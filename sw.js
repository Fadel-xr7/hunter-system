// يخلي النظام يشتغل بدون إنترنت. الشبكة أولاً، فأي تعديل يظهر مباشرة،
// والنسخة المخزنة تُستخدم بس لما ينقطع النت.
const CACHE = 'hunter-v9';
const ASSETS = ['./', './index.html', './style.css', './i18n.js', './app.js', './config.js', './cloud.js', './vendor/supabase.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './hunter-avatar.webp', './dungeon-gate.webp'];

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
