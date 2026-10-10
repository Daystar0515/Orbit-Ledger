// 理財持有：股票、ETF、基金。
// 持有清單存在資料庫的 meta 裡（key: 'holdings'）。這個檔案不碰畫面，方便用 Node 測試。
//
// 持有格式：
//   { id, kind:'stock'|'etf'|'fund', code, name,
//     shares     持有股數／單位數（可有小數，最多 4 位）
//     cost       平均成本（每股／每單位，最多 4 位小數）
//     price      目前市價（沒有就是 null；沒有市價時，市值暫用成本計算）
//     priceAt    市價取得（或手動輸入）的時間，ISO 字串
//     priceSrc   'live' 盤中即時｜'prev' 昨收｜'close' 收盤｜'manual' 手動輸入
//     priceDate  報價所屬的交易日（來源給什麼就存什麼，只用來參考）
//     updatedAt  使用者最後一次編輯的時間（備份合併用；自動更新市價不會改它） }
// 金額：市值與成本都四捨五入成新台幣整數。

export const HKINDS = {
  stock: { name: '股票', sample: '2330' },
  etf: { name: 'ETF', sample: '0050' },
  fund: { name: '基金', sample: '' },
};
export const HKIND_ORDER = ['stock', 'etf', 'fund'];
export const AUTO_KINDS = ['stock', 'etf']; // 可以自動更新市價的類型（基金沒有穩定的免費來源）
export const SRC_NAMES = { live: '即時', prev: '昨收', close: '收盤', manual: '手動輸入' };
export const HOLD_MAX = 60;
export const NAME_MAX = 16;
export const CODE_MAX = 10;
export const NUM_MAX = 99999999;
export const CODE_RE = /^[0-9A-Z]{4,7}$/;

const round4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * 把輸入的文字變成數字（可有小數）。空白回傳 null；格式不對或超出範圍回傳 NaN。
 * 允許千分位逗號與空白。
 */
