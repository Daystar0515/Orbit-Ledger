import {
  LEVELS, LEVEL_NAMES, startOfPeriod, endOfPeriod, periodLabel, canGoForward, shiftAnchor, levelUp, levelDown, toKey, fromKey,
} from './dateutil.js';
import { makeEntries } from './sample.js';
import { findCat, catColor, onThemeChange, UNKNOWN_CAT, loadCustom, getCustom, onCatsChange, setColorBlind, mergeCustom } from './cats.js';
import { totalsByCategory } from './stats.js';
import { buildSegments, renderRing, percentText } from './ring.js';
import { renderOrbit, stopOrbit, collapseOrbit } from './orbit.js';
import { createDatePicker } from './date-picker.js';
import { loadAccounts, getAccounts, onAccountsChange, mergeAccounts } from './accounts.js';
import { createAccEditor } from './acc-editor.js';
import { createAssetSheet } from './asset-sheet.js';
import { createSearchSheet } from './search-sheet.js';
import { attachGestures, PINCH_THRESHOLDS } from './gestures.js';
import * as db from './db.js';
import { getPref, setPref } from './prefs.js';
import { anySheetOpen } from './sheet.js';
import { createEntrySheet } from './entry-sheet.js';
import { createSettings } from './settings.js';
import { attachRowSwipe } from './list-gestures.js';
import { toView, makeRow, transferText } from './rows.js';

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
  entries: [], // 帳本裡的真實帳目（從資料庫讀進來）
  showDemo: getPref('demo', false), // 示範資料：預設關閉
  colorBlind: getPref('cb', false), // 紅綠色盲友善模式
  view: getPref('view', 'orbit') === 'ring' ? 'ring' : 'orbit', // 行星軌道（預設）或圓環
};

/** 色盲模式：類別顏色走另一組調色盤，整個畫面的支出／收入色也用 data-cb 換掉。 */
function applyColorBlind() {
  setColorBlind(state.colorBlind);
  document.documentElement.toggleAttribute('data-cb', state.colorBlind);
}
applyColorBlind();

const els = {
  kicker: $('kicker'),
  period: $('period'),
  periodBtn: $('period-btn'),
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
  gear: $('gear'),
  demoTag: $('demo-tag'),
  toast: $('toast'),
};

// ---- 提示訊息 ----
let toastTimer = 0;
/** action = { label, fn }：訊息旁多一個按鈕（例如刪除後的「復原」）。 */
function toast(msg, ms = 2200, action = null) {
  const t = els.toast;
  t.replaceChildren(document.createTextNode(msg));
  t.classList.toggle('has-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-act';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      t.classList.remove('show');
      clearTimeout(toastTimer);
      action.fn();
    });
    t.appendChild(b);
  }
  t.classList.toggle('high', anySheetOpen());
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** 重播動畫：先移除再強制重排，才能連續觸發同一個動畫。 */
function playAnim(cls) {
  const w = els.ringWrap;
  w.classList.remove('anim-from-left', 'anim-from-right', 'anim-fade', 'anim-bump');
  if (!cls || reduceMotion) return;
  void w.offsetWidth;
  w.classList.add(cls);
}

// ---- 資料 ----

/** 取得某個期間要顯示的全部帳目（真實帳目，加上選擇顯示的示範資料），新的在上面。 */
function entriesFor(level, start, today) {
  const from = toKey(start);
  const to = toKey(endOfPeriod(start, level));
  const real = state.entries
    .filter((e) => e.date >= from && e.date <= to)
    .map(toView)
    .filter(Boolean);
  const demo = state.showDemo ? makeEntries(level, start, today) : [];
  return [...real, ...demo].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

// ---- 畫面 ----

/** 頂部標題與層級圓點（切換層級時要先更新，不必等行星動畫）。 */
function renderHeader() {
  const today = new Date();
  const start = startOfPeriod(state.anchor, state.level);
  els.kicker.textContent = `${LEVEL_NAMES[state.level]}檢視`;
  els.period.textContent = periodLabel(start, state.level, today);
  els.dotsZone.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.level === state.level;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'true' : 'false');
  });
}

