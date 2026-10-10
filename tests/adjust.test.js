import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAdjust, adjOptions, adjSign, cleanAdjust, adjustText, transferFee } from '../js/adjust.js';
import { balances, cleanAccounts, parseRate } from '../js/accounts.js';
import { parseBackup, buildBackup, buildCsv } from '../js/backup.js';
import { nextOccurrence, eventSpec, dueReminders, buildIcs, monthlyRule, yearlyInterest } from '../js/reminders.js';

test('支出：手續費加上去、優惠扣掉', () => {
  assert.equal(applyAdjust(1000, [{ k: 'fee', v: 15 }, { k: 'discount', v: 100 }], 'expense'), 915);
  assert.equal(applyAdjust(1000, [], 'expense'), 1000);
});

test('收入：手續費與稅金扣掉、加給加上去', () => {
  assert.equal(applyAdjust(50000, [{ k: 'fee', v: 15 }, { k: 'tax', v: 2500 }, { k: 'bonus', v: 3000 }], 'income'), 50485);
});

test('各種收支可用的項目', () => {
  assert.deepEqual(adjOptions('transfer').map((a) => a.k), ['fee']);
  assert.ok(adjOptions('expense').some((a) => a.k === 'discount'));
  assert.ok(!adjOptions('income').some((a) => a.k === 'discount'));
  assert.equal(adjSign('income', 'discount'), 0);
});

test('調整項目的清理', () => {
  assert.deepEqual(cleanAdjust([{ k: 'fee', v: 15 }, { k: 'fee', v: 3 }, { k: 'x', v: 1 }, { k: 'tip', v: 0 }, { k: 'discount', v: 1.5 }], 'expense'), [{ k: 'fee', v: 15 }]);
  assert.deepEqual(cleanAdjust([{ k: 'discount', v: 10 }], 'income'), []);
});

test('明細上的說明文字', () => {
  assert.equal(adjustText({ type: 'expense', base: 1000, adjust: [{ k: 'fee', v: 15 }, { k: 'discount', v: 100 }] }), '原價 1,000・手續費 +15・優惠折扣 −100');
  assert.equal(adjustText({ type: 'transfer', adjust: [{ k: 'fee', v: 15 }] }), '手續費 +15');
  assert.equal(adjustText({ type: 'expense' }), '');
});

test('轉帳手續費從轉出帳戶多扣', () => {
  const accs = [{ id: 'b', kind: 'bank', name: 'B', opening: 10000 }, { id: 'c', kind: 'cash', name: 'C', opening: 0 }];
  const e = { id: 't', type: 'transfer', fromId: 'b', toId: 'c', amount: 3000, date: '2026-10-10', adjust: [{ k: 'fee', v: 15 }] };
  assert.equal(transferFee(e), 15);
  const bal = balances(accs, [e]);
  assert.equal(bal.get('b'), 10000 - 3015);
  assert.equal(bal.get('c'), 3000);
});

test('備份保留原價與調整，CSV 有調整欄', () => {
  const e = { id: 'x', type: 'expense', catId: 'shopping', accountId: 'c', amount: 915, base: 1000, adjust: [{ k: 'fee', v: 15 }, { k: 'discount', v: 100 }], date: '2026-10-10', note: '外套', createdAt: 1 };
  const res = parseBackup(buildBackup([e]));
  assert.deepEqual(res.entries[0], e);
  const bad = JSON.stringify({ app: 'orbit', version: 3, entries: [{ ...e, base: undefined }] });
  assert.equal(parseBackup(bad).entries.length, 0); // 有調整卻沒有原價：視為壞資料
  const csv = buildCsv([e], [{ id: 'c', name: '錢包' }]);
  assert.ok(csv.includes('2026-10-10,支出,購物,外套,915,錢包,原價 1,000・手續費 +15・優惠折扣 −100') || csv.includes('"原價 1,000・手續費 +15・優惠折扣 −100"'));
});

test('存款利率：輸入、清理、估算', () => {
  assert.equal(parseRate('1.5'), 1.5);
  assert.equal(parseRate('1.5%'), 1.5);
  assert.equal(parseRate('0'), null);
  assert.equal(parseRate('abc'), null);
  assert.equal(parseRate('101'), null);
  const [a] = cleanAccounts([{ id: 'b', kind: 'bank', name: '郵局', opening: 0, interestOn: true, rate: 1.5, accrualDay: 21, payDay: 21, payFreq: 'weird', remind: { on: true, offsets: [0], events: ['due', 'payout'] } }]);
  assert.deepEqual(a, { id: 'b', kind: 'bank', name: '郵局', opening: 0, interestOn: true, rate: 1.5, accrualDay: 21, payDay: 21, payFreq: 'semiannual', remind: { on: true, offsets: [0], events: ['payout'] } });
  const [off] = cleanAccounts([{ id: 'b', kind: 'bank', name: '郵局', opening: 0, interestOn: false, rate: 1.5 }]);
  assert.deepEqual(off, { id: 'b', kind: 'bank', name: '郵局', opening: 0 });
  assert.equal(yearlyInterest(46000, 1.5), 690);
  assert.equal(yearlyInterest(-5, 1.5), 0);
});

test('發息日：每半年只在 6、12 月', () => {
  const acc = { kind: 'bank', interestOn: true, accrualDay: 21, payDay: 21, payFreq: 'semiannual', remind: { on: true, offsets: [0, 7], events: ['accrual', 'payout'] } };
  const k = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  assert.equal(k(nextOccurrence(eventSpec(acc, 'payout'), new Date(2026, 9, 10))), '2026-12-21');
  assert.equal(k(nextOccurrence(eventSpec(acc, 'accrual'), new Date(2026, 9, 10))), '2026-10-21');
  assert.equal(k(nextOccurrence(eventSpec({ ...acc, payFreq: 'quarterly', payDay: 31 }, 'payout'), new Date(2026, 9, 10))), '2026-12-31');
  assert.equal(k(nextOccurrence(eventSpec({ ...acc, payFreq: 'quarterly', payDay: 31 }, 'payout'), new Date(2027, 0, 1))), '2027-3-31');
  const r = (d) => dueReminders([acc], d).map((x) => `${x.event}:${x.offset}`).sort();
  assert.deepEqual(r(new Date(2026, 9, 14)), ['accrual:7']);
  assert.deepEqual(r(new Date(2026, 10, 21)), ['accrual:0']); // 11 月沒有發息
  assert.deepEqual(r(new Date(2026, 11, 21)), ['accrual:0', 'payout:0']);
  assert.deepEqual(dueReminders([{ ...acc, interestOn: false }], new Date(2026, 11, 21)), []);
  assert.equal(monthlyRule(21, [6, 12]), 'FREQ=MONTHLY;BYMONTH=6,12;BYMONTHDAY=21');
  const ics = buildIcs({ id: 'b', name: '郵局', ...acc }, new Date(2026, 9, 10));
  assert.ok(ics.includes('RRULE:FREQ=MONTHLY;BYMONTH=6,12;BYMONTHDAY=21') && ics.includes('SUMMARY:郵局 發息日') && ics.includes('DTSTART;VALUE=DATE:20261221'));
});
