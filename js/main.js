import {
  LEVELS, LEVEL_NAMES, startOfPeriod, periodLabel, canGoForward, shiftAnchor, levelUp, levelDown,
} from './dateutil.js';
import { makeEntries, totalsByCategory } from './sample.js';
import { buildSegments, renderRing, percentText } from './ring.js';
import { attachGestures } from './gestures.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('zh-TW');
const money = (n) => `NT$ ${nf.format(n)}`;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPE_NAMES = { expense: '支出', income: '收入' };

const state = {
  level: 'day',
  anchor: new Date(), // 目前正在看的日期；各層級都以它所在的期間為準
  type: 'expense',
  selectedId: null,
};

const els = {
  kicker: $('kicker'),
  period: $('period'),
  ring: $('ring'),
  ringWrap: $('ring-wrap'),
  ringZone: $('ring-zone'),
  dotsZone: $('dots-zone'),
  typeSwitch: $('type-switch'),
  caption: $('c-caption'),
  amount: $('c-amount'),
  sub: $('c-sub'),
  list: $('list'),
  fab: $('fab'),
  toast: $('toast'),
};

/** 重播動畫：先移除再強制重排，才能連續觸發同一個動畫。 */
function playAnim(cls) {
  const w = els.ringWrap;
  w.classList.remove('anim-from-left', 'anim-from-right', 'anim-fade', 'anim-bump');
  if (!cls || reduceMotion) return;
  void w.offsetWidth;
  w.classList.add(cls);
}

function render({ grow = true } = {}) {
  const today = new Date();
  const start = startOfPeriod(state.anchor, state.level);
  const entries = makeEntries(state.level, start, today);
  const data = buildSegments(totalsByCategory(entries, state.type));

  if (state.selectedId && !data.segments.some((s) => s.id === state.selectedId)) state.selectedId = null;
  const selected = data.segments.find((s) => s.id === state.selectedId) || null;

  // 頂部
  els.kicker.textContent = `${LEVEL_NAMES[state.level]}檢視`;
  els.period.textContent = periodLabel(start, state.level, today);

  // 支出／收入切換
  els.typeSwitch.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.type === state.type;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });

  // 層級圓點
  els.dotsZone.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.level === state.level;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'true' : 'false');
  });

  // 圓環與中央文字
  renderRing(els.ring, data, { selectedId: state.selectedId, animate: grow && !reduceMotion, formatMoney: money });
  const typeName = TYPE_NAMES[state.type];
  if (selected) {
    els.caption.textContent = selected.name;
    setAmount(selected.amount);
    els.sub.textContent = percentText(selected.fraction);
  } else {
    els.caption.textContent = `當${LEVEL_NAMES[state.level]}${typeName}`;
    setAmount(data.total);
    const isToday = state.level === 'day' && start.getTime() === startOfPeriod(today, 'day').getTime();
    const emptyText = isToday
      ? `今天還沒有${typeName}紀錄`
      : state.level === 'day' ? `這天沒有${typeName}紀錄` : `這段期間沒有${typeName}紀錄`;
    els.sub.textContent = data.total > 0 ? '' : emptyText;
  }
  els.ring.setAttribute('aria-label', `${typeName}圓環，${els.caption.textContent} ${money(selected ? selected.amount : data.total)}`);

  // 明細列表（全部帳目；收入與支出以顏色與正負號區分）
  renderList(entries, state.level);
}

/** 中央金額：「NT$」做成較小的前綴，數字依位數縮小，避免碰到圓環內緣。 */
function setAmount(n) {
  const digits = nf.format(n);
  const cur = document.createElement('span');
  cur.className = 'cur';
  cur.textContent = 'NT$';
  const num = document.createElement('span');
  num.textContent = digits;
  els.amount.replaceChildren(cur, num);
  els.amount.dataset.size = digits.length <= 5 ? 'l' : digits.length <= 7 ? 'm' : 's';
}

