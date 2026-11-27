const CACHE_NAME = 'frostline-zero-v1'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
]
// Replaced by scripts/pwa-precache.mjs in dist during production builds.
const PRECACHE = []
const baseUrl = self.registration.scope
const scopeSuffix = `@${baseUrl}`
const scopedCache = CACHE_NAME + scopeSuffix
const uncached = new Set(['sdk.config.json', 'version.json'].map(path => new URL(path, baseUrl).href))

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(scopedCache)
      .then(cache => cache.addAll([...new Set([...APP_SHELL, ...PRECACHE].map(path => new URL(path, baseUrl).href))]))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('frostline-zero-') && key.endsWith(scopeSuffix) && key !== scopedCache)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || uncached.has(request.url)) return

  // HTML navigations fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          caches.open(scopedCache).then(cache => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(new URL('index.html', baseUrl).href, { cacheName: scopedCache }))
    )
    return
  }

  // Game modules, fonts, textures and sharing assets use a cache-first strategy after
  // their first successful network load. This keeps the already-loaded game playable offline.
  event.respondWith(
    caches.match(request, { cacheName: scopedCache }).then(cached => cached || fetch(request).then(response => {
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone()
        caches.open(scopedCache).then(cache => cache.put(request, copy))
      }
      return response
    }))
  )
})
