import { jsPDF } from 'jspdf'
import { isDocumented, progressFor, sharedDocumentationFor, withExecutionDefaults } from '../model'
import type { Evidence, ExecutionStatus, ProjectBundle, Scenario, SharedDocumentation, Step } from '../model'
import { numberedStepActions } from '../numbered-steps'
import { download } from './download'

type Color = [number, number, number]
type Orientation = 'portrait' | 'landscape'

const navy: Color = [15, 25, 43]
const ink: Color = [29, 43, 59]
const muted: Color = [72, 93, 111]
const teal: Color = [0, 102, 113]
const cyan: Color = [91, 229, 234]
const line: Color = [211, 220, 229]
const light: Color = [240, 246, 249]
const white: Color = [255, 255, 255]
const warning: Color = [138, 81, 12]
const failed: Color = [161, 37, 56]
const statusColors: Record<ExecutionStatus, Color> = {
  'No ejecutado': muted,
  'En progreso': teal,
  Passed: teal,
  Failed: failed,
  Bloqueado: warning,
  'No aplica': muted,
}
const margin = 17
const lineHeight = 5
const mmPerPixel = 25.4 / 96
const pageFormat = 'letter'

function clean(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
}

function displayDate(value: string): string {
  const iso = /^(\d{4})-(\d\d)-(\d\d)(?:T|$)/.exec(value)
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value
}

export function fitImage(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(mmPerPixel, maxWidth / width, maxHeight / height)
  return { width: width * scale, height: height * scale }
}

class Report {
  readonly pdf = new jsPDF({ unit: 'mm', format: pageFormat, compress: true, putOnlyUsedFonts: true })
  orientation: Orientation = 'portrait'
  y = margin
  section = ''

  get width() { return this.pdf.internal.pageSize.getWidth() }
  get height() { return this.pdf.internal.pageSize.getHeight() }
  get contentWidth() { return this.width - margin * 2 }
  get bottom() { return this.height - 21 }

  text(text: string, x: number, y: number, size: number, color: Color = ink, bold = false): void {
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...color)
    this.pdf.text(clean(text), x, y)
  }

  wrap(text: string, width: number, size: number, bold = false): string[] {
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
    return this.pdf.splitTextToSize(clean(text), width)
  }

  rect(x: number, y: number, width: number, height: number, color: Color): void {
    this.pdf.setFillColor(...color).rect(x, y, width, height, 'F')
  }

  rule(x: number, y: number, width: number, color: Color = line): void {
    this.pdf.setDrawColor(...color).setLineWidth(0.25).line(x, y, x + width, y)
  }

  page(section = this.section, orientation = this.orientation): void {
    this.pdf.addPage(pageFormat, orientation)
    this.orientation = orientation
    this.section = section
    this.rect(0, 0, this.width, this.height, white)
    this.rect(0, 0, this.width, 14, navy)
    this.text('TAF', margin, 9.5, 12, cyan, true)
    const caption = this.wrap(section, this.contentWidth - 25, 9, true)[0] ?? ''
    this.text(caption, margin + 23, 9.5, 9, white, true)
    this.y = 26
  }

  room(height: number): void {
    if (this.y + height > this.bottom) this.page()
  }

  heading(title: string): void {
    this.room(17)
    this.text(title, margin, this.y, 16, navy, true)
    this.y += 9
  }

  field(label: string, value: string, usePlaceholder = false): void {
    if (!value.trim() && !usePlaceholder) return
    const lines = this.wrap(value.trim() ? value : 'Sin registrar', this.contentWidth, 10.5)
    this.room(14)
    this.text(label, margin, this.y, 9, teal, true)
    this.y += 5.6

    for (const text of lines) {
      if (this.y + 2 > this.bottom) {
        this.page()
        this.text(`${label} (continuación)`, margin, this.y, 9, teal, true)
        this.y += 5.6
      }
      this.text(text, margin, this.y, 10.5)
      this.y += lineHeight
    }
    this.y += 3
  }

  footer(): void {
    const count = this.pdf.getNumberOfPages()
    for (let page = 1; page <= count; page++) {
      this.pdf.setPage(page)
      this.rule(margin, this.height - 16, this.contentWidth)
      this.text('TAF  /  DOCUMENTACIÓN DE PRUEBAS', margin, this.height - 9.5, 8, muted, true)
      this.text(`${page} / ${count}`, this.width - margin - 20, this.height - 9.5, 8, muted, true)
    }
  }
}

