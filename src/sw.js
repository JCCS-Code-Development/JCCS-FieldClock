import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Runtime cache: API reads
registerRoute(
  ({ url }) => /\/api\/(?:jobs|employees|work-orders|invoices|reports)\//.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-reads-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

// Runtime cache: Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// ── Push notifications ───────────────────────────────────────────
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('JCCS FieldClock', {
      body: 'Your check is ready for this week. Log in to view payment details.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [200, 100, 200],
      tag: 'check-ready',
      renotify: true,
      data: { url: '/contractor/invoices' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(url) && 'focus' in c)
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
