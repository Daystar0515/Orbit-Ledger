import { transferFee } from './adjust.js';

// 帳戶（資產）：分成三大類——現金、信用卡、存款，每一類底下可以有多個自訂的子帳戶。
// 帳戶清單存在資料庫的 meta 裡（key: 'accounts'）。
//
// 帳戶格式：{ id, kind: 'cash'|'credit'|'bank', name, opening, limit? }
//   opening：期初金額。現金／存款是「一開始有多少錢」；信用卡是「一開始已刷未繳多少」。
//   limit：信用卡的自訂額度上限（只有信用卡有）。
//
// 金額怎麼算（純函式 balances，方便測試）：
//   現金／存款：期初 + 收入 − 支出 + 轉入 − 轉出（綠色顯示）
//   信用卡：    期初 + 刷卡支出 − 轉入（繳卡費）+ 轉出（預借現金）（紅色顯示，代表欠款）

export const KINDS = {
  cash: { name: '現金', sample: '錢包' },
  credit: { name: '信用卡', sample: '玉山 Pi 卡' },
  bank: { name: '存款', sample: '郵局存款' },
};
export const KIND_ORDER = ['cash', 'credit', 'bank'];
export const ACC_NAME_MAX = 10;
export const ACC_MAX = 30;
export const MONEY_MAX = 99999999;

export function defaultAccounts() {
  return [
    { id: 'a-cash', kind: 'cash', name: '錢包', opening: 0 },
    { id: 'a-credit', kind: 'credit', name: '信用卡', opening: 0, limit: 0, statementDay: null, dueDay: null, remind: { on: false, offsets: [1], events: ['due'] } },
    { id: 'a-bank', kind: 'bank', name: '銀行存款', opening: 0 },
  ];
}

/** 把使用者輸入的金額字串變成整數；不合法回傳 null。允許千分位逗號與空白。 */
export function parseMoney(text) {
  const t = String(text ?? '').replace(/[,\s]/g, '');
  if (t === '') return 0;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MONEY_MAX ? n : null;
}

/** 每月的第幾天（1～31）；沒設定是 null。 */
const cleanDay = (d) => (Number.isInteger(d) && d >= 1 && d <= 31 ? d : null);
export const REMIND_OFFSETS = [0, 1, 7]; // 當天、前一天、前一週
/** 各類帳戶可以提醒的日子：信用卡是結帳日、繳款日；存款（有設定利率時）是計息日、發息日。 */
export const REMIND_EVENTS = { credit: ['statement', 'due'], bank: ['accrual', 'payout'] };
const DEFAULT_EVENT = { credit: 'due', bank: 'payout' };
export const PAY_FREQS = ['monthly', 'quarterly', 'semiannual', 'annual']; // 發息頻率
/** 提醒設定：{ on, offsets: 提前幾天, events: 哪些日子 } */
export function cleanRemind(r, kind = 'credit') {
  const o = r && typeof r === 'object' ? r : {};
  const offsets = REMIND_OFFSETS.filter((x) => Array.isArray(o.offsets) && o.offsets.includes(x));
  const allowed = REMIND_EVENTS[kind] || [];
  const events = allowed.filter((x) => Array.isArray(o.events) && o.events.includes(x));
  return { on: o.on === true, offsets: offsets.length ? offsets : [1], events: events.length ? events : [DEFAULT_EVENT[kind]] };
}
/** 年利率（%），最多三位小數，0 < 利率 ≤ 100；不合法回傳 null。 */
export function parseRate(text) {
  const t = String(text ?? '').trim().replace(/%$/, '');
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100 ? n : null;
}
const cleanRate = (r) => (typeof r === 'number' && r > 0 && r <= 100 ? Math.round(r * 1000) / 1000 : null);

const clampMoney = (n) => (Number.isInteger(n) ? Math.max(0, Math.min(MONEY_MAX, n)) : 0);

export function cleanAccounts(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && typeof a.id === 'string' && a.id && KINDS[a.kind] && typeof a.name === 'string' && a.name.trim())
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .slice(0, ACC_MAX)
    .map((a) => {
      const out = { id: a.id, kind: a.kind, name: a.name.trim().slice(0, ACC_NAME_MAX), opening: clampMoney(a.opening) };
      if (a.kind === 'credit') {
        out.limit = clampMoney(a.limit);
        out.statementDay = cleanDay(a.statementDay);
        out.dueDay = cleanDay(a.dueDay);
        out.remind = cleanRemind(a.remind, 'credit');
      }
      if (a.kind === 'bank' && a.interestOn) {
        // 存款利率（選填）：年利率、計息日、發息日與發息頻率、提醒
        out.interestOn = true;
        out.rate = cleanRate(a.rate);
        out.accrualDay = cleanDay(a.accrualDay);
        out.payDay = cleanDay(a.payDay);
        out.payFreq = PAY_FREQS.includes(a.payFreq) ? a.payFreq : 'semiannual';
        out.remind = cleanRemind(a.remind, 'bank');
      }
      return out;
    });
}

