import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchQuotes, refreshPrices, autoCodes, quoteLine, getQuoteStatus } from '../js/quotes.js';
import { loadHoldings, getHoldings } from '../js/holdings.js';

const ok = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
const H = (id, kind, code, extra = {}) => ({ id, kind, code, name: code, shares: 1, cost: 10, price: null, ...extra });

test('fetchQuotes：整理回傳、列出沒查到的代碼', async () => {
  let seen = '';
  const f = async (u) => { seen = u; return new Response(JSON.stringify({ ok: true, quotes: { 2330: { price: 2550, source: 'live', date: '20261008', name: '台積電' }, 9999: { price: 0 } }, missing: [] })); };
  const r = await fetchQuotes(['2330', '2330', '0050', 'bad!', '9999'], { url: 'https://w.example/', fetchImpl: f });
  assert.match(seen, /^https:\/\/w\.example\/\?codes=2330%2C0050%2C9999$/);
  assert.equal(r.quotes['2330'].price, 2550);
  assert.deepEqual(r.missing.sort(), ['0050', '9999']);
});

test('fetchQuotes：沒有有效代碼時不會發出請求', async () => {
  let called = 0;
  const r = await fetchQuotes(['x', ''], { url: 'https://w.example/', fetchImpl: async () => { called += 1; } });
  assert.equal(called, 0);
  assert.deepEqual(r, { quotes: {}, missing: [] });
});

test('fetchQuotes：HTTP 錯誤、格式不對、網路失敗都會丟錯', async () => {
  await assert.rejects(fetchQuotes(['2330'], { url: 'https://w/', fetchImpl: ok({ ok: false }, 500) }), /500/);
  await assert.rejects(fetchQuotes(['2330'], { url: 'https://w/', fetchImpl: ok({ hello: 1 }) }), /格式/);
  await assert.rejects(fetchQuotes(['2330'], { url: 'https://w/', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /Failed/);
  await assert.rejects(fetchQuotes(['2330'], { url: '', fetchImpl: ok({}) }), /沒有設定/);
});

test('fetchQuotes：逾時會中止', async () => {
  const slow = (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(fetchQuotes(['2330'], { url: 'https://w/', fetchImpl: slow, timeout: 20 }), /aborted/);
});

test('autoCodes：只有股票與 ETF、代碼合格、去重', () => {
  const list = [H('a', 'stock', '2330'), H('b', 'etf', '2330'), H('c', 'fund', '0050'), H('d', 'stock', 'x'), H('e', 'etf', '00878')];
  assert.deepEqual(autoCodes(list), ['2330', '00878']);
});

test('refreshPrices：成功更新、失敗時保留舊價格並記錄狀態', async () => {
  loadHoldings([H('a', 'stock', '2330', { price: 2000, priceAt: '2026-10-01T00:00:00.000Z', priceSrc: 'close' }), H('f', 'fund', '', { name: '某基金', price: 12, priceSrc: 'manual' })]);
  const bad = await refreshPrices({ force: true, url: 'https://w/', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(bad.ok, false);
  assert.equal(getQuoteStatus().state, 'fail');
  assert.equal(getHoldings()[0].price, 2000);
  const good = await refreshPrices({ force: true, url: 'https://w/', fetchImpl: ok({ ok: true, quotes: { 2330: { price: 2550, source: 'live' } } }) });
  assert.deepEqual([good.ok, good.updated], [true, 1]);
  assert.equal(getHoldings()[0].price, 2550);
  assert.equal(getHoldings()[1].price, 12);
  assert.equal(getQuoteStatus().state, 'ok');
  // 剛更新過：不強制就略過
  let called = 0;
  const skip = await refreshPrices({ url: 'https://w/', fetchImpl: async () => { called += 1; } });
  assert.equal(skip.skipped, true);
  assert.equal(called, 0);
});

test('refreshPrices：沒有可更新的持有時直接略過', async () => {
  loadHoldings([H('f', 'fund', '', { name: '某基金', price: 12 })]);
  const r = await refreshPrices({ force: true, url: 'https://w/', fetchImpl: async () => { throw new Error('should not call'); } });
  assert.equal(r.skipped, true);
});

test('quoteLine：各種狀態的文字', () => {
  const now = new Date('2026-10-10T12:00:00');
  assert.equal(quoteLine([H('f', 'fund', '', { name: '某基金' })], { state: 'ok' }, now), '');
  const h = H('a', 'stock', '2330', { price: 100, priceAt: new Date('2026-10-10T09:30:00').toISOString(), priceSrc: 'live' });
  assert.equal(quoteLine([h], { state: 'ok' }, now), '市價更新於 今天 09:30 即時');
  assert.equal(quoteLine([h], { state: 'loading' }, now), '市價更新中…');
  assert.match(quoteLine([h], { state: 'fail' }, now), /暫時無法更新市價，顯示的是 今天 09:30 即時 的價格/);
  assert.match(quoteLine([H('b', 'etf', '0050')], { state: 'fail' }, now), /手動輸入/);
});
