import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, planImport, buildCsv, validateEntry, backupFileName, lastBackupText } from '../js/backup.js';
import { buildSegments } from '../js/ring.js';

const e = (o = {}) => ({ id: 'a', type: 'expense', catId: 'study', amount: 350, date: '2026-10-05', note: '書本費', createdAt: 1000, ...o });
let n = 0;
const mk = () => `gen-${++n}`;

test('備份可以完整讀回，且不含示範資料', () => {
  const list = [e(), e({ id: 'b', type: 'income', catId: 'salary', amount: 50000, note: '十月薪水', updatedAt: 5 }), { ...e({ id: 'demo-1' }), demo: true }];
  const res = parseBackup(buildBackup(list, new Date(2026, 9, 10)), mk);
  assert.equal(res.ok, true);
  assert.equal(res.entries.length, 2);
  assert.deepEqual(res.entries.find((x) => x.id === 'b'), list[1]);
  assert.equal(res.skipped, 0);
});

test('壞掉或不相干的檔案會被拒絕，且說明原因', () => {
  assert.equal(parseBackup('', mk).ok, false);
  assert.match(parseBackup('{oops', mk).error, /無法讀取/);
  assert.match(parseBackup('{"app":"other","entries":[]}', mk).error, /不是 Orbit/);
  assert.match(parseBackup('{"app":"orbit","version":99,"entries":[]}', mk).error, /較新版本/);
});

test('不合格的帳目被略過並計數', () => {
  const bad = [
    e({ id: 'x1', amount: 0 }), e({ id: 'x2', amount: 1.5 }), e({ id: 'x3', amount: 1e9 }),
    e({ id: 'x4', date: '2026-02-30' }), e({ id: 'x5', date: '2026/10/05' }), e({ id: 'x6', type: 'transfer' }),
    e({ id: 'x7', catId: '' }), null, 'str', e({ id: 'ok' }), e({ id: 'ok' }),
  ];
  const res = parseBackup(JSON.stringify({ app: 'orbit', version: 1, entries: bad }), mk);
  assert.deepEqual(res.entries.map((x) => x.id), ['ok']);
  assert.equal(res.skipped, 10);
});

test('缺少編號時產生新編號；備註超過 40 字會被截短', () => {
  const v = validateEntry({ ...e(), id: undefined, note: 'x'.repeat(60) }, mk);
  assert.match(v.id, /^gen-/);
  assert.equal(v.note.length, 40);
  assert.equal(validateEntry({ ...e(), id: undefined }, null), null);
});

test('匯入計畫：新增、相同、較新者為準、匯入不刪除現有帳目', () => {
  const local = [e({ id: 'same' }), e({ id: 'edited', amount: 100, updatedAt: 50 }), e({ id: 'old', amount: 100, updatedAt: 10 }), e({ id: 'only-local' })];
  const incoming = [
    e({ id: 'same' }), e({ id: 'new' }),
    e({ id: 'edited', amount: 999, updatedAt: 40 }), // 備份較舊 → 保留手機上的
    e({ id: 'old', amount: 777, updatedAt: 20 }), // 備份較新 → 更新
  ];
  const plan = planImport(local, incoming);
  assert.deepEqual(plan.add.map((x) => x.id), ['new']);
  assert.deepEqual(plan.update.map((x) => x.id), ['old']);
  assert.equal(plan.same, 1);
  assert.equal(plan.keptLocal, 1);
});

test('同一份備份匯入兩次，第二次沒有任何變動', () => {
  const list = [e(), e({ id: 'b' })];
  const plan = planImport(list, list);
  assert.equal(plan.add.length + plan.update.length, 0);
});

test('CSV：表頭、中文類別、跳脫逗號與引號、擋掉公式', () => {
  const csv = buildCsv([
    e({ note: '午餐,便當 "大"', catId: 'food' }),
    e({ id: 'c', note: '=SUM(A1)', date: '2026-10-04' }),
    e({ id: 'd', type: 'income', catId: 'salary', note: '', amount: 100, date: '2026-10-06' }),
    { ...e({ id: 'demo' }), demo: true },
  ]);
  assert.ok(csv.startsWith('﻿日期,收支,類別,具體事項,金額,帳戶,調整\r\n'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[1], "2026-10-04,支出,學習,'=SUM(A1),350,,");
  assert.equal(lines[2], '2026-10-05,支出,飲食,"午餐,便當 ""大""",350,,');
  assert.equal(lines[3], '2026-10-06,收入,薪資,,100,,');
});

test('檔名與上次備份文字', () => {
  assert.equal(backupFileName(new Date(2026, 9, 5)), 'orbit-backup-2026-10-05.json');
  assert.equal(lastBackupText(null), '尚未備份過');
  const now = new Date(2026, 9, 10, 15, 0);
  assert.equal(lastBackupText(new Date(2026, 9, 10, 9, 5).toISOString(), now), '上次備份：今天 09:05');
  assert.equal(lastBackupText(new Date(2026, 9, 9, 23, 0).toISOString(), now), '上次備份：昨天');
  assert.equal(lastBackupText(new Date(2026, 9, 3, 1, 0).toISOString(), now), '上次備份：7 天前');
});

test('圓環弧段由大到小，「其他」固定最後', () => {
  const { segments } = buildSegments([
    { id: 'a', name: 'A', color: '#000', amount: 40 },
    { id: 'b', name: 'B', color: '#000', amount: 500 },
    { id: 'c', name: 'C', color: '#000', amount: 2 },
    { id: 'd', name: 'D', color: '#000', amount: 3 },
    { id: 'e', name: 'E', color: '#000', amount: 200 },
  ]);
  assert.deepEqual(segments.map((s) => s.id), ['b', 'e', 'a', 'other']);
});

test('版本 4：備份帶著理財持有，匯入時整理並丟掉壞資料', () => {
  const holds = [
    { id: 'h1', kind: 'stock', code: '2330', name: '台積電', shares: 10.5, cost: 580, price: 600, priceAt: '2026-10-08T05:30:00.000Z', priceSrc: 'live', updatedAt: 5 },
    { id: 'bad', kind: 'stock', shares: 0, cost: 1 },
  ];
  const text = buildBackup([], new Date('2026-10-10T00:00:00Z'), { expense: [], income: [] }, [], holds);
  const data = JSON.parse(text);
  assert.equal(data.version, 4);
  assert.equal(data.holdings.length, 2);
  const res = parseBackup(text, mk);
  assert.equal(res.ok, true);
  assert.equal(res.holdings.length, 1);
  assert.equal(res.holdings[0].shares, 10.5);
  // 舊版備份沒有 holdings 欄位
  const old = parseBackup(JSON.stringify({ app: 'orbit', version: 3, entries: [] }), mk);
  assert.deepEqual(old.holdings, []);
});