// ---- 目前的帳戶清單 ----
let accounts = defaultAccounts();
const listeners = new Set();
export const onAccountsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(getAccounts()));

/** 從資料庫還原；沒有資料（第一次使用）就用預設的三個帳戶。回傳是否用了預設值。 */
export function loadAccounts(data) {
  const list = cleanAccounts(data);
  accounts = data == null ? defaultAccounts() : list;
  return data == null;
}
export const getAccounts = () => accounts.map((a) => ({ ...a }));
export const findAccount = (id) => accounts.find((a) => a.id === id) || null;
export const accountsOf = (kind) => accounts.filter((a) => a.kind === kind);
/** 記帳時能選的帳戶：支出三種都可以；收入不能進信用卡。依現金、信用卡、存款排序。 */
export const accountsFor = (type) =>
  KIND_ORDER.filter((k) => type !== 'income' || k !== 'credit').flatMap((k) => accountsOf(k));

const newAccId = () => `a-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addAccount({ kind, name, opening = 0, limit = 0 }) {
  const nm = String(name || '').trim().slice(0, ACC_NAME_MAX);
  if (!KINDS[kind] || !nm || accounts.length >= ACC_MAX) return null;
  const acc = cleanAccounts([{ id: newAccId(), kind, name: nm, opening, limit }])[0];
  accounts.push(acc);
  emit();
  return acc;
}
export function updateAccount(id, patch) {
  const i = accounts.findIndex((a) => a.id === id);
  if (i < 0) return false;
  const next = cleanAccounts([{ ...accounts[i], ...patch, id, kind: accounts[i].kind }])[0];
  if (!next) return false;
  accounts[i] = next;
  emit();
  return true;
}
export function deleteAccount(id) {
  const n = accounts.length;
  accounts = accounts.filter((a) => a.id !== id);
  if (accounts.length !== n) emit();
  return accounts.length !== n;
}
/** 手機上這個帳戶是否還是「沒動過的預設帳戶」（是的話，匯入時可以直接換成備份裡的版本）。 */
const untouchedDefault = (a) => {
  const d = defaultAccounts().find((x) => x.id === a.id);
  return !!d && d.name === a.name && d.opening === a.opening && (d.limit || 0) === (a.limit || 0);
};
const differs = (a, b) => a.name !== b.name || a.opening !== b.opening || (a.limit || 0) !== (b.limit || 0);

/** 匯入時：沒有的帳戶新增；手機上還是預設值的帳戶，換成備份裡的名稱與金額。 */
function planAccounts(incoming) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const add = [];
  const replace = [];
  for (const a of cleanAccounts(incoming)) {
    const cur = byId.get(a.id);
    if (!cur) add.push(a);
    else if (untouchedDefault(cur) && differs(cur, a)) replace.push(a);
  }
  return { add: add.slice(0, Math.max(0, ACC_MAX - accounts.length)), replace };
}
export function newAccountCount(incoming) {
  const p = planAccounts(incoming);
  return p.add.length + p.replace.length;
}
export function mergeAccounts(incoming) {
  const p = planAccounts(incoming);
  p.replace.forEach((a) => { accounts[accounts.findIndex((x) => x.id === a.id)] = a; });
  accounts.push(...p.add);
  const n = p.add.length + p.replace.length;
  if (n) emit();
  return n;
}

// ---- 計算（純函式） ----

/**
 * 每個帳戶目前的金額。現金／存款是餘額；信用卡是欠款（已刷未繳）。
 * asOf（'YYYY-MM-DD'）：只算到這一天為止；之後的帳目是預先記的，不計入。
 * @returns {Map<string, number>}
 */
export function balances(accountList, entries, asOf = null) {
  const kind = new Map(accountList.map((a) => [a.id, a.kind]));
  const bal = new Map(accountList.map((a) => [a.id, a.opening || 0]));
  // sign：對「現金／存款餘額」的影響；信用卡欠款的方向剛好相反
  const add = (id, sign, amount) => {
    if (!bal.has(id)) return;
    bal.set(id, bal.get(id) + (kind.get(id) === 'credit' ? -sign : sign) * amount);
  };
  for (const e of entries) {
    if (e.demo) continue;
    if (asOf && e.date > asOf) continue; // 還沒到的（預先記的未來收支）不計入目前的金額
    if (e.type === 'expense') add(e.accountId, -1, e.amount);
    else if (e.type === 'income') add(e.accountId, +1, e.amount);
    else if (e.type === 'transfer') {
      add(e.fromId, -1, e.amount + transferFee(e)); // 手續費從轉出帳戶多扣
      add(e.toId, +1, e.amount);
    }
  }
  return bal;
}

/** 三大類的合計與淨資產（現金 + 存款 − 信用卡欠款）。 */
export function kindTotals(accountList, bal) {
  const t = { cash: 0, credit: 0, bank: 0 };
  for (const a of accountList) t[a.kind] += bal.get(a.id) || 0;
  return { ...t, net: t.cash + t.bank - t.credit };
}
