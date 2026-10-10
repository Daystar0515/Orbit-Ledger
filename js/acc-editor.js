// 新增／編輯帳戶的小視窗（疊在資產頁或記帳視窗上面）。

import { makeSheet } from './sheet.js';
import { KINDS, parseMoney, addAccount, updateAccount, deleteAccount, getAccounts } from './accounts.js';

const $ = (id) => document.getElementById(id);

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
  let ctx = { acc: null, kind: 'cash', fixedKind: false };
  let cb = onDone;

  const sheet = makeSheet(el, { stack: true });

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
    const data = { name: nm, opening: op, limit: lim || 0 };
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

  [name, opening, limit].forEach((inp) => inp.addEventListener('keydown', (e) => {
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
      renderKind();
      sheet.open();
    },
  };
}
