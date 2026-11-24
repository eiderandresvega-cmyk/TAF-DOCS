import { emptyDetails, emptyScenario, statuses, type ExecutionStatus, type ProjectDetails, type ScenarioDraft } from '../model'
import type { ImportResult } from './index'
export const columns = ['ID', 'HU Azure', 'Escenario', 'Componente', 'Tipo de prueba', 'Objetivo', 'Precondiciones',
  'Datos de entrada', 'Datos de prueba / preparación', 'Gherkin', 'Pasos detallados numerados', 'Resultado esperado',
  'Requisito cubierto', 'Criterio cubierto', 'Prioridad', 'Estimación (min)', 'Evidencia requerida', 'Día plan',
  'Fecha plan', 'Estado ejecución', 'Resultado obtenido', 'Enlace evidencia', 'Defecto Azure', 'Ejecutado por',
  'Fecha real', 'Comentarios / bloqueo', 'Origen / aprobación'] as const
type Column = (typeof columns)[number]
const key = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value).trim() : ''

const standardColumns: readonly Column[] = ['ID', 'Tipo de prueba', 'Prioridad', 'Componente', 'Precondiciones',
  'Datos de entrada', 'Objetivo', 'Pasos detallados numerados', 'Gherkin', 'Resultado esperado', 'Requisito cubierto',
  'Estimación (min)', 'Evidencia requerida', 'Estado ejecución', 'Comentarios / bloqueo']
const standardLabels = new Map<Column, string>([
  ['Pasos detallados numerados', 'Pasos numerados'],
  ['Estado ejecución', 'Estatus'],
  ['Comentarios / bloqueo', 'Evidencia / observaciones'],
])
const standardHeaders = new Map([...standardLabels].map(([column, label]) => [key(label), column]))
const columnsByHeader = new Map([...columns.map((column) => [key(column), column] as const), ...standardHeaders])
const scenarioFields = new Set<Column>(['ID', 'Escenario', 'Componente', 'Prioridad', 'Objetivo', 'Pasos detallados numerados',
  'Resultado esperado', 'Evidencia requerida', 'Estado ejecución', 'Resultado obtenido', 'Comentarios / bloqueo', 'Defecto Azure'])
const statusByLabel = new Map<string, ExecutionStatus>([
  ...statuses.map((status) => [key(status), status] as const), ['pass', 'Passed'], ['fail', 'Failed'], ['aprobado', 'Passed'],
  ['fallido', 'Failed'], ['pendiente', 'No ejecutado'], ['no iniciado', 'No ejecutado'], ['blocked', 'Bloqueado'], ['na', 'No aplica'],
])
const noEvidence = new Set(['no', 'false', '0', 'n a', 'no aplica'])
const yesEvidence = new Set(['si', 'true', '1'])

const coverFields: Array<[keyof ProjectDetails | 'workItem', (label: string) => boolean]> = [
  ['title', (label) => ['nombre del proyecto', 'proyecto', 'nombre de proyecto'].includes(label)],
  ['country', (label) => label === 'pais' || label.startsWith('pais impactado')],
  ['qaOwner', (label) => ['qa specialist', 'qa', 'qa responsable', 'qa asignado'].includes(label)],
  ['poOwner', (label) => label === 'po' || label.startsWith('po creador') || label === 'responsable de producto' || label === 'product owner'],
  ['reportDate', (label) => label.startsWith('fecha de elaboracion') || label === 'fecha del informe'],
  ['authorization', (label) => label.startsWith('autorizacion')],
  ['workItem', (label) => label === 'work item principal'],
]

const months = new Map(Object.entries({ ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04',
  may: '05', jun: '06', jul: '07', ago: '08', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dic: '12', dec: '12' }))

function coverDate(input: string) {
  const dayFirst = /^(\d{1,2})[/. -]+(\d{1,2}|[a-z]{3,4})[/. -]+(\d{4})$/u.exec(input.toLowerCase())
  const iso = dayFirst
    ? `${dayFirst[3]}-${months.get(dayFirst[2]) ?? dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`
    : input
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return ''
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : ''
}

function readCover(cover: unknown[][] = []) {
  const details = emptyDetails()
  let workItem = ''
  for (const row of cover) {
    const filled = row.map(text).filter(Boolean)
    for (const [index, cell] of filled.entries()) {
      const field = coverFields.find(([, matches]) => matches(key(cell)))?.[0]
      const value = filled[index + 1]
      if (!field || !value) continue
      if (field === 'reportDate') { const formatted = coverDate(value); if (formatted) details.reportDate = formatted }
      else if (field === 'workItem') { if (!workItem) workItem = value }
      else if (!details[field]) details[field] = value.slice(0, 180)
    }
  }
  return { details, workItem }
}

