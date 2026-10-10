// 新增／編輯自訂類別的小視窗（疊在記帳視窗上）。

import { makeSheet } from './sheet.js';
import { PALETTES, NAME_MAX, CUSTOM_MAX, paletteColor, addCustomCat, updateCustomCat, deleteCustomCat, catsOf, baseCatsOf } from './cats.js';

const $ = (id) => document.getElementById(id);

/** @param {{toast:(msg:string)=>void, onDone:(type:string, cat:object|null, deleted:boolean)=>void}} deps */
export function createCatEditor({ toast, onDone }) {
  const el = $('cat-sheet');
  const nameInput = $('cat-name');
  const swatches = $('cat-swatches');
  const saveBtn = $('cat-save');
  const delBtn = $('cat-delete');
  const title = $('cat-title');
  const note = $('cat-note');
  let ctx = { type: 'expense', cat: null, pal: 0 };

  const sheet = makeSheet(el, { stack: true });

  function renderSwatches() {
    swatches.replaceChildren();
    PALETTES[ctx.type].forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `swatch${ctx.pal === i ? ' on' : ''}`;
      b.dataset.pal = String(i);
      b.style.background = paletteColor(ctx.type, i);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(ctx.pal === i));
      b.setAttribute('aria-label', `顏色 ${i + 1}`);
      swatches.appendChild(b);
    });
  }

  swatches.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    ctx.pal = Number(b.dataset.pal);
    renderSwatches();
  });

  function save() {
    const name = nameInput.value.trim();
    if (!name) { toast('請輸入類別名稱'); return; }
    const clash = catsOf(ctx.type).some((c) => c.name === name && (!ctx.cat || c.id !== ctx.cat.id));
    if (clash) { toast('已經有同名的類別了'); return; }
    let cat;
    if (ctx.cat) {
      updateCustomCat(ctx.type, ctx.cat.id, { name, pal: ctx.pal });
      cat = { ...ctx.cat, name, pal: ctx.pal };
    } else {
      cat = addCustomCat(ctx.type, { name, pal: ctx.pal });
      if (!cat) { toast('自訂類別已達上限'); return; }
    }
    sheet.close();
    onDone(ctx.type, cat, false);
  }
  saveBtn.addEventListener('click', save);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });

  delBtn.addEventListener('click', () => {
    if (!ctx.cat) return;
    // 兩段式確認：第一次按變成「再按一次確認刪除」
    if (!delBtn.classList.contains('confirm')) {
      delBtn.classList.add('confirm');
      delBtn.textContent = '確認刪除';
      note.textContent = '刪除後，這個類別的舊帳目會改歸到「未分類」，金額不會消失。';
      return;
    }
    deleteCustomCat(ctx.type, ctx.cat.id);
    sheet.close();
    onDone(ctx.type, ctx.cat, true);
  });

  return {
    isOpen: () => sheet.isOpen(),
    close: () => sheet.close(),
    /** @param {{type:'expense'|'income', cat?:object|null}} opts cat 有值就是編輯 */
    open({ type, cat = null }) {
      ctx = { type, cat, pal: cat ? cat.pal : firstFreePal(type) };
      title.textContent = cat ? '編輯類別' : '新增類別';
      saveBtn.textContent = cat ? '儲存' : '加入';
      nameInput.value = cat ? cat.name : '';
      delBtn.hidden = !cat;
      delBtn.classList.remove('confirm');
      delBtn.textContent = '刪除';
      note.textContent = '';
      if (!cat) {
        const left = CUSTOM_MAX - (catsOf(type).length - baseCatsOf(type).length);
        if (left <= 0) { toast('自訂類別已達上限'); return; }
      }
      renderSwatches();
      sheet.open();
    },
    refreshTheme() { if (sheet.isOpen()) renderSwatches(); },
  };
}

/** 新增時預設挑一個還沒被用過的顏色。 */
function firstFreePal(type) {
  const used = new Set(catsOf(type).map((c) => c.pal));
  const i = PALETTES[type].findIndex((_, k) => !used.has(k));
  return i >= 0 ? i : 0;
}
