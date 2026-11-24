import type { ProjectDetails, ScenarioDraft } from '../model'

export type ImportResult = { details: ProjectDetails; scenarios: ScenarioDraft[]; warnings: string[]; headerRow: number }
const limit = 16 * 1024 * 1024

export async function parseExcel(file: File, signal?: AbortSignal): Promise<ImportResult> {
  if (!/\.xlsx$/iu.test(file.name)) throw new Error('Selecciona un archivo con extensión .xlsx.')
  if (!file.size || file.size > limit) throw new Error('El archivo Excel debe tener entre 1 byte y 16 MiB.')
  signal?.throwIfAborted()
  const bytes = await file.arrayBuffer()
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workbook.worker.ts', import.meta.url), { type: 'module' })
    const timer = setTimeout(() => fail(new Error('El análisis del Excel superó el tiempo permitido.')), 30_000)
    function clean() { worker.terminate(); clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
    function fail(error: unknown) { clean(); reject(error) }
    function cancel() { fail(signal?.reason ?? new DOMException('Análisis cancelado.', 'AbortError')) }
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onerror = () => fail(new Error('No se pudo iniciar el análisis del Excel.'))
    worker.onmessage = ({ data }) => {
      if (!data.ok) { fail(new Error(data.error)); return }
      clean(); resolve(data.result)
    }
    worker.postMessage(bytes, [bytes])
  })
}

export async function downloadTemplate() {
  const { writeFile, utils } = await import('xlsx')
  const { columns } = await import('./schema')
  const workbook = utils.book_new()
  const portada = utils.aoa_to_sheet([['Plantilla TAF Docs'], [], ['Nombre del proyecto', 'Flujo de pagos de demostración'],
    ['País impactado', 'Colombia'], ['QA Specialist', 'QA Demo'], ['Responsable de producto', 'Producto Demo']])
  const row = (items: Record<string, string>) => columns.map((column) => items[column] ?? '')
  const escenarios = utils.aoa_to_sheet([['Plantilla de escenarios TAF'], [], [], [], [...columns],
    row({ ID: 'UAT-001', Escenario: 'Registrar un pago de prueba', Componente: 'Pagos', Prioridad: 'Alta', 'Resultado esperado': 'La operación queda registrada.', 'Evidencia requerida': 'Sí' }),
    row({ ID: 'UAT-002', Escenario: 'Consultar el estado del pago', Componente: 'Historial', Prioridad: 'Media', 'Resultado esperado': 'La operación aparece en el historial.' }),
  ])
  portada['!cols'] = [{ wch: 27 }, { wch: 44 }]
  escenarios['!cols'] = columns.map((name) => ({ wch: Math.max(14, name.length + 2) }))
  utils.book_append_sheet(workbook, portada, 'Portada')
  utils.book_append_sheet(workbook, escenarios, 'Escenarios')
  writeFile(workbook, 'TAF-Plantilla-test-scripts.xlsx', { compression: true })
}
