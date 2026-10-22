/* GPlanSiS|Flows — service worker (escopo raiz).
   Shell estático: HTML rede-primeiro com reserva offline; demais arquivos do shell cache-primeiro, por versão.
   Nunca intercepta /api/* nem requisições que não sejam GET (documentos, login e IA vão sempre ao servidor).
   VERSION: o servidor troca __BUILD__ por um hash dos arquivos do app a cada publicação. */
const VERSION = 'flows-__BUILD__';
const CACHE = 'gplansis-flows-' + VERSION;
const SHELL = [
  '/', '/plataforma.js', '/plataforma.css', '/favicon.svg', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png',
  '/fonts/fonts.css',
  '/fonts/ibm-plex-sans-latin-400-normal.woff2', '/fonts/ibm-plex-sans-latin-500-normal.woff2',
  '/fonts/ibm-plex-sans-latin-600-normal.woff2', '/fonts/ibm-plex-mono-latin-400-normal.woff2',
  '/fonts/ibm-plex-mono-latin-500-normal.woff2'
];
const ASSETS = new Set(SHELL.filter(p => p !== '/'));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload', credentials: 'same-origin' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('gplansis-flows-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    // rede primeiro; guarda a última cópia do shell para abrir sem rede
    e.respondWith(fetch(req).then(r => {
      if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then(c => c.put('/', cp)); }
      return r;
    }).catch(() => caches.match('/', { cacheName: CACHE }).then(r => r || Response.error())));
    return;
  }

  if (ASSETS.has(url.pathname)) {
    e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
      if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return r;
    })));
  }
});
