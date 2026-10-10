// 信用卡的結帳日／繳款日、存款的計息日／發息日，以及提醒（純函式，方便測試）。
//
// 網頁 App 沒有伺服器，沒辦法在 App 關著的時候主動推播；所以提醒有兩條路：
//   1. 打開 Orbit 時，如果今天剛好是「當天／前一天／前一週」，就在畫面上提醒。
//   2. 匯出成 iPhone 行事曆（.ics，每月重複、附鬧鐘），由系統行事曆負責準時通知。

import { toKey } from './dateutil.js';

export const EVENT_NAMES = { statement: '結帳日', due: '繳款日', accrual: '計息日', payout: '發息日' };
export const FREQ_NAMES = { monthly: '每月', quarterly: '每季（3、6、9、12 月）', semiannual: '每半年（6、12 月）', annual: '每年（12 月）' };
const FREQ_MONTHS = { monthly: null, quarterly: [3, 6, 9, 12], semiannual: [6, 12], annual: [12] };

/** 某個帳戶某種日子的規則：{ day, months }（months 是 null 代表每個月）；沒設定就回傳 null。 */
export function eventSpec(acc, ev) {
  const day = { statement: acc.statementDay, due: acc.dueDay, accrual: acc.accrualDay, payout: acc.payDay }[ev];
  if (!day) return null;
  return { day, months: ev === 'payout' ? FREQ_MONTHS[acc.payFreq] || null : null };
}

/** 從 from（含）開始，下一個符合規則的日子。 */
export function nextOccurrence(spec, from) {
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let k = 0; k < 14; k += 1) {
    const y = f.getFullYear();
    const m = f.getMonth() + k;
    const d = dayInMonth(y, m, spec.day);
    if ((!spec.months || spec.months.includes(d.getMonth() + 1)) && d >= f) return d;
  }
  return null;
}

/** 依年利率估算一年的利息（簡單估算，實際以銀行為準）。 */
export const yearlyInterest = (balance, rate) => (balance > 0 && rate > 0 ? Math.round((balance * rate) / 100) : 0);
export const OFFSET_NAMES = { 0: '當天', 1: '前一天', 7: '前一週' };

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/** 某年某月的第 day 天；那個月沒有這一天（例如 2 月 30 日）就用月底。 */
export function dayInMonth(y, m, day) {
  return new Date(y, m, Math.min(day, daysIn(y, m)));
}

/** 從 from 那天（含）開始，下一個「每月 day 日」。 */
export function nextMonthly(day, from) {
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const here = dayInMonth(f.getFullYear(), f.getMonth(), day);
  return here >= f ? here : dayInMonth(f.getFullYear(), f.getMonth() + 1, day);
}

const daysBetween = (a, b) => Math.round((b - a) / 86400000);

/** 「10/20（還有 10 天）」這類的文字。 */
export function whenText(date, today) {
  const n = daysBetween(new Date(today.getFullYear(), today.getMonth(), today.getDate()), date);
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  if (n === 0) return `${md}（今天）`;
  if (n === 1) return `${md}（明天）`;
  return `${md}（${n} 天後）`;
}

/**
 * 今天該提醒的項目。
 * @returns {{acc:object, event:'statement'|'due', date:Date, offset:number, key:string}[]}
 */
export function dueReminders(accounts, today) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out = [];
  for (const a of accounts) {
    const can = a.kind === 'credit' || (a.kind === 'bank' && a.interestOn);
    if (!can || !a.remind || !a.remind.on) continue;
    for (const ev of a.remind.events) {
      const spec = eventSpec(a, ev);
      if (!spec) continue;
      for (const off of a.remind.offsets) {
        // 今天往後推 off 天，剛好是那一天，就提醒
        const target = new Date(t.getFullYear(), t.getMonth(), t.getDate() + off);
        const hit = nextOccurrence(spec, target);
        if (hit && toKey(hit) === toKey(target)) {
          out.push({ acc: a, event: ev, date: target, offset: off, key: `${a.id}:${ev}:${toKey(target)}:${off}` });
        }
      }
    }
  }
  return out;
}

/** 提醒的一句話：「玉山卡 繳款日 10/20（明天）」 */
export function reminderText(r, today) {
  return `${r.acc.name} ${EVENT_NAMES[r.event]} ${whenText(r.date, today)}`;
}

// ---- 行事曆（.ics） ----

const icsDate = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const icsEscape = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** 每月（或指定月份）day 日的重複規則；29～31 日在較短的月份改成月底。 */
export function monthlyRule(day, months = null) {
  const by = months ? `;BYMONTH=${months.join(',')}` : '';
  if (day <= 28) return `FREQ=MONTHLY${by};BYMONTHDAY=${day}`;
  const days = [];
  for (let d = 28; d <= day; d += 1) days.push(d);
  return `FREQ=MONTHLY${by};BYMONTHDAY=${days.join(',')};BYSETPOS=-1`;
}

/** 提前 off 天、早上 9 點的鬧鐘（全天事件從 00:00 起算）。 */
export function alarmTrigger(off) {
  if (off === 0) return 'PT9H';
  return off === 1 ? '-PT15H' : `-P${off - 1}DT15H`;
}

/**
 * 產生一個帳戶的行事曆檔（每種要提醒的日子各一個重複的全天事件）。
 * @param {object} acc 信用卡或有設定利率的存款帳戶
 * @param {Date} today
 */
export function buildIcs(acc, today, stamp = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Ledger//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = acc.remind && acc.remind.events ? acc.remind.events : ['due'];
  for (const ev of events) {
    const spec = eventSpec(acc, ev);
    if (!spec) continue;
    const { day } = spec;
    const first = nextOccurrence(spec, today);
    const next = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${acc.id}-${ev}@orbit-ledger`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(first)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `RRULE:${monthlyRule(day, spec.months)}`,
      `SUMMARY:${icsEscape(`${acc.name} ${EVENT_NAMES[ev]}`)}`,
      `DESCRIPTION:${icsEscape(`Orbit 提醒：${acc.name} ${spec.months ? `${spec.months.join('、')} 月` : '每月'} ${day} 日${EVENT_NAMES[ev]}`)}`,
    );
    for (const off of acc.remind && acc.remind.offsets ? acc.remind.offsets : [1]) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`${acc.name} ${EVENT_NAMES[ev]}（${OFFSET_NAMES[off]}）`)}`, `TRIGGER:${alarmTrigger(off)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
