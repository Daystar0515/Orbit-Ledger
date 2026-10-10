// 資產宇宙的資料整理（純函式，不碰畫面）。
// 太陽 = 淨資產（現金＋存款＋理財市值－信用卡欠款）；
// 行星 = 每個現金帳戶、存款帳戶與理財持有，大小代表價值。信用卡欠款只從太陽扣掉，不畫成行星。

import { isDark, isColorBlind } from './cats.js';
import { valueOf, rateOf, rateText, toneOf, holdingsValue, HKINDS } from './holdings.js';

/** 資產宇宙的行星顏色：一般模式全部是藍色系（和太陽同一個色系），只有色盲模式才用薰衣草紫。c／d＝淺色／深色主題。 */
const COLORS = {
  cash: { c: '#4BA3FF', d: '#7CBBFF', cb: '#A98BE8', cbd: '#C9B3FF' }, // 天藍
  bank: { c: '#1D4ED8', d: '#4F7DF0', cb: '#6F4FB8', cbd: '#9B7FE0' }, // 深藍
  stock: { c: '#2F7BEF', d: '#5A9BFF', cb: '#8566CC', cbd: '#B8A0F0' }, // 湛藍（和資產宇宙的太陽同色）
  etf: { c: '#0F6FC2', d: '#3C98E6', cb: '#C4AEF0', cbd: '#DCCBFF' }, // 青藍
  fund: { c: '#7FA6E8', d: '#A8C4F2', cb: '#9A82D8', cbd: '#D2C2FA' }, // 淺灰藍
};
export function assetColor(group) {
  const p = COLORS[group] || COLORS.cash;
  if (isColorBlind()) return isDark() ? p.cbd : p.cb;
  return isDark() ? p.d : p.c;
}

/** 行星上的盈虧標示：{ text, tone, strength }；strength 0～1，報酬率越大越亮（20% 以上全亮）。 */
export function pnlTag(rate) {
  if (rate === null || rate === undefined) return null;
  const tone = toneOf(Math.abs(rate) < 0.0005 ? 0 : rate);
  return { text: rateText(tone === 'flat' ? 0 : rate), tone, strength: Math.min(1, Math.abs(rate) / 0.2) };
}

/**
 * @param {object[]} accounts
 * @param {Map<string, number>} bal accounts.js 的 balances()
 * @param {object[]} holdings
 * @returns {{items:object[], rows:object[], cash:number, bank:number, credit:number, holdings:number, net:number}}
 *   items：畫行星用（只有金額大於 0 的）；rows：明細列表用（全部，含 0 與信用卡）
 */
export function assetSummary(accounts, bal, holdings) {
  const rows = [];
  let cash = 0;
  let bank = 0;
  let credit = 0;
  for (const a of accounts) {
    const v = bal.get(a.id) || 0;
    if (a.kind === 'credit') { credit += v; rows.push({ id: `a:${a.id}`, type: 'account', kind: 'credit', group: 'credit', name: a.name, amount: v, acc: a }); continue; }
    if (a.kind === 'cash') cash += v; else bank += v;
    rows.push({ id: `a:${a.id}`, type: 'account', kind: a.kind, group: a.kind, name: a.name, amount: v, acc: a, color: assetColor(a.kind) });
  }
  for (const h of holdings) {
    const rate = rateOf(h);
    rows.push({ id: `h:${h.id}`, type: 'holding', kind: h.kind, group: h.kind, name: h.name, amount: valueOf(h), hold: h, rate, color: assetColor(h.kind) });
  }
  const hv = holdingsValue(holdings);
  const items = rows
    .filter((r) => r.group !== 'credit' && r.amount > 0)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, amount: r.amount, group: r.group, rate: r.rate === undefined ? null : r.rate }));
  return { items, rows, cash, bank, credit, holdings: hv, net: cash + bank + hv - credit };
}

/** 明細裡每一列的小標：「現金」「存款」「股票・2330」。 */
export function rowKindText(r) {
  if (r.type === 'holding') return `${HKINDS[r.kind].name}${r.hold.code ? `・${r.hold.code}` : ''}`;
  return { cash: '現金', bank: '存款', credit: '信用卡' }[r.kind] || '';
}
