import { describe, expect, it } from 'vitest'
import { columns, parseRows } from './schema'

type Column = (typeof columns)[number]

const cover = [
  ['', 'Nombre del proyecto', '', ' Validación de demostración '],
  ['País impactado', 'Colombia', '', 'QA Specialist', 'QA de ejemplo'],
  ['', 'PO — creador del work item principal', '', 'Producto de ejemplo'],
  ['Fecha de elaboración', '', '7/10/2026'],
  ['', 'Autorización de pruebas', 'Aprobación sintética'],
]

const row = (values: Partial<Record<Column, string | number | boolean>>, order: readonly Column[] = columns) =>
  order.map((column) => values[column] ?? '')

describe('esquema de importación de Excel', () => {
  it('encuentra las 27 columnas fuera de la primera fila y admite otro orden', () => {
    const order = [...columns].reverse()
    const header = order.map((column) => `  ${column.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()}  `)
    const scenario = row({
      ID: 7, Escenario: ' Registrar acceso ', Componente: 'Sesiones', Objetivo: 'Validar identidad',
      'Estado ejecución': 'aprobado', 'Resultado esperado': 'Acceso permitido', 'Resultado obtenido': 'Acceso permitido',
      'Evidencia requerida': false, 'Fecha plan': '2026-10-07', 'Pasos detallados numerados': '1. Iniciar sesión',
    }, order)
    const result = parseRows([['Plantilla'], ['ID', 'Escenario'], [], [], header, scenario], cover)

    expect(columns).toHaveLength(27)
    expect(result.headerRow).toBe(5)
    expect(result.warnings).toEqual([])
    expect(result.scenarios).toHaveLength(1)
    expect(result.scenarios[0]).toMatchObject({
      sourceId: '7', title: 'Registrar acceso', component: 'Sesiones', objective: 'Validar identidad',
      detailedSteps: '1. Iniciar sesión', executionStatus: 'Passed', expectedResult: 'Acceso permitido',
      actualResult: 'Acceso permitido', evidenceRequired: false, metadata: { 'Fecha plan': '2026-10-07' },
    })
  })

  it('diagnostica una columna requerida ausente', () => {
    const header = columns.filter((column) => column !== 'Resultado esperado')
    expect(() => parseRows([header], cover)).toThrow(/Faltan columnas requeridas: Resultado esperado/)
  })

  it('diagnostica duplicados normalizados aun con las 27 columnas presentes', () => {
    expect(() => parseRows([[...columns, '  ESTADO   EJECUCION  ']], cover)).toThrow(/Hay columnas repetidas: Estado ejecución/)
  })

  it('omite filas sin ID o nombre y advierte si falta un resultado esperado', () => {
    const result = parseRows([
      [...columns],
      row({ Escenario: 'Sin ID' }),
      [],
      row({ ID: 'UAT-007', Escenario: ' Caso sin resultado esperado ' }),
      row({ ID: 'uat-007', Escenario: 'Identificador repetido' }),
      row({ ID: 'UAT-008' }),
    ], cover)

    expect(result.scenarios).toMatchObject([{ sourceId: 'UAT-007', title: 'Caso sin resultado esperado', expectedResult: '' }])
    expect(result.warnings).toEqual([
      'Fila 2: se omitió porque falta ID o Escenario.',
      'Fila 4: falta el resultado esperado.',
      'Fila 5: se omitió un ID duplicado.',
      'Fila 6: se omitió porque falta ID o Escenario.',
    ])
  })

  it('lee valores de portada aunque haya celdas vacías y varias etiquetas en una fila', () => {
    const result = parseRows([[...columns], row({ ID: 'UAT-001', Escenario: 'Consultar', 'Resultado esperado': 'Visible' })], cover)
    expect(result.details).toEqual({
      title: 'Validación de demostración', country: 'Colombia', qaOwner: 'QA de ejemplo',
      poOwner: 'Producto de ejemplo', reportDate: '2026-10-07', authorization: 'Aprobación sintética',
    })
  })

  it('permite completar los datos cuando no hay hoja Portada', () => {
    const result = parseRows([[...columns], row({ ID: 'UAT-001', Escenario: 'Consultar', 'Resultado esperado': 'Visible' })], undefined)
    expect(result.details).toMatchObject({ title: '', qaOwner: '', poOwner: '' })
    expect(result.warnings).toEqual([
      'No se encontró la hoja Portada. Completa los datos del proyecto.',
      'Completa los datos obligatorios de la portada antes de continuar.',
    ])
  })
})
