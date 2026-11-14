/* Vitruvian Manager's offline worker, for the installable app (manifest.json). Network first: online, every request
   goes to the network as before and the copy kept here is refreshed; offline, the shell (its page, script, styles,
   registry, marks and the freshness lines' module) and IoT Connect's own page still open from that copy. It keeps nothing else: never another
   origin (fonts, maps, feeds), never the site's data, /api/ or /mcp, and never the bridge on this computer. Every
   other request is left alone, exactly as if there were no worker. The shell registers it (shell.js); bump VERSION
   when the list changes. */
const VERSION = 'vm-shell-2';
const IOT = 'digital/iot-connect/';
const FILES = [
  '', 'shell.js', 'shell.css', 'registry.json', 'manifest.json',
  'design/prp.css', 'design/prp-bar.js', 'design/prp-freshness.js', 'design/prp-voice.js', 'design/jdpi-documentary.js', 'design/jdpi-narrator.js', 'design/jdpi-entities.js',
  'design/brand-vm.svg', 'design/brand-vm-icon.svg', 'design/vm-loading.svg',
  'design/icons/vm-192.png', 'design/icons/vm-512.png', 'design/icons/vm-maskable-512.png', 'apple-touch-icon.png',
  IOT, `${IOT}iot.css`, `${IOT}app.js`,
  ...['bridge', 'keymap', 'model', 'qr', 'sha256', 'words'].map(f => `${IOT}lib/${f}.js`),
  ...['dom', 'overview', 'devices', 'remote', 'hermes', 'uns', 'law'].map(f => `${IOT}views/${f}.js`),
];

/** The cache key of a request this worker keeps, or null for every request it leaves alone. */
function keyOf(request, scope) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url), base = new URL(scope);
  if (url.origin !== base.origin) return null;
  // Cloudflare Pages serves /x/index.html at /x/: both name the same file.
  const path = url.pathname.replace(/\/index\.html$/, '/');
  if (!path.startsWith(base.pathname)) return null;
  const rel = path.slice(base.pathname.length);
  return FILES.includes(rel) ? new URL(rel, base).href : null;
}
self.vmKeyOf = keyOf; // for the tests, which run this file in a sandbox

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => Promise.all(FILES.map(f => {
    const url = new URL(f, self.registration.scope).href;
    return fetch(url, { cache: 'no-cache' }).then(r => (r.ok && !r.redirected ? cache.put(url, r) : null)).catch(() => null);
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('vm-shell-') && k !== VERSION).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', event => {
  const key = keyOf(event.request, self.registration.scope);
  if (!key) return; // not ours: the browser fetches it as usual
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic' && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(caches.open(VERSION).then(cache => cache.put(key, copy)));
    }
    return response;
  }).catch(() => caches.match(key).then(hit => hit || Response.error())));
});
