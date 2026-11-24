import { describe, expect, it } from 'vitest'
import { inspectImage } from './imageFormat'

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('validación del formato de capturas', () => {
  it('lee las dimensiones declaradas en una cabecera PNG', () => {
    expect(inspectImage(pngHeader(1200, 800))).toEqual({ mime: 'image/png', width: 1200, height: 800 })
  })

  it('impide decodificar imágenes con exceso de dimensiones o píxeles', () => {
    expect(() => inspectImage(pngHeader(12_001, 1))).toThrow('límite')
    expect(() => inspectImage(pngHeader(6000, 6000))).toThrow('límite')
  })

  it('rechaza tipos activos y cabeceras truncadas', () => {
    expect(() => inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow('válida')
    expect(() => inspectImage(new Uint8Array([255, 216, 255, 224, 255]))).toThrow('dimensiones')
  })

  it('lee la cabecera de un WebP compacto sin pérdida', () => {
    const bytes = new Uint8Array(26)
    const encoder = new TextEncoder()
    bytes.set(encoder.encode('RIFF'), 0)
    bytes.set(encoder.encode('WEBPVP8L'), 8)
    const view = new DataView(bytes.buffer)
    view.setUint32(4, 18, true)
    view.setUint32(16, 5, true)
    bytes[20] = 0x2f
    view.setUint32(21, (7 << 14) | 9, true)
    expect(inspectImage(bytes)).toEqual({ mime: 'image/webp', width: 10, height: 8 })
  })

  it('rechaza un WebP con dimensiones incompatibles entre el lienzo y la imagen', () => {
    const bytes = new Uint8Array(44)
    const encoder = new TextEncoder()
    bytes.set(encoder.encode('RIFF'), 0)
    bytes.set(encoder.encode('WEBPVP8X'), 8)
    bytes.set(encoder.encode('VP8L'), 30)
    const view = new DataView(bytes.buffer)
    view.setUint32(4, 36, true)
    view.setUint32(16, 10, true)
    view.setUint32(34, 5, true)
    bytes[38] = 0x2f
    view.setUint32(39, 9000, true)
    expect(() => inspectImage(bytes)).toThrow('dimensiones')
  })
})
