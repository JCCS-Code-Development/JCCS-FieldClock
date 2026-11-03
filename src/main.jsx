import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App.jsx'

// A new build ships a new service worker; sw.js calls skipWaiting() +
// clientsClaim() so it takes control of already-open tabs right away. Reload
// once when that happens, so every client lands on the current code without
// anyone having to close and reopen the app. Guarded on an existing controller
// so a first-ever visit doesn't reload itself.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}

// The browser only checks for a new sw.js on a real page load. An installed
// PWA on a phone is usually just resumed from the background, never reloaded,
// so without this it can keep running a weeks-old build (seen: an employee
// still on a pre-Oct-2 build where Lunch stayed hidden past 2 hours worked).
// Ask for an update whenever the app comes back to the foreground, and every
// 30 minutes while it's open; a found update triggers the reload above.
if ('serviceWorker' in navigator) {
  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {})
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  setInterval(checkForUpdate, 30 * 60 * 1000)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
