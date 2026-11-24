import { emptyDetails, emptyScenario, statuses, type ExecutionStatus, type ProjectDetails, type ScenarioDraft } from '../model'
import type { ImportResult } from './index'
export const columns = ['ID', 'HU Azure', 'Escenario', 'Componente', 'Tipo de prueba', 'Objetivo', 'Precondiciones',
  'Datos de entrada', 'Datos de prueba / preparación', 'Gherkin', 'Pasos detallados numerados', 'Resultado esperado',
  'Requisito cubierto', 'Criterio cubierto', 'Prioridad', 'Estimación (min)', 'Evidencia requerida', 'Día plan',
  'Fecha plan', 'Estado ejecución', 'Resultado obtenido', 'Enlace evidencia', 'Defecto Azure', 'Ejecutado por',
  'Fecha real', 'Comentarios / bloqueo', 'Origen / aprobación'] as const
const key = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value).trim() : ''
const names = columns.map(key)
const indexOf = (label: typeof columns[number]) => columns.indexOf(label)
const coverFields: Array<[keyof ProjectDetails, (label: string) => boolean]> = [
  ['title', (label) => ['nombre del proyecto', 'proyecto', 'nombre de proyecto'].includes(label)],
  ['country', (label) => label === 'pais' || label.startsWith('pais impactado')],
  ['qaOwner', (label) => ['qa specialist', 'qa', 'qa responsable', 'qa asignado'].includes(label)],
  ['poOwner', (label) => label === 'po' || label.startsWith('po creador') || label === 'responsable de producto' || label === 'product owner'],
  ['reportDate', (label) => label.startsWith('fecha de elaboracion') || label === 'fecha del informe'],
  ['authorization', (label) => label.startsWith('autorizacion')],
]
const dates = (input: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(input)) return input
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u.exec(input)
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : ''
}

export function parseRows(rows: unknown[][], cover: unknown[][] | undefined): ImportResult {
  const warnings: string[] = []
  let headerRow = -1
  let score = 0
  for (const [index, row] of rows.slice(0, 100).entries()) {
    const keys = new Set(row.map((value) => key(text(value))))
    const matches = names.filter((name) => keys.has(name)).length
    if (matches > score) { headerRow = index; score = matches }
    if (matches === names.length) break
  }
  if (headerRow < 0 || score < 2) throw new Error('No se encontraron los encabezados de la hoja Escenarios.')
  const rowKeys = rows[headerRow].map((value) => key(text(value)))
  const missing = columns.filter((_, index) => !rowKeys.includes(names[index]))
  const duplicated = columns.filter((_, index) => rowKeys.filter((name) => name === names[index]).length > 1)
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(', ')}.`)
  if (duplicated.length) throw new Error(`Hay columnas repetidas: ${duplicated.join(', ')}.`)
  const mapped = names.map((name) => rowKeys.indexOf(name))
  const scenarios: ScenarioDraft[] = []
  const used = new Set<string>()
  const aliases = new Map<string, ExecutionStatus>([['pass', 'Passed'], ['fail', 'Failed'], ['aprobado', 'Passed'],
    ['fallido', 'Failed'], ['pendiente', 'No ejecutado'], ['blocked', 'Bloqueado'], ['na', 'No aplica']])
  for (const [offset, row] of rows.slice(headerRow + 1).entries()) {
    const values = mapped.map((column) => text(row[column]))
    if (values.every((value) => !value)) continue
    const get = (label: typeof columns[number]) => values[indexOf(label)]
    const number = headerRow + offset + 2
    const sourceId = get('ID')
    const title = get('Escenario')
    if (!sourceId || !title) { warnings.push(`Fila ${number}: se omitió porque falta ID o Escenario.`); continue }
    if (used.has(sourceId.toLocaleLowerCase())) { warnings.push(`Fila ${number}: se omitió un ID duplicado.`); continue }
    if (scenarios.length >= 5000) throw new Error('El Excel supera el límite de 5.000 escenarios.')
    used.add(sourceId.toLocaleLowerCase())
    const expectedResult = get('Resultado esperado')
    if (!expectedResult) warnings.push(`Fila ${number}: falta el resultado esperado.`)
    const resultKey = key(get('Estado ejecución'))
    const executionStatus = statuses.find((status) => key(status) === resultKey) ?? aliases.get(resultKey) ?? 'No ejecutado'
    const primary = new Set(['ID', 'Escenario', 'Componente', 'Prioridad', 'Objetivo', 'Pasos detallados numerados', 'Resultado esperado',
      'Evidencia requerida', 'Estado ejecución', 'Resultado obtenido', 'Comentarios / bloqueo', 'Defecto Azure'])
    scenarios.push({ ...emptyScenario(), sourceId, title, expectedResult, component: get('Componente'), priority: get('Prioridad'),
      objective: get('Objetivo'), detailedSteps: get('Pasos detallados numerados'), executionStatus, actualResult: get('Resultado obtenido'),
      comments: get('Comentarios / bloqueo'), defectRef: get('Defecto Azure'),
      evidenceRequired: !['no', 'false', '0', 'n a', 'no aplica'].includes(key(get('Evidencia requerida'))),
      metadata: Object.fromEntries(columns.flatMap((name, index) => !primary.has(name) && values[index] ? [[name, values[index]]] : [])),
    })
  }
  if (!scenarios.length) throw new Error('La hoja Escenarios no contiene filas con un ID y un escenario válidos.')
  const details = emptyDetails()
  if (!cover) warnings.push('No se encontró la hoja Portada. Completa los datos del proyecto.')
  for (const row of cover ?? []) {
    const filled = row.map(text).filter(Boolean)
    for (let index = 0; index + 1 < filled.length; index++) {
      const match = coverFields.find(([, matches]) => matches(key(filled[index])))
      if (!match) continue
      const field = match[0]
      const value = filled[index + 1]
      if (field === 'reportDate') { const formatted = dates(value); if (formatted) details.reportDate = formatted }
      else if (!details[field]) details[field] = value.slice(0, 180)
    }
  }
  if ([details.title, details.qaOwner, details.poOwner].some((value) => !value)) warnings.push('Completa los datos obligatorios de la portada antes de continuar.')
  return { details, scenarios, warnings, headerRow: headerRow + 1 }
}
