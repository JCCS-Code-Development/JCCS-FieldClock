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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
