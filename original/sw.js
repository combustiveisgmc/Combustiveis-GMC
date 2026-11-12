const CACHE_NAME = 'postos-autorizados-v5';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo-mark.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // icones e manifest: raramente mudam, cache primeiro é seguro e mais rápido
  if (url.endsWith('.png') || url.endsWith('manifest.json')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // tudo o resto (html, postos.csv): rede primeiro (pega sempre a versão mais
  // nova quando tem sinal), cai pro que está salvo só se estiver sem internet
  event.respondWith(
    fetch(event.request).then(function(resp) {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
      return resp;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
