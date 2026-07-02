import client from './client'

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  if (!VAPID_KEY) { console.warn('VITE_VAPID_PUBLIC_KEY not set'); return null }

  const reg          = await navigator.serviceWorker.ready
  const permission   = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
  })

  const json = sub.toJSON()
  await client.post('/push/subscribe.php', {
    endpoint: json.endpoint,
    p256dh:   json.keys.p256dh,
    auth:     json.keys.auth,
  })

  return sub
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await client.delete('/push/subscribe.php', { data: { endpoint: sub.endpoint } })
  await sub.unsubscribe()
}

export async function getCurrentSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}
