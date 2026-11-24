import { optimizeImage, type OptimizedImage } from './imageCanvas'
import { assertImageDimensions, assertImageSize, inspectImage } from './imageFormat'

type WorkerReply = { image: OptimizedImage } | { fallback: true } | { error: string }

function processInWorker(file: File, signal: AbortSignal): Promise<OptimizedImage | undefined> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(undefined)
      return
    }

    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('La captura demoró demasiado en procesarse. Intenta con una imagen más pequeña.'))
    }, 30_000)
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    function cleanup() {
      window.clearTimeout(timeout)
      worker.terminate()
      signal.removeEventListener('abort', abort)
    }

    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      cleanup()
      if ('error' in data) reject(new Error(data.error))
      else resolve('image' in data ? data.image : undefined)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      cleanup()
      resolve(undefined)
    }
    worker.onmessageerror = () => {
      cleanup()
      resolve(undefined)
    }
    worker.postMessage(file)
  })
}

function decodeImage(blob: Blob, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    const abort = () => {
      cleanup()
      image.removeAttribute('src')
      reject(signal.reason)
    }
    function cleanup() {
      URL.revokeObjectURL(url)
      signal.removeEventListener('abort', abort)
      image.onload = image.onerror = null
    }
    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('No se pudo abrir la captura. Comprueba que el archivo esté completo.'))
    }
    signal.addEventListener('abort', abort, { once: true })
    image.src = url
  })
}

export async function processImage(file: File, signal: AbortSignal): Promise<OptimizedImage> {
  signal.throwIfAborted()
  assertImageSize(file.size)
  const result = await processInWorker(file, signal)
  signal.throwIfAborted()
  if (result) return result

  const { mime } = inspectImage(new Uint8Array(await file.arrayBuffer()))
  signal.throwIfAborted()
  const source = await decodeImage(file.slice(0, file.size, mime), signal)
  signal.throwIfAborted()
  assertImageDimensions({ width: source.naturalWidth, height: source.naturalHeight })
  const optimized = await optimizeImage(
    source,
    source.naturalWidth,
    source.naturalHeight,
    (width, height) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return { canvas, context: canvas.getContext('2d', { alpha: false }) }
    },
    (canvas, quality) => new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('El navegador no pudo comprimir la captura.'))
      }, 'image/jpeg', quality)
    }),
  )
  signal.throwIfAborted()
  return optimized
}