function cover(report: Report, bundle: ProjectBundle): void {
  const { project, scenarios, evidence } = bundle
  const stats = progressFor(scenarios, evidence)
  const title = project.title || 'Proyecto de pruebas'
  report.section = 'Datos generales'
  report.rect(0, 0, report.width, report.height, white)
  report.rect(0, 0, report.width, 105, navy)
  report.rect(margin, 17, 2, 8, cyan)
  report.text('TAF', margin + 6, 23.5, 18, cyan, true)
  report.text('DOCUMENTACIÓN DE PRUEBAS QA', margin, 43, 11, cyan, true)
  const titleLines = report.wrap(title, report.contentWidth - 7, 29, true)
  const displayed = titleLines.length > 4 ? [...titleLines.slice(0, 3), '...'] : titleLines
  displayed.forEach((row, index) => report.text(row, margin, 58 + index * 11.5, 29, white, true))

  const gap = 5
  const cardWidth = (report.contentWidth - gap) / 2
  const metrics = [
    { name: 'Avance de ejecución', value: stats.execution, note: `${stats.executed} de ${stats.total} escenarios ejecutados` },
    { name: 'Avance de documentación', value: stats.documentation, note: `${stats.documented} de ${stats.total} escenarios documentados` },
  ]
  metrics.forEach(({ name, value, note }, index) => {
    const x = margin + index * (cardWidth + gap)
    report.rect(x, 112, cardWidth, 34, light)
    report.text(name, x + 5, 120, 9, muted, true)
    report.text(`${value}%`, x + 5, 132, 24, teal, true)
    report.text(note, x + 5, 141, 8, muted)
  })

  report.y = 160
  report.heading('Datos generales')
  if (titleLines.length > 4) report.field('Proyecto', title)
  report.field('QA asignado', project.qaOwner, true)
  report.field('PO / responsable', project.poOwner, true)
  report.field('País impactado', project.country, true)
  report.field('Fecha de elaboración', displayDate(project.reportDate || project.createdAt), true)
  report.room(25)
  report.heading('Autorización')
  report.field('Referencia de aprobación', project.authorization, true)
}

function scenarioIndex(report: Report, scenarios: Scenario[]): void {
  if (!scenarios.length) return
  const idX = margin + 3
  const titleX = margin + 36
  const statusX = report.width - margin - 34
  const titleWidth = statusX - titleX - 5
  const rowLine = 4.8

  function tablePage() {
    report.page('Índice de escenarios', 'portrait')
    report.heading('Escenarios de prueba')
    report.rect(margin, report.y - 3, report.contentWidth, 9, navy)
    report.text('ID', idX, report.y + 2.9, 9, white, true)
    report.text('Escenario', titleX, report.y + 2.9, 9, white, true)
    report.text('Estado', statusX, report.y + 2.9, 9, white, true)
    report.y += 6
  }

  tablePage()
  scenarios.forEach((scenario, index) => {
    const ids = report.wrap(scenario.sourceId || String(index + 1), 30, 9, true)
    const titles = report.wrap(scenario.title || 'Sin título', titleWidth, 9)
    const count = Math.max(ids.length, titles.length)
    let cursor = 0
    while (cursor < count) {
      if (report.y + rowLine + 5 > report.bottom) tablePage()
      const rows = Math.min(count - cursor, Math.floor((report.bottom - report.y - 5) / rowLine))
      const height = rows * rowLine + 5
      if (index % 2 === 0) report.rect(margin, report.y, report.contentWidth, height, light)
      for (let row = 0; row < rows; row++) {
        const y = report.y + 5 + row * rowLine
        const id = ids[cursor + row]
        const title = titles[cursor + row]
        if (id) report.text(id, idX, y, 9, ink, true)
        if (title) report.text(title, titleX, y, 9)
      }
      if (cursor === 0) report.text(scenario.executionStatus, statusX, report.y + 5, 9, statusColors[scenario.executionStatus], true)
      report.y += height
      cursor += rows
    }
  })
}

async function addEvidence(report: Report, evidence: Evidence, label: string): Promise<void> {
  const orientation = evidence.width >= 1600 && evidence.width / evidence.height >= 1.7 ? 'landscape' : 'portrait'
  if (report.orientation !== orientation) report.page(report.section, orientation)

  const captionReserve = evidence.caption.trim() ? 14 : 0
  const frame = fitImage(evidence.width, evidence.height, report.contentWidth, report.bottom - 40 - captionReserve)
  report.room(frame.height + 13 + captionReserve)
  report.text(label, margin, report.y, 9, teal, true)
  report.y += 5
  const imageTypes = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP' } as const
  const format = imageTypes[evidence.image.type as keyof typeof imageTypes]
  if (!format) throw new Error('Una captura tiene un formato incompatible con el PDF.')
  const bytes = new Uint8Array(await evidence.image.arrayBuffer())
  try {
    report.pdf.addImage(bytes, format, margin, report.y, frame.width, frame.height, `captura-${evidence.id}`, 'FAST')
  } catch {
    throw new Error('Una captura está dañada y no se pudo incluir en el PDF.')
  }
  report.y += frame.height + 8
  report.field('Descripción de la captura', evidence.caption)
}

function scenarioIdentifier(scenario: Scenario): string {
  return scenario.sourceId || `Escenario ${scenario.order + 1}`
}

function scenarioFields(report: Report, scenario: Scenario): void {
  const { actualResult, comments } = withExecutionDefaults(scenario)
  report.field('Componente', scenario.component)
  report.field('Prioridad', scenario.priority)
  report.field('Objetivo', scenario.objective)
  const importedActions = numberedStepActions(scenario.detailedSteps)
  const matchesStructuredSteps = importedActions.length === scenario.steps.length &&
    importedActions.every((action, index) => action === scenario.steps[index].action)
  if (importedActions.length === 0 || !matchesStructuredSteps) {
    report.field('Pasos del escenario', scenario.detailedSteps)
  }
  report.field('Resultado esperado', scenario.expectedResult, true)
  report.field('Resultado actual', actualResult, true)
  report.field('Evidencia requerida', scenario.evidenceRequired ? 'Sí' : 'No')
  report.field('Comentarios', comments)
  report.field('Referencia de defecto', scenario.defectRef)
}

