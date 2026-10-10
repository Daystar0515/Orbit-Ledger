// 示範資料：M1 做出真正的記帳功能之前，用它來看畫面與手勢。
// 同一個期間每次產生的結果都一樣（用期間當亂數種子）。

import { LEVELS, startOfDay, endOfPeriod } from './dateutil.js';

export const EXPENSE_CATS = [
  { id: 'food', name: '飲食', color: '#E69F00', notes: ['早餐', '午餐', '晚餐', '咖啡', '宵夜'], range: [60, 260], weight: 1 },
  { id: 'life', name: '生活', color: '#009E73', notes: ['日用品', '水電', '手機費', '洗衣'], range: [80, 900], weight: 0.5 },
  { id: 'transport', name: '交通', color: '#0072B2', notes: ['捷運', '公車', '計程車'], range: [20, 160], weight: 0.8 },
  { id: 'shopping', name: '購物', color: '#CC79A7', notes: ['衣服', '網購', '鞋子'], range: [200, 1800], weight: 0.35 },
  { id: 'fun', name: '娛樂', color: '#7B5EA7', notes: ['電影', '遊戲', '聚會'], range: [100, 700], weight: 0.4 },
  { id: 'study', name: '學習', color: '#56B4E9', notes: ['書籍', '線上課程', '影印'], range: [100, 900], weight: 0.3 },
  { id: 'medical', name: '醫療', color: '#D55E00', notes: ['掛號費', '藥局'], range: [100, 800], weight: 0.15 },
  { id: 'invest', name: '投資', color: '#6B7A8F', notes: ['定期定額', 'ETF'], range: [500, 3000], weight: 0.15 },
  { id: 'travel', name: '旅行', color: '#E3B505', notes: ['車票', '住宿', '門票'], range: [300, 4000], weight: 0.1 },
];

export const INCOME_CATS = [
  { id: 'salary', name: '薪資', color: '#2E8B57', notes: ['月薪'], range: [36000, 52000] },
  { id: 'iinvest', name: '投資', color: '#3A7CA5', notes: ['股息', '利息'], range: [300, 4000] },
  { id: 'bonus', name: '獎金', color: '#E3B505', notes: ['績效獎金', '年終'], range: [3000, 20000] },
  { id: 'pocket', name: '零用', color: '#B565A7', notes: ['家人給', '紅包'], range: [500, 3000] },
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MULT = { day: 2.2, week: 4, month: 14, year: 120 };

function incomeCount(id, level, rnd) {
  const r = rnd();
  switch (id) {
    case 'salary': return level === 'month' ? 1 : level === 'year' ? 12 : 0;
    case 'bonus': return level === 'year' ? 2 : level === 'month' ? (r < 0.2 ? 1 : 0) : 0;
    case 'iinvest': return level === 'year' ? 4 : level === 'month' ? (r < 0.4 ? 1 : 0) : level === 'week' ? (r < 0.1 ? 1 : 0) : 0;
    case 'pocket': return level === 'day' ? (r < 0.15 ? 1 : 0) : level === 'week' ? Math.round(r * 2) : level === 'month' ? Math.round(r * 4) : 20;
    default: return 0;
  }
}

/**
 * 產生某期間的示範帳目。
 * @returns {{id:string, type:'expense'|'income', cat:object, amount:number, date:Date, note:string}[]}
 *   依日期由新到舊排序；日期不會晚於 today。
 */
export function makeEntries(level, start, today) {
  const end = endOfPeriod(start, level);
  const last = end.getTime() > today.getTime() ? startOfDay(today) : end;
  const spanDays = Math.max(0, Math.round((last.getTime() - start.getTime()) / 86400000));
  const entries = [];

  for (const type of ['expense', 'income']) {
    const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
    const seed = start.getFullYear() * 10000 + (start.getMonth() + 1) * 100 + start.getDate()
      + (type === 'expense' ? 11 : 29) + LEVELS.indexOf(level) * 101;
    const rnd = mulberry32(seed);

    cats.forEach((cat) => {
      const count = type === 'expense'
        ? Math.round(rnd() * MULT[level] * cat.weight)
        : incomeCount(cat.id, level, rnd);
      for (let i = 0; i < count; i++) {
        const [lo, hi] = cat.range;
        const amount = Math.round((lo + rnd() * (hi - lo)) / 10) * 10 || lo;
        const day = Math.floor(rnd() * (spanDays + 1));
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
        const note = cat.notes[Math.floor(rnd() * cat.notes.length)];
        entries.push({ id: `${type}-${cat.id}-${i}`, type, cat, amount, date, note });
      }
    });
  }

  entries.sort((a, b) => b.date - a.date || a.id.localeCompare(b.id));
  return entries;
}

/** 依類別加總某一種類型的帳目，回傳含金額的類別清單（未排序、含 0）。 */
export function totalsByCategory(entries, type) {
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  return cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    amount: entries.filter((e) => e.type === type && e.cat.id === cat.id).reduce((s, e) => s + e.amount, 0),
  }));
}
