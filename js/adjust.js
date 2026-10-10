// 金額調整：手續費、運費、優惠折扣……這些「讓原價變多或變少」的項目（純函式，方便測試）。
//
// 支出：手續費、運費、服務費、稅金、小費會加在原價上；優惠折扣、折價券、點數折抵會從原價扣掉。
// 收入：手續費、稅金（代扣）會從收到的金額扣掉；加給／獎勵會加上去。
// 轉帳：只有手續費，會從轉出帳戶多扣，轉入的金額不變。
//
// 帳目的 amount 永遠是「最後實際的金額」，所以圓環、資產都不用改算法；
// 另外存 base（原價）與 adjust（[{ k, v }]），方便之後編輯與顯示。

export const ADJ_KINDS = [
  { k: 'fee', name: '手續費', expense: 1, income: -1, transfer: 1 },
  { k: 'ship', name: '運費', expense: 1 },
  { k: 'service', name: '服務費', expense: 1 },
  { k: 'tax', name: '稅金', expense: 1, income: -1 },
  { k: 'tip', name: '小費', expense: 1 },
  { k: 'discount', name: '優惠折扣', expense: -1 },
  { k: 'coupon', name: '折價券', expense: -1 },
  { k: 'points', name: '點數折抵', expense: -1 },
  { k: 'bonus', name: '加給／獎勵', income: 1 },
];

const byK = new Map(ADJ_KINDS.map((a) => [a.k, a]));
export const adjName = (k) => (byK.get(k) || { name: k }).name;
/** 這種收支能用哪些調整項目 */
export const adjOptions = (type) => ADJ_KINDS.filter((a) => a[type]);
/** +1：加上去；-1：扣掉；0：這種收支不適用 */
export const adjSign = (type, k) => (byK.get(k) || {})[type] || 0;

/** 原價加上所有調整後的金額。轉帳的手續費不改變轉過去的金額，所以轉帳的結果就是原價。 */
export function applyAdjust(base, adjust, type) {
  if (type === 'transfer') return base;
  return (adjust || []).reduce((sum, a) => sum + adjSign(type, a.k) * a.v, base);
}

/** 轉帳手續費合計（從轉出帳戶多扣的錢）。 */
export const transferFee = (e) => (e.type === 'transfer' ? (e.adjust || []).filter((a) => a.k === 'fee').reduce((s, a) => s + a.v, 0) : 0);

/** 清理：只留認得的項目、正整數、同一項只留一筆。 */
export function cleanAdjust(list, type, max = 99999999) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && byK.has(a.k) && adjSign(type, a.k) !== 0 && Number.isInteger(a.v) && a.v >= 1 && a.v <= max)
    .filter((a) => (seen.has(a.k) ? false : (seen.add(a.k), true)))
    .map((a) => ({ k: a.k, v: a.v }));
}

const nf = new Intl.NumberFormat('zh-TW');
/** 明細上的說明：「原價 1,000・手續費 +15・優惠折扣 −100」 */
export function adjustText(e) {
  const list = e.adjust || [];
  if (!list.length) return '';
  const parts = list.map((a) => `${adjName(a.k)} ${adjSign(e.type, a.k) > 0 ? '+' : '−'}${nf.format(a.v)}`);
  if (e.type !== 'transfer' && Number.isInteger(e.base)) parts.unshift(`原價 ${nf.format(e.base)}`);
  return parts.join('・');
}
