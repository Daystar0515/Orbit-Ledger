import test from 'node:test';
import assert from 'node:assert/strict';
import { balances, kindTotals, cleanAccounts, defaultAccounts, parseMoney } from '../js/accounts.js';
import { parseBackup, buildBackup, buildCsv, validateEntry, planImport } from '../js/backup.js';

const accs = [
  { id: 'c', kind: 'cash', name: '錢包', opening: 1000 },
  { id: 'k', kind: 'credit', name: '卡', opening: 200, limit: 50000 },
  { id: 'b', kind: 'bank', name: '郵局', opening: 10000 },
];
const E = (o) => ({ id: Math.random().toString(36), date: '2026-10-10', note: '', createdAt: 1, ...o });

test('現金／存款：期初 + 收入 − 支出 ± 轉帳；信用卡欠款方向相反', () => {
  const entries = [
    E({ type: 'expense', catId: 'food', accountId: 'c', amount: 120 }),
    E({ type: 'expense', catId: 'shopping', accountId: 'k', amount: 3000 }),
    E({ type: 'income', catId: 'salary', accountId: 'b', amount: 50000 }),
    E({ type: 'transfer', fromId: 'b', toId: 'c', amount: 3000 }), // 提款
    E({ type: 'transfer', fromId: 'b', toId: 'k', amount: 1000 }), // 繳卡費
    E({ type: 'transfer', fromId: 'k', toId: 'c', amount: 500 }), // 預借現金
    E({ type: 'expense', catId: 'food', amount: 999 }), // 沒有帳戶：不影響任何餘額
    E({ type: 'expense', catId: 'food', accountId: 'gone', amount: 999 }), // 帳戶已刪除
    { ...E({ type: 'expense', catId: 'food', accountId: 'c', amount: 999 }), demo: true }, // 示範資料
  ];
  const bal = balances(accs, entries);
  assert.equal(bal.get('c'), 1000 - 120 + 3000 + 500);
  assert.equal(bal.get('k'), 200 + 3000 - 1000 + 500);
  assert.equal(bal.get('b'), 10000 + 50000 - 3000 - 1000);
  const t = kindTotals(accs, bal);
  assert.deepEqual(t, { cash: 4380, credit: 2700, bank: 56000, net: 4380 + 56000 - 2700 });
});

test('帳戶資料清理：類型、名稱、金額、重複編號', () => {
  const out = cleanAccounts([
    { id: 'x', kind: 'cash', name: '  錢包很長很長很長很長很長  ', opening: 12.5 },
    { id: 'x', kind: 'bank', name: '重複', opening: 1 },
    { id: 'y', kind: 'gold', name: '黃金', opening: 1 },
    { id: 'z', kind: 'credit', name: '卡', opening: 5, limit: -3 },
    { id: '', kind: 'cash', name: 'a' },
  ]);
  assert.deepEqual(out, [
    { id: 'x', kind: 'cash', name: '錢包很長很長很長很長', opening: 0 },
    { id: 'z', kind: 'credit', name: '卡', opening: 5, limit: 0 },
  ]);
  assert.deepEqual(defaultAccounts().map((a) => a.kind), ['cash', 'credit', 'bank']);
});

test('金額輸入：允許逗號與空白，拒絕小數與負數', () => {
  assert.equal(parseMoney('50,000'), 50000);
  assert.equal(parseMoney(' 12 000 '), 12000);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney('1.5'), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('999999999'), null);
});

test('備份 v3：轉帳與帳戶來回不變', () => {
  const entries = [
    E({ id: 't1', type: 'transfer', fromId: 'b', toId: 'c', amount: 3000, note: '提款' }),
    E({ id: 'e1', type: 'expense', catId: 'food', accountId: 'k', amount: 250 }),
  ];
  const res = parseBackup(buildBackup(entries, new Date(2026, 9, 10), { expense: [], income: [] }, accs));
  assert.equal(res.ok, true);
  assert.deepEqual(res.accounts, accs);
  assert.deepEqual(res.entries.find((e) => e.id === 't1'), { id: 't1', type: 'transfer', fromId: 'b', toId: 'c', amount: 3000, date: '2026-10-10', note: '提款', createdAt: 1 });
  assert.equal(res.entries.find((e) => e.id === 'e1').accountId, 'k');
});

test('轉帳的格式檢查', () => {
  assert.equal(validateEntry({ id: 'a', type: 'transfer', fromId: 'x', toId: 'x', amount: 1, date: '2026-10-10' }), null);
  assert.equal(validateEntry({ id: 'a', type: 'transfer', fromId: 'x', amount: 1, date: '2026-10-10' }), null);
  assert.ok(validateEntry({ id: 'a', type: 'transfer', fromId: 'x', toId: 'y', amount: 1, date: '2026-10-10' }));
});

test('匯入：同編號但帳戶不同，視為內容不同', () => {
  const a = E({ id: 's', type: 'expense', catId: 'food', accountId: 'c', amount: 1, updatedAt: 9 });
  const b = { ...a, accountId: 'k', updatedAt: 10 };
  assert.equal(planImport([a], [b]).update.length, 1);
});

test('CSV：帳戶欄、轉帳寫成 A → B', () => {
  const csv = buildCsv([
    E({ type: 'transfer', fromId: 'b', toId: 'c', amount: 3000, note: '提款' }),
    E({ type: 'expense', catId: 'food', accountId: 'k', amount: 250, note: '午餐' }),
  ], accs);
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], '日期,收支,類別,具體事項,金額,帳戶');
  assert.ok(lines.includes('2026-10-10,轉帳,,提款,3000,郵局 → 錢包'));
  assert.ok(lines.includes('2026-10-10,支出,飲食,午餐,250,卡'));
});
