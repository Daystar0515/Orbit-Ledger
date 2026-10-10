// 新增／編輯帳目的半版視窗：金額（內建數字鍵盤）、類別、具體事項（自己輸入）、日期。

import { makeSheet } from './sheet.js';
import { catsOf, catColor, findCat } from './cats.js';
import { toKey, fromKey, shortDate, addPeriods } from './dateutil.js';

const MAX_DIGITS = 8; // 最多 99,999,999 元
const NOTE_MAX = 40;
const nf = new Intl.NumberFormat('zh-TW');
const $ = (id) => document.getElementById(id);

/**
 * @param {{onSave:(entry:object, isEdit:boolean)=>Promise<void>|void, onDelete:(entry:object)=>Promise<void>|void, toast:(msg:string)=>void, newId:()=>string}} deps
 */
export function createEntrySheet({ onSave, onDelete, toast, newId }) {
  const el = $('entry-sheet');
  const typeBtns = [...el.querySelectorAll('#sheet-type button')];
  const amountEl = $('sheet-amount');
  const amountText = $('amount-text');
  const grid = $('cat-grid');
  const dateText = $('date-text');
  const dateInput = $('date-input');
  const prevBtn = $('date-prev');
  const nextBtn = $('date-next');
  const noteInput = $('note-input');
  const saveBtn = $('sheet-save');
  const delBtn = $('sheet-delete');

  const s = { type: 'expense', digits: '', catId: null, dateKey: '', note: '', editing: null };
  let saving = false;

  const sheet = makeSheet(el, {
    onClose() {
      el.classList.remove('typing');
      el.style.removeProperty('--kb');
    },
  });

  const todayKey = () => toKey(new Date());
  const valid = () => Number(s.digits) > 0 && !!s.catId;

  function renderType() {
    el.dataset.type = s.type;
    typeBtns.forEach((b) => {
      const on = b.dataset.type === s.type;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderCats() {
    const cats = catsOf(s.type);
    grid.className = `cat-grid cols${cats.length <= 4 ? 4 : 3}`;
    grid.replaceChildren();
    cats.forEach((cat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cat-chip${s.catId === cat.id ? ' on' : ''}`;
      b.dataset.id = cat.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(s.catId === cat.id));
      const dot = document.createElement('span');
      dot.className = 'cdot';
      dot.style.background = catColor(cat);
      const name = document.createElement('span');
      name.textContent = cat.name;
      b.append(dot, name);
      grid.appendChild(b);
    });
  }

  /** 具體事項欄的提示：選了類別就顯示該類別的範例，例如「學習」→「例如：書本費」。 */
  function renderPlaceholder() {
    const cat = s.catId ? findCat(s.type, s.catId) : null;
    noteInput.placeholder = cat && cat.example ? `具體事項，例如：${cat.example}` : '先選類別，再輸入具體事項';
  }

  function renderMode() {
    const edit = !!s.editing;
    el.setAttribute('aria-label', edit ? '編輯帳目' : '新增帳目');
    saveBtn.textContent = edit ? '儲存變更' : '儲存';
    delBtn.hidden = !edit;
  }

  function renderAmount() {
    amountText.textContent = s.digits ? nf.format(Number(s.digits)) : '0';
    amountEl.classList.toggle('empty', !s.digits);
    const len = amountText.textContent.length;
    amountEl.dataset.size = len <= 7 ? 'l' : len <= 10 ? 'm' : 's';
    saveBtn.classList.toggle('is-off', !valid());
  }

  function renderDate() {
    const d = fromKey(s.dateKey);
    dateText.textContent = shortDate(d, new Date());
    dateInput.value = s.dateKey;
    dateInput.max = todayKey();
    nextBtn.disabled = s.dateKey >= todayKey();
  }

  function setType(type) {
    if (type === s.type) return;
    s.type = type;
    s.catId = null; // 支出與收入的類別不同，換類型就要重選
    renderType();
    renderCats();
    renderPlaceholder();
    renderAmount();
  }

  function pressKey(k) {
    if (k === 'back') s.digits = s.digits.slice(0, -1);
    else if (k === '00') {
      if (s.digits && s.digits.length + 2 <= MAX_DIGITS) s.digits += '00';
    } else if (/^\d$/.test(k)) {
      if (s.digits === '' && k === '0') { renderAmount(); return; } // 不接受開頭的 0
      if (s.digits.length < MAX_DIGITS) s.digits += k;
    }
    renderAmount();
  }

  function shake(node) {
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  async function save() {
    if (saving) return;
    if (!s.digits || Number(s.digits) <= 0) {
      toast('請先輸入金額');
      shake(amountEl);
      return;
    }
    if (!s.catId) {
      toast('請選擇類別');
      shake(grid);
      return;
    }
    saving = true;
    const old = s.editing;
    const entry = {
      id: old ? old.id : newId(),
      type: s.type,
      catId: s.catId,
      amount: Number(s.digits),
      date: s.dateKey > todayKey() ? todayKey() : s.dateKey,
      note: s.note.trim().slice(0, NOTE_MAX),
      createdAt: old ? old.createdAt : Date.now(),
    };
    if (old) entry.updatedAt = Date.now();
    try {
      await onSave(entry, !!old);
      sheet.close();
    } catch (e) {
      toast('儲存失敗，請再試一次');
    } finally {
      saving = false;
    }
  }

  // ---- 事件 ----
  el.querySelector('#sheet-type').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (b) setType(b.dataset.type);
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.cat-chip');
    if (!b) return;
    s.catId = b.dataset.id;
    renderCats();
    renderPlaceholder();
    renderAmount();
    // 選完類別，順手讓使用者知道下一步是輸入具體事項（不自動叫出鍵盤，免得蓋住類別）
    noteInput.classList.remove('nudge');
    void noteInput.offsetWidth;
    noteInput.classList.add('nudge');
  });
  $('keypad').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) pressKey(b.dataset.k);
  });
  prevBtn.addEventListener('click', () => {
    s.dateKey = toKey(addPeriods(fromKey(s.dateKey), 'day', -1));
    renderDate();
  });
  nextBtn.addEventListener('click', () => {
    if (s.dateKey >= todayKey()) return;
    s.dateKey = toKey(addPeriods(fromKey(s.dateKey), 'day', 1));
    renderDate();
  });
  dateInput.addEventListener('change', () => {
    const d = fromKey(dateInput.value);
    if (!d) { renderDate(); return; } // 清空或不合法就維持原本的日期
    s.dateKey = dateInput.value > todayKey() ? todayKey() : dateInput.value;
    renderDate();
  });
  noteInput.addEventListener('input', () => { s.note = noteInput.value; });
  noteInput.addEventListener('focus', () => el.classList.add('typing'));
  noteInput.addEventListener('blur', () => el.classList.remove('typing'));
  noteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); noteInput.blur(); }
  });
  saveBtn.addEventListener('click', save);
  delBtn.addEventListener('click', async () => {
    if (saving || !s.editing) return;
    saving = true;
    try {
      await onDelete(s.editing);
      sheet.close();
    } catch (e) {
      toast('刪除失敗，請再試一次');
    } finally {
      saving = false;
    }
  });

  // 實體鍵盤（電腦上測試用）：數字、Backspace、Enter
  document.addEventListener('keydown', (e) => {
    if (!sheet.isOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (/^\d$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { pressKey('back'); e.preventDefault(); }
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { save(); e.preventDefault(); }
  });

  // 手機鍵盤彈出時，讓視窗跟著往上抬，備註欄才不會被蓋住。
  const vv = window.visualViewport;
  const syncKeyboard = () => {
    if (!vv || !sheet.isOpen()) return;
    const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    el.style.setProperty('--kb', `${Math.round(offset)}px`);
  };
  vv?.addEventListener('resize', syncKeyboard);
  vv?.addEventListener('scroll', syncKeyboard);

  return {
    isOpen: () => sheet.isOpen(),
    close: () => sheet.close(),
    /**
     * 新增：open({type})；編輯：open({entry})，欄位會預先填好。
     * @param {{type?:'expense'|'income', entry?:object}} [opts]
     */
    open({ type = 'expense', entry = null } = {}) {
      s.editing = entry;
      if (entry) {
        s.type = entry.type;
        s.digits = String(entry.amount);
        s.catId = entry.catId;
        s.note = entry.note || '';
        s.dateKey = entry.date;
      } else {
        s.type = type;
        s.digits = '';
        s.catId = null;
        s.note = '';
        s.dateKey = todayKey();
      }
      noteInput.value = s.note;
      noteInput.classList.remove('nudge');
      renderMode();
      renderType();
      renderCats();
      renderPlaceholder();
      renderAmount();
      renderDate();
      sheet.open();
    },
    /** 深色／淺色模式切換時，更新類別圓點的顏色。 */
    refreshTheme() { if (sheet.isOpen()) renderCats(); },
  };
}