function renderList(entries, level) {
  els.list.replaceChildren();
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '這段期間沒有帳目';
    els.list.appendChild(li);
    return;
  }
  const pad = (n) => String(n).padStart(2, '0');
  for (const e of entries) {
    const li = document.createElement('li');
    li.className = 'row';

    const dot = document.createElement('span');
    dot.className = 'cdot';
    dot.style.background = e.cat.color;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const cat = document.createElement('div');
    cat.className = 'cat';
    cat.textContent = e.cat.name;
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = level === 'day' ? e.note : `${pad(e.date.getMonth() + 1)}/${pad(e.date.getDate())} · ${e.note}`;
    meta.append(cat, note);

    const amt = document.createElement('div');
    amt.className = `amt ${e.type}`;
    amt.textContent = `${e.type === 'income' ? '+' : '-'}${nf.format(e.amount)}`;

    li.append(dot, meta, amt);
    els.list.appendChild(li);
  }
}

// ---- 操作 ----

function go(n) {
  const today = new Date();
  if (n > 0 && !canGoForward(state.anchor, state.level, today)) {
    playAnim('anim-bump'); // 已經是最近的期間
    return;
  }
  state.anchor = shiftAnchor(state.anchor, state.level, n, today);
  state.selectedId = null;
  playAnim(n < 0 ? 'anim-from-left' : 'anim-from-right');
  render({ grow: false });
}

function setLevel(level) {
  if (level === state.level) return;
  state.level = level;
  state.selectedId = null;
  playAnim('anim-fade');
  render();
}

function setType(type) {
  if (type === state.type) return;
  state.type = type;
  state.selectedId = null;
  playAnim('anim-fade');
  render();
}

const toggleType = () => setType(state.type === 'expense' ? 'income' : 'expense');

attachGestures(els.ringZone, {
  onSwipe(dir) {
    if (dir === 'right') go(-1); // 向右滑：往過去
    else if (dir === 'left') go(1); // 向左滑：往較近
    else toggleType(); // 上下滑：切換支出／收入圓環
  },
  onPinch(dir) {
    setLevel(dir === 'in' ? levelUp(state.level) : levelDown(state.level)); // 縮小：日→週→月→年
  },
});

attachGestures(els.dotsZone, {
  onSwipe(dir) {
    // 比照 iOS 主畫面圓點：向左滑到下一頁，向右滑回上一頁
    if (dir === 'left') setLevel(levelUp(state.level));
    else if (dir === 'right') setLevel(levelDown(state.level));
  },
});

els.dotsZone.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-level]');
  if (b) setLevel(b.dataset.level);
});

els.typeSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (b) setType(b.dataset.type);
});

function toggleSegment(id) {
  state.selectedId = state.selectedId === id ? null : id;
  render({ grow: false });
}

els.ring.addEventListener('click', (e) => {
  const seg = e.target.closest('.seg');
  if (seg) toggleSegment(seg.dataset.id);
  else if (state.selectedId) toggleSegment(state.selectedId);
});
els.ring.addEventListener('keydown', (e) => {
  const seg = e.target.closest?.('.seg');
  if (seg && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    toggleSegment(seg.dataset.id);
  }
});

// 鍵盤替代（電腦上測試用）：← → 換日期，↑ ↓ 換圓環，- + 換層級
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowLeft': go(-1); break;
    case 'ArrowRight': go(1); break;
    case 'ArrowUp':
    case 'ArrowDown': toggleType(); break;
    case '-': setLevel(levelUp(state.level)); break;
    case '+':
    case '=': setLevel(levelDown(state.level)); break;
    default: return;
  }
  e.preventDefault();
});

let toastTimer = 0;
els.fab.addEventListener('click', () => {
  els.toast.textContent = '新增帳目會在下一個階段完成';
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
});

// 回到前景時若已經跨日，讓「今天」跟著更新。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render({ grow: false });
});

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 供檢查用：目前支援的層級。
window.__orbit = { LEVELS, state };
