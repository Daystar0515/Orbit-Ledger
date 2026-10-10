// 明細列（主畫面與搜尋頁共用）。帳目要先轉成「畫面用格式」（toView）。

import { findCat, catColor, UNKNOWN_CAT } from './cats.js';
import { fromKey } from './dateutil.js';
import { findAccount } from './accounts.js';

const nf = new Intl.NumberFormat('zh-TW');
const pad = (n) => String(n).padStart(2, '0');
export const TRANSFER_CAT = { id: 'transfer', name: '轉帳', example: '', pal: -1 };

/** 把資料庫裡的一筆帳目轉成畫面用的格式。日期不合法的帳目回傳 null。 */
export function toView(e) {
  const date = fromKey(e.date);
  if (!date) return null;
  const isT = e.type === 'transfer';
  return {
    id: e.id,
    type: e.type,
    catId: e.catId,
    cat: isT ? TRANSFER_CAT : findCat(e.type, e.catId) || UNKNOWN_CAT,
    accountId: e.accountId || null,
    fromId: e.fromId || null,
    toId: e.toId || null,
    amount: e.amount,
    date,
    note: e.note || '',
    createdAt: e.createdAt || 0,
    demo: !!e.demo,
  };
}

export const accName = (id) => (findAccount(id) || { name: '已刪除的帳戶' }).name;

/** 轉帳的說明文字：現金 → 郵局存款 */
export const transferText = (e) => `${accName(e.fromId)} → ${accName(e.toId)}`;

/**
 * @param {object} e toView 的結果
 * @param {{showDate:boolean, editable:boolean, index?:number}} opts
 */
export function makeRow(e, { showDate, editable, index = 0 }) {
  const li = document.createElement('li');
  li.className = editable ? 'row swipe' : 'row';
  li.style.setProperty('--i', String(Math.min(index, 10))); // 進場動畫依序錯開，最多錯開 10 列
  li.dataset.id = e.id;
  const isT = e.type === 'transfer';

  const fg = document.createElement('div');
  fg.className = 'row-fg';

  const dot = document.createElement('span');
  dot.className = isT ? 'cdot tdot' : 'cdot';
  if (!isT) dot.style.background = catColor(e.cat, e.type);

  // 主標題是類別，副標題是自己輸入的具體事項（長期檢視時前面加上日期；轉帳顯示帳戶）
  const meta = document.createElement('div');
  meta.className = 'meta';
  const cat = document.createElement('div');
  cat.className = 'cat';
  cat.textContent = e.cat.name;
  const note = document.createElement('div');
  note.className = 'note';
  const parts = [];
  if (showDate) parts.push(`${pad(e.date.getMonth() + 1)}/${pad(e.date.getDate())}`);
  if (isT) parts.push(transferText(e));
  if (e.note) parts.push(e.note);
  note.textContent = parts.join(' · ');
  meta.append(cat);
  if (parts.length) meta.append(note);

  const amt = document.createElement('div');
  amt.className = `amt ${e.type}`;
  amt.textContent = isT ? nf.format(e.amount) : `${e.type === 'income' ? '+' : '-'}${nf.format(e.amount)}`;

  fg.append(dot, meta, amt);
  li.appendChild(fg);
  if (editable) {
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${e.cat.name}${e.note ? ` ${e.note}` : ''} NT$ ${nf.format(e.amount)}，點一下編輯`);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.textContent = '刪除';
    del.tabIndex = -1;
    li.appendChild(del);
  }
  return li;
}
