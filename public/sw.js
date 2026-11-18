const CACHE_NAME = 'postos-autorizados-v16';   // v16: identidade do Grupo Miranda Coelho (logo, ícone e laranja); v15: login do motorista pelo usuário de 6 números, sem CPF
const SHELL_FILES = [
  '/',
  '/app.css',
  '/app.js',
  '/postos.csv',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-grupo-negativo.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; })
        .map(function (n) { return caches.delete(n); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  // só GET do próprio site; login e gestão nunca passam pelo cache
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/gestao')) return;

  // imagens e manifest quase nunca mudam: cache primeiro
  if (url.pathname.endsWith('.png') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(caches.match(req).then(function (c) { return c || fetch(req); }));
    return;
  }

  // resto (página, csv, css, js): rede primeiro; sem sinal, usa o que ficou salvo
  event.respondWith(
    fetch(req).then(function (resp) {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(url.pathname, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(url.pathname);
    })
  );
});
