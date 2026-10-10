// Orbit 報價轉發（Cloudflare Worker）
// 用法：GET https://<你的 worker 網址>/?codes=2330,0050,6488
// 它只會收到股票代碼，不會收到任何持股、成本或帳目。
// 先試證交所盤中即時價（mis）；沒有的話退回上市／上櫃的每日收盤價（OpenAPI）。
// 加上 &debug=1 可以看到各個來源有沒有連上，方便除錯。

const ALLOWED_ORIGINS = ['https://daystar0515.github.io'];
const MAX_CODES = 30;
const UA = 'Mozilla/5.0 (compatible; OrbitQuotes/1.0)';

const num = (v) => {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function originOk(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function headers(origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && originOk(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  }
  return h;
}

const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: headers(origin) });

/** 盤中即時價：同時問上市（tse）與上櫃（otc），查不到的那一邊不會回傳。 */
async function fetchLive(codes, dbg) {
  const ex = codes.flatMap((c) => [`tse_${c}.tw`, `otc_${c}.tw`]).join('|');
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(ex)}&json=1&delay=0&_=${Date.now()}`;
  const out = new Map();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://mis.twse.com.tw/stock/index.jsp', Accept: 'application/json' } });
    dbg.live = { status: r.status };
    if (!r.ok) return out;
    const data = await r.json();
    const arr = Array.isArray(data.msgArray) ? data.msgArray : [];
    dbg.live.rows = arr.length;
    for (const m of arr) {
      const last = num(m.z); // 最新成交價；還沒成交時是 "-"
      const prev = num(m.y); // 昨收
      const price = last || prev;
      if (!m.c || !price) continue;
      out.set(m.c, {
        name: m.n || '',
        price,
        prev,
        source: last ? 'live' : 'prev',
        market: m.ex || '',
        date: m.d || '',
        time: m.t || '',
      });
    }
  } catch (e) {
    dbg.live = { error: String(e && e.message ? e.message : e) };
  }
  return out;
}

/** 每日收盤價（官方開放資料）。整份資料很大，所以讓 Cloudflare 快取 30 分鐘。 */
async function fetchCloses(dbg) {
  const sources = [
    ['twse', 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'],
    ['tpex', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'],
  ];
  const out = new Map();
  await Promise.all(sources.map(async ([key, url]) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 1800, cacheEverything: true } });
      dbg[key] = { status: r.status };
      if (!r.ok) return;
      const rows = await r.json();
      if (!Array.isArray(rows)) return;
      dbg[key].rows = rows.length;
      if (rows[0]) dbg[key].fields = Object.keys(rows[0]);
      for (const row of rows) {
        const code = String(row.Code ?? row.SecuritiesCompanyCode ?? '').trim();
        const price = num(row.ClosingPrice ?? row.Close);
        if (!code || !price || out.has(code)) continue;
        out.set(code, { name: row.Name ?? row.CompanyName ?? '', price, prev: null, source: 'close', market: key === 'twse' ? 'tse' : 'otc', date: String(row.Date ?? ''), time: '' });
      }
    } catch (e) {
      dbg[key] = { error: String(e && e.message ? e.message : e) };
    }
  }));
  return out;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (request.method !== 'GET') return json({ ok: false, error: 'method' }, 405, origin);
    // 瀏覽器從別的網站來的請求，只接受 Orbit 的網站；直接在網址列打開（沒有 Origin）可以用來測試
    if (origin && !originOk(origin)) return json({ ok: false, error: 'origin' }, 403, origin);

    const url = new URL(request.url);
    const codes = [...new Set((url.searchParams.get('codes') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
    if (!codes.length) return json({ ok: false, error: 'codes' }, 400, origin);
    if (codes.length > MAX_CODES) return json({ ok: false, error: 'too-many' }, 400, origin);
    if (codes.some((c) => !/^[0-9A-Z]{4,7}$/.test(c))) return json({ ok: false, error: 'bad-code' }, 400, origin);

    const dbg = {};
    const live = await fetchLive(codes, dbg);
    const quotes = {};
    let missing = codes.filter((c) => !live.has(c));
    for (const c of codes) if (live.has(c)) quotes[c] = live.get(c);

    // 即時價沒有的（休市、還沒成交、來源失敗），退回每日收盤價；只有「昨收」的也改用收盤價
    const needClose = codes.filter((c) => !live.has(c) || live.get(c).source === 'prev');
    if (needClose.length) {
      const closes = await fetchCloses(dbg);
      for (const c of needClose) if (closes.has(c)) quotes[c] = closes.get(c);
      missing = codes.filter((c) => !quotes[c]);
    }

    const body = { ok: true, fetchedAt: new Date().toISOString(), quotes, missing };
    if (url.searchParams.get('debug') === '1') body.debug = dbg;
    return json(body, 200, origin);
  },
};
