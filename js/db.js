// 本機資料庫（IndexedDB）。帳目只存在這支手機的瀏覽器裡，不會傳到任何地方。
//
// 帳目的格式：
//   { id, type:'expense'|'income', catId, amount(整數,新台幣元), date:'YYYY-MM-DD', note, createdAt(毫秒) }
//
// 如果瀏覽器不讓用 IndexedDB（例如某些私密瀏覽模式），會退回「只存在記憶體」，
// 這時 mode 會是 'memory'，畫面要提醒使用者關掉就會消失。

const DB_NAME = 'orbit';
const STORE = 'entries';
const META = 'meta';
const VERSION = 2;

let db = null;
const mem = new Map();
const memMeta = new Map();

/** 'idb'：存進瀏覽器的資料庫；'memory'：只存在這次開啟期間。 */
export let mode = 'idb';

export async function init() {
  if (db) return mode;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('此瀏覽器沒有 IndexedDB');
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('date', 'date');
        }
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('資料庫被其他分頁佔用'));
    });
    db.onversionchange = () => db.close();
    mode = 'idb';
  } catch (e) {
    db = null;
    mode = 'memory';
  }
  return mode;
}

/** 讀取／寫入設定型資料（自訂類別、帳戶等）。value 要能轉成 JSON。 */
export async function getMeta(key) {
  if (!db) return memMeta.has(key) ? memMeta.get(key) : null;
  const row = await run('readonly', (s) => s.get(key), META);
  return row ? row.value : null;
}
export async function setMeta(key, value) {
  if (!db) { memMeta.set(key, value); return; }
  await run('readwrite', (s) => s.put({ key, value }), META);
}

/** 在一個交易裡執行 fn(store)；等整個交易確實寫入完成才回傳。 */
function run(txMode, fn, storeName = STORE) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, txMode);
    let result;
    const req = fn(tx.objectStore(storeName));
    if (req && 'onsuccess' in req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('寫入被中止'));
  });
}

export async function getAll() {
  if (!db) return [...mem.values()];
  return (await run('readonly', (s) => s.getAll())) || [];
}

export async function put(entry) {
  if (!db) { mem.set(entry.id, entry); return; }
  await run('readwrite', (s) => s.put(entry));
}

export async function putMany(entries) {
  if (!db) { entries.forEach((e) => mem.set(e.id, e)); return; }
  await run('readwrite', (s) => { entries.forEach((e) => s.put(e)); });
}

export async function remove(id) {
  if (!db) { mem.delete(id); return; }
  await run('readwrite', (s) => s.delete(id));
}

export async function clear() {
  if (!db) { mem.clear(); return; }
  await run('readwrite', (s) => s.clear());
}

/** 請瀏覽器盡量不要自動清掉這份資料；回傳目前是否已受保護。 */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* 忽略 */ }
  return false;
}

export async function isPersisted() {
  try {
    return !!(navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted()));
  } catch (e) {
    return false;
  }
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
