import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { refreshFxRate } from './lib/fx'
import { requestPersistentStorage } from './lib/storage'
import './styles.css'

/*
 * No zooming. The layout is built to the screen, and a stray pinch or
 * double-tap while ticking cards off left the page zoomed and sideways.
 * Safari in a browser tab ignores the viewport's user-scalable=no, so its
 * pinch gesture is cancelled here too; double-tap is handled in CSS.
 */
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask to be exempt from storage eviction — the collection lives in this
// browser, and losing it to a low-disk cleanup would be unrecoverable.
void requestPersistentStorage()

// Some cards are priced only in euros; a current rate keeps totals in one
// currency. Failure is fine — a cached or built-in rate carries on.
void refreshFxRate()

// Offline support. Dev is left alone so changes aren't served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Whether a worker was already in charge when this page loaded. Without it,
  // the claim that happens on a first-ever install would trigger a reload.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  // A new deployment otherwise only appears on the load *after* the one that
  // fetched it, which makes fixes look like they didn't ship.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  /*
   * A Home Screen app is usually resumed from memory rather than relaunched,
   * so it can run the old version for days after a new one is published —
   * a rename that "didn't happen", a fix that "didn't ship". Coming back to
   * the app asks the server which build is current and reloads onto it if
   * this isn't that build. At most every few minutes, and never mid-typing.
   */
  const CHECK_EVERY_MS = 5 * 60 * 1000
  let lastCheck = Date.now()
  const runningBuild = (): string | null =>
    document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null
  const checkForNewBuild = async () => {
    if (document.visibilityState !== 'visible' || reloading) return
    if (Date.now() - lastCheck < CHECK_EVERY_MS) return
    lastCheck = Date.now()
    const current = runningBuild()
    if (!current) return
    try {
      const res = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })
      if (!res.ok) return
      const latest = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(await res.text())?.[1]
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      if (latest && latest !== current && !typing) {
        reloading = true
        window.location.reload()
      }
    } catch {
      /* offline: the version in hand is the one to use */
    }
  }
  document.addEventListener('visibilitychange', () => void checkForNewBuild())

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        // Catches a new version published while the app is left open.
        setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000)
      })
      .catch(() => undefined)
  })
}
