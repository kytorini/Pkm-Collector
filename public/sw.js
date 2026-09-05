/*
 * Offline support. The collection itself already lives in localStorage and the
 * card data in IndexedDB — this covers the two things that still needed the
 * network: the app's own files, and card artwork.
 */
const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const IMAGES = `card-images-${VERSION}`

/** Card art is content-addressed by set and number, so it never changes. */
const IMAGE_HOSTS = ['images.pokemontcg.io']
/** Card data is cached in IndexedDB by the app, with its own freshness rules. */
const API_HOSTS = ['api.pokemontcg.io']

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached ?? (await network) ?? Response.error()
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    // Card images come back opaque (no CORS), which is fine to store and replay.
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
    return response
  } catch {
    return cached ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Prices must never be served stale from here; the app decides when to refetch.
  if (API_HOSTS.includes(url.hostname)) return

  if (IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGES))
    return
  }

  if (url.origin !== self.location.origin) return

  // A navigation offline should still open the app, not a browser error page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL)
        return (await cache.match(new URL('./', self.location.href).href)) ?? (await cache.match('./index.html')) ?? Response.error()
      }),
    )
    return
  }

  event.respondWith(staleWhileRevalidate(request, SHELL))
})
