export interface OptimizedImage {
  width: number
  height: number
  image: Blob
  thumbnail: Blob
}

export type ImageCanvas = HTMLCanvasElement | OffscreenCanvas

export type DrawContext = Pick<CanvasRenderingContext2D,
  'drawImage' | 'fillRect' | 'fillStyle' | 'imageSmoothingEnabled' | 'imageSmoothingQuality'>

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function prepareCanvas<T extends ImageCanvas>(
  source: CanvasImageSource,
  width: number,
  height: number,
  createCanvas: (width: number, height: number) => { canvas: T; context: DrawContext | null },
): T {
  const { canvas, context } = createCanvas(width, height)
  if (!context) throw new Error('El navegador no pudo reservar memoria para la captura.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)
  return canvas
}

export async function optimizeImage<T extends ImageCanvas>(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  createCanvas: (width: number, height: number) => { canvas: T; context: DrawContext | null },
  toBlob: (canvas: T, quality: number) => Promise<Blob>,
): Promise<OptimizedImage> {
  const { width, height } = fit(sourceWidth, sourceHeight, 2400)
  const original = prepareCanvas(source, width, height, createCanvas)
  const small = fit(width, height, 480)
  const thumbnail = prepareCanvas(original, small.width, small.height, createCanvas)

  try {
    const [image, preview] = await Promise.all([toBlob(original, 0.88), toBlob(thumbnail, 0.8)])
    return { width, height, image, thumbnail: preview }
  } finally {
    original.width = original.height = 1
    thumbnail.width = thumbnail.height = 1
  }
}
