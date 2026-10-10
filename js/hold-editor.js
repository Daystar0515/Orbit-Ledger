// 新增／編輯理財持有的小視窗：股票、ETF、基金。
// 股票與 ETF：輸入代碼後可以「查詢市價」（自動帶入名稱與現價），之後打開 Orbit 會自動更新。
// 基金：沒有穩定的免費報價來源，市價自己輸入。

import { makeSheet } from './sheet.js';
import {
  HKINDS, CODE_RE, AUTO_KINDS, NAME_MAX, parseDecimal, addHolding, updateHolding, deleteHolding, priceNote,
} from './holdings.js';
import { fetchQuotes } from './quotes.js';

const $ = (id) => document.getElementById(id);
const nf4 = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });
const numText = (n) => (n === null || n === undefined ? '' : String(n));

/** @param {{toast:(msg:string, ms?:number)=>void}} deps */
export function createHoldEditor({ toast }) {
  const el = $('hold-sheet');
  const kinds = $('hold-kinds');
  const code = $('hold-code');
  const codeLabel = $('hold-code-label');
  const name = $('hold-name');
  const shares = $('hold-shares');
  const sharesLabel = $('hold-shares-label');
  const cost = $('hold-cost');
  const costLabel = $('hold-cost-label');
  const price = $('hold-price');
  const priceLabel = $('hold-price-label');
  const priceNoteEl = $('hold-price-note');
  const lookupBtn = $('hold-lookup');
  const saveBtn = $('hold-save');
  const delBtn = $('hold-delete');
  const title = $('hold-title');
  const note = $('hold-note');
  let ctx = { holding: null, kind: 'stock' };
  let fetched = null; // 查詢市價得到的 { price, source, date, at }
  let nameFromLookup = '';
  let cb = () => {};

  const sheet = makeSheet(el, { stack: true });

  function renderKind() {
    const k = ctx.kind;
    const fund = k === 'fund';
    kinds.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.kind === k;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !!ctx.holding && !on;
    });
    const unit = fund ? '單位' : '股';
    codeLabel.textContent = fund ? '代碼（選填）' : '代碼';
    code.placeholder = fund ? '例如：基金代號，可以不填' : `例如：${HKINDS[k].sample}`;
    sharesLabel.textContent = fund ? '持有單位數' : '持有股數';
    shares.placeholder = fund ? '例如：123.456' : '例如：1000（零股也可以）';
    costLabel.textContent = `平均成本（每${unit}）`;
    priceLabel.textContent = fund ? '目前淨值（每單位，自己輸入）' : '目前市價（每股）';
    lookupBtn.hidden = fund;
    name.placeholder = fund ? '例如：貝萊德世界科技基金' : '查詢市價時會自動帶入';
    renderPriceNote();
  }

  function renderPriceNote() {
    if (fetched) priceNoteEl.textContent = `${fetched.name ? `${fetched.name}　` : ''}現價 ${nf4.format(fetched.price)}（${priceNote({ price: fetched.price, priceAt: fetched.at, priceSrc: fetched.source })}）`;
    else if (ctx.kind === 'fund') priceNoteEl.textContent = '基金沒有免費的即時報價，請自己更新淨值；沒有填的話，市值暫以成本計算。';
    else priceNoteEl.textContent = '股票與 ETF 之後每次打開 Orbit 會自動更新市價；也可以先查詢，或自己輸入。';
  }

  kinds.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (!b || b.disabled) return;
    ctx.kind = b.dataset.kind;
    fetched = null;
    renderKind();
  });

  lookupBtn.addEventListener('click', async () => {
    const c = code.value.trim().toUpperCase();
    if (!CODE_RE.test(c)) { toast('代碼請輸入 4～7 位的數字或英文，例如 2330、00878'); return; }
    lookupBtn.disabled = true;
    lookupBtn.textContent = '查詢中…';
    try {
      const { quotes } = await fetchQuotes([c]);
      const q = quotes[c];
      if (!q) { toast('查不到這個代碼，請確認是上市或上櫃的股票／ETF', 3500); return; }
      fetched = { price: q.price, source: q.source, date: q.date, at: new Date().toISOString(), name: q.name };
      price.value = String(q.price);
      if (q.name && (!name.value.trim() || name.value.trim() === nameFromLookup)) { name.value = q.name.slice(0, NAME_MAX); nameFromLookup = name.value; }
      renderPriceNote();
    } catch (err) {
      toast('現在連不上報價服務，可以自己輸入市價', 3500);
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = '查詢市價';
    }
  });

  price.addEventListener('input', () => { if (fetched && Number(price.value) !== fetched.price) { fetched = null; renderPriceNote(); } });

  saveBtn.addEventListener('click', () => {
    const k = ctx.kind;
    const fund = k === 'fund';
    const c = code.value.trim().toUpperCase();
    if (!fund && !CODE_RE.test(c)) { toast('代碼請輸入 4～7 位的數字或英文，例如 2330、00878'); return; }
    if (fund && c && c.length > 10) { toast('代碼最多 10 個字'); return; }
    const nm = name.value.trim() || (fund ? '' : c);
    if (!nm) { toast('請輸入名稱'); return; }
    const sh = parseDecimal(shares.value);
    if (sh === null || Number.isNaN(sh) || sh <= 0) { toast(`請輸入持有${fund ? '單位數' : '股數'}（最多 4 位小數）`); return; }
    const co = parseDecimal(cost.value);
    if (co === null || Number.isNaN(co)) { toast('請輸入平均成本（沒有成本可以填 0）'); return; }
    const pr = parseDecimal(price.value);
    if (Number.isNaN(pr) || pr === 0) { toast('市價請輸入大於 0 的數字，或留白'); return; }
    const data = { kind: k, code: c, name: nm, shares: sh, cost: co };
    const old = ctx.holding;
    if (pr === null) {
      Object.assign(data, { price: null, priceAt: null, priceSrc: null, priceDate: null });
    } else if (fetched && fetched.price === pr) {
      Object.assign(data, { price: pr, priceAt: fetched.at, priceSrc: fetched.source || 'live', priceDate: fetched.date || null });
    } else if (old && old.price === pr) {
      Object.assign(data, { price: pr, priceAt: old.priceAt, priceSrc: old.priceSrc, priceDate: old.priceDate });
    } else {
      Object.assign(data, { price: pr, priceAt: new Date().toISOString(), priceSrc: 'manual', priceDate: null });
    }
    const h = old ? updateHolding(old.id, data) : addHolding(data);
    if (!h) { toast(old ? '儲存失敗，請檢查輸入' : '持有數量已達上限'); return; }
    sheet.close();
    cb(h, false);
  });

  delBtn.addEventListener('click', () => {
    if (!ctx.holding) return;
    if (!delBtn.classList.contains('confirm')) {
      delBtn.classList.add('confirm');
      delBtn.textContent = '確認刪除';
      note.textContent = '刪除只會移除這筆持有的記錄，不會影響任何帳目與帳戶餘額。';
      return;
    }
    const gone = ctx.holding;
    deleteHolding(gone.id);
    sheet.close();
    cb(gone, true);
  });

  [code, name, shares, cost, price].forEach((inp) => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
  }));
  code.addEventListener('input', () => { code.value = code.value.toUpperCase(); });

  return {
    isOpen: () => sheet.isOpen(),
    close: () => sheet.close(),
    /** holding 有值就是編輯；kind 是新增時預設的類型。 */
    open({ holding = null, kind = 'stock', onDone = null } = {}) {
      cb = onDone || (() => {});
      ctx = { holding, kind: holding ? holding.kind : kind };
      fetched = null;
      nameFromLookup = '';
      title.textContent = holding ? '編輯持有' : '新增持有';
      saveBtn.textContent = holding ? '儲存' : '加入';
      code.value = holding ? holding.code : '';
      name.value = holding ? holding.name : '';
      shares.value = holding ? numText(holding.shares) : '';
      cost.value = holding ? numText(holding.cost) : '';
      price.value = holding ? numText(holding.price) : '';
      delBtn.hidden = !holding;
      delBtn.classList.remove('confirm');
      delBtn.textContent = '刪除';
      note.textContent = '';
      lookupBtn.disabled = false;
      lookupBtn.textContent = '查詢市價';
      renderKind();
      sheet.open();
    },
  };
}

export { AUTO_KINDS };
