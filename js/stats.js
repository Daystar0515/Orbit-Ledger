// 統計：把帳目依類別加總。純函式，不碰畫面，方便測試。

import { catsOf, catColor, UNKNOWN_CAT, GREY } from './cats.js';

/**
 * 依類別加總某一種類型的帳目，回傳含金額的類別清單（未排序、含 0）。
 * @param {{type:'expense'|'income', cat:{id:string}, amount:number}[]} entries
 */
export function totalsByCategory(entries, type) {
  const of = entries.filter((e) => e.type === type);
  const rows = catsOf(type).map((cat) => ({
    id: cat.id,
    name: cat.name,
    color: catColor(cat, type),
    amount: of.filter((e) => e.cat.id === cat.id).reduce((sum, e) => sum + e.amount, 0),
  }));
  // 類別被刪除（或備份來自別處）的帳目歸到「未分類」，圓環總額才不會少算。
  const known = new Set(rows.map((r) => r.id));
  const lost = of.filter((e) => !known.has(e.cat.id)).reduce((sum, e) => sum + e.amount, 0);
  if (lost > 0) rows.push({ id: UNKNOWN_CAT.id, name: UNKNOWN_CAT.name, color: GREY, amount: lost });
  return rows;
}

/** 某一種類型的總額。 */
export function sumOf(entries, type) {
  return entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
}
