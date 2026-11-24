import { zipSync } from 'fflate'
import { inspectImage } from '../evidence/imageFormat'
import type { Evidence, ExecutionStatus, Project, ProjectBundle, Scenario, Step } from '../model'
import { BACKUP_EVIDENCE_LIMIT, BACKUP_FILE_LIMIT, BACKUP_LIMIT, readBackupZip } from './backupZip'
import { download } from './download'

const FORMAT = 'taf-project'
const VERSION = 1
const JSON_LIMIT = BACKUP_FILE_LIMIT
const MANIFEST_LIMIT = 1024 * 1024
const MAX_SCENARIOS = 5_000
const MIME_SUFFIX = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

type EvidenceRecord = Omit<Evidence, 'image' | 'thumbnail'> & { imagePath: string; thumbnailPath: string }
type BackupMetadata = { project: Project; scenarios: Scenario[]; evidence: EvidenceRecord[] }

function invalid(): never {
  throw new Error('El respaldo contiene datos incompletos o incompatibles.')
}

function zipTooLarge(): never {
  throw new Error('El proyecto excede el tamaño máximo de respaldo (192 MiB).')
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}

function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) return invalid()
  return value
}

function string(value: unknown, max = JSON_LIMIT): string {
  if (typeof value !== 'string' || value.length > max) return invalid()
  return value
}

function identifier(value: unknown): string {
  const id = string(value, 100)
  if (!id.trim()) return invalid()
  return id
}

function integer(value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return invalid()
  return value
}

function fields<Key extends string>(source: Record<string, unknown>, keys: readonly Key[]): Record<Key, string> {
  return Object.fromEntries(keys.map(key => [key, string(source[key])])) as Record<Key, string>
}

function status(value: unknown): ExecutionStatus {
  switch (value) {
    case 'No ejecutado':
    case 'En progreso':
    case 'Passed':
    case 'Failed':
    case 'Bloqueado':
    case 'No aplica':
      return value
    default:
      return invalid()
  }
}

function parseProject(value: unknown): Project {
  const row = record(value)
  const { source } = row
  if (source !== 'manual' && source !== 'demo' && source !== 'xlsx') return invalid()
  return {
    id: identifier(row.id),
    source,
    ...fields(row, ['title', 'country', 'qaOwner', 'poOwner', 'reportDate', 'authorization', 'createdAt', 'updatedAt']),
  }
}

function parseStep(value: unknown): Step {
  const row = record(value)
  return {
    id: identifier(row.id),
    ...fields(row, ['action', 'expectedResult', 'actualResult']),
    status: status(row.status),
  }
}

function parseScenario(value: unknown): Scenario {
  const row = record(value)
  if (typeof row.evidenceRequired !== 'boolean') return invalid()
  const metadata = Object.entries(record(row.metadata))
  if (metadata.length > 100) return invalid()
  return {
    id: identifier(row.id),
    projectId: identifier(row.projectId),
    order: integer(row.order, 0),
    ...fields(row, ['sourceId', 'title', 'component', 'priority', 'objective', 'detailedSteps', 'expectedResult', 'actualResult', 'comments', 'defectRef']),
    evidenceRequired: row.evidenceRequired,
    executionStatus: status(row.executionStatus),
    metadata: Object.fromEntries(metadata.map(([key, entry]) => [string(key, 256), string(entry)])),
    steps: array(row.steps, 5_000).map(parseStep),
  }
}

function parseEvidence(value: unknown): EvidenceRecord {
  const row = record(value)
  return {
    id: identifier(row.id),
    projectId: identifier(row.projectId),
    scenarioId: identifier(row.scenarioId),
    stepId: row.stepId === undefined ? undefined : identifier(row.stepId),
    order: integer(row.order, 0),
    caption: string(row.caption),
    width: integer(row.width, 1),
    height: integer(row.height, 1),
    imagePath: string(row.imagePath, 40),
    thumbnailPath: string(row.thumbnailPath, 40),
  }
}

function parseMetadata(value: unknown): BackupMetadata {
  const metadata = record(value)
  const project = parseProject(metadata.project)
  const scenarios = array(metadata.scenarios, MAX_SCENARIOS).map(parseScenario)
  const stepsByScenario = new Map<string, Set<string>>()
  const stepIds = new Set<string>()
  for (const scenario of scenarios) {
    if (scenario.projectId !== project.id || stepsByScenario.has(scenario.id)) return invalid()
    const steps = new Set<string>()
    for (const step of scenario.steps) {
      if (stepIds.has(step.id)) return invalid()
      stepIds.add(step.id)
      steps.add(step.id)
    }
    stepsByScenario.set(scenario.id, steps)
  }

  const evidence = array(metadata.evidence, BACKUP_EVIDENCE_LIMIT).map(parseEvidence)
  const evidenceIds = new Set<string>()
  for (const item of evidence) {
    const steps = stepsByScenario.get(item.scenarioId)
    if (evidenceIds.has(item.id) || item.projectId !== project.id || !steps || (item.stepId && !steps.has(item.stepId))) return invalid()
    evidenceIds.add(item.id)
  }
  return { project, scenarios, evidence }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function blobBytes(files: Map<string, Uint8Array>, path: string): Uint8Array {
  const bytes = files.get(path)
  if (!bytes) return invalid()
  return bytes
}

function json(bytes: Uint8Array, limit: number): unknown {
  if (bytes.length > limit) return invalid()
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    return invalid()
  }
}

