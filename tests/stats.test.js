import test from 'node:test';
import assert from 'node:assert/strict';
import { totalsByCategory, sumOf } from '../js/stats.js';
import { findCat, EXPENSE_CATS, INCOME_CATS, catsOf } from '../js/cats.js';
import { buildSegments, percentText } from '../js/ring.js';

const e = (type, catId, amount) => ({ type, cat: findCat(type, catId), amount });

test('totalsByCategory：同類別加總，沒有的類別是 0，不同類型分開算', () => {
  const entries = [e('expense', 'food', 100), e('expense', 'food', 50), e('expense', 'life', 30), e('income', 'salary', 40000)];
  const exp = totalsByCategory(entries, 'expense');
  assert.equal(exp.length, EXPENSE_CATS.length);
  assert.equal(exp.find((c) => c.id === 'food').amount, 150);
  assert.equal(exp.find((c) => c.id === 'life').amount, 30);
  assert.equal(exp.find((c) => c.id === 'travel').amount, 0);
  const inc = totalsByCategory(entries, 'income');
  assert.equal(inc.length, INCOME_CATS.length);
  assert.equal(inc.find((c) => c.id === 'salary').amount, 40000);
});

test('收入與支出都有「投資」，但是兩個不同的類別，不會互相混在一起', () => {
  const entries = [e('expense', 'invest', 500), e('income', 'iinvest', 300)];
  assert.equal(totalsByCategory(entries, 'expense').find((c) => c.id === 'invest').amount, 500);
  assert.equal(totalsByCategory(entries, 'income').find((c) => c.id === 'iinvest').amount, 300);
  assert.equal(sumOf(entries, 'expense'), 500);
  assert.equal(sumOf(entries, 'income'), 300);
});

test('類別 id 不重複，也找得到', () => {
  for (const type of ['expense', 'income']) {
    const ids = catsOf(type).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    ids.forEach((id) => assert.ok(findCat(type, id)));
  }
  assert.equal(findCat('expense', 'nope'), null);
});

test('buildSegments：總額為 0 時沒有弧段', () => {
  const r = buildSegments([{ id: 'a', name: 'A', color: '#000', amount: 0 }]);
  assert.equal(r.total, 0);
  assert.equal(r.segments.length, 0);
});

test('buildSegments：由大到小排序，占比加總為 1', () => {
  const r = buildSegments([
    { id: 'a', name: 'A', color: '#111', amount: 100 },
    { id: 'b', name: 'B', color: '#222', amount: 300 },
    { id: 'c', name: 'C', color: '#333', amount: 600 },
  ]);
  assert.deepEqual(r.segments.map((s) => s.id), ['c', 'b', 'a']);
  assert.equal(r.total, 1000);
  assert.ok(Math.abs(r.segments.reduce((s, x) => s + x.fraction, 0) - 1) < 1e-9);
});

test('buildSegments：低於 3% 的類別合併成「其他」', () => {
  const r = buildSegments([
    { id: 'a', name: 'A', color: '#111', amount: 1000 },
    { id: 'b', name: 'B', color: '#222', amount: 10 },
    { id: 'c', name: 'C', color: '#333', amount: 10 },
  ]);
  assert.deepEqual(r.segments.map((s) => s.id), ['a', 'other']);
  assert.equal(r.segments[1].name, '其他');
  assert.equal(r.segments[1].amount, 20);
});

test('buildSegments：只有一個小類別時不改名，只有一個類別時占 100%', () => {
  const one = buildSegments([
    { id: 'a', name: 'A', color: '#111', amount: 1000 },
    { id: 'b', name: 'B', color: '#222', amount: 10 },
  ]);
  assert.deepEqual(one.segments.map((s) => s.id), ['a', 'b']);
  const solo = buildSegments([{ id: 'a', name: 'A', color: '#111', amount: 5 }]);
  assert.equal(solo.segments.length, 1);
  assert.equal(solo.segments[0].fraction, 1);
});

test('percentText', () => {
  assert.equal(percentText(0.5), '50%');
  assert.equal(percentText(0.004), '<1%');
  assert.equal(percentText(1), '100%');
});
