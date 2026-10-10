// 設定頁：示範資料開關、資料儲存狀態、備份（匯出／匯入／CSV）。

import { makeSheet } from './sheet.js';
import * as db from './db.js';
import { getPref, setPref } from './prefs.js';
import { buildBackup, buildCsv, parseBackup, planImport, backupFileName, lastBackupText } from './backup.js';
import { newCustomCount } from './cats.js';
import { newAccountCount } from './accounts.js';
import { saveTextFile, pickTextFile } from './files.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{getDemo:()=>boolean, setDemo:(on:boolean)=>void, getEntries:()=>object[],
 *          applyImport:(plan:object)=>Promise<void>, toast:(msg:string, ms?:number)=>void, newId:()=>string}} deps
 */
export function createSettings({ getDemo, setDemo, getView, setView, getCb, setCb, getCategories, getAccounts, getEntries, applyImport, toast, newId }) {
  const el = $('settings-sheet');
  const sw = $('demo-switch');
  const cbSw = $('cb-switch');
  const viewSw = $('view-switch');
  const note = $('storage-note');
  const backupNote = $('backup-note');
  const panel = $('import-panel');
  const summary = $('import-summary');
  let pending = null; // 等使用者確認的匯入計畫

  function renderSwitch() {
    const on = getDemo();
    sw.setAttribute('aria-checked', String(on));
    sw.classList.toggle('on', on);
    viewSw.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.view === getView();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const cb = getCb();
    cbSw.setAttribute('aria-checked', String(cb));
    cbSw.classList.toggle('on', cb);
  }

  async function renderStorage() {
    if (db.mode === 'memory') {
      note.textContent = '這個瀏覽器目前無法保存資料（可能是私密瀏覽）。關閉 Orbit 後，剛記的帳會消失。';
      return;
    }
    const persisted = await db.isPersisted();
    note.textContent = persisted
      ? '帳目只存在這支手機上，並已請系統盡量保留。換手機或刪除 Orbit 前，請先匯出備份。'
      : '帳目只存在這支手機上。若清除 Safari 的網站資料，帳目也會一起消失，建議定期匯出備份。';
  }

  function renderBackup() {
    const n = getEntries().length;
    backupNote.textContent = `目前共 ${n} 筆帳目。${lastBackupText(getPref('lastBackup', null))}。備份檔不會傳到任何伺服器，由你自己決定存到哪裡。`;
  }

  function hidePanel() {
    pending = null;
    panel.hidden = true;
  }

  const sheet = makeSheet(el, {
    onOpen() { hidePanel(); renderSwitch(); renderStorage(); renderBackup(); },
    onClose() { hidePanel(); },
  });

  sw.addEventListener('click', () => {
    setDemo(!getDemo());
    renderSwitch();
  });

  viewSw.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b || b.dataset.view === getView()) return;
    setView(b.dataset.view);
    renderSwitch();
  });

  cbSw.addEventListener('click', () => {
    setCb(!getCb());
    renderSwitch();
  });

  // 匯出：不能在點擊與分享之間做太多非同步的事，否則 iOS 會拒絕開啟分享選單。
  async function exportAs(kind) {
    const entries = getEntries();
    if (entries.length === 0) { toast('還沒有帳目可以匯出'); return; }
    const now = new Date();
    const isJson = kind === 'json';
    const text = isJson ? buildBackup(entries, now, getCategories(), getAccounts()) : buildCsv(entries, getAccounts());
    const result = await saveTextFile({
      name: backupFileName(now, isJson ? 'json' : 'csv'),
      text,
      mime: isJson ? 'application/json' : 'text/csv',
    });
    if (result === 'cancelled') return;
    if (isJson) {
      setPref('lastBackup', now.toISOString());
      renderBackup();
      toast(result === 'shared' ? '請在分享選單選「儲存到檔案」，備份才算完成' : '已下載備份檔', 4500);
    } else {
      toast(result === 'shared' ? '請在分享選單選「儲存到檔案」' : '已下載 CSV', 3500);
    }
  }
  $('export-json').addEventListener('click', () => exportAs('json'));
  $('export-csv').addEventListener('click', () => exportAs('csv'));

  $('import-btn').addEventListener('click', async () => {
    hidePanel();
    let text;
    try {
      text = await pickTextFile($('import-file'));
    } catch (e) {
      toast('讀取檔案失敗，請再試一次');
      return;
    }
    if (text == null) return;
    const res = parseBackup(text, newId);
    if (!res.ok) { toast(res.error, 4000); return; }
    if (res.entries.length === 0) { toast('備份檔裡沒有可匯入的帳目', 3500); return; }
    const plan = planImport(getEntries(), res.entries);
    plan.cats = res.categories;
    plan.accounts = res.accounts;
    const newCats = newCustomCount(res.categories);
    const newAccs = newAccountCount(res.accounts);
    if (plan.add.length + plan.update.length === 0 && newCats === 0 && newAccs === 0) {
      toast('這份備份的帳目都已經在手機上了', 3500);
      return;
    }
    const lines = [`備份檔共 ${res.entries.length} 筆：新增 ${plan.add.length} 筆`];
    if (plan.update.length) lines.push(`更新 ${plan.update.length} 筆（備份裡的版本較新）`);
    if (newCats) lines.push(`自訂類別 ${newCats} 個`);
    if (newAccs) lines.push(`帳戶 ${newAccs} 個`);
    if (plan.same + plan.keptLocal) lines.push(`${plan.same + plan.keptLocal} 筆維持手機上現有的`);
    if (res.skipped) lines.push(`${res.skipped} 筆格式不正確，已略過`);
    summary.textContent = `${lines.join('；')}。匯入不會刪除手機上現有的任何帳目。`;
    pending = plan;
    panel.hidden = false;
  });

  $('import-cancel').addEventListener('click', hidePanel);
  $('import-ok').addEventListener('click', async () => {
    if (!pending) return;
    const plan = pending;
    hidePanel();
    try {
      await applyImport(plan);
      renderBackup();
    } catch (e) {
      toast('匯入失敗，帳目沒有被更動');
    }
  });

  return { open: () => sheet.open(), close: () => sheet.close(), isOpen: () => sheet.isOpen() };
}
