import { Inflate } from 'fflate'

const MIB = 1024 * 1024
export const BACKUP_LIMIT = 192 * MIB
export const BACKUP_EVIDENCE_LIMIT = 4_000
const BACKUP_ENTRY_LIMIT = 2 + 2 * BACKUP_EVIDENCE_LIMIT
export const BACKUP_FILE_LIMIT = 25 * MIB

const allowedName = /^(manifest\.json|metadata\.json|evidence\/[1-9]\d{0,3}-(image|thumbnail)\.(jpg|png|webp))$/

function check(condition: boolean): asserts condition {
  if (!condition) throw new Error('El respaldo ZIP está dañado o supera los límites de TAF.')
}

interface Entry {
  name: string
  start: number
  dataStart: number
  dataEnd: number
  size: number
  compression: number
}

function readDirectory(bytes: Uint8Array): Entry[] {
  check(bytes.length >= 22 && bytes.length <= BACKUP_LIMIT)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)

  let eocd = bytes.length - 22
  const minEnd = Math.max(0, eocd - 65_535)
  while (eocd >= minEnd && (u32(eocd) !== 0x06054b50 || eocd + 22 + u16(eocd + 20) !== bytes.length)) {
    eocd--
  }
  check(eocd >= minEnd)
  const count = u16(eocd + 10)
  const directory = u32(eocd + 16)
  check(u16(eocd + 4) === 0 && u16(eocd + 6) === 0 && u16(eocd + 8) === count)
  check(count >= 2 && count <= BACKUP_ENTRY_LIMIT && directory > 0 && directory + u32(eocd + 12) === eocd)

  const entries: Entry[] = []
  const names = new Set<string>()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let cursor = directory
  let totalSize = 0

  for (let index = 0; index < count; index++) {
    check(cursor + 46 <= eocd && u32(cursor) === 0x02014b50)
    const flags = u16(cursor + 8)
    const compression = u16(cursor + 10)
    const crc = u32(cursor + 16)
    const compressedSize = u32(cursor + 20)
    const size = u32(cursor + 24)
    const nameLength = u16(cursor + 28)
    const extraLength = u16(cursor + 30)
    const commentLength = u16(cursor + 32)
    const start = u32(cursor + 42)
    const nameStart = cursor + 46
    cursor = nameStart + nameLength + extraLength + commentLength
    totalSize += size

    check((flags & ~0x0806) === 0 && (compression === 0 || compression === 8))
    check(size > 0 && size <= BACKUP_FILE_LIMIT && totalSize <= BACKUP_LIMIT)
    check(compressedSize > 0 && (compression !== 0 || compressedSize === size))
    check(cursor <= eocd && nameLength > 0 && nameLength <= 40 && start + 30 <= directory)
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    check(allowedName.test(name) && !names.has(name))
    names.add(name)

    check(u32(start) === 0x04034b50 && u16(start + 6) === flags && u16(start + 8) === compression)
    check(u32(start + 14) === crc && u32(start + 18) === compressedSize && u32(start + 22) === size)
    check(u16(start + 26) === nameLength && start + 30 + nameLength <= directory)
    const localName = decoder.decode(bytes.subarray(start + 30, start + 30 + nameLength))
    const dataStart = start + 30 + nameLength + u16(start + 28)
    const dataEnd = dataStart + compressedSize
    check(localName === name && dataEnd <= directory)
    entries.push({ name, start, dataStart, dataEnd, size, compression })
  }

  check(cursor === eocd)
  let end = 0
  for (const entry of entries.sort((left, right) => left.start - right.start)) {
    check(entry.start === end)
    end = entry.dataEnd
  }
  check(end === directory)
  return entries
}

function inflateEntry(data: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size)
  let offset = 0
  const decoder = new Inflate((chunk) => {
    check(offset + chunk.length <= size)
    out.set(chunk, offset)
    offset += chunk.length
  })
  // Bound the amount that can expand in one decoder push even with a forged directory.
  const chunkSize = 8 * 1024
  for (let start = 0; start < data.length; start += chunkSize) {
    const end = start + chunkSize
    decoder.push(data.subarray(start, end), end >= data.length)
  }
  check(offset === size)
  return out
}

export function readBackupZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const entry of readDirectory(bytes)) {
    const data = bytes.subarray(entry.dataStart, entry.dataEnd)
    files.set(entry.name, entry.compression === 0 ? data : inflateEntry(data, entry.size))
  }
  return files
}