/** @param {{grow?:boolean, from?:'in'|'out'}} [opts] from：行星從太陽（in）或從外圍（out）飛回軌道 */
function render({ grow = true, from = 'in' } = {}) {
  const today = new Date();
  const start = startOfPeriod(state.anchor, state.level);
  const entries = entriesFor(state.level, start, today);
  const data = buildSegments(totalsByCategory(entries, state.type));

  if (state.selectedId && !data.segments.some((s) => s.id === state.selectedId)) state.selectedId = null;
  const selected = data.segments.find((s) => s.id === state.selectedId) || null;

  // 頂部
  renderHeader();
  els.demoTag.hidden = !state.showDemo;

  // 支出／收入切換
  els.typeSwitch.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.type === state.type;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });

  // 圓環與中央文字
  const ringOpts = { selectedId: state.selectedId, animate: grow && !reduceMotion, formatMoney: money };
  els.ringWrap.dataset.view = state.view;
  if (state.view === 'orbit') {
    const tint = getComputedStyle(document.documentElement).getPropertyValue(state.type === 'income' ? '--income' : '--expense').trim();
    renderOrbit(els.ring, data, { ...ringOpts, tint, from, reduce: reduceMotion, isPaused: anySheetOpen });
  } else {
    stopOrbit();
    renderRing(els.ring, data, ringOpts);
  }
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

/** 中央金額：「NT$」做成較小的前綴，數字依位數縮小，避免碰到圓環內緣。金額變動時數字會滾動過去。 */
let tweenRaf = 0;
let shownAmount = 0;
function setAmount(n) {
  cancelAnimationFrame(tweenRaf);
  const from = shownAmount;
  shownAmount = n;
  const draw = (v) => {
    const digits = nf.format(Math.round(v));
    const cur = document.createElement('span');
    cur.className = 'cur';
    cur.textContent = 'NT$';
    const num = document.createElement('span');
    num.textContent = digits;
    els.amount.replaceChildren(cur, num);
    els.amount.dataset.size = nf.format(n).length <= 5 ? 'l' : nf.format(n).length <= 7 ? 'm' : 's';
  };
  if (reduceMotion || from === n || Math.abs(n - from) < 2) { draw(n); return; }
  const t0 = performance.now();
  const dur = 420;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const eased = 1 - (1 - t) ** 3; // 先快後慢
    draw(from + (n - from) * eased);
    if (t < 1) tweenRaf = requestAnimationFrame(step);
  };
  tweenRaf = requestAnimationFrame(step);
}

function renderList(entries, level) {
  els.list.replaceChildren();
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.entries.length === 0 && !state.showDemo
      ? '還沒有帳目，點下方「＋」記下第一筆'
      : '這段期間沒有帳目';
    els.list.appendChild(li);
    return;
  }
  entries.forEach((e, i) => {
    els.list.appendChild(makeRow(e, { showDate: level !== 'day', editable: !e.demo, index: i }));
  });
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

/**
 * 換層級（也可以同時換日期）。行星模式下有轉場：
 *   看更長的期間（日→週→月→年）：整個星系收進太陽，再從太陽向外散開成新的資料；
 *   看更短的期間：行星向外飛散，新的行星再從外圍落回軌道。
 */
let levelSeq = 0;
async function setLevel(level, anchor = null) {
  const sameDay = !anchor || startOfPeriod(anchor, level).getTime() === startOfPeriod(state.anchor, level).getTime();
  if (level === state.level && sameDay) return;
  const dir = LEVELS.indexOf(level) >= LEVELS.indexOf(state.level) ? 'in' : 'out';
  const seq = ++levelSeq;
  state.level = level;
  if (anchor) state.anchor = anchor;
  state.selectedId = null;
  playAnim(null);
  renderHeader();
  if (state.view === 'orbit' && !reduceMotion) await collapseOrbit(dir);
  if (seq !== levelSeq) return; // 動畫期間又換了一次，以最後一次為準
  render({ from: dir });
}

