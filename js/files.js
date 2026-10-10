// 存檔與選檔（瀏覽器端）。
// iPhone 的主畫面 App 不一定能直接「下載」檔案，最可靠的是系統的分享選單
// （Web Share API，附上檔案），之後可選「儲存到檔案」。不能用時才退回下載。

/**
 * 把文字存成檔案給使用者。要在點擊按鈕的當下呼叫（分享選單需要使用者操作）。
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function saveTextFile({ name, text, mime }) {
  const type = mime || 'text/plain';
  let file = null;
  try {
    file = new File([text], name, { type });
  } catch (e) { /* 舊瀏覽器沒有 File 建構子 */ }

  if (file && navigator.canShare && navigator.share) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled'; // 使用者自己關掉分享選單
      // 其他錯誤（例如系統拒絕）→ 改用下載
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

/** 讓使用者選一個檔案並讀成文字；沒有選就回傳 null。 */
export function pickTextFile(input) {
  return new Promise((resolve, reject) => {
    const onChange = async () => {
      const f = input.files && input.files[0];
      input.value = ''; // 之後選同一個檔案也能再觸發 change
      if (!f) { resolve(null); return; }
      try {
        resolve(await f.text());
      } catch (e) {
        reject(e);
      }
    };
    input.addEventListener('change', onChange, { once: true });
    input.click();
  });
}
