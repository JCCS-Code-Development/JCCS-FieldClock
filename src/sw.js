import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Take over immediately when a new SW is installed — no waiting for tabs to close
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Runtime cache: API reads
registerRoute(
  ({ url }) => /\/api\/(?:jobs|employees|invoices|reports)\//.test(url.pathname),
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
const PUSH_CONFIGS = {
  en: {
    paycheck:        { body: 'Your paycheck is available. Tap to view.',        tag: 'paycheck',        url: '/my-pay' },
    check_ready:     { body: 'Your check is ready for this week. Tap to view.', tag: 'check-ready',     url: '/contractor/invoices' },
    travel_reminder: { body: "Still traveling? Tap to confirm you've arrived.",  tag: 'travel-reminder', url: '/' },
  },
  es: {
    paycheck:        { body: 'Tu cheque de pago está disponible. Toca para ver.',        tag: 'paycheck',        url: '/my-pay' },
    check_ready:     { body: 'Tu cheque está listo esta semana. Toca para ver.',          tag: 'check-ready',     url: '/contractor/invoices' },
    travel_reminder: { body: '¿Sigues en camino? Toca para confirmar tu llegada.',        tag: 'travel-reminder', url: '/' },
  },
}

self.addEventListener('push', (event) => {
  let data = {}
  try { data = JSON.parse(event.data?.text() ?? '{}') } catch {}

  const lang  = PUSH_CONFIGS[data.lang] ? data.lang : 'en'
  const table = PUSH_CONFIGS[lang]
  const cfg   = (data.type && table[data.type]) ? table[data.type] : table.check_ready

  event.waitUntil(
    self.registration.showNotification('JCCS FieldClock', {
      body:    cfg.body,
      icon:    '/pwa-192x192.png',
      badge:   '/pwa-192x192.png',
      vibrate: [200, 100, 200],
      tag:     cfg.tag,
      renotify: true,
      data:    { url: cfg.url },
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
