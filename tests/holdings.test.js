import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecimal, cleanHoldings, valueOf, costOf, pnlOf, rateOf, rateText, toneOf, holdingsPnl, holdingsValue, priceNote,
  loadHoldings, getHoldings, addHolding, updateHolding, deleteHolding, applyQuotes, mergeHoldings, newHoldingCount,
} from '../js/holdings.js';
import { assetSummary, pnlTag } from '../js/asset-data.js';

const base = { id: 'h1', kind: 'stock', code: '2330', name: '台積電', shares: 10, cost: 580, price: 600, priceAt: '2026-10-08T05:30:00.000Z', priceSrc: 'live' };

test('parseDecimal：空白、小數、千分位、超過位數與格式錯誤', () => {
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('  '), null);
  assert.equal(parseDecimal('1,234.5'), 1234.5);
  assert.equal(parseDecimal('0.0001'), 0.0001);
  assert.ok(Number.isNaN(parseDecimal('0.00001')));
  assert.ok(Number.isNaN(parseDecimal('-1')));
  assert.ok(Number.isNaN(parseDecimal('abc')));
  assert.ok(Number.isNaN(parseDecimal('1e5')));
  assert.ok(Number.isNaN(parseDecimal('100000000')));
});

test('市值、成本、盈虧與報酬率', () => {
  assert.equal(valueOf(base), 6000);
  assert.equal(costOf(base), 5800);
  assert.equal(pnlOf(base), 200);
  assert.ok(Math.abs(rateOf(base) - 600 / 580 + 1) < 1e-12);
  // 零股與小數：四捨五入成整數
  const odd = { ...base, shares: 3, cost: 114.95, price: 116.05 };
  assert.equal(valueOf(odd), 348);
  assert.equal(costOf(odd), 345);
  // 基金單位數有小數
  const fund = { id: 'f', kind: 'fund', code: '', name: '某基金', shares: 123.456, cost: 10.1234, price: 10.5, priceAt: null, priceSrc: 'manual' };
  assert.equal(valueOf(fund), Math.round(123.456 * 10.5));
});

test('沒有市價時：市值暫用成本、盈虧為 0、沒有報酬率', () => {
  const h = { ...base, price: null, priceAt: null, priceSrc: null };
  assert.equal(valueOf(h), 5800);
  assert.equal(pnlOf(h), 0);
  assert.equal(rateOf(h), null);
  assert.equal(priceNote(h), '尚無市價');
  assert.equal(holdingsPnl([h]).count, 0);
});

test('成本是 0（例如贈與的股票）時沒有報酬率但不會當掉', () => {
  const h = { ...base, cost: 0 };
  assert.equal(rateOf(h), null);
  assert.equal(pnlOf(h), 6000);
});

test('報酬率文字與顏色分類', () => {
  assert.equal(rateText(0.0321), '▲ 3.2%');
  assert.equal(rateText(-0.015), '▼ 1.5%');
  assert.equal(rateText(0), '－ 0%');
  assert.equal(rateText(0.00001), '－ 0%');
  assert.equal(rateText(1.5), '▲ 150%');
  assert.equal(rateText(null), '');
  assert.equal(toneOf(5), 'gain');
  assert.equal(toneOf(-5), 'loss');
  assert.equal(toneOf(0), 'flat');
});

test('pnlTag：越高報酬越亮，20% 以上全亮', () => {
  assert.equal(pnlTag(null), null);
  assert.equal(pnlTag(0.1).strength, 0.5);
  assert.equal(pnlTag(0.5).strength, 1);
  assert.equal(pnlTag(-0.05).tone, 'loss');
  assert.equal(pnlTag(0.0001).tone, 'flat');
});

test('priceNote：今天／較早／手動輸入', () => {
  const now = new Date('2026-10-08T10:00:00');
  const at = new Date('2026-10-08T09:05:00').toISOString();
  assert.equal(priceNote({ ...base, priceAt: at, priceSrc: 'live' }, now), '今天 09:05 即時');
  const old = new Date('2026-10-05T13:30:00').toISOString();
  assert.equal(priceNote({ ...base, priceAt: old, priceSrc: 'close' }, now), '10/05 13:30 收盤');
  assert.equal(priceNote({ ...base, priceAt: old, priceSrc: 'manual' }, now), '手動輸入 10/05');
});

test('cleanHoldings：丟掉壞資料、整理欄位、補名稱', () => {
  const list = cleanHoldings([
    base,
    { ...base, id: 'h1' }, // 重複編號
    { ...base, id: 'bad1', shares: 0 },
    { ...base, id: 'bad2', kind: 'crypto' },
    { ...base, id: 'bad3', cost: -1 },
    { ...base, id: 'ok2', code: ' 0050 ', name: '', price: 'x' },
    null,
  ]);
  assert.deepEqual(list.map((h) => h.id), ['h1', 'ok2']);
  assert.equal(list[1].code, '0050');
  assert.equal(list[1].name, '0050');
  assert.equal(list[1].price, null);
  assert.equal(list[1].priceSrc, null);
  assert.deepEqual(cleanHoldings('x'), []);
});

