const MAX_BYTES = 25 * 1024 * 1024
const MAX_EDGE = 12_000
const MAX_PIXELS = 32_000_000

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const jpegFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9,
  0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

interface Dimensions {
  width: number
  height: number
}

function hasTag(view: DataView, offset: number, tag: string): boolean {
  return offset + tag.length <= view.byteLength &&
    Array.from(tag).every((char, index) => view.getUint8(offset + index) === char.charCodeAt(0))
}

function jpegDimensions(view: DataView): Dimensions | undefined {
  let offset = 2
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++
    if (offset + 3 > view.byteLength) return
    const marker = view.getUint8(offset++)
    if (marker === 0xda || marker === 0xd9) return
    const length = view.getUint16(offset)
    if (length < 2 || offset + length > view.byteLength) return
    if (jpegFrameMarkers.has(marker) && length >= 8) {
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) }
    }
    offset += length
  }
}

function littleEndian24(view: DataView, offset: number): number {
  return view.getUint8(offset) + view.getUint16(offset + 1, true) * 256
}

function webpFrameDimensions(view: DataView, offset: number, size: number): Dimensions | undefined {
  const start = offset + 8
  if (hasTag(view, offset, 'VP8 ') && size >= 10 &&
    view.getUint8(start + 3) === 0x9d && view.getUint8(start + 4) === 0x01 && view.getUint8(start + 5) === 0x2a) {
    return {
      width: view.getUint16(start + 6, true) & 0x3fff,
      height: view.getUint16(start + 8, true) & 0x3fff,
    }
  }
  if (hasTag(view, offset, 'VP8L') && size >= 5 && view.getUint8(start) === 0x2f) {
    const packed = view.getUint32(start + 1, true)
    return { width: 1 + (packed & 0x3fff), height: 1 + ((packed >>> 14) & 0x3fff) }
  }
}

function webpDimensions(view: DataView): Dimensions | undefined {
  if (view.byteLength < 26 || view.getUint32(4, true) + 8 !== view.byteLength) return

  let canvas: Dimensions | undefined
  let frame: Dimensions | undefined
  let offset = 12
  for (let chunks = 0; offset + 8 <= view.byteLength && chunks < 4096; chunks++) {
    const size = view.getUint32(offset + 4, true)
    const next = offset + 8 + size + (size % 2)
    if (next > view.byteLength) return

    if (hasTag(view, offset, 'VP8X')) {
      if (size !== 10 || offset !== 12) return
      if (view.getUint8(20) & 0x02) {
        throw new Error('Selecciona una captura estática en PNG, JPEG o WebP.')
      }
      canvas = { width: 1 + littleEndian24(view, 24), height: 1 + littleEndian24(view, 27) }
    }
    if (hasTag(view, offset, 'VP8 ') || hasTag(view, offset, 'VP8L')) {
      if (frame) return
      frame = webpFrameDimensions(view, offset, size)
      if (!frame) return
    }
    offset = next
  }

  if (offset !== view.byteLength || !frame) return
  if (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) return
  return frame
}

export function assertImageSize(size: number): void {
  if (size === 0 || size > MAX_BYTES) {
    throw new Error('La captura debe ocupar entre 1 byte y 25 MB.')
  }
}

export function inspectImage(bytes: Uint8Array): Dimensions & { mime: ImageMime } {
  assertImageSize(bytes.byteLength)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let mime: ImageMime
  let dimensions: Dimensions | undefined

  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    mime = 'image/png'
    if (view.byteLength >= 33 && view.getUint32(8) === 13 && hasTag(view, 12, 'IHDR')) {
      dimensions = { width: view.getUint32(16), height: view.getUint32(20) }
    }
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg'
    dimensions = jpegDimensions(view)
  } else if (hasTag(view, 0, 'RIFF') && hasTag(view, 8, 'WEBP')) {
    mime = 'image/webp'
    dimensions = webpDimensions(view)
  } else {
    throw new Error('Selecciona una imagen PNG, JPEG o WebP válida.')
  }

  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
    throw new Error('No se pudieron leer las dimensiones de la captura.')
  }
  assertImageDimensions(dimensions)
  return { mime, ...dimensions }
}

export function assertImageDimensions({ width, height }: Dimensions): void {
  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new Error('La captura supera el límite de 32 megapíxeles o 12.000 píxeles por lado.')
  }
}
