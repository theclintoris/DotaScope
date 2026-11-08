export function isNativeShell() {
  const nativeCapacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean }
  }).Capacitor
  if (nativeCapacitor?.isNativePlatform?.()) return true
  return new URLSearchParams(window.location.search).get('runtime') === 'desktop'
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  // The native shells bundle the app locally. A service worker on the WebView
  // origin can pin an old bundle between app updates, so skip it there.
  const nativeCapacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean }
  }).Capacitor
  if (nativeCapacitor?.isNativePlatform?.()) return
  if (new URLSearchParams(window.location.search).get('runtime') === 'desktop') return

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(swUrl).catch((error: unknown) => {
      console.warn('DotaScope service worker registration failed:', error)
    })
  })
}
