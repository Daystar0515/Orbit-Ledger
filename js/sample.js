// 示範資料：設定裡打開「顯示示範資料」才會出現，用來試看圓環與手勢。
// 它不會存進帳本；同一個期間每次產生的結果都一樣（用期間當亂數種子）。

import { LEVELS, startOfDay, endOfPeriod } from './dateutil.js';
import { EXPENSE_CATS, INCOME_CATS } from './cats.js';

// 每個類別的示範備註、金額範圍與出現頻率（只給示範資料用）。
const PROFILE = {
  food: { notes: ['早餐', '午餐', '晚餐', '咖啡', '宵夜'], range: [60, 260], weight: 1 },
  life: { notes: ['日用品', '水電', '手機費', '洗衣'], range: [80, 900], weight: 0.5 },
  transport: { notes: ['捷運', '公車', '計程車'], range: [20, 160], weight: 0.8 },
  shopping: { notes: ['衣服', '網購', '鞋子'], range: [200, 1800], weight: 0.35 },
  fun: { notes: ['電影', '遊戲', '聚會'], range: [100, 700], weight: 0.4 },
  study: { notes: ['書籍', '線上課程', '影印'], range: [100, 900], weight: 0.3 },
  medical: { notes: ['掛號費', '藥局'], range: [100, 800], weight: 0.15 },
  invest: { notes: ['定期定額', 'ETF'], range: [500, 3000], weight: 0.15 },
  travel: { notes: ['車票', '住宿', '門票'], range: [300, 4000], weight: 0.1 },
  salary: { notes: ['月薪'], range: [36000, 52000] },
  iinvest: { notes: ['股息', '利息'], range: [300, 4000] },
  bonus: { notes: ['績效獎金', '年終'], range: [3000, 20000] },
  pocket: { notes: ['家人給', '紅包'], range: [500, 3000] },
};

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
 * @returns {{id:string, type:'expense'|'income', cat:object, amount:number, date:Date, note:string, demo:true}[]}
 *   日期不會晚於 today。
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
      const prof = PROFILE[cat.id];
      const count = type === 'expense'
        ? Math.round(rnd() * MULT[level] * prof.weight)
        : incomeCount(cat.id, level, rnd);
      for (let i = 0; i < count; i++) {
        const [lo, hi] = prof.range;
        const amount = Math.round((lo + rnd() * (hi - lo)) / 10) * 10 || lo;
        const day = Math.floor(rnd() * (spanDays + 1));
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
        const note = prof.notes[Math.floor(rnd() * prof.notes.length)];
        entries.push({ id: `demo-${type}-${cat.id}-${i}`, type, cat, amount, date, note, demo: true });
      }
    });
  }
  return entries;
}
