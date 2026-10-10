// Service Worker：讓 Orbit 在沒有網路時也能開啟。
// 策略：有網路時一律抓最新檔案（並更新快取），沒網路時用快取。
// 改了任何檔案後，把 CACHE 的名稱改掉（例如加上 -1），舊快取就會被清掉。

const CACHE = 'orbit-1.0.0-1'; // 跟著 App 版本走；同一版本內改了檔案就加上 -1、-2…
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/dateutil.js',
  'js/sample.js',
  'js/cats.js',
  'js/stats.js',
  'js/db.js',
  'js/prefs.js',
  'js/sheet.js',
  'js/entry-sheet.js',
  'js/settings.js',
  'js/backup.js',
  'js/files.js',
  'js/list-gestures.js',
  'js/palette.js',
  'js/carousel.js',
  'js/cat-editor.js',
  'js/orbit.js',
  'js/date-picker.js',
  'js/accounts.js',
  'js/acc-editor.js',
  'js/asset-sheet.js',
  'js/search-sheet.js',
  'js/rows.js',
  'js/reminders.js',
  'js/adjust.js',
  'js/version.js',
  'js/ring.js',
  'js/gestures.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