/** 切換支出／收入。行星模式下是「日食」：月亮遮住太陽、太陽換色，再露出新的行星。 */
let typeSeq = 0;
async function setType(type) {
  if (type === state.type) return;
  const seq = ++typeSeq;
  state.type = type;
  state.selectedId = null;
  playAnim(null);
  els.typeSwitch.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.type === type));
  if (state.view === 'orbit' && !reduceMotion) {
    await collapseOrbit('eclipse', 380);
    if (seq !== typeSeq) return;
    render({ from: 'eclipse' });
  } else render();
}

const toggleType = () => setType(state.type === 'expense' ? 'income' : 'expense');

attachGestures(els.ringZone, {
  onSwipe(dir) {
    if (dir === 'right') go(-1); // 向右滑：往過去
    else if (dir === 'left') go(1); // 向左滑：往較近
    else toggleType(); // 上下滑：切換支出／收入圓環
  },
  // 雙指縮放即時跟手：圓環／星系跟著手指縮放，放開時超過門檻才換層級，否則彈回原狀
  onPinchMove(ratio) {
    const r = Math.max(0.55, Math.min(1.5, ratio));
    els.ringWrap.classList.add('pinching');
    els.ringWrap.style.setProperty('--pinch', String(1 + (r - 1) * 0.6));
  },
  onPinchEnd(ratio) {
    els.ringWrap.classList.remove('pinching');
    els.ringWrap.style.removeProperty('--pinch'); // 用 CSS transition 彈回
    if (ratio < PINCH_THRESHOLDS.in) {
      const next = levelUp(state.level); // 縮小：日→週→月→年
      if (next === state.level) playAnim('anim-bump'); else setLevel(next);
    } else if (ratio > PINCH_THRESHOLDS.out) {
      const next = levelDown(state.level);
      if (next === state.level) playAnim('anim-bump'); else setLevel(next);
    }
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
  if (anySheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'INPUT') return;
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

// ---- 新增帳目與設定 ----

/** 回到某筆帳目所在的那一天與圓環，讓使用者馬上看到結果。 */
function showEntry(entry, { sweep = true } = {}) {
  if (entry.type !== 'transfer') state.type = entry.type; // 轉帳不影響圓環，維持目前的支出／收入
  state.anchor = fromKey(entry.date) || new Date();
  state.selectedId = null;
  playAnim(null);
  render({ grow: sweep });
}

const entryName = (e) => {
  if (e.type === 'transfer') return `轉帳 ${transferText(e)}`;
  const cat = findCat(e.type, e.catId);
  return `${cat ? cat.name : ''}${e.note ? ` ${e.note}` : ''}`.trim();
};

async function removeEntry(entry) {
  await db.remove(entry.id); // 確定從資料庫刪掉才更新畫面
  state.entries = state.entries.filter((x) => x.id !== entry.id);
  rowSwipe.closeOpen();
  render({ grow: false });
  toast(`已刪除 ${entryName(entry)}`, 5000, {
    label: '復原',
    async fn() {
      try {
        await db.put(entry);
        state.entries.push(entry);
        showEntry(entry, { sweep: false });
        toast('已復原');
      } catch (e) {
        toast('復原失敗，這筆帳目沒有救回來');
      }
    },
  });
}

const accEditor = createAccEditor({ toast, onDone() {} });

const entrySheet = createEntrySheet({
  newId: db.newId,
  toast,
  accEditor,
  async onSave(entry, isEdit) {
    await db.put(entry); // 確定寫進資料庫才算成功
    if (isEdit) state.entries = state.entries.map((x) => (x.id === entry.id ? entry : x));
    else state.entries.push(entry);
    db.requestPersistence(); // 請瀏覽器盡量別自動清掉這份資料
    showEntry(entry, { sweep: !isEdit && entry.type !== 'transfer' });
    toast(`${isEdit ? '已更新' : '已記下'} ${entryName(entry)} ${money(entry.amount)}`);
  },
  onDelete: removeEntry,
});

const rowSwipe = attachRowSwipe(els.list, {
  onTap(id) {
    const entry = state.entries.find((x) => x.id === id);
    if (entry) entrySheet.open({ entry });
  },
  onDelete(id) {
    const entry = state.entries.find((x) => x.id === id);
    if (entry) removeEntry(entry).catch(() => toast('刪除失敗，請再試一次'));
  },
  onDemoTap() { toast('這是示範資料，不能編輯；可到設定關掉'); },
});

const datePicker = createDatePicker({
  getLevel: () => state.level,
  getAnchor: () => state.anchor,
  getEntryKeys: () => new Set(state.entries.map((e) => e.date)),
  onLevel: (level) => setLevel(level),
  onPick(level, date) {
    const today = new Date();
    setLevel(level, date > today ? today : date);
  },
});
els.periodBtn.addEventListener('click', () => datePicker.open());

const settings = createSettings({
  getDemo: () => state.showDemo,
  setDemo(on) {
    state.showDemo = on;
    setPref('demo', on);
    render({ grow: false });
  },
  getView: () => state.view,
  setView(v) {
    state.view = v === 'orbit' ? 'orbit' : 'ring';
    setPref('view', state.view);
    state.selectedId = null;
    render();
  },
  getCb: () => state.colorBlind,
  setCb(on) {
    state.colorBlind = on;
    setPref('cb', on);
    applyColorBlind();
    render({ grow: false });
    entrySheet.refreshTheme();
  },
  getEntries: () => state.entries,
  getCategories: () => getCustom(),
  getAccounts: () => getAccounts(),
  toast,
  newId: db.newId,
  async applyImport(plan) {
    const rows = [...plan.add, ...plan.update];
    await db.putMany(rows); // 同一個交易：全部成功或全部不動
    if (plan.cats) mergeCustom(plan.cats); // 備份裡的自訂類別（已存在的不會重複）
    if (plan.accounts) mergeAccounts(plan.accounts); // 備份裡的帳戶（已存在的不會重複）
    const byId = new Map(state.entries.map((x) => [x.id, x]));
    rows.forEach((x) => byId.set(x.id, x));
    state.entries = [...byId.values()];
    db.requestPersistence();
    state.selectedId = null;
    render({ grow: false });
    toast(`已匯入 ${plan.add.length} 筆${plan.update.length ? `、更新 ${plan.update.length} 筆` : ''}`, 3500);
  },
});

const assetSheet = createAssetSheet({ getEntries: () => state.entries, editor: accEditor });
const searchSheet = createSearchSheet({
  getViews: () => state.entries.map(toView).filter(Boolean),
  getAnchor: () => state.anchor,
  getLevel: () => state.level,
});

els.fab.addEventListener('click', () => entrySheet.open({ type: state.type }));
$('asset-btn').addEventListener('click', () => assetSheet.open());
$('search-btn').addEventListener('click', () => searchSheet.open());
els.gear.addEventListener('click', () => settings.open());

onThemeChange(() => {
  render({ grow: false });
  entrySheet.refreshTheme();
});

// 回到前景時若已經跨日，讓「今天」跟著更新。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render({ grow: false });
});

// 自訂類別有變動就存起來，畫面跟著更新
onCatsChange((cats) => {
  db.setMeta('cats', cats).catch(() => toast('類別沒有存成功，請再試一次'));
  render({ grow: false });
});

// 帳戶有變動（新增、改名、刪除）就存起來
onAccountsChange((accs) => {
  db.setMeta('accounts', accs).catch(() => toast('帳戶沒有存成功，請再試一次'));
  render({ grow: false });
  entrySheet.refreshAccounts();
  assetSheet.refresh();
});

// ---- 啟動 ----

async function boot() {
  try {
    await db.init();
    loadCustom(await db.getMeta('cats'));
    const accData = await db.getMeta('accounts');
    if (loadAccounts(accData)) await db.setMeta('accounts', getAccounts()); // 第一次使用：存下預設帳戶
    state.entries = await db.getAll();
  } catch (e) {
    toast('讀取帳目時發生問題，請重新開啟 Orbit', 4000);
  }
  render();
  if (db.mode === 'memory') toast('這個瀏覽器無法保存資料，關閉後帳目會消失', 5000);
}
boot();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
