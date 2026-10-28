// Keeps the app working offline: the network wins when it is reachable, the last copy otherwise.
const CACHE = 'pinboard-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// "Share to Pinboard" from Android arrives as a POST: park the shared text and pictures in a cache
// for the page to pick up, then send the browser to the app.
async function takeShare(request) {
  const form = await request.formData();
  const cache = await caches.open('pinboard-share');
  for (const key of await cache.keys()) await cache.delete(key);
  const meta = { title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '' };
  await cache.put('shared/meta', new Response(JSON.stringify(meta)));
  let n = 0;
  for (const file of form.getAll('images')) {
    if (file instanceof File) await cache.put(`shared/image-${n++}`, new Response(file, { headers: { 'Content-Type': file.type } }));
  }
  return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    event.respondWith(takeShare(req));
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error())),
      ),
  );
});

// Tapping a reminder notification brings the app to the front (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const open = all[0];
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
