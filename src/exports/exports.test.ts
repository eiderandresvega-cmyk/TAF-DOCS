import { describe, expect, it } from 'vitest'
import { unzipSync, unzlibSync, zipSync } from 'fflate'
import { emptyDetails, emptyScenario, type DocumentationLink, type ProjectBundle } from '../model'
import { makeBackup, readBackup } from './backup'
import { fitImage, makePdf } from './pdf'

function sample(): ProjectBundle {
  const createdAt = '2026-10-07T12:00:00.000Z'
  const project = {
    ...emptyDetails(), id: 'qa-project', title: 'Verificación de sesión', country: 'Colombia',
    source: 'demo' as const, reportDate: '2026-10-07', createdAt, updatedAt: createdAt,
  }
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQ7pgHAAIDAUI1TNdEAAAAAElFTkSuQmCC'),
    (character) => character.charCodeAt(0))
  const image = new Blob([png], { type: 'image/png' })
  const steps = [{ id: 'step-01', action: 'Entrar a la pantalla', expectedResult: 'Se muestra el inicio',
    actualResult: 'Se mostró el inicio', status: 'Passed' as const }]
  return {
    project,
    scenarios: [
      { ...emptyScenario(), id: 'scenario-02', sourceId: 'TF-02', title: 'Caso pendiente', projectId: project.id, order: 1, steps: [] },
      { ...emptyScenario(), id: 'scenario-01', sourceId: 'TF-01', title: 'Inicio de sesión', projectId: project.id, order: 0,
        executionStatus: 'Passed', expectedResult: 'Acceso permitido', actualResult: 'Acceso permitido', steps },
    ],
    evidence: [{ id: 'evidence-1', scenarioId: 'scenario-01', projectId: project.id, stepId: 'step-01', order: 0,
      width: 1, height: 1, caption: 'Pantalla de ejemplo', image, thumbnail: image }],
  }
}

function backupFile(bytes: Uint8Array) {
  return new File([bytes as Uint8Array<ArrayBuffer>], 'sample.tafproject')
}

function extractPageStreams(bytes: ArrayBuffer): string {
  const decoder = new TextDecoder('latin1')
  const structure = decoder.decode(bytes)
  return Array.from(structure.matchAll(/<<\s*\/Length (\d+)\s*\/Filter \/FlateDecode\s*>>\s*stream\r?\n/g), (match) => {
    const start = match.index + match[0].length
    return decoder.decode(unzlibSync(new Uint8Array(bytes, start, Number(match[1]))))
  }).join('\n')
}

describe('respaldo portable', () => {
  it('restaura metadatos, pasos y originales y miniaturas verificados', async () => {
    const original = sample()
    const backup = await makeBackup(original)
    const restored = await readBackup(new File([backup], 'proyecto.tafproject'))
    expect(restored.project).toEqual(original.project)
    expect(restored.scenarios).toEqual(original.scenarios)
    expect(restored.evidence[0]?.stepId).toBe('step-01')
    expect(restored.evidence[0]?.thumbnail.type).toBe('image/png')
    expect(await restored.evidence[0]?.image.arrayBuffer()).toEqual(await original.evidence[0]?.image.arrayBuffer())
  })

  it('verifica el contenido incluso si el ZIP se vuelve a empaquetar', async () => {
    const bytes = new Uint8Array(await (await makeBackup(sample())).arrayBuffer())
    const files = unzipSync(bytes)
    const recompressed = zipSync(files, { level: 6 })
    await expect(readBackup(backupFile(recompressed))).resolves.toMatchObject({ project: { id: 'qa-project' } })
    const image = files['evidence/1-image.png']!
    image[image.length - 1] ^= 1
    await expect(readBackup(backupFile(zipSync(files)))).rejects.toThrow(/integridad/)
  })

  it('restaura resultados extensos dentro del tamaño permitido del proyecto', async () => {
    const bundle = sample()
    const result = 'Resultado de prueba\n'.repeat(6_000)
    bundle.scenarios[0]!.actualResult = result
    const backup = await makeBackup(bundle)
    const restored = await readBackup(new File([backup], 'proyecto.tafproject'))
    expect(restored.scenarios[0]?.actualResult).toBe(result)
  })

  it('rechaza rutas ajenas al formato y referencias de pasos incompletas', async () => {
    const unsafe = { 'manifest.json': new Uint8Array([48]), '../metadata.json': new Uint8Array([48]) }
    await expect(readBackup(backupFile(zipSync(unsafe)))).rejects.toThrow(/ZIP/)
    const bundle = sample()
    const files = unzipSync(new Uint8Array(await (await makeBackup(bundle)).arrayBuffer()))
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const metadata = JSON.parse(decoder.decode(files['metadata.json']))
    metadata.evidence[0].stepId = 'missing'
    const modified = encoder.encode(JSON.stringify(metadata))
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', modified))
    const manifest = JSON.parse(decoder.decode(files['manifest.json']))
    manifest.files['metadata.json'] = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
    files['metadata.json'] = modified
    files['manifest.json'] = encoder.encode(JSON.stringify(manifest))
    await expect(readBackup(backupFile(zipSync(files)))).rejects.toThrow(/incompatibles/)

    bundle.evidence[0]!.stepId = 'missing'
    await expect(makeBackup(bundle)).rejects.toThrow(/incompatibles/)
  })

  it('valida la geometría original antes de crear un archivo de respaldo', async () => {
    const bundle = sample()
    bundle.evidence[0]!.width = 3
    await expect(makeBackup(bundle)).rejects.toThrow(/incompatibles/)
  })

  it('conserva los enlaces entre escenarios de la versión 2', async () => {
    const original = sample()
    const documentationLinks = [{ sourceScenarioId: 'scenario-01', sourceStepId: 'step-01' }]
    original.scenarios[0]!.documentationLinks = documentationLinks
    const file = await makeBackup(original)
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
    expect(JSON.parse(new TextDecoder().decode(files['manifest.json'])).version).toBe(2)
    const restored = await readBackup(new File([file], 'proyecto.tafproject'))
    expect(restored.scenarios[0]?.documentationLinks).toEqual(documentationLinks)
    expect(restored.evidence).toHaveLength(1)
  })

  it('reconstruye pasos de respaldos anteriores y respeta una lista vacía en los nuevos', async () => {
    const original = sample()
    const target = original.scenarios[0]!
    target.detailedSteps = '1. Abrir documento\n2. Validar documento'
    for (const [id, order, caption] of [['c-2', 5, 'Descripción propia'], ['c-1', 0, ''], ['c-3', 6, '']] as const) {
      original.evidence.push({ ...original.evidence[0], id, scenarioId: target.id, stepId: undefined, order, caption })
    }
    const file = await makeBackup(original)
    const current = await readBackup(new File([file], 'proyecto.tafproject'))
    expect(current.scenarios[0]?.steps).toEqual([])
    expect(current.evidence[2]?.stepId).toBeUndefined()

    const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify({ ...manifest, version: 1 }))
    const restored = await readBackup(backupFile(zipSync(files)))
    expect(restored.scenarios[0]?.steps.map((step) => step.action)).toEqual(['Abrir documento', 'Validar documento'])
    const [first, second] = restored.scenarios[0]!.steps
    expect(restored.evidence[2]).toMatchObject({ id: 'c-1', stepId: first.id, caption: 'Paso 1. Abrir documento' })
    expect(restored.evidence[1]).toMatchObject({ id: 'c-2', stepId: second.id, caption: 'Descripción propia' })
    expect(restored.evidence[3]).toMatchObject({ id: 'c-3', stepId: undefined, caption: '' })
    expect(restored.scenarios[1]?.steps).toEqual(original.scenarios[1]?.steps)
    expect(restored.evidence[0]?.stepId).toBe('step-01')
  })

  it.each<DocumentationLink[]>([
    [{ sourceScenarioId: 'scenario-02' }],
    [{ sourceScenarioId: 'otro-proyecto' }],
    [{ sourceScenarioId: 'scenario-01', sourceStepId: 'missing' }],
    [{ sourceScenarioId: 'scenario-01' }, { sourceScenarioId: 'scenario-01' }],
    [{ sourceScenarioId: 'scenario-01', sourceStepId: 'step-01' }, { sourceScenarioId: 'scenario-01' }],
  ])('rechaza referencias de documentación inválidas', async (...links) => {
    const bundle = sample()
    bundle.scenarios[0]!.documentationLinks = links
    await expect(makeBackup(bundle)).rejects.toThrow(/incompatibles/)
  })
})

