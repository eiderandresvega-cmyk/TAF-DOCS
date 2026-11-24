import { Inflate } from 'fflate'
import { read, utils } from 'xlsx'
import { parseRows } from './schema'

const MIB = 1024 * 1024
const check = (condition: boolean) => {
  if (!condition) throw new Error('El contenedor ZIP/Excel está dañado o supera el tamaño admitido.')
}

function validateZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const dat = new DataView(buffer)
  const u16 = (position: number) => dat.getUint16(position, true)
  const u32 = (position: number) => dat.getUint32(position, true)
  function validateExtraFields(start: number, length: number) {
    const stop = start + length
    for (let position = start; position < stop;) {
      check(position + 4 <= stop && u16(position) !== 0x0001)
      position += 4 + u16(position + 2)
      check(position <= stop)
    }
  }
  check(bytes.length >= 22 && bytes.length <= 16 * MIB && u32(0) === 0x04034b50)
  const end = bytes.length - 22
  check(u32(end) === 0x06054b50 && u16(end + 20) === 0)
  for (let offset = end + 1; offset <= bytes.length - 4; offset++) check(u32(offset) !== 0x06054b50)
  const count = u16(end + 10)
  const directory = u32(end + 16)
  check(count > 0 && count <= 768 && u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 8) === count)
  check(directory >= 30 && directory + u32(end + 12) === end)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const filenames = new Set<string>()
  const parts: { start: number; dataStart: number; dataEnd: number; nextLocal: number; method: number; size: number }[] = []
  let position = directory
  let total = 0
  for (let index = 0; index < count; index++) {
    check(position + 46 <= end && u32(position) === 0x02014b50)
    const flags = u16(position + 8)
    const method = u16(position + 10)
    const compressed = u32(position + 20)
    const size = u32(position + 24)
    const nameLength = u16(position + 28)
    const nameEnd = position + 46 + nameLength
    const start = u32(position + 42)
    const next = nameEnd + u16(position + 30) + u16(position + 32)
    total += size
    check(nameLength > 0 && nameLength <= 256 && next <= end && size <= 40 * MIB && total <= 96 * MIB)
    check((flags & 0x2041) === 0 && u16(position + 34) === 0 && (method === 0 || method === 8))
    validateExtraFields(nameEnd, u16(position + 30))
    const name = decoder.decode(bytes.subarray(position + 46, nameEnd))
    check(!name.startsWith('/') && !/[\\:\u0000-\u001f]/u.test(name) && !name.split('/').some((segment) => segment === '..' || segment === '.') && !filenames.has(name))
    filenames.add(name)
    check(start + 30 <= directory && u32(start) === 0x04034b50 && u16(start + 6) === flags && u16(start + 8) === method)
    check(u16(start + 26) === nameLength && decoder.decode(bytes.subarray(start + 30, start + 30 + nameLength)) === name)
    const localNameEnd = start + 30 + nameLength
    const extraLength = u16(start + 28)
    const dataStart = localNameEnd + extraLength
    const dataEnd = dataStart + compressed
    check(dataEnd <= directory && (method !== 0 || size === compressed))
    validateExtraFields(localNameEnd, extraLength)
    const localCompressed = u32(start + 18)
    const localSize = u32(start + 22)
    let nextLocal = dataEnd
    if (flags & 8) {
      check((localCompressed === 0 || localCompressed === compressed) && (localSize === 0 || localSize === size))
      check(method !== 0 || localCompressed === compressed)
      check(dataEnd + 12 <= directory)
      const descriptor = u32(dataEnd) === 0x08074b50 ? dataEnd + 4 : dataEnd
      check(descriptor + 12 <= directory && u32(descriptor + 4) === compressed && u32(descriptor + 8) === size)
      nextLocal = descriptor + 12
    } else {
      check(localCompressed === compressed && localSize === size)
    }
    parts.push({ start, dataStart, dataEnd, nextLocal, method, size })
    position = next
  }
  check(position === end && filenames.has('[Content_Types].xml') && filenames.has('xl/workbook.xml'))
  if ([...filenames].some((name) => /(?:^|\/)vbaproject\.bin$/iu.test(name))) throw new Error('TAF admite libros .xlsx sin macros.')
  let previousEnd = 0
  for (const entry of parts.sort((a, b) => a.start - b.start)) {
    check(entry.start >= previousEnd)
    previousEnd = entry.nextLocal
    if (entry.method === 0) continue
    let written = 0
    const inflate = new Inflate((chunk) => { written += chunk.length; check(written <= entry.size) })
    check(entry.dataStart < entry.dataEnd)
    for (let offset = entry.dataStart; offset < entry.dataEnd; offset += 4096) {
      const next = Math.min(offset + 4096, entry.dataEnd)
      inflate.push(bytes.subarray(offset, next), next === entry.dataEnd)
    }
    check(written === entry.size)
  }
}

self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    validateZip(data)
    const xlsx = read(data, { type: 'array', bookVBA: false, cellHTML: false, cellFormula: false, sheetRows: 5102, cellNF: false, cellDates: false })
    const find = (name: string) => xlsx.SheetNames.find((entry) => entry.trim().toLowerCase() === name)
    const workName = find('escenarios')
    if (!workName) throw new Error('No se encontró la hoja Escenarios.')
    const rows = (name: string, rowLimit: number) => {
      const sheet = xlsx.Sheets[name]
      if (!sheet['!ref']) return []
      const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref'])
      if (range.e.c > 255 || (name === workName && range.e.r >= rowLimit)) throw new Error('La hoja supera el límite de filas o columnas.')
      range.s.c = 0; range.s.r = 0; range.e.r = Math.min(rowLimit - 1, range.e.r)
      return utils.sheet_to_json<unknown[]>(sheet, { header: 1, range, raw: false, defval: '', blankrows: true })
    }
    const coverName = find('portada')
    const result = parseRows(rows(workName, 5101), coverName ? rows(coverName, 100) : undefined)
    self.postMessage({ ok: true, result })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error && !(error instanceof RangeError) ? error.message : 'No se pudo leer el archivo Excel.' })
  }
}
