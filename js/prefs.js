// 小設定（例如是否顯示示範資料）。存在 localStorage；
// 如果瀏覽器不讓用（私密瀏覽等），退回記憶體，功能照常，只是關掉再開會忘記。

const PREFIX = 'orbit.';
const memory = new Map();

export function getPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) { /* 忽略 */ }
  return memory.has(key) ? memory.get(key) : fallback;
}

export function setPref(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) { /* 忽略 */ }
}
