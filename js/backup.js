// 備份與匯入：把帳目變成檔案內容，或把檔案內容讀回帳目。
// 這個檔案只處理資料（不碰畫面、不碰瀏覽器），所以可以直接用 Node 做單元測試。

import { findCat } from './cats.js';
import { fromKey, toKey } from './dateutil.js';

export const BACKUP_APP = 'orbit';
export const BACKUP_VERSION = 3; // 2：多了自訂類別；3：多了帳戶與轉帳（讀得懂舊版備份）
export const MAX_AMOUNT = 99999999;
export const NOTE_MAX = 40;
const MAX_FILE_CHARS = 20 * 1024 * 1024; // 超過 20MB 的字串不是正常的備份
const TYPE_NAMES = { expense: '支出', income: '收入', transfer: '轉帳' };

const pad = (n) => String(n).padStart(2, '0');

/** 備份檔名：orbit-backup-2026-10-10.json（用本地日期） */
export function backupFileName(now = new Date(), ext = 'json') {
  return `orbit-backup-${toKey(now)}.${ext}`;
}

/** 只留下帳本需要的欄位，並整理成固定格式。 */
function cleanEntry(e) {
  const out = { id: e.id, type: e.type };
  if (e.type === 'transfer') {
    out.fromId = e.fromId;
    out.toId = e.toId;
  } else {
    out.catId = e.catId;
    if (e.accountId) out.accountId = e.accountId;
  }
  Object.assign(out, { amount: e.amount, date: e.date, note: e.note || '', createdAt: e.createdAt || 0 });
  if (e.updatedAt) out.updatedAt = e.updatedAt;
  return out;
}

/** 做出備份檔的文字內容（JSON）。示範資料不會在 entries 裡，所以不會被備份。 */
export function buildBackup(entries, now = new Date(), categories = { expense: [], income: [] }, accounts = []) {
  const list = entries
    .filter((e) => !e.demo)
    .map(cleanEntry)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  return JSON.stringify(
    { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), count: list.length, categories, accounts, entries: list },
    null,
    1,
  );
}

/** 檢查單筆帳目；合格就回傳整理過的帳目，否則回傳 null。 */
export function validateEntry(raw, makeId) {
  if (!raw || typeof raw !== 'object') return null;
  const isTransfer = raw.type === 'transfer';
  if (raw.type !== 'expense' && raw.type !== 'income' && !isTransfer) return null;
  const okId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;
  if (isTransfer) {
    if (!okId(raw.fromId) || !okId(raw.toId) || raw.fromId === raw.toId) return null;
  } else if (!okId(raw.catId)) return null;
  if (!Number.isInteger(raw.amount) || raw.amount < 1 || raw.amount > MAX_AMOUNT) return null;
  if (typeof raw.date !== 'string' || !fromKey(raw.date) || toKey(fromKey(raw.date)) !== raw.date) return null;
  let id = raw.id;
  if (typeof id !== 'string' || !id || id.length > 100) {
    if (!makeId) return null;
    id = makeId();
  }
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, NOTE_MAX) : '';
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : 0;
  const out = { id, type: raw.type };
  if (isTransfer) Object.assign(out, { fromId: raw.fromId, toId: raw.toId });
  else {
    out.catId = raw.catId;
    if (okId(raw.accountId)) out.accountId = raw.accountId;
  }
  Object.assign(out, { amount: raw.amount, date: raw.date, note, createdAt });
  if (Number.isFinite(raw.updatedAt) && raw.updatedAt > 0) out.updatedAt = raw.updatedAt;
  return out;
}

/**
 * 讀取備份檔的文字內容。
 * @returns {{ok:true, entries:object[], skipped:number, categories:object, exportedAt:string|null} | {ok:false, error:string}}
 */
export function parseBackup(text, makeId) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '檔案是空的' };
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: '檔案太大，不像是 Orbit 的備份' };
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, error: '這個檔案不是 Orbit 備份檔（無法讀取內容）' };
  }
  if (!data || data.app !== BACKUP_APP || !Array.isArray(data.entries)) {
    return { ok: false, error: '這個檔案不是 Orbit 備份檔' };
  }
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    return { ok: false, error: '這份備份來自較新版本的 Orbit，請先更新 Orbit 再匯入' };
  }
  const seen = new Set();
  const entries = [];
  let skipped = 0;
  for (const raw of data.entries) {
    const e = validateEntry(raw, makeId);
    if (!e) { skipped += 1; continue; }
    if (seen.has(e.id)) { skipped += 1; continue; } // 同一份檔案裡編號重複，只留第一筆
    seen.add(e.id);
    entries.push(e);
  }
  const c = data.categories && typeof data.categories === 'object' ? data.categories : {};
  const categories = { expense: Array.isArray(c.expense) ? c.expense : [], income: Array.isArray(c.income) ? c.income : [] };
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  return { ok: true, entries, skipped, categories, accounts, exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null };
}

const sameEntry = (a, b) =>
  a.type === b.type && a.catId === b.catId && a.amount === b.amount && a.date === b.date && a.note === b.note
  && (a.accountId || '') === (b.accountId || '') && (a.fromId || '') === (b.fromId || '') && (a.toId || '') === (b.toId || '');
const stamp = (e) => e.updatedAt || e.createdAt || 0;

/**
 * 決定匯入時哪些要新增、哪些要更新。
 * 規則：編號沒看過 → 新增；編號相同且內容一樣 → 略過；
 * 編號相同但內容不同 → 以「較晚修改」的那份為準（時間相同就保留手機上現有的）。
 * 匯入永遠不會刪除手機上現有的帳目。
 */
export function planImport(existing, incoming) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const add = [];
  const update = [];
  let same = 0;
  let keptLocal = 0;
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) add.push(inc);
    else if (sameEntry(cur, inc)) same += 1;
    else if (stamp(inc) > stamp(cur)) update.push(inc);
    else keptLocal += 1;
  }
  return { add, update, same, keptLocal };
}

// ---- CSV ----

/** 試算表會把 = + - @ 開頭的文字當公式執行，前面補一個 ' 讓它保持純文字。 */
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 匯出給試算表看的 CSV（開頭加 BOM，Excel 才不會把中文讀成亂碼）。
 * @param {object[]} entries
 * @param {{id:string,name:string}[]} [accounts] 用來把帳戶編號換成名稱
 */
export function buildCsv(entries, accounts = []) {
  const accName = (id) => (accounts.find((a) => a.id === id) || {}).name || '';
  const rows = entries
    .filter((e) => !e.demo)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const lines = [['日期', '收支', '類別', '具體事項', '金額', '帳戶'].join(',')];
  for (const e of rows) {
    if (e.type === 'transfer') {
      lines.push([e.date, TYPE_NAMES.transfer, '', e.note || '', e.amount, `${accName(e.fromId)} → ${accName(e.toId)}`].map(csvCell).join(','));
      continue;
    }
    const cat = findCat(e.type, e.catId);
    lines.push([e.date, TYPE_NAMES[e.type] || e.type, cat ? cat.name : e.catId, e.note || '', e.amount, accName(e.accountId)].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 「上次備份」的顯示文字。 */
export function lastBackupText(iso, now = new Date()) {
  if (!iso) return '尚未備份過';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '尚未備份過';
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
  if (days <= 0) return `上次備份：今天 ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  if (days === 1) return '上次備份：昨天';
  return `上次備份：${days} 天前`;
}
