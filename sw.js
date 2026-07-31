const CACHE_NAME = 'tabungan-emas-v4';
const APP_SHELL = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

  // Apa pun yang BUKAN berasal dari origin situs ini sendiri (API harga live, proxy CORS,
  // Google Apps Script untuk sinkron, dsb) dilewatkan sepenuhnya — Service Worker TIDAK
  // ikut campur (tidak mencegat, tidak nge-cache). Biarkan browser menanganinya secara native.
  if (reqUrl.origin !== self.location.origin) {
    return;
  }

  // App shell (file milik situs sendiri): network-first (selalu ambil versi terbaru kalau online),
  // fallback ke cache HANYA kalau benar-benar offline/network gagal.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
