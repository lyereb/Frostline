const CACHE_NAME = 'frostline-zero-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
]
// Replaced by scripts/pwa-precache.mjs in dist during production builds.
const PRECACHE = []

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...APP_SHELL, ...PRECACHE]))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  // HTML navigations fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Game modules, fonts, textures and sharing assets use a cache-first strategy after
  // their first successful network load. This keeps the already-loaded game playable offline.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
      }
      return response
    }))
  )
})
