// 外部服務的設定。
// 報價轉發：Cloudflare Worker（原始碼在 worker/quotes-worker.js）。
// 它只會收到股票代碼，不會收到任何持股、成本或帳目。網址空白或連不上時，Orbit 會改用手動輸入的市價。
export const QUOTES_URL = 'https://orbit-quotes.tungshenhsieh.workers.dev/';
