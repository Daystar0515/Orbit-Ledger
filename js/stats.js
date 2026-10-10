// 統計：把帳目依類別加總。純函式，不碰畫面，方便測試。

import { catsOf, catColor } from './cats.js';

/**
 * 依類別加總某一種類型的帳目，回傳含金額的類別清單（未排序、含 0）。
 * @param {{type:'expense'|'income', cat:{id:string}, amount:number}[]} entries
 */
export function totalsByCategory(entries, type) {
  return catsOf(type).map((cat) => ({
    id: cat.id,
    name: cat.name,
    color: catColor(cat),
    amount: entries
      .filter((e) => e.type === type && e.cat.id === cat.id)
      .reduce((sum, e) => sum + e.amount, 0),
  }));
}

/** 某一種類型的總額。 */
export function sumOf(entries, type) {
  return entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
}