function imageMime(bytes: Uint8Array, geometry?: { width: number; height: number }) {
  const { mime, width, height } = inspectImage(bytes)
  if (geometry && (width !== geometry.width || height !== geometry.height)) return invalid()
  return mime
}

function packImage(bytes: Uint8Array, path: string, prefix: string, geometry?: { width: number; height: number }): Blob {
  const mime = imageMime(bytes, geometry)
  if (path !== `${prefix}.${MIME_SUFFIX[mime]}`) return invalid()
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime })
}

export async function makeBackup(bundle: ProjectBundle): Promise<Blob> {
  if (bundle.scenarios.length > MAX_SCENARIOS || bundle.evidence.length > BACKUP_EVIDENCE_LIMIT) {
    throw new Error('El proyecto supera el número de escenarios o capturas permitido en un respaldo.')
  }
  const files: Record<string, Uint8Array> = {}
  let archiveSize = 22
  const add = (path: string, bytes: Uint8Array, limit: number) => {
    archiveSize += 76 + 2 * path.length + bytes.byteLength
    if (bytes.byteLength > limit || archiveSize > BACKUP_LIMIT) zipTooLarge()
    files[path] = bytes
  }
  const evidence: EvidenceRecord[] = []
  for (const [index, item] of bundle.evidence.entries()) {
    const { image, thumbnail, ...metadata } = item
    if (image.size > BACKUP_FILE_LIMIT || thumbnail.size > BACKUP_FILE_LIMIT) zipTooLarge()
    const imageBytes = new Uint8Array(await image.arrayBuffer())
    const thumbnailBytes = new Uint8Array(await thumbnail.arrayBuffer())
    const imagePath = `evidence/${index + 1}-image.${MIME_SUFFIX[imageMime(imageBytes, metadata)]}`
    const thumbnailPath = `evidence/${index + 1}-thumbnail.${MIME_SUFFIX[imageMime(thumbnailBytes)]}`
    add(imagePath, imageBytes, BACKUP_FILE_LIMIT)
    add(thumbnailPath, thumbnailBytes, BACKUP_FILE_LIMIT)
    evidence.push({ ...metadata, imagePath, thumbnailPath })
  }
  const metadata = parseMetadata({ project: bundle.project, scenarios: bundle.scenarios, evidence })
  add('metadata.json', encoder.encode(JSON.stringify(metadata)), JSON_LIMIT)
  const hashes: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(files)) hashes[path] = await sha256(bytes)
  add('manifest.json', encoder.encode(JSON.stringify({ format: FORMAT, version: VERSION, files: hashes })), MANIFEST_LIMIT)
  const archived = zipSync(files, { level: 0, mtime: new Date(2000, 0, 1) })
  if (archived.byteLength > BACKUP_LIMIT) zipTooLarge()
  return new Blob([archived as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export async function downloadBackup(bundle: ProjectBundle): Promise<void> {
  download(await makeBackup(bundle), bundle.project.title, 'tafproject')
}

export async function readBackup(file: File): Promise<ProjectBundle> {
  if (!file.name.toLowerCase().endsWith('.tafproject')) throw new Error('Selecciona un archivo .tafproject.')
  if (file.size > BACKUP_LIMIT) zipTooLarge()
  const files = readBackupZip(new Uint8Array(await file.arrayBuffer()))
  const manifest = record(json(blobBytes(files, 'manifest.json'), MANIFEST_LIMIT))
  if (manifest.format !== FORMAT || manifest.version !== VERSION) {
    throw new Error('El formato o la versión de este respaldo no es compatible con TAF.')
  }
  const checksums = record(manifest.files)
  if (Object.keys(checksums).length !== files.size - 1 || Object.hasOwn(checksums, 'manifest.json')) return invalid()
  for (const [path, bytes] of files) {
    if (path === 'manifest.json') continue
    const checksum = checksums[path]
    if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum) || await sha256(bytes) !== checksum) {
      throw new Error('El respaldo está dañado. La comprobación de integridad no coincide.')
    }
  }

  const { project, scenarios, evidence: evidenceInfo } = parseMetadata(json(blobBytes(files, 'metadata.json'), JSON_LIMIT))
  if (files.size !== 2 + 2 * evidenceInfo.length) return invalid()
  const evidence: Evidence[] = evidenceInfo.map(({ imagePath, thumbnailPath, ...item }, index) => {
    const image = packImage(blobBytes(files, imagePath), imagePath, `evidence/${index + 1}-image`, item)
    const thumbnail = packImage(blobBytes(files, thumbnailPath), thumbnailPath, `evidence/${index + 1}-thumbnail`)
    return { ...item, image, thumbnail }
  })
  return { project, scenarios, evidence }
}
