export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const register = () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}) }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
