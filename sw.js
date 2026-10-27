// Offline support for the BLO quiz.
// Online: the page always comes fresh from the network, so new uploads show up straight away.
// Offline (or a very slow network): the last saved copy is used instead.
const CACHE = 'blo-quiz-v2';
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

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);

    if (isPage) {
      try {
        const res = await withTimeout(fetch(req, { cache: 'no-store' }), 8000);
        if (res && res.ok) { await cache.put('./index.html', res.clone()); return res; }
      } catch (_) { /* offline or too slow: fall through to the saved copy */ }
      return (await cache.match('./index.html')) ||
             new Response('Offline, and this page has not been saved yet.',
                          { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }

    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  })());
});
