const CACHE_VERSION = 'dotascope-v4'
const APP_SHELL = './'
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

// The hashed JS/CSS filenames change on every build. Read them from the
// precached app shell so a first-session install can still boot offline.
async function precacheShell() {
  const cache = await caches.open(CACHE_VERSION)
  await cache.addAll(SHELL_FILES)

  const index = await cache.match('./index.html')
  if (!index) return

  const html = await index.text()
  const assets = new Set()
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1]
    if (!value.startsWith('/') && !value.startsWith('./')) continue
    const url = new URL(value, self.location.origin + '/')
    if (url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) continue
    assets.add(url.pathname + url.search)
  }

  await Promise.all([...assets].map((path) => cache.add(path).catch(() => undefined)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  if (!sameOrigin) {
    if (request.destination === 'image') {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached
          return fetch(request).then((response) => {
            if (response.ok || response.type === 'opaque') {
              const copy = response.clone()
              void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          })
        }),
      )
    }
    return
  }

  if (url.pathname.endsWith('/sw.js')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE_VERSION).then((cache) => cache.put(APP_SHELL, copy))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION)
          return (
            (await cache.match(APP_SHELL, { ignoreVary: true })) ||
            (await cache.match('./index.html', { ignoreVary: true })) ||
            Response.error()
          )
        }),
    )
    return
  }

  if (['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION)
        const cached = await cache.match(request, { ignoreVary: true })

        if (cached) {
          event.waitUntil(
            fetch(request)
              .then((response) => {
                if (response.ok) return cache.put(request, response.clone())
              })
              .catch(() => undefined),
          )
          return cached
        }

        const response = await fetch(request)
        if (response.ok) void cache.put(request, response.clone())
        return response
      })(),
    )
  }
})
