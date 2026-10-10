// 類別與顏色。支出用紅色系、收入用綠色系；
// color 給淺色模式，dark 給深色模式（較亮，才看得清楚）。
// example 是「具體事項」輸入欄的提示範例。
// MVP 的類別是固定的；id 一旦寫進帳目就不要改，之後開放自訂類別時才不會對不上。

export const EXPENSE_CATS = [
  { id: 'food', name: '飲食', example: '午餐', color: '#C73100', dark: '#FF3E2F' },
  { id: 'life', name: '生活', example: '水電費', color: '#FE6B98', dark: '#FE94AF' },
  { id: 'transport', name: '交通', example: '捷運', color: '#A4014D', dark: '#DE0D6B' },
  { id: 'shopping', name: '購物', example: '外套', color: '#FE5B0A', dark: '#FE8053' },
  { id: 'fun', name: '娛樂', example: '電影', color: '#E41C70', dark: '#FE5B90' },
  { id: 'study', name: '學習', example: '書本費', color: '#EBA9B8', dark: '#FFBFA9' },
  { id: 'medical', name: '醫療', example: '掛號費', color: '#77422F', dark: '#C65021' },
  { id: 'invest', name: '投資', example: '定期定額', color: '#9C606F', dark: '#A26675' },
  { id: 'travel', name: '旅行', example: '車票', color: '#C48873', dark: '#C7868E' },
];

export const INCOME_CATS = [
  { id: 'salary', name: '薪資', example: '十月薪水', color: '#188C00', dark: '#1B9B00' },
  { id: 'iinvest', name: '投資', example: '股息', color: '#7FC200', dark: '#A0D102' },
  { id: 'bonus', name: '獎金', example: '年終獎金', color: '#465C12', dark: '#96EDC7' },
  { id: 'pocket', name: '零用', example: '生活費', color: '#51A885', dark: '#60B793' },
];

/** 找不到類別時（例如日後匯入了未知的類別）的備用類別。 */
export const UNKNOWN_CAT = { id: 'unknown', name: '未分類', example: '', color: '#9AA0A6', dark: '#9AA0A6' };

export const catsOf = (type) => (type === 'income' ? INCOME_CATS : EXPENSE_CATS);
export const findCat = (type, id) => catsOf(type).find((c) => c.id === id) || null;

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export const isDark = () => !!(darkQuery && darkQuery.matches);
export const onThemeChange = (fn) => darkQuery && darkQuery.addEventListener('change', fn);

/** 依目前是深色或淺色模式，回傳類別要用的顏色。 */
export const catColor = (cat) => (isDark() ? cat.dark : cat.color);