describe('reporte PDF', () => {
  it('mantiene la relación de aspecto y evita agrandar imágenes pequeñas', () => {
    expect(fitImage(320, 160, 180, 200)).toEqual({ width: 320 * 25.4 / 96, height: 160 * 25.4 / 96 })
    expect(fitImage(2400, 1200, 180, 200)).toEqual({ width: 180, height: 90 })
    expect(fitImage(1200, 2400, 180, 200)).toEqual({ width: 100, height: 200 })
  })

  it('genera portada, índice, escenarios y un objeto de imagen con salida estable', async () => {
    const first = await makePdf(sample())
    const second = await makePdf(sample())
    const bytes = await first.arrayBuffer()
    const structure = new TextDecoder('latin1').decode(bytes)
    expect(first.type).toBe('application/pdf')
    expect(structure.startsWith('%PDF-')).toBe(true)
    expect(structure.match(/\/Type \/Page\b/g)).toHaveLength(4)
    expect(structure).toContain('/Subtype /Image')
    expect(bytes).toEqual(await second.arrayBuffer())
  })

  it('repite únicamente la documentación seleccionada y reutiliza la imagen en el PDF', async () => {
    const bundle = sample()
    const [target, source] = bundle.scenarios
    source.actualResult = ''
    source.detailedSteps = '1. Entrar a la pantalla\n2. Comprobar ruta secundaria'
    source.steps.push({ ...source.steps[0], id: 'step-02', action: 'Comprobar ruta secundaria' })
    target.documentationLinks = [{ sourceScenarioId: source.id, sourceStepId: 'step-01' }]
    bundle.scenarios.push({ ...target, id: 'scenario-03', sourceId: 'TF-03', order: 2,
      documentationLinks: [{ sourceScenarioId: source.id }] })

    const bytes = await (await makePdf(bundle)).arrayBuffer()
    const content = extractPageStreams(bytes)
    expect(content.match(/Escenario de origen/g)).toHaveLength(2)
    expect(content.match(/Entrar a la pantalla/g)).toHaveLength(3)
    expect(content.match(/Comprobar ruta secundaria/g)).toHaveLength(2)
    expect(content.match(/Pantalla de ejemplo/g)).toHaveLength(3)
    expect(content.match(/Escenario ejecutado exitosamente/g)).toHaveLength(2)
    expect(content.match(/Acceso permitido/g)).toHaveLength(4)
    expect(new TextDecoder('latin1').decode(bytes).match(/\/Subtype \/Image\b/g)).toHaveLength(1)
  })
})