export function parseRows(rows: unknown[][], cover: unknown[][] | undefined): ImportResult {
  const warnings: string[] = []
  let headerRow = -1
  let score = 0
  for (const [index, row] of rows.slice(0, 100).entries()) {
    const keys = new Set(row.map((value) => key(text(value))))
    const matches = new Set([...keys].map((name) => columnsByHeader.get(name)).filter(Boolean)).size
    if (matches > score) { headerRow = index; score = matches }
    if (matches === columns.length) break
  }
  if (headerRow < 0 || score < 2) throw new Error('No se encontraron los encabezados de la hoja Escenarios.')
  const rowKeys = rows[headerRow].map((value) => key(text(value)))
  const matched = rowKeys.map((name) => columnsByHeader.get(name))
  // Two distinctive headers identify the standard template even if one of its columns is missing.
  const standard = score < columns.length && new Set(rowKeys.filter((name) => standardHeaders.has(name))).size >= 2
  const missing = (standard ? standardColumns : columns).filter((column) => !matched.includes(column))
  const duplicated = columns.filter((column) => matched.filter((entry) => entry === column).length > 1)
  if (missing.length) {
    const labels = missing.map((column) => standard ? standardLabels.get(column) ?? column : column)
    throw new Error(`Faltan columnas requeridas: ${labels.join(', ')}.`)
  }
  if (duplicated.length) throw new Error(`Hay columnas repetidas: ${duplicated.join(', ')}.`)
  const mapped = new Map(columns.map((column) => [column, matched.indexOf(column)]))
  const { details, workItem } = readCover(cover)
  const scenarios: ScenarioDraft[] = []
  const used = new Set<string>()
  for (const [offset, row] of rows.slice(headerRow + 1).entries()) {
    const values = new Map([...mapped].map(([column, index]) => [column, text(row[index])]))
    if (![...values.values()].some(Boolean)) continue
    const get = (column: Column) => values.get(column) ?? ''
    const number = headerRow + offset + 2
    const sourceId = get('ID')
    const objective = get('Objetivo')
    const title = get('Escenario') || (standard ? objective.split(/\r\n?|\n/u, 1)[0].trim() : '')
    if (!sourceId || !title) {
      warnings.push(`Fila ${number}: se omitió porque falta ${standard ? 'ID o un objetivo para nombrar el escenario' : 'ID o Escenario'}.`)
      continue
    }
    if (used.has(sourceId.toLocaleLowerCase())) { warnings.push(`Fila ${number}: se omitió un ID duplicado.`); continue }
    if (scenarios.length >= 5000) throw new Error('El Excel supera el límite de 5.000 escenarios.')
    used.add(sourceId.toLocaleLowerCase())
    const expectedResult = get('Resultado esperado')
    if (!expectedResult) warnings.push(`Fila ${number}: falta el resultado esperado.`)
    const executionStatus = statusByLabel.get(key(get('Estado ejecución'))) ?? 'No ejecutado'
    const evidenceLabel = get('Evidencia requerida')
    const evidenceKey = key(evidenceLabel)
    const evidenceRequired = !noEvidence.has(evidenceKey)
    const metadata = Object.fromEntries([...values].filter(([column, value]) => !scenarioFields.has(column) && value))
    if (standard && workItem && !metadata['HU Azure']) metadata['Work item principal'] = workItem
    if (standard && evidenceLabel && evidenceRequired && !yesEvidence.has(evidenceKey)) metadata['Evidencia requerida'] = evidenceLabel
    scenarios.push({ ...emptyScenario(), sourceId, title, expectedResult, component: get('Componente'), priority: get('Prioridad'),
      objective, detailedSteps: get('Pasos detallados numerados'), executionStatus, actualResult: get('Resultado obtenido'),
      comments: get('Comentarios / bloqueo'), defectRef: get('Defecto Azure'), evidenceRequired, metadata,
    })
  }
  if (!scenarios.length) throw new Error('La hoja Escenarios no contiene filas con un ID y un escenario válidos.')
  if (!cover) warnings.push('No se encontró la hoja Portada. Completa los datos del proyecto.')
  if ([details.title, details.qaOwner, details.poOwner].some((value) => !value)) warnings.push('Completa los datos obligatorios de la portada antes de continuar.')
  return { details, scenarios, warnings, headerRow: headerRow + 1, columnCount: score }
}
