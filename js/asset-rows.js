// 資產相關的列（資產頁的持有、主畫面資產宇宙的明細）。

import { HKINDS, valueOf, pnlOf, rateOf, rateText, toneOf, priceNote, hasPrice } from './holdings.js';
import { rowKindText } from './asset-data.js';

const nf = new Intl.NumberFormat('zh-TW');
const nf4 = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });
export const money = (n) => `${n < 0 ? '-' : ''}NT$ ${nf.format(Math.abs(n))}`;
export const signedMoney = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}NT$ ${nf.format(Math.abs(n))}`;
export const unitOf = (kind) => (kind === 'fund' ? '單位' : '股');

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

/** 持有的右邊兩行：市值，與盈虧（有市價才有）。 */
function holdingRight(h) {
  const right = span('a-right', '');
  right.appendChild(span('a-amt pos', money(valueOf(h))));
  if (hasPrice(h)) {
    const rate = rateOf(h);
    const tone = toneOf(pnlOf(h));
    right.appendChild(span(`a-pnl tone-${tone}`, `${rate === null ? '' : `${rateText(rate)}　`}${signedMoney(pnlOf(h))}`));
  }
  return right;
}

/** 資產頁、明細裡的一列持有。 */
export function holdingRow(h, now = new Date()) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'a-row';
  row.dataset.hid = h.id;
  const left = span('a-left', '');
  left.appendChild(span('a-acc', h.name));
  left.appendChild(span('a-sub', `${HKINDS[h.kind].name}${h.code ? `・${h.code}` : ''}・${nf4.format(h.shares)} ${unitOf(h.kind)}・均價 ${nf4.format(h.cost)}`));
  left.appendChild(span('a-sub', hasPrice(h) ? `市價 ${nf4.format(h.price)}（${priceNote(h, now)}）` : '尚無市價，市值暫以成本計算'));
  row.append(left, holdingRight(h));
  row.setAttribute('aria-label', `${h.name} 市值 ${money(valueOf(h))}，點一下編輯`);
  return row;
}

/**
 * 資產宇宙的明細列表：選到的行星排最前面，其餘由大到小，信用卡欠款放最後。
 * @param {object[]} rows asset-data.js 的 assetSummary().rows
 * @returns {HTMLLIElement[]}
 */
export function assetListRows(rows, selectedId, now = new Date()) {
  const rank = (r) => (r.id === selectedId ? 0 : r.group === 'credit' ? 3 : 1);
  const sorted = rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || b[0].amount - a[0].amount || a[1] - b[1]).map(([r]) => r);
  return sorted.map((r) => {
    const li = document.createElement('li');
    li.className = `arow-li${r.id === selectedId ? ' hl' : ''}`;
    let btn;
    if (r.type === 'holding') {
      btn = holdingRow(r.hold, now);
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'a-row';
      btn.dataset.aid = r.acc.id;
      const left = span('a-left', '');
      left.appendChild(span('a-acc', r.name));
      left.appendChild(span('a-sub', r.group === 'credit' ? '信用卡・已刷未繳' : rowKindText(r)));
      const tone = r.group === 'credit' ? (r.amount > 0 ? 'neg' : 'zero') : r.amount < 0 ? 'neg' : r.amount > 0 ? 'pos' : 'zero';
      btn.append(left, span(`a-amt ${tone}`, money(r.amount)));
      btn.setAttribute('aria-label', `${r.name} ${money(r.amount)}，點一下編輯`);
    }
    li.appendChild(btn);
    return li;
  });
}
