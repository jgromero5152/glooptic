// Permite abrir el sistema sin internet: primero intenta la red y, si no hay, usa la copia guardada.
const CACHE = 'optica-v3';
const FILES = ['./', './index.html', './app.js', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './jspdf.umd.min.js', './logo-mark.png', './logo-glooptic.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Pide siempre la versión más reciente al servidor (sin usar la copia vieja del navegador).
const fetchFresco = req => new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const propio = e.request.url.startsWith(self.location.origin);
  e.respondWith(
    fetch(propio ? fetchFresco(e.request) : e.request)
      .then(r => {
        if (r.ok && (propio || e.request.url.includes('fonts.g'))) {
          const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
