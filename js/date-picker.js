// 點頂部日期開啟的選擇器：上方切換日／週／月／年，下方依層級顯示月曆、月份或年份。
// 切換層級會立刻套用（日期不變）；點選某一天／月／年會跳到那裡並關閉視窗。
// 可以選到兩年後（用來查看或預先記未來的收支）。

import { makeSheet } from './sheet.js';
import { startOfDay, startOfPeriod, toKey } from './dateutil.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {{getLevel:()=>string, getAnchor:()=>Date, getEntryKeys:()=>Set<string>,
 *          onLevel:(level:string)=>void, onPick:(level:string, date:Date)=>void}} deps
 */
export function createDatePicker({ getLevel, getAnchor, getEntryKeys, onLevel, onPick }) {
  const el = $('date-sheet');
  const levels = $('dp-levels');
  const title = $('dp-title');
  const grid = $('dp-grid');
  const weekdays = $('dp-weekdays');
  const prev = $('dp-prev');
  const next = $('dp-next');
  let level = 'day';
  let cursor = new Date(); // 月曆正在看的月份（日／週）或年份（月）

  const sheet = makeSheet(el, {
    onOpen() {
      level = getLevel();
      cursor = new Date(getAnchor());
      draw();
    },
  });

  function cell(text, { on = false, disabled = false, today = false, dot = false, faint = false, data = {} } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `dp-cell${on ? ' on' : ''}${today ? ' today' : ''}${faint ? ' faint' : ''}`;
    b.disabled = disabled;
    b.textContent = text;
    if (dot) {
      const d = document.createElement('span');
      d.className = 'dp-dot';
      b.appendChild(d);
    }
    Object.entries(data).forEach(([k, v]) => { b.dataset[k] = v; });
    return b;
  }

  function draw() {
    levels.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.level === level;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const now = new Date();
    const today = startOfDay(now);
    const maxDate = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()); // 最遠到兩年後
    const anchor = startOfDay(getAnchor());
    const keys = getEntryKeys();
    grid.replaceChildren();
    grid.dataset.mode = level === 'week' || level === 'day' ? 'days' : level;
    weekdays.hidden = !(level === 'day' || level === 'week');

    if (level === 'day' || level === 'week') {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      title.textContent = `${y}年${m + 1}月`;
      const first = new Date(y, m, 1);
      const offset = (first.getDay() + 6) % 7; // 週一起算
      const days = new Date(y, m + 1, 0).getDate();
      const selWeek = toKey(startOfPeriod(anchor, 'week'));
      for (let i = 0; i < offset; i += 1) grid.appendChild(cell('', { disabled: true, faint: true }));
      for (let d = 1; d <= days; d += 1) {
        const date = new Date(y, m, d);
        const key = toKey(date);
        const on = level === 'day' ? key === toKey(anchor) : toKey(startOfPeriod(date, 'week')) === selWeek && getLevel() === 'week';
        grid.appendChild(cell(String(d), {
          on,
          disabled: date > maxDate,
          today: key === toKey(today),
          dot: keys.has(key),
          data: { date: key },
        }));
      }
      prev.disabled = false;
      next.disabled = y > maxDate.getFullYear() || (y === maxDate.getFullYear() && m >= maxDate.getMonth());
    } else if (level === 'month') {
      const y = cursor.getFullYear();
      title.textContent = `${y}年`;
      const months = new Set([...keys].filter((k) => k.startsWith(`${y}-`)).map((k) => k.slice(5, 7)));
      for (let m = 0; m < 12; m += 1) {
        const date = new Date(y, m, 1);
        grid.appendChild(cell(`${m + 1}月`, {
          on: getLevel() === 'month' && anchor.getFullYear() === y && anchor.getMonth() === m,
          disabled: date > maxDate,
          today: y === now.getFullYear() && m === now.getMonth(),
          dot: months.has(pad(m + 1)),
          data: { date: toKey(date) },
        }));
      }
      prev.disabled = false;
      next.disabled = y >= maxDate.getFullYear();
    } else {
      const years = new Set([...keys].map((k) => Number(k.slice(0, 4))));
      const lastYear = maxDate.getFullYear();
      const firstYear = Math.min(lastYear - 5, ...years);
      title.textContent = `${firstYear}–${lastYear}`;
      for (let y = firstYear; y <= lastYear; y += 1) {
        grid.appendChild(cell(`${y}年`, {
          on: getLevel() === 'year' && anchor.getFullYear() === y,
          today: y === now.getFullYear(),
          dot: years.has(y),
          data: { date: `${y}-01-01` },
        }));
      }
      prev.disabled = true;
      next.disabled = true;
    }
  }

  levels.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b || b.dataset.level === level) return;
    level = b.dataset.level;
    onLevel(level); // 立刻套用，日期維持不變
    cursor = new Date(getAnchor());
    draw();
  });

  prev.addEventListener('click', () => {
    if (level === 'month') cursor = new Date(cursor.getFullYear() - 1, 0, 1);
    else cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    draw();
  });
  next.addEventListener('click', () => {
    if (next.disabled) return;
    if (level === 'month') cursor = new Date(cursor.getFullYear() + 1, 0, 1);
    else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    draw();
  });

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.dp-cell');
    if (!b || b.disabled || !b.dataset.date) return;
    const [y, m, d] = b.dataset.date.split('-').map(Number);
    sheet.close();
    onPick(level, new Date(y, m - 1, d));
  });

  $('dp-today').addEventListener('click', () => {
    sheet.close();
    onPick(level, new Date());
  });

  return { open: () => sheet.open(), close: () => sheet.close(), isOpen: () => sheet.isOpen() };
}
