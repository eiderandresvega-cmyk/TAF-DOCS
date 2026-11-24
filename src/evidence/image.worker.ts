import { optimizeImage } from './imageCanvas'
import { assertImageDimensions, inspectImage } from './imageFormat'

self.addEventListener('message', async (event: MessageEvent<File>) => {
  if (typeof OffscreenCanvas !== 'function' || typeof OffscreenCanvas.prototype.convertToBlob !== 'function' ||
    typeof createImageBitmap !== 'function') {
    self.postMessage({ fallback: true })
    return
  }

  try {
    const file = event.data
    const { mime } = inspectImage(new Uint8Array(await file.arrayBuffer()))
    const source = await createImageBitmap(file.slice(0, file.size, mime))
    try {
      assertImageDimensions(source)
      const image = await optimizeImage(
        source,
        source.width,
        source.height,
        (width, height) => {
          const canvas = new OffscreenCanvas(width, height)
          return { canvas, context: canvas.getContext('2d', { alpha: false }) }
        },
        (canvas, quality) => canvas.convertToBlob({ type: 'image/jpeg', quality }),
      )
      self.postMessage({ image })
    } finally {
      source.close()
    }
  } catch (failure) {
    const message = failure instanceof Error && failure.name === 'Error'
      ? failure.message
      : 'No se pudo abrir la captura. Comprueba que el archivo esté completo.'
    self.postMessage({ error: message })
  }
})
