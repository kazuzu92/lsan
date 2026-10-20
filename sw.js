/* Fonctionnement hors connexion.
   L'app et les leçons : réseau d'abord (pour recevoir les mises à jour), cache sinon.
   Audio, polices, icônes : cache d'abord (ils ne changent pas, leur nom change avec leur contenu).
   Augmente VERSION si tu supprimes ou renommes des fichiers. */
const VERSION = 'lsan-1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'fsrs.js', 'manifest.webmanifest',
  'content/en.json', 'content/dj.json', 'audio/en/index.json', 'audio/dj/index.json',
  'fonts/instrument-sans-latin-400-normal.woff2', 'fonts/instrument-sans-latin-600-normal.woff2',
  'fonts/noto-naskh-arabic-arabic-400-normal.woff2', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const immutable = /\/(audio\/(en|dj)\/[0-9a-f]+\.mp3|fonts\/|icons\/)/.test(url.pathname);
  if (immutable) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
