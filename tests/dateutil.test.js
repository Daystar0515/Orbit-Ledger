import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfPeriod, addPeriods, endOfPeriod, periodLabel, canGoForward, shiftAnchor, levelUp, levelDown,
} from '../js/dateutil.js';

const d = (y, m, day) => new Date(y, m - 1, day);
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

test('週從週一開始（2026-10-10 是週六）', () => {
  assert.equal(iso(startOfPeriod(d(2026, 10, 10), 'week')), '2026-10-05');
  assert.equal(iso(endOfPeriod(d(2026, 10, 5), 'week')), '2026-10-11');
  // 週日仍屬於同一週
  assert.equal(iso(startOfPeriod(d(2026, 10, 11), 'week')), '2026-10-05');
  // 週一本身
  assert.equal(iso(startOfPeriod(d(2026, 10, 5), 'week')), '2026-10-05');
});

test('跨月、跨年的週', () => {
  assert.equal(iso(startOfPeriod(d(2026, 1, 1), 'week')), '2025-12-29');
  assert.equal(iso(endOfPeriod(d(2025, 12, 29), 'week')), '2026-01-04');
});

test('月與年的起訖，含閏年', () => {
  assert.equal(iso(startOfPeriod(d(2026, 10, 10), 'month')), '2026-10-01');
  assert.equal(iso(endOfPeriod(d(2026, 10, 1), 'month')), '2026-10-31');
  assert.equal(iso(endOfPeriod(d(2024, 2, 1), 'month')), '2024-02-29');
  assert.equal(iso(endOfPeriod(d(2026, 2, 1), 'month')), '2026-02-28');
  assert.equal(iso(startOfPeriod(d(2026, 10, 10), 'year')), '2026-01-01');
  assert.equal(iso(endOfPeriod(d(2026, 1, 1), 'year')), '2026-12-31');
});

test('addPeriods 往前往後', () => {
  assert.equal(iso(addPeriods(d(2026, 3, 1), 'month', -1)), '2026-02-01');
  assert.equal(iso(addPeriods(d(2026, 1, 1), 'month', -1)), '2025-12-01');
  assert.equal(iso(addPeriods(d(2026, 10, 5), 'week', -1)), '2026-09-28');
  assert.equal(iso(addPeriods(d(2026, 1, 1), 'year', -1)), '2025-01-01');
  assert.equal(iso(addPeriods(d(2026, 3, 1), 'day', -1)), '2026-02-28');
});

test('日期標籤格式', () => {
  const now = d(2026, 10, 10);
  assert.equal(periodLabel(d(2026, 10, 10), 'day', now), '2026年10月10日');
  assert.equal(periodLabel(d(2026, 10, 5), 'day', now), '2026年10月05日');
  assert.equal(periodLabel(d(2026, 10, 5), 'week', now), '2026年10月05日-2026年10月11日');
  assert.equal(periodLabel(d(2026, 10, 1), 'month', now), '2026年10月');
  assert.equal(periodLabel(d(2025, 10, 1), 'month', now), '2025年10月');
  assert.equal(periodLabel(d(2026, 1, 1), 'year', now), '2026年');
});

test('不能滑到未來', () => {
  const now = d(2026, 10, 10);
  assert.equal(canGoForward(d(2026, 10, 10), 'day', now), false);
  assert.equal(canGoForward(d(2026, 10, 9), 'day', now), true);
  assert.equal(canGoForward(d(2026, 10, 7), 'week', now), false); // 同一週
  assert.equal(canGoForward(d(2026, 9, 30), 'week', now), true);
  assert.equal(iso(shiftAnchor(d(2026, 10, 10), 'day', 1, now)), '2026-10-10');
  assert.equal(iso(shiftAnchor(d(2026, 10, 10), 'day', -1, now)), '2026-10-09');
  assert.equal(iso(shiftAnchor(d(2026, 10, 10), 'month', -1, now)), '2026-09-01');
});

test('層級升降到頭就停', () => {
  assert.equal(levelUp('day'), 'week');
  assert.equal(levelUp('year'), 'year');
  assert.equal(levelDown('week'), 'day');
  assert.equal(levelDown('day'), 'day');
});

import { toKey, fromKey, shortDate } from '../js/dateutil.js';

test('toKey / fromKey 來回一致，不合法的日期回傳 null', () => {
  assert.equal(toKey(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(toKey(new Date(2026, 0, 1)), '2026-01-01');
  const back = fromKey('2026-02-28');
  assert.equal(toKey(back), '2026-02-28');
  assert.equal(fromKey('2026-02-30'), null);
  assert.equal(fromKey('2026-13-01'), null);
  assert.equal(fromKey('abc'), null);
  assert.equal(fromKey(''), null);
  assert.equal(toKey(fromKey('2024-02-29')), '2024-02-29');
  assert.equal(fromKey('2026-02-29'), null);
});

test('日期字串排序與日期先後一致（用來篩選期間）', () => {
  assert.ok('2026-09-30' < '2026-10-01');
  assert.ok('2025-12-31' < '2026-01-01');
});

test('shortDate：今天、昨天、同年、不同年', () => {
  const now = new Date(2026, 9, 10, 23, 59);
  assert.equal(shortDate(new Date(2026, 9, 10), now), '今天');
  assert.equal(shortDate(new Date(2026, 9, 9), now), '昨天');
  assert.equal(shortDate(new Date(2026, 9, 8), now), '10月08日');
  assert.equal(shortDate(new Date(2025, 11, 31), now), '2025年12月31日');
});