test('新增、修改、刪除與通知', () => {
  loadHoldings(null);
  let calls = 0;
  const h = addHolding({ kind: 'etf', code: '0050', name: '元大台灣50', shares: 100, cost: 150 });
  assert.ok(h && h.id);
  assert.equal(getHoldings().length, 1);
  assert.equal(addHolding({ kind: 'etf', code: '0050', name: 'x', shares: 0, cost: 1 }), null);
  const u = updateHolding(h.id, { shares: 120.5 });
  assert.equal(u.shares, 120.5);
  assert.equal(updateHolding('nope', { shares: 1 }), null);
  assert.equal(updateHolding(h.id, { shares: -1 }), null);
  assert.equal(getHoldings()[0].shares, 120.5);
  assert.ok(deleteHolding(h.id));
  assert.equal(deleteHolding(h.id), false);
  assert.equal(calls, 0);
});

test('applyQuotes：只更新股票與 ETF，不動基金，也不改使用者編輯時間', () => {
  loadHoldings([
    { ...base, id: 'a', price: null, priceAt: null, priceSrc: null, updatedAt: 111 },
    { id: 'b', kind: 'fund', code: '2330', name: '基金', shares: 1, cost: 10, price: 12, priceAt: null, priceSrc: 'manual' },
    { ...base, id: 'c', kind: 'etf', code: '0050', price: null, priceAt: null, priceSrc: null },
  ]);
  const n = applyQuotes({ 2330: { price: 2550, source: 'live', date: '20261008' }, '0050': { price: 0 } }, '2026-10-10T08:00:00.000Z');
  assert.equal(n, 1);
  const [a, b, c] = getHoldings();
  assert.equal(a.price, 2550);
  assert.equal(a.priceSrc, 'live');
  assert.equal(a.priceDate, '20261008');
  assert.equal(a.updatedAt, 111);
  assert.equal(b.price, 12); // 基金即使代碼相同也不自動更新
  assert.equal(c.price, null);
});

test('assetSummary：淨資產與行星項目', () => {
  const accounts = [
    { id: 'c1', kind: 'cash', name: '錢包' },
    { id: 'k1', kind: 'credit', name: '信用卡' },
    { id: 'b1', kind: 'bank', name: '郵局' },
    { id: 'b2', kind: 'bank', name: '空帳戶' },
  ];
  const bal = new Map([['c1', 1000], ['k1', 300], ['b1', 5000], ['b2', 0]]);
  const s = assetSummary(accounts, bal, [base]);
  assert.equal(s.cash, 1000);
  assert.equal(s.bank, 5000);
  assert.equal(s.credit, 300);
  assert.equal(s.holdings, 6000);
  assert.equal(s.net, 1000 + 5000 + 6000 - 300);
  assert.deepEqual(s.items.map((i) => i.id).sort(), ['a:b1', 'a:c1', 'h:h1']);
  assert.equal(s.rows.length, 5); // 含信用卡與餘額 0 的帳戶
  assert.ok(s.items.find((i) => i.id === 'h:h1').rate > 0);
  assert.equal(s.items.find((i) => i.id === 'a:c1').rate, null);
});

test('holdingsValue 與 holdingsPnl 合計', () => {
  const list = [base, { ...base, id: 'x', shares: 5, cost: 100, price: 80 }, { ...base, id: 'y', price: null }];
  assert.equal(holdingsValue(list), 6000 + 400 + 5800);
  const p = holdingsPnl(list);
  assert.equal(p.pnl, 200 - 100);
  assert.equal(p.count, 2);
  assert.ok(Math.abs(p.rate - 100 / 6300) < 1e-12);
});

test('匯入合併：新的加入、較新的更新、較舊的略過', () => {
  loadHoldings([{ ...base, updatedAt: 100 }]);
  const incoming = [
    { ...base, shares: 99, updatedAt: 50 }, // 較舊：略過
    { ...base, id: 'h2', code: '0050', kind: 'etf', updatedAt: 10 },
  ];
  assert.equal(newHoldingCount(incoming), 1);
  assert.equal(mergeHoldings(incoming), 1);
  assert.equal(getHoldings().length, 2);
  assert.equal(getHoldings()[0].shares, 10);
  assert.equal(mergeHoldings([{ ...base, shares: 77, updatedAt: 200 }]), 1);
  assert.equal(getHoldings()[0].shares, 77);
});
