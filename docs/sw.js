// يخلي النظام يشتغل بدون إنترنت. الشبكة أولاً، فأي تعديل يظهر مباشرة،
// والنسخة المخزنة تُستخدم بس لما ينقطع النت.
const CACHE = 'hunter-v23';
const ASSETS = ['./', './index.html', './css/style.css', './js/boot.js', './js/i18n.js', './js/config.js', './js/core.js', './js/ui.js', './js/look-anime.js', './js/look-ink.js', './js/tasks.js', './js/hero.js', './js/timer.js', './js/records.js', './js/stats.js', './js/brief.js', './js/backup.js', './js/main.js', './js/cloud.js', './vendor/supabase.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-192.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png', './assets/favicon.svg', './assets/favicon-32.png', './assets/hunter-avatar.webp', './assets/dungeon-gate.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('hunter-') && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
