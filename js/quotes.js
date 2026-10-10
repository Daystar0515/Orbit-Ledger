// 報價：向 Cloudflare Worker 詢問股票與 ETF 的目前價格（盤中是即時價，休市是最後一個交易日的價格）。
// Worker 只會收到股票代碼。網路不通或服務失效時，Orbit 會繼續顯示上次的價格，也可以手動輸入。

import { QUOTES_URL } from './config.js';
import { AUTO_KINDS, CODE_RE, applyQuotes, getHoldings, priceNote, SRC_NAMES } from './holdings.js';

const TIMEOUT_MS = 8000;
const MIN_GAP_MS = 45000; // 自動更新的最短間隔（按「更新」可以略過）
const MAX_CODES = 30;

/**
 * 向 Worker 查價。失敗（網路、逾時、格式不對）會丟出錯誤。
 * @returns {Promise<{quotes:Record<string,object>, missing:string[]}>}
 */
export async function fetchQuotes(codes, { url = QUOTES_URL, fetchImpl = globalThis.fetch, timeout = TIMEOUT_MS } = {}) {
  const list = [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter((c) => CODE_RE.test(c)))].slice(0, MAX_CODES);
  if (!list.length) return { quotes: {}, missing: [] };
  if (!url || typeof fetchImpl !== 'function') throw new Error('沒有設定報價服務');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : 0;
  try {
    const res = await fetchImpl(`${url.replace(/\/?$/, '/')}?codes=${encodeURIComponent(list.join(','))}`, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!res.ok) throw new Error(`報價服務回應 ${res.status}`);
    const data = await res.json();
    if (!data || data.ok !== true || typeof data.quotes !== 'object' || data.quotes === null) throw new Error('報價服務的回應格式不對');
    const quotes = {};
    for (const [code, q] of Object.entries(data.quotes)) {
      if (q && typeof q.price === 'number' && q.price > 0 && Number.isFinite(q.price)) {
        quotes[code] = { price: q.price, source: q.source, date: q.date, name: typeof q.name === 'string' ? q.name : '' };
      }
    }
    return { quotes, missing: list.filter((c) => !quotes[c]) };
  } finally {
    clearTimeout(timer);
  }
}

// ---- 更新狀態（給畫面顯示「市價更新於…」） ----
let status = { state: 'idle', at: 0, error: '' }; // idle | loading | ok | fail
const listeners = new Set();
export const getQuoteStatus = () => ({ ...status });
export const onQuoteStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const setStatus = (s) => { status = { ...status, ...s }; listeners.forEach((fn) => fn(getQuoteStatus())); };

/** 持有裡可以自動更新的代碼。 */
export const autoCodes = (list = getHoldings()) =>
  [...new Set(list.filter((h) => AUTO_KINDS.includes(h.kind) && CODE_RE.test(h.code)).map((h) => h.code))];

let inflight = null;
/**
 * 更新所有股票與 ETF 的市價。force：略過最短間隔。
 * @returns {Promise<{ok:boolean, updated:number, missing:string[], skipped?:boolean, error?:string}>}
 */
export function refreshPrices({ force = false, fetchImpl, url } = {}) {
  const codes = autoCodes();
  if (!codes.length) return Promise.resolve({ ok: true, updated: 0, missing: [], skipped: true });
  if (inflight) return inflight;
  if (!force && status.at && Date.now() - status.at < MIN_GAP_MS && status.state === 'ok') {
    return Promise.resolve({ ok: true, updated: 0, missing: [], skipped: true });
  }
  setStatus({ state: 'loading' });
  inflight = fetchQuotes(codes, { fetchImpl, url })
    .then(({ quotes, missing }) => {
      const updated = applyQuotes(quotes, new Date().toISOString());
      setStatus({ state: 'ok', at: Date.now(), error: '' });
      return { ok: true, updated, missing };
    })
    .catch((e) => {
      setStatus({ state: 'fail', at: Date.now(), error: String(e && e.message ? e.message : e) });
      return { ok: false, updated: 0, missing: [], error: String(e && e.message ? e.message : e) };
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** 資產頁上方那一行：「市價更新於 今天 16:20 即時」。沒有可自動更新的持有就回傳空字串。 */
export function quoteLine(list, st, now = new Date()) {
  const auto = list.filter((h) => AUTO_KINDS.includes(h.kind));
  if (!auto.length) return '';
  if (st.state === 'loading') return '市價更新中…';
  const latest = auto.filter((h) => h.priceAt).sort((a, b) => b.priceAt.localeCompare(a.priceAt))[0];
  const when = latest ? priceNote(latest, now) : '';
  if (st.state === 'fail') return when ? `暫時無法更新市價，顯示的是 ${when} 的價格` : '暫時無法更新市價，可以先手動輸入';
  return when ? `市價更新於 ${when}` : '';
}

export { SRC_NAMES };
