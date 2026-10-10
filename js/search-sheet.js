// 搜尋頁：上方是查詢內容（點一下可以重新輸入），下面是「日／週／月／年」的總額卡（左右滑動切換範圍），
// 再下面是範圍內所有符合的紀錄。範圍以主畫面目前看的日期為準。支出金額紅色、收入綠色。

import { makeSheet } from './sheet.js';
import { createCarousel } from './carousel.js';
import { LEVELS, LEVEL_NAMES, startOfPeriod, endOfPeriod, periodLabel, toKey } from './dateutil.js';
import { makeRow, transferText } from './rows.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('zh-TW');

/** 是否符合查詢：具體事項、類別名稱，或轉帳的帳戶名稱（不分大小寫）。 */
export function matches(e, q) {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  const hay = [e.note, e.cat && e.cat.name, e.type === 'transfer' ? transferText(e) : ''].join(' ').toLowerCase();
  return hay.includes(s);
}

/**
 * @param {{getViews:()=>object[], getAnchor:()=>Date, getLevel:()=>string}} deps
 *   getViews：全部真實帳目（toView 後的格式）
 */
export function createSearchSheet({ getViews, getAnchor, getLevel }) {
  const el = $('search-sheet');
  const input = $('search-input');
  const list = $('search-list');
  const count = $('search-count');
  let level = 'month';
  let timer = 0;

  const sheet = makeSheet(el, {
    onOpen() {
      level = getLevel();
      draw();
    },
  });

  function card(it) {
    const box = document.createElement('span');
    box.className = 'rc';
    const top = document.createElement('span');
    top.className = 'rc-top';
    top.textContent = `${LEVEL_NAMES[it.id]}・${it.label}`;
    box.appendChild(top);
    const sums = document.createElement('span');
    sums.className = 'rc-sums';
    if (it.exp === 0 && it.inc === 0) {
      const z = document.createElement('span');
      z.className = 'rc-none';
      z.textContent = it.q ? '沒有符合的紀錄' : '輸入要找的內容';
      sums.appendChild(z);
    }
    if (it.exp > 0) {
      const x = document.createElement('span');
      x.className = 'rc-exp';
      x.textContent = `-NT$ ${nf.format(it.exp)}`;
      sums.appendChild(x);
    }
    if (it.inc > 0) {
      const x = document.createElement('span');
      x.className = 'rc-inc';
      x.textContent = `+NT$ ${nf.format(it.inc)}`;
      sums.appendChild(x);
    }
    box.appendChild(sums);
    return box;
  }

  const car = createCarousel($('search-car'), {
    label: '搜尋範圍',
    renderItem: card,
    onChange(item) {
      if (!item) return;
      level = item.id;
      drawList();
    },
  });

  /** 某個範圍內符合的紀錄（新的在上面）。 */
  function found(lv) {
    const q = input.value;
    const start = startOfPeriod(getAnchor(), lv);
    const from = toKey(start);
    const to = toKey(endOfPeriod(start, lv));
    return getViews()
      .filter((e) => {
        const k = toKey(e.date);
        return k >= from && k <= to && matches(e, q);
      })
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  }

  function draw() {
    const today = new Date();
    const q = input.value.trim();
    const items = LEVELS.map((lv) => {
      const rows = found(lv);
      const sum = (t) => rows.filter((e) => e.type === t).reduce((s, e) => s + e.amount, 0);
      return { id: lv, label: periodLabel(startOfPeriod(getAnchor(), lv), lv, today), exp: sum('expense'), inc: sum('income'), q };
    });
    car.setItems(items, level);
    drawList();
  }

  function drawList() {
    const q = input.value.trim();
    list.replaceChildren();
    if (!q) {
      count.textContent = '';
      return;
    }
    const rows = found(level);
    count.textContent = `${LEVEL_NAMES[level]}範圍內共 ${rows.length} 筆`;
    if (rows.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = `這${LEVEL_NAMES[level]}沒有「${q}」的紀錄，左右滑動上方卡片可以換範圍`;
      list.appendChild(li);
      return;
    }
    rows.forEach((e, i) => list.appendChild(makeRow(e, { showDate: true, editable: false, index: i })));
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); draw(); input.blur(); }
  });

  return {
    open() {
      sheet.open();
      if (!input.value) input.focus(); // 在點按鈕的當下呼叫，iPhone 才會跳出鍵盤
    },
    close: () => sheet.close(),
    isOpen: () => sheet.isOpen(),
    refresh: () => { if (sheet.isOpen()) draw(); },
  };
}
