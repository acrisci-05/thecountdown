// Service worker di The Countdown: rende il sito installabile e apribile anche offline.
// Strategia unica, "prima la rete": così dopo ogni pubblicazione si vede subito la versione nuova.
// La copia salvata serve solo quando sei offline. Le API non vengono mai salvate qui
// (le uscite cambiano di continuo e hanno già la cache della CDN).
const VERSION = 'tc-v2';
const SHELL = ['/', '/index.html', '/countdown.html', '/styles.css', '/js/boot.js', '/js/app.js', '/js/data.js', '/js/share.js', '/js/countdown-page.js', '/js/vendor/qrcode.js', '/manifest.webmanifest', '/assets/favicon.svg', '/assets/icon-192.png', '/assets/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(cache => cache.put(url.pathname.startsWith('/countdown') ? '/countdown.html' : '/', copy)); }
      return res;
    }).catch(() => caches.match(url.pathname.startsWith('/countdown') ? '/countdown.html' : '/')));
    return;
  }
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(cache => cache.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req)));
});
