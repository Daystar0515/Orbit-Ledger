import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMonthly, dayInMonth, dueReminders, reminderText, buildIcs, monthlyRule, alarmTrigger, whenText } from '../js/reminders.js';

const d = (y, m, day) => new Date(y, m - 1, day);
const key = (x) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
const card = (o = {}) => ({ id: 'k', kind: 'credit', name: '玉山卡', opening: 0, limit: 0, statementDay: 5, dueDay: 20, remind: { on: true, offsets: [0, 1, 7], events: ['statement', 'due'] }, ...o });

test('每月某日：當月沒有那天就用月底', () => {
  assert.equal(key(dayInMonth(2026, 1, 31)), '2026-2-28');
  assert.equal(key(dayInMonth(2028, 1, 30)), '2028-2-29');
  assert.equal(key(nextMonthly(20, d(2026, 10, 10))), '2026-10-20');
  assert.equal(key(nextMonthly(20, d(2026, 10, 20))), '2026-10-20'); // 當天也算
  assert.equal(key(nextMonthly(5, d(2026, 10, 10))), '2026-11-5');
  assert.equal(key(nextMonthly(31, d(2026, 2, 1))), '2026-2-28');
  assert.equal(key(nextMonthly(31, d(2026, 12, 31))), '2026-12-31');
});

test('今天該提醒的項目：當天、前一天、前一週', () => {
  const r = (today, c = card()) => dueReminders([c], today).map((x) => `${x.event}:${x.offset}`).sort();
  assert.deepEqual(r(d(2026, 10, 20)), ['due:0']);
  assert.deepEqual(r(d(2026, 10, 19)), ['due:1']);
  assert.deepEqual(r(d(2026, 10, 13)), ['due:7']);
  assert.deepEqual(r(d(2026, 10, 29)), ['statement:7']); // 11/5 結帳日前一週
  assert.deepEqual(r(d(2026, 10, 15)), []);
  assert.deepEqual(r(d(2026, 10, 20), card({ remind: { on: false, offsets: [0], events: ['due'] } })), []);
  assert.deepEqual(r(d(2026, 10, 20), card({ remind: { on: true, offsets: [1], events: ['due'] } })), []);
  assert.deepEqual(r(d(2026, 10, 4), card({ remind: { on: true, offsets: [1], events: ['due'] } })), []); // 只提醒繳款日
  // 跨月：2/28 是 31 日卡的繳款日
  assert.deepEqual(r(d(2026, 2, 27), card({ dueDay: 31, statementDay: null })), ['due:1']);
});

test('提醒文字', () => {
  const [x] = dueReminders([card()], d(2026, 10, 19));
  assert.equal(reminderText(x, d(2026, 10, 19)), '玉山卡 繳款日 10/20（明天）');
  assert.equal(whenText(d(2026, 10, 30), d(2026, 10, 20)), '10/30（10 天後）');
});

test('行事曆檔：每月重複、全天事件、早上 9 點的鬧鐘', () => {
  assert.equal(monthlyRule(20), 'FREQ=MONTHLY;BYMONTHDAY=20');
  assert.equal(monthlyRule(31), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  assert.equal(alarmTrigger(0), 'PT9H');
  assert.equal(alarmTrigger(1), '-PT15H');
  assert.equal(alarmTrigger(7), '-P6DT15H');
  const ics = buildIcs(card(), d(2026, 10, 10), new Date(Date.UTC(2026, 9, 10, 1, 2, 3)));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 6);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261105'));
  assert.ok(ics.includes('SUMMARY:玉山卡 繳款日'));
  assert.ok(ics.includes('DTSTAMP:20261010T010203Z'));
  assert.ok(ics.includes('UID:k-due@orbit-ledger'));
});
