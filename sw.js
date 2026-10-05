// Offline cache for the BLO quiz.
// Serves the saved copy instantly (works with no connection), then checks
// GitHub for a newer version in the background and tells the page if there is one.
const CACHE = 'blo-quiz-v1';
const CORE = ['./', './index.html', './manifest.webmanifest',
              './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(req, { ignoreSearch: true })) ||
                   (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);

    const fresh = fetch(req, { cache: 'no-cache' }).then(async res => {
      if (res && res.ok) {
        const tag = r => r.headers.get('etag') || r.headers.get('last-modified');
        const before = cached && tag(cached);
        const after = tag(res);
        await cache.put(req, res.clone());
        if (req.mode === 'navigate' && before && after && before !== after) {
          (await self.clients.matchAll()).forEach(c => c.postMessage('updated'));
        }
      }
      return res;
    }).catch(() => undefined);

    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || new Response('Offline, and this page has not been saved yet.',
                                         { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