export function parseDecimal(text, { max = NUM_MAX, places = 4 } = {}) {
  const t = String(text ?? '').replace(/[,\s]/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const frac = t.split('.')[1];
  if (frac && frac.length > places) return NaN;
  const n = Number(t);
  return n <= max ? n : NaN;
}

const cleanNum = (v, { allowZero }) => (typeof v === 'number' && Number.isFinite(v) && (allowZero ? v >= 0 : v > 0) && v <= NUM_MAX ? round4(v) : null);
const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanHoldings(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((h) => h && typeof h.id === 'string' && h.id && h.id.length <= 100 && HKINDS[h.kind])
    .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .map((h) => {
      const shares = cleanNum(h.shares, { allowZero: false });
      const cost = cleanNum(h.cost, { allowZero: true });
      const code = cleanStr(h.code, CODE_MAX).toUpperCase();
      const name = cleanStr(h.name, NAME_MAX) || code;
      if (shares === null || cost === null || !name) return null;
      const price = cleanNum(h.price, { allowZero: false });
      const at = typeof h.priceAt === 'string' && !Number.isNaN(new Date(h.priceAt).getTime()) ? h.priceAt : null;
      const out = { id: h.id, kind: h.kind, code, name, shares, cost, price, priceAt: price === null ? null : at };
      out.priceSrc = price !== null && SRC_NAMES[h.priceSrc] ? h.priceSrc : price !== null ? 'manual' : null;
      out.priceDate = price !== null && typeof h.priceDate === 'string' ? h.priceDate.slice(0, 12) : null;
      out.updatedAt = Number.isFinite(h.updatedAt) && h.updatedAt > 0 ? h.updatedAt : 0;
      return out;
    })
    .filter(Boolean)
    .slice(0, HOLD_MAX);
}

// ---- 計算（純函式） ----

export const hasPrice = (h) => h.price !== null && h.price !== undefined;
/** 成本（新台幣整數）。 */
export const costOf = (h) => Math.round(h.shares * h.cost);
/** 目前市值（新台幣整數）。沒有市價時暫用成本，淨資產才不會少算。 */
export const valueOf = (h) => Math.round(h.shares * (hasPrice(h) ? h.price : h.cost));
/** 盈虧金額；沒有市價時是 0。 */
export const pnlOf = (h) => (hasPrice(h) ? valueOf(h) - costOf(h) : 0);
/** 報酬率（0.052 代表 +5.2%）；沒有市價或成本是 0 時是 null。 */
export const rateOf = (h) => (hasPrice(h) && h.cost > 0 ? h.price / h.cost - 1 : null);
export const holdingsValue = (list) => list.reduce((s, h) => s + valueOf(h), 0);
export const holdingsCost = (list) => list.filter(hasPrice).reduce((s, h) => s + costOf(h), 0);
/** 所有有市價的持有合計的盈虧與報酬率。 */
export function holdingsPnl(list) {
  const priced = list.filter(hasPrice);
  const cost = priced.reduce((s, h) => s + costOf(h), 0);
  const pnl = priced.reduce((s, h) => s + pnlOf(h), 0);
  return { pnl, rate: cost > 0 ? pnl / cost : null, count: priced.length };
}

/** 報酬率的顯示文字：▲ 3.2%、▼ 1.5%、－ 0%。 */
export function rateText(rate) {
  if (rate === null || rate === undefined) return '';
  const p = Math.abs(rate) * 100;
  const s = p >= 100 ? String(Math.round(p)) : p.toFixed(1);
  if (Number(s) === 0) return '－ 0%';
  return `${rate > 0 ? '▲' : '▼'} ${s}%`;
}
/** 'gain' 賺｜'loss' 賠｜'flat' 持平（用在顏色）。 */
export const toneOf = (n) => (n > 0 ? 'gain' : n < 0 ? 'loss' : 'flat');

const pad = (n) => String(n).padStart(2, '0');
/** 市價的來源說明：「今天 16:20 即時」「10/09 13:30 收盤」「手動輸入 10/09」。 */
export function priceNote(h, now = new Date()) {
  if (!hasPrice(h)) return '尚無市價';
  const t = h.priceAt ? new Date(h.priceAt) : null;
  const ok = t && !Number.isNaN(t.getTime());
  const sameDay = ok && t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
  const day = ok ? (sameDay ? '今天' : `${pad(t.getMonth() + 1)}/${pad(t.getDate())}`) : '';
  const clock = ok ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
  const src = SRC_NAMES[h.priceSrc] || '';
  if (h.priceSrc === 'manual') return `手動輸入${day ? ` ${day}` : ''}`;
  return `${day} ${clock} ${src}`.trim();
}

// ---- 目前的持有清單 ----
let holdings = [];
const listeners = new Set();
export const onHoldingsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (info = {}) => listeners.forEach((fn) => fn(getHoldings(), info));

export function loadHoldings(data) { holdings = cleanHoldings(data); }
export const getHoldings = () => holdings.map((h) => ({ ...h }));
export const findHolding = (id) => holdings.find((h) => h.id === id) || null;

const newHoldId = () => `h-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addHolding(fields) {
  if (holdings.length >= HOLD_MAX) return null;
  const h = cleanHoldings([{ ...fields, id: newHoldId(), updatedAt: Date.now() }])[0];
  if (!h) return null;
  holdings.push(h);
  emit();
  return h;
}
export function updateHolding(id, patch) {
  const i = holdings.findIndex((h) => h.id === id);
  if (i < 0) return null;
  const next = cleanHoldings([{ ...holdings[i], ...patch, id, updatedAt: Date.now() }])[0];
  if (!next) return null;
  holdings[i] = next;
  emit();
  return next;
}
export function deleteHolding(id) {
  const n = holdings.length;
  holdings = holdings.filter((h) => h.id !== id);
  if (holdings.length !== n) emit();
  return holdings.length !== n;
}

/**
 * 套用自動抓到的市價：只更新股票與 ETF，依代碼對應；不會改動使用者編輯的時間。
 * @param {Record<string, {price:number, source?:string, date?:string, name?:string}>} quotes
 * @returns {number} 更新了幾筆
 */
export function applyQuotes(quotes, atISO) {
  let n = 0;
  holdings = holdings.map((h) => {
    const q = AUTO_KINDS.includes(h.kind) ? quotes[h.code] : null;
    if (!q || !(q.price > 0)) return h;
    n += 1;
    return {
      ...h,
      price: round4(q.price),
      priceAt: atISO,
      priceSrc: SRC_NAMES[q.source] && q.source !== 'manual' ? q.source : 'live',
      priceDate: typeof q.date === 'string' ? q.date.slice(0, 12) : null,
    };
  });
  if (n) emit({ priceOnly: true });
  return n;
}

// ---- 匯入備份 ----
function planHoldings(incoming) {
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const add = [];
  const update = [];
  for (const h of cleanHoldings(incoming)) {
    const cur = byId.get(h.id);
    if (!cur) add.push(h);
    else if (h.updatedAt > cur.updatedAt) update.push(h);
  }
  return { add: add.slice(0, Math.max(0, HOLD_MAX - holdings.length)), update };
}
export const newHoldingCount = (incoming) => {
  const p = planHoldings(incoming);
  return p.add.length + p.update.length;
};
export function mergeHoldings(incoming) {
  const p = planHoldings(incoming);
  p.update.forEach((h) => { holdings[holdings.findIndex((x) => x.id === h.id)] = h; });
  holdings.push(...p.add);
  const n = p.add.length + p.update.length;
  if (n) emit();
  return n;
}
