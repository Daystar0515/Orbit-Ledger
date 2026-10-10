// 資產頁：上方「資產」與淨資產，下面依現金、信用卡、存款三大類列出子帳戶。
// 大類名稱靠左、子帳戶合計靠右；子帳戶名稱靠左、金額靠右。
// 現金與存款用綠色（收入色），信用卡欠款用紅色（支出色），並在下方小字顯示自訂額度上限。

import { makeSheet } from './sheet.js';
import { KINDS, KIND_ORDER, getAccounts, balances, kindTotals } from './accounts.js';
import { toKey } from './dateutil.js';
import { nextOccurrence, eventSpec, whenText, yearlyInterest } from './reminders.js';
import { getHoldings, holdingsValue, holdingsPnl, findHolding, rateText, toneOf } from './holdings.js';
import { holdingRow, signedMoney } from './asset-rows.js';
import { quoteLine, getQuoteStatus, onQuoteStatus, refreshPrices } from './quotes.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('zh-TW');
const money = (n) => `${n < 0 ? '-' : ''}NT$ ${nf.format(Math.abs(n))}`;

/** @param {{getEntries:()=>object[], editor:object, holdEditor:object, toast:(msg:string, ms?:number)=>void}} deps */
export function createAssetSheet({ getEntries, editor, holdEditor, toast }) {
  const el = $('asset-sheet');
  const groups = $('asset-groups');
  const net = $('net-amt');
  const futureNote = document.createElement('div');
  futureNote.className = 'a-note';
  net.after(futureNote);
  // 市價更新狀態與「更新」按鈕（有股票或 ETF 時才出現）
  const quoteBar = document.createElement('div');
  quoteBar.className = 'a-note quote-bar';
  quoteBar.hidden = true;
  const quoteText = document.createElement('span');
  const quoteBtn = document.createElement('button');
  quoteBtn.type = 'button';
  quoteBtn.className = 'quote-btn';
  quoteBtn.textContent = '更新';
  quoteBar.append(quoteText, quoteBtn);
  futureNote.after(quoteBar);

  function drawQuoteBar() {
    const text = quoteLine(getHoldings(), getQuoteStatus());
    quoteBar.hidden = !text;
    quoteText.textContent = text;
    quoteBtn.disabled = getQuoteStatus().state === 'loading';
  }
  quoteBtn.addEventListener('click', async () => {
    const r = await refreshPrices({ force: true });
    if (!r.ok) toast('現在連不上報價服務，先顯示上次的價格', 3500);
    else if (r.missing.length) toast(`有 ${r.missing.length} 檔查不到價格：${r.missing.join('、')}`, 4000);
  });
  onQuoteStatus(() => { if (sheet.isOpen()) drawQuoteBar(); });

  const sheet = makeSheet(el, { onOpen: () => draw() });

  /** 現金／存款：正數綠、負數紅；信用卡：有欠款就紅。 */
  const tone = (kind, n) => (kind === 'credit' ? (n > 0 ? 'neg' : 'zero') : n < 0 ? 'neg' : n > 0 ? 'pos' : 'zero');

  function draw() {
    const list = getAccounts();
    const today = new Date();
    const todayKey = toKey(today);
    const bal = balances(list, getEntries(), todayKey); // 未來的收支還沒發生，不計入
    const t = kindTotals(list, bal);
    const holds = getHoldings();
    const netWorth = t.net + holdingsValue(holds);
    net.textContent = money(netWorth);
    net.className = `net-amt ${netWorth < 0 ? 'neg' : ''}`;
    drawQuoteBar();
    const later = getEntries().filter((e) => e.date > todayKey && (e.accountId || e.fromId)).length;
    futureNote.hidden = later === 0;
    futureNote.textContent = `另有 ${later} 筆預先記的未來收支，到那天才會計入。`;
    groups.replaceChildren();

    for (const kind of KIND_ORDER) {
      const g = document.createElement('section');
      g.className = 'a-group';
      g.dataset.kind = kind;

      const head = document.createElement('div');
      head.className = 'a-head';
      const hn = document.createElement('span');
      hn.className = 'a-name';
      hn.textContent = KINDS[kind].name;
      const ht = document.createElement('span');
      ht.className = `a-sum ${tone(kind, t[kind])}`;
      ht.textContent = money(t[kind]);
      head.append(hn, ht);
      g.appendChild(head);

      const accs = list.filter((a) => a.kind === kind);
      if (accs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'a-empty';
        empty.textContent = `還沒有${KINDS[kind].name}帳戶`;
        g.appendChild(empty);
      }
      for (const a of accs) {
        const v = bal.get(a.id) || 0;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'a-row';
        row.dataset.id = a.id;
        const left = document.createElement('span');
        left.className = 'a-left';
        const nm = document.createElement('span');
        nm.className = 'a-acc';
        nm.textContent = a.name;
        left.appendChild(nm);
        const addSub = (text, cls = '') => {
          const sub = document.createElement('span');
          sub.className = `a-sub ${cls}`.trim();
          sub.textContent = text;
          left.appendChild(sub);
        };
        /** 「結帳 11/5（26 天後）・繳款 10/20（10 天後）」 */
        const daysLine = (pairs) => {
          const parts = pairs
            .map(([ev, label]) => { const sp = eventSpec(a, ev); return sp ? `${label} ${whenText(nextOccurrence(sp, today), today)}` : null; })
            .filter(Boolean);
          if (parts.length) addSub(parts.join('・'), 'a-days');
        };
        if (kind === 'credit') {
          addSub(a.limit
            ? `額度上限 NT$ ${nf.format(a.limit)}・可用 NT$ ${nf.format(Math.max(0, a.limit - v))}`
            : '尚未設定額度上限');
          daysLine([['statement', '結帳'], ['due', '繳款']]);
        }
        if (kind === 'bank' && a.interestOn && a.rate) {
          const y = yearlyInterest(v, a.rate);
          addSub(`年利率 ${a.rate}%${y ? `・預估年息約 NT$ ${nf.format(y)}` : ''}`, 'a-rate');
          daysLine([['accrual', '計息'], ['payout', '發息']]);
        }
        if ((kind === 'credit' || (kind === 'bank' && a.interestOn)) && a.remind && a.remind.on) addSub('已開啟提醒', 'a-remind');
        const amt = document.createElement('span');
        amt.className = `a-amt ${tone(kind, v)}`;
        amt.textContent = money(v);
        row.append(left, amt);
        row.setAttribute('aria-label', `${a.name} ${money(v)}，點一下編輯`);
        g.appendChild(row);
      }

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'a-add';
      add.dataset.kind = kind;
      add.textContent = `＋ 新增${KINDS[kind].name}帳戶`;
      g.appendChild(add);
      groups.appendChild(g);
    }
    groups.appendChild(holdingGroup(holds, today));
  }

  /** 第四大類：理財（股票、ETF、基金）。 */
  function holdingGroup(holds, today) {
    const g = document.createElement('section');
    g.className = 'a-group';
    g.dataset.kind = 'holding';
    const head = document.createElement('div');
    head.className = 'a-head';
    const hn = document.createElement('span');
    hn.className = 'a-name';
    hn.textContent = '理財';
    const ht = document.createElement('span');
    ht.className = 'a-sum pos';
    ht.textContent = money(holdingsValue(holds));
    head.append(hn, ht);
    g.appendChild(head);
    const total = holdingsPnl(holds);
    if (total.count) {
      const line = document.createElement('div');
      line.className = `a-sub a-total tone-${toneOf(total.pnl)}`;
      line.textContent = `總盈虧 ${total.rate === null ? '' : `${rateText(total.rate)}　`}${signedMoney(total.pnl)}`;
      g.appendChild(line);
    }
    if (!holds.length) {
      const empty = document.createElement('div');
      empty.className = 'a-empty';
      empty.textContent = '還沒有持有的股票、ETF 或基金';
      g.appendChild(empty);
    }
    for (const h of holds) g.appendChild(holdingRow(h, today));
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'a-add';
    add.dataset.kind = 'holding';
    add.textContent = '＋ 新增持有';
    g.appendChild(add);
    return g;
  }

  groups.addEventListener('click', (e) => {
    const hrow = e.target.closest('.a-row[data-hid]');
    if (hrow) {
      const h = findHolding(hrow.dataset.hid);
      if (h) holdEditor.open({ holding: h, onDone: draw });
      return;
    }
    if (e.target.closest('.a-add[data-kind="holding"]')) { holdEditor.open({ onDone: draw }); return; }
    const row = e.target.closest('.a-row');
    if (row) {
      const acc = getAccounts().find((a) => a.id === row.dataset.id);
      if (acc) editor.open({ acc, onDone: draw });
      return;
    }
    const add = e.target.closest('.a-add');
    if (add) editor.open({ kind: add.dataset.kind, fixedKind: true, onDone: draw });
  });

  return {
    open: () => sheet.open(),
    close: () => sheet.close(),
    isOpen: () => sheet.isOpen(),
    refresh: () => { if (sheet.isOpen()) draw(); },
  };
}
