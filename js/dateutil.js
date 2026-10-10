// 日期與期間計算：全部以裝置的本地時區為準，一週從週一開始。

export const LEVELS = ['day', 'week', 'month', 'year'];
export const LEVEL_NAMES = { day: '日', week: '週', month: '月', year: '年' };

const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 回傳 date 所在期間的第一天（00:00）。 */
export function startOfPeriod(date, level) {
  const d = startOfDay(date);
  switch (level) {
    case 'day':
      return d;
    case 'week': {
      const sinceMonday = (d.getDay() + 6) % 7;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'year':
      return new Date(d.getFullYear(), 0, 1);
    default:
      throw new Error(`未知的層級：${level}`);
  }
}

/** start 必須是期間的第一天；回傳往前（負數）或往後（正數）n 個期間的第一天。 */
export function addPeriods(start, level, n) {
  switch (level) {
    case 'day':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
    case 'week':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * n);
    case 'month':
      return new Date(start.getFullYear(), start.getMonth() + n, 1);
    case 'year':
      return new Date(start.getFullYear() + n, 0, 1);
    default:
      throw new Error(`未知的層級：${level}`);
  }
}

/** 期間的最後一天（含）。 */
export function endOfPeriod(start, level) {
  const next = addPeriods(start, level, 1);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
}

/** Date → 'YYYY-MM-DD'（本地時區）。帳目的日期就用這個格式存，不會有時區造成差一天的問題。 */
export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date（當天 00:00，本地時區）；格式或日期不合法時回傳 null。 */
export function fromKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, da);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da ? d : null;
}

/** 新增視窗上的日期文字：今天／昨天／10月08日（不是今年時加年份）。 */
export function shortDate(d, now) {
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  const md = `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

export function fullDate(d) {
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
}

/**
 * 頂部日期標籤。
 * 日：2026年10月10日；週：2026年10月05日-2026年10月11日；
 * 月：2026年10月；年：2026年。
 */
export function periodLabel(start, level, now) {
  switch (level) {
    case 'day':
      return fullDate(start);
    case 'week':
      return `${fullDate(start)}-${fullDate(endOfPeriod(start, 'week'))}`;
    case 'month': {
      return `${start.getFullYear()}年${start.getMonth() + 1}月`;
    }
    case 'year':
      return `${start.getFullYear()}年`;
    default:
      throw new Error(`未知的層級：${level}`);
  }
}

/** 還能不能往較近的期間滑（最近只到今天所在的期間）。 */
export function canGoForward(anchor, level, now) {
  return startOfPeriod(anchor, level).getTime() < startOfPeriod(now, level).getTime();
}

/** 以 anchor 所在期間為基準，移動 n 個期間，並限制不超過今天所在期間；回傳新的 anchor。 */
export function shiftAnchor(anchor, level, n, now) {
  const next = addPeriods(startOfPeriod(anchor, level), level, n);
  const limit = startOfPeriod(now, level);
  return next.getTime() > limit.getTime() ? limit : next;
}

export function levelUp(level) {
  const i = LEVELS.indexOf(level);
  return LEVELS[Math.min(i + 1, LEVELS.length - 1)];
}

export function levelDown(level) {
  const i = LEVELS.indexOf(level);
  return LEVELS[Math.max(i - 1, 0)];
}