function stepDetails(report: Report, step: Step, number: number): void {
  report.room(29)
  report.rule(margin, report.y - 3, report.contentWidth)
  report.y += 5
  report.heading(`Paso ${number}`)
  report.field('Acción', step.action, true)
  report.field('Resultado esperado', step.expectedResult, true)
  report.field('Resultado actual', step.actualResult, true)
  report.field('Estado del paso', step.status)
}

async function scenarioCaptures(report: Report, scenario: Scenario, captures: Evidence[]): Promise<void> {
  const stepNumbers = new Map(scenario.steps.map((step, index) => [step.id, index + 1]))
  const ordered = captures.slice().sort((left, right) => left.order - right.order)
  for (const [index, capture] of ordered.entries()) {
    const step = capture.stepId && stepNumbers.get(capture.stepId)
    await addEvidence(report, capture, step ? `Paso ${step}  /  Captura ${index + 1}` : `Captura de escenario ${index + 1}`)
  }
}

async function sharedDetails(report: Report, documentation: SharedDocumentation[]): Promise<void> {
  if (documentation.length === 0) return
  if (report.orientation !== 'portrait') report.page(report.section, 'portrait')
  report.room(37)
  report.heading('Documentación compartida')
  for (const { source, step, evidence } of documentation) {
    if (report.orientation !== 'portrait') report.page(report.section, 'portrait')
    report.field('Escenario de origen', `${scenarioIdentifier(source)} / ${source.title || 'Sin título'}`)
    if (step) {
      stepDetails(report, step, source.steps.findIndex((entry) => entry.id === step.id) + 1)
    } else {
      report.field('Estado del escenario de origen', source.executionStatus)
      scenarioFields(report, source)
      source.steps.forEach((entry, index) => stepDetails(report, entry, index + 1))
    }
    await scenarioCaptures(report, source, evidence)
  }
}

async function scenarioDetails(report: Report, scenario: Scenario, captures: Evidence[], documentation: SharedDocumentation[], documented: boolean): Promise<void> {
  const primaryId = scenarioIdentifier(scenario)
  report.page(`Escenario  /  ${primaryId}`, 'portrait')
  report.heading('Evidencia de ejecución de pruebas')
  report.rect(margin, report.y - 3.5, report.contentWidth, 11, light)
  report.text(scenario.executionStatus, margin + 3, report.y + 3.7, 11, statusColors[scenario.executionStatus], true)
  report.text(documented ? 'Documentado' : 'Documentación pendiente', margin + 40, report.y + 3.7, 10, documented ? teal : warning, true)
  report.y += 16
  report.field('Identificador', primaryId)
  report.field('Escenario', scenario.title, true)
  scenarioFields(report, scenario)
  scenario.steps.forEach((step, index) => stepDetails(report, step, index + 1))
  await scenarioCaptures(report, scenario, captures)
  await sharedDetails(report, documentation)
}

export async function makePdf(bundle: ProjectBundle): Promise<Blob> {
  const report = new Report()
  const title = bundle.project.title || 'Proyecto de pruebas'
  report.pdf.setProperties({ title, subject: 'Documentación de pruebas QA', author: 'TAF', creator: 'TAF' })
  const timestamp = new Date(bundle.project.updatedAt)
  if (!Number.isNaN(timestamp.getTime())) {
    const utc = timestamp.toISOString().slice(0, 19).replace(/[-:T]/g, '')
    report.pdf.setCreationDate(`D:${utc}+00'00'`)
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bundle.project.id))
  const fileId = Array.from(new Uint8Array(digest).subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')
  report.pdf.setFileId(fileId)

  const scenarios = bundle.scenarios.slice().sort((left, right) => left.order - right.order)
  const byScenario = new Map<string, Evidence[]>()
  for (const capture of bundle.evidence) {
    const captures = byScenario.get(capture.scenarioId) ?? []
    captures.push(capture)
    byScenario.set(capture.scenarioId, captures)
  }
  cover(report, bundle)
  scenarioIndex(report, scenarios)
  for (const scenario of scenarios) {
    const captures = byScenario.get(scenario.id) ?? []
    const documentation = sharedDocumentationFor(scenario, scenarios, bundle.evidence)
    const relatedCaptures = captures.length ? captures : documentation.flatMap((entry) => entry.evidence)
    const documented = isDocumented(scenario, relatedCaptures, scenarios)
    await scenarioDetails(report, scenario, captures, documentation, documented)
  }
  report.footer()
  return report.pdf.output('blob')
}

export async function downloadPdf(bundle: ProjectBundle): Promise<void> {
  download(await makePdf(bundle), `${bundle.project.title || 'Proyecto'} - Documentación QA`, 'pdf')
}
