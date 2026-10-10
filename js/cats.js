// 類別與顏色。
// 內建類別固定（id 一旦寫進帳目就不要改）；使用者可以另外新增自訂類別，存在資料庫的 meta 裡。
// 顏色來自 palette.js：支出紅色系、收入綠色系；開啟色盲友善模式後，支出變藍色系、收入變黃色系。

import { EXPENSE_PALETTE, INCOME_PALETTE } from './palette.js';

// example 是「具體事項」輸入欄的提示範例；pal 是調色盤裡的格子編號。
export const EXPENSE_CATS = [
  { id: 'food', name: '飲食', example: '午餐', pal: 0 },
  { id: 'life', name: '生活', example: '水電費', pal: 1 },
  { id: 'transport', name: '交通', example: '捷運', pal: 2 },
  { id: 'shopping', name: '購物', example: '外套', pal: 3 },
  { id: 'fun', name: '娛樂', example: '電影', pal: 4 },
  { id: 'study', name: '學習', example: '書本費', pal: 5 },
  { id: 'medical', name: '醫療', example: '掛號費', pal: 6 },
  { id: 'invest', name: '投資', example: '定期定額', pal: 7 },
  { id: 'travel', name: '旅行', example: '車票', pal: 8 },
];

export const INCOME_CATS = [
  { id: 'salary', name: '薪資', example: '十月薪水', pal: 0 },
  { id: 'iinvest', name: '投資', example: '股息', pal: 1 },
  { id: 'bonus', name: '獎金', example: '年終獎金', pal: 2 },
  { id: 'pocket', name: '零用', example: '生活費', pal: 3 },
];

export const PALETTES = { expense: EXPENSE_PALETTE, income: INCOME_PALETTE };
export const CUSTOM_MAX = 12; // 每種（支出／收入）最多幾個自訂類別
export const NAME_MAX = 8;

/** 找不到類別時（例如類別被刪除，或備份來自別台手機）的備用類別。 */
export const UNKNOWN_CAT = { id: 'unknown', name: '未分類', example: '', pal: -1 };

// ---- 自訂類別 ----
let custom = { expense: [], income: [] };
const listeners = new Set();
export const onCatsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(getCustom()));

const cleanList = (type, list) => {
  const seen = new Set();
  const max = PALETTES[type].length;
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c.id === 'string' && c.id && typeof c.name === 'string' && c.name.trim())
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, CUSTOM_MAX)
    .map((c) => ({ id: c.id, name: c.name.trim().slice(0, NAME_MAX), example: '', pal: Number.isInteger(c.pal) && c.pal >= 0 && c.pal < max ? c.pal : 0, custom: true }));
};

/** 從資料庫讀回自訂類別（不會通知，因為這只是還原）。 */
export function loadCustom(data) {
  custom = { expense: cleanList('expense', data && data.expense), income: cleanList('income', data && data.income) };
}
export const getCustom = () => ({
  expense: custom.expense.map(({ id, name, pal }) => ({ id, name, pal })),
  income: custom.income.map(({ id, name, pal }) => ({ id, name, pal })),
});

const newCatId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** @returns {object|null} 新類別；已達上限或名稱是空的就回傳 null */
export function addCustomCat(type, { name, pal }) {
  const nm = String(name || '').trim().slice(0, NAME_MAX);
  if (!nm || custom[type].length >= CUSTOM_MAX) return null;
  const cat = cleanList(type, [{ id: newCatId(), name: nm, pal }])[0];
  custom[type].push(cat);
  emit();
  return cat;
}
export function updateCustomCat(type, id, { name, pal }) {
  const i = custom[type].findIndex((c) => c.id === id);
  const nm = String(name || '').trim().slice(0, NAME_MAX);
  if (i < 0 || !nm) return false;
  custom[type][i] = cleanList(type, [{ id, name: nm, pal }])[0];
  emit();
  return true;
}
export function deleteCustomCat(type, id) {
  const n = custom[type].length;
  custom[type] = custom[type].filter((c) => c.id !== id);
  if (custom[type].length !== n) emit();
  return custom[type].length !== n;
}
/** 匯入備份時，把備份裡有、手機上沒有的自訂類別補進來；回傳新增的數量。 */
export function mergeCustom(incoming) {
  const add = { expense: [], income: [] };
  for (const type of ['expense', 'income']) {
    const have = new Set([...custom[type].map((c) => c.id), ...(type === 'income' ? INCOME_CATS : EXPENSE_CATS).map((c) => c.id)]);
    for (const c of cleanList(type, incoming && incoming[type])) {
      if (!have.has(c.id) && custom[type].length + add[type].length < CUSTOM_MAX) add[type].push(c);
    }
    custom[type].push(...add[type]);
  }
  const n = add.expense.length + add.income.length;
  if (n) emit();
  return n;
}

/** 備份裡有幾個自訂類別是手機上還沒有的（不會更動任何資料）。 */
export function newCustomCount(incoming) {
  let n = 0;
  for (const type of ['expense', 'income']) {
    const have = new Set([...custom[type].map((c) => c.id), ...(type === 'income' ? INCOME_CATS : EXPENSE_CATS).map((c) => c.id)]);
    n += cleanList(type, incoming && incoming[type]).filter((c) => !have.has(c.id)).length;
  }
  return n;
}

export const baseCatsOf = (type) => (type === 'income' ? INCOME_CATS : EXPENSE_CATS);
export const catsOf = (type) => [...baseCatsOf(type), ...custom[type === 'income' ? 'income' : 'expense']];
export const findCat = (type, id) => catsOf(type).find((c) => c.id === id) || null;

// ---- 顏色 ----
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export const isDark = () => !!(darkQuery && darkQuery.matches);
export const onThemeChange = (fn) => darkQuery && darkQuery.addEventListener('change', fn);

let colorBlind = false;
export const setColorBlind = (on) => { colorBlind = !!on; };
export const isColorBlind = () => colorBlind;

export const GREY = '#9AA0A6';

/** 取得調色盤某一格目前該用的顏色（依深色／淺色與色盲模式）。 */
export function paletteColor(type, pal) {
  const p = PALETTES[type === 'income' ? 'income' : 'expense'][pal];
  if (!p) return GREY;
  if (colorBlind) return isDark() ? p.cbd : p.cb;
  return isDark() ? p.d : p.c;
}

/** 類別現在要用的顏色。type 要和類別所屬的收支一致。 */
export const catColor = (cat, type) => (cat.pal < 0 ? GREY : paletteColor(type || cat.type || 'expense', cat.pal));
