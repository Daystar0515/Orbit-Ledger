// 新增／編輯帳戶的小視窗（疊在資產頁或記帳視窗上面）。
// 信用卡：額度上限、結帳日、繳款日。存款：可選擇設定利率（年利率、計息日、發息日與頻率）。
// 兩者都可以自行開關提醒（當天／前一天／前一週），也能加入 iPhone 行事曆。

import { makeSheet } from './sheet.js';
import { KINDS, parseMoney, parseRate, addAccount, updateAccount, deleteAccount, getAccounts, REMIND_OFFSETS, REMIND_EVENTS } from './accounts.js';
import { buildIcs, eventSpec, EVENT_NAMES } from './reminders.js';
import { saveTextFile } from './files.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_REMIND = { credit: { on: false, offsets: [1], events: ['due'] }, bank: { on: false, offsets: [1], events: ['payout'] } };

/** @param {{toast:(msg:string)=>void, onDone:(acc:object|null, deleted:boolean)=>void}} deps */
export function createAccEditor({ toast, onDone }) {
  const el = $('acc-sheet');
  const kinds = $('acc-kinds');
  const name = $('acc-name');
  const opening = $('acc-opening');
  const openingLabel = $('acc-opening-label');
  const limitRow = $('acc-limit-row');
  const limit = $('acc-limit');
  const saveBtn = $('acc-save');
  const delBtn = $('acc-delete');
  const title = $('acc-title');
  const note = $('acc-note');
  const stSel = $('acc-statement');
  const dueSel = $('acc-due');
  const intRow = $('acc-int-row');
  const intSw = $('acc-int');
  const intFields = $('acc-int-fields');
  const rate = $('acc-rate');
  const accrualSel = $('acc-accrual');
  const paySel = $('acc-pay');
  const freqSel = $('acc-freq');
  const remBlock = $('acc-remind-block');
  const remSw = $('acc-remind');
  const remOpts = $('acc-remind-opts');
  const evChips = $('acc-remind-events');
  const offChips = $('acc-remind-offsets');
  let ctx = { acc: null, kind: 'cash', fixedKind: false };
  let remind = { ...DEFAULT_REMIND.credit };
  let interestOn = false;
  let cb = onDone;

  // 每月 1～31 日的選單
  [stSel, dueSel, accrualSel, paySel].forEach((sel) => {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '未設定';
    sel.appendChild(none);
    for (let d = 1; d <= 31; d += 1) {
      const o = document.createElement('option');
      o.value = String(d);
      o.textContent = sel === paySel ? `${d} 日` : `每月 ${d} 日`;
      sel.appendChild(o);
    }
  });

  const sheet = makeSheet(el, { stack: true });
  const dayOf = (sel) => (sel.value ? Number(sel.value) : null);
  const hasRemind = () => ctx.kind === 'credit' || (ctx.kind === 'bank' && interestOn);

  /** 依目前畫面上的值組出帳戶資料（還沒存）。 */
  function formAccount() {
    const base = { id: ctx.acc ? ctx.acc.id : 'new', kind: ctx.kind, name: name.value.trim() || KINDS[ctx.kind].name };
    if (ctx.kind === 'credit') return { ...base, statementDay: dayOf(stSel), dueDay: dayOf(dueSel), remind: { ...remind } };
    if (ctx.kind === 'bank' && interestOn) {
      return { ...base, interestOn: true, rate: parseRate(rate.value), accrualDay: dayOf(accrualSel), payDay: dayOf(paySel), payFreq: freqSel.value, remind: { ...remind } };
    }
    return base;
  }
  const missingText = () => `請先設定${remind.events.map((ev) => EVENT_NAMES[ev]).join('或')}`;

  function renderRemind() {
    remBlock.hidden = !hasRemind();
    remSw.classList.toggle('on', remind.on);
    remSw.setAttribute('aria-checked', String(remind.on));
    remOpts.hidden = !remind.on;
    // 「提醒哪些日子」依帳戶類型換成結帳日／繳款日，或計息日／發息日
    const evs = REMIND_EVENTS[ctx.kind] || [];
    if (evChips.dataset.kind !== ctx.kind) {
      evChips.dataset.kind = ctx.kind;
      evChips.replaceChildren(...evs.map((ev) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.ev = ev;
        b.textContent = EVENT_NAMES[ev];
        return b;
      }));
    }
    evChips.querySelectorAll('button').forEach((b) => {
      const on = remind.events.includes(b.dataset.ev);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    offChips.querySelectorAll('button').forEach((b) => {
      const on = remind.offsets.includes(Number(b.dataset.off));
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderInterest() {
    intRow.hidden = ctx.kind !== 'bank';
    intSw.classList.toggle('on', interestOn);
    intSw.setAttribute('aria-checked', String(interestOn));
    intFields.hidden = !interestOn;
    renderRemind();
  }

  remSw.addEventListener('click', () => { remind.on = !remind.on; renderRemind(); });
  intSw.addEventListener('click', () => { interestOn = !interestOn; renderInterest(); });
  // 多選；至少要留一個
  evChips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ev]');
    if (!b) return;
    const ev = b.dataset.ev;
    const next = remind.events.includes(ev) ? remind.events.filter((x) => x !== ev) : [...remind.events, ev];
    if (next.length) remind.events = (REMIND_EVENTS[ctx.kind] || []).filter((x) => next.includes(x));
    renderRemind();
  });
  offChips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-off]');
    if (!b) return;
    const off = Number(b.dataset.off);
    const next = remind.offsets.includes(off) ? remind.offsets.filter((x) => x !== off) : [...remind.offsets, off];
    if (next.length) remind.offsets = REMIND_OFFSETS.filter((x) => next.includes(x));
    renderRemind();
  });

  $('acc-ics').addEventListener('click', async () => {
    const acc = formAccount();
    const wanted = remind.events.filter((ev) => eventSpec(acc, ev));
    if (!wanted.length) { toast(missingText()); return; }
    const res = await saveTextFile({ name: `Orbit-${acc.name}-提醒.ics`, text: buildIcs({ ...acc, remind: { ...remind, events: wanted } }, new Date()), mime: 'text/calendar' });
    if (res === 'cancelled') return;
    const many = remind.offsets.length > 2 ? '（iPhone 行事曆一個事件最多保留 2 個提醒）' : '';
    toast(res === 'shared' ? `請在分享選單選「行事曆」加入${many}` : `已下載行事曆檔，打開它即可加入${many}`, 5000);
  });

  function renderKind() {
    kinds.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.kind === ctx.kind;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = (ctx.fixedKind || !!ctx.acc) && !on;
    });
    const credit = ctx.kind === 'credit';
    openingLabel.textContent = credit ? '目前已刷未繳金額' : '目前餘額';
    limitRow.hidden = !credit;
    name.placeholder = `例如：${KINDS[ctx.kind].sample}`;
    if (!ctx.acc && DEFAULT_REMIND[ctx.kind] && !(REMIND_EVENTS[ctx.kind] || []).some((ev) => remind.events.includes(ev))) {
      remind = { ...DEFAULT_REMIND[ctx.kind] }; // 新增時換了類型，提醒的預設跟著換
    }
    renderInterest();
  }

  kinds.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (!b || b.disabled) return;
    ctx.kind = b.dataset.kind;
    renderKind();
  });

  saveBtn.addEventListener('click', () => {
    const nm = name.value.trim();
    if (!nm) { toast('請輸入帳戶名稱'); return; }
    if (getAccounts().some((a) => a.name === nm && (!ctx.acc || a.id !== ctx.acc.id))) { toast('已經有同名的帳戶了'); return; }
    const op = parseMoney(opening.value);
    const lim = parseMoney(limit.value);
    if (op === null) { toast('金額請輸入 0 以上的整數'); return; }
    if (ctx.kind === 'credit' && lim === null) { toast('額度請輸入 0 以上的整數'); return; }
    const form = formAccount();
    const data = { ...form, name: nm, opening: op, limit: lim || 0 };
    delete data.id;
    delete data.kind;
    if (ctx.kind === 'bank' && interestOn && data.rate === null) { toast('年利率請輸入大於 0 的數字，例如 1.5'); return; }
    if (ctx.kind === 'bank' && !interestOn) data.interestOn = false;
    if (hasRemind() && remind.on && !remind.events.some((ev) => eventSpec(form, ev))) { toast(`開啟提醒前，${missingText()}`); return; }
    let acc;
    if (ctx.acc) {
      updateAccount(ctx.acc.id, data);
      acc = { ...ctx.acc, ...data };
    } else {
      acc = addAccount({ kind: ctx.kind, ...data });
      if (!acc) { toast('帳戶數量已達上限'); return; }
    }
    sheet.close();
    cb(acc, false);
  });

  delBtn.addEventListener('click', () => {
    if (!ctx.acc) return;
    if (!delBtn.classList.contains('confirm')) {
      delBtn.classList.add('confirm');
      delBtn.textContent = '確認刪除';
      note.textContent = '刪除後，用這個帳戶記的帳目仍會保留，只是不再計入任何帳戶的金額。';
      return;
    }
    deleteAccount(ctx.acc.id);
    sheet.close();
    cb(ctx.acc, true);
  });

  [name, opening, limit, rate].forEach((inp) => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
  }));

  return {
    isOpen: () => sheet.isOpen(),
    close: () => sheet.close(),
    /**
     * @param {{acc?:object|null, kind?:string, fixedKind?:boolean, onDone?:Function}} opts
     *   acc 有值就是編輯；kind 是新增時預設的類型；fixedKind 時不能改類型
     */
    open({ acc = null, kind = 'cash', fixedKind = false, onDone: done = null } = {}) {
      cb = done || onDone;
      ctx = { acc, kind: acc ? acc.kind : kind, fixedKind };
      title.textContent = acc ? '編輯帳戶' : `新增${fixedKind ? KINDS[kind].name : ''}帳戶`;
      saveBtn.textContent = acc ? '儲存' : '加入';
      name.value = acc ? acc.name : '';
      opening.value = acc && acc.opening ? String(acc.opening) : '';
      limit.value = acc && acc.limit ? String(acc.limit) : '';
      delBtn.hidden = !acc;
      delBtn.classList.remove('confirm');
      delBtn.textContent = '刪除';
      note.textContent = acc ? '' : '之後的收支會自動從這個金額加減。';
      stSel.value = acc && acc.statementDay ? String(acc.statementDay) : '';
      dueSel.value = acc && acc.dueDay ? String(acc.dueDay) : '';
      interestOn = !!(acc && acc.interestOn);
      rate.value = acc && acc.rate ? String(acc.rate) : '';
      accrualSel.value = acc && acc.accrualDay ? String(acc.accrualDay) : '';
      paySel.value = acc && acc.payDay ? String(acc.payDay) : '';
      freqSel.value = acc && acc.payFreq ? acc.payFreq : 'semiannual';
      const k = ctx.kind;
      remind = acc && acc.remind ? { on: !!acc.remind.on, offsets: [...acc.remind.offsets], events: [...acc.remind.events] } : { ...(DEFAULT_REMIND[k] || DEFAULT_REMIND.credit) };
      evChips.dataset.kind = '';
      renderKind();
      sheet.open();
    },
  };
}
