import { ACTIVATE_PWA_UPDATE } from './pwa-messages'

function registerWorker() {
  return navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
}

export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const register = () => { void registerWorker().catch(() => {}) }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

function waitForWorker(worker: ServiceWorker, states: readonly ServiceWorkerState[], signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    function cleanup() {
      worker.removeEventListener('statechange', check)
      signal.removeEventListener('abort', timedOut)
    }
    function timedOut() {
      cleanup()
      reject(signal.reason)
    }
    function check() {
      if (signal.aborted) return timedOut()
      if (states.includes(worker.state)) {
        cleanup()
        resolve()
      } else if (worker.state === 'redundant') {
        cleanup()
        reject(new Error('La versión nueva se reemplazó antes de activarse.'))
      }
    }
    worker.addEventListener('statechange', check)
    signal.addEventListener('abort', timedOut, { once: true })
    check()
  })
}

export async function applyPwaUpdate() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const registration = await registerWorker()
  await registration.update()
  const worker = registration.installing ?? registration.waiting ?? registration.active
  if (!worker) throw new Error('La aplicación aún no está lista para actualizarse.')

  const signal = AbortSignal.timeout(12_000)
  await waitForWorker(worker, ['installed', 'activating', 'activated'], signal)
  if (worker.state === 'installed') worker.postMessage(ACTIVATE_PWA_UPDATE)
  await waitForWorker(worker, ['activated'], signal)
}
