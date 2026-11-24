import Dexie, { type EntityTable } from 'dexie'
import { ScenarioStepsConflictError, sameDocumentationLink, type DocumentationLink, type Evidence, type NewEvidence, type Project, type ProjectBundle, type ProjectDetails, type Scenario, type ScenarioDraft, type Step } from './model'
import { numberedSteps } from './numbered-steps'
import { assignCaptureStep } from './scenario-evidence'

const PROJECT_LIMIT = 3
const db = new Dexie('taf-docs') as Dexie & {
  projects: EntityTable<Project, 'id'>
  scenarios: EntityTable<Scenario, 'id'>
  evidence: EntityTable<Evidence, 'id'>
}

const stores = {
  projects: 'id, updatedAt',
  scenarios: 'id, projectId, [projectId+order]',
  evidence: 'id, projectId, scenarioId, [scenarioId+order]',
}

db.version(1).stores(stores)
db.version(2).stores(stores).upgrade(async (transaction) => {
  const imported = new Map<string, { steps: Step[]; occupied: Set<string> }>()
  await transaction.table<Scenario, string>('scenarios').toCollection().modify((scenario) => {
    if (scenario.steps.length) return false
    const steps = numberedSteps(scenario.detailedSteps)
    if (!steps.length) return false

    scenario.steps = steps
    imported.set(scenario.id, { steps, occupied: new Set() })
  })
  if (!imported.size) return

  await transaction.table<Evidence, string>('evidence').orderBy('[scenarioId+order]').modify((capture) => {
    const plan = imported.get(capture.scenarioId)
    if (!plan || capture.stepId) return false
    const placement = assignCaptureStep(capture, plan.steps, plan.occupied)
    if (!placement.stepId) return false
    Object.assign(capture, placement)
  })
})

export function listProjects() {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function getBundle(id: string): Promise<ProjectBundle | undefined> {
  return db.transaction('r', db.projects, db.scenarios, db.evidence, async () => {
    const project = await db.projects.get(id)
    if (!project) return undefined
    const scenarios = await db.scenarios.where('projectId').equals(id).sortBy('order')
    const evidence = await db.evidence.where('projectId').equals(id).sortBy('order')
    return { project, scenarios, evidence }
  })
}

async function saveNewBundle(bundle: ProjectBundle) {
  await db.transaction('rw', db.projects, db.scenarios, db.evidence, async () => {
    if (await db.projects.count() >= PROJECT_LIMIT) {
      throw new Error('Alcanzaste el límite de tres proyectos locales. Exporta una copia y elimina un proyecto para continuar.')
    }
    await db.projects.add(bundle.project)
    await db.scenarios.bulkAdd(bundle.scenarios)
    await db.evidence.bulkAdd(bundle.evidence)
  })
  await navigator.storage?.persist?.().catch(() => false)
  return bundle.project.id
}

export function createProject(details: ProjectDetails, drafts: ScenarioDraft[], source: Project['source']) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  return saveNewBundle({
    project: { ...details, id, source, createdAt: now, updatedAt: now },
    scenarios: drafts.map((draft, order) => ({ ...draft, id: crypto.randomUUID(), projectId: id, order,
      steps: numberedSteps(draft.detailedSteps),
    })),
    evidence: [],
  })
}

export function restoreProject(bundle: ProjectBundle) {
  const projectId = crypto.randomUUID()
  const scenarioIds = new Map<string, string>()
  const stepIds = new Map<string, string>()
  const scenarios = bundle.scenarios.map((scenario) => {
    const id = crypto.randomUUID()
    scenarioIds.set(scenario.id, id)
    const steps = scenario.steps.map((step) => {
      const id = crypto.randomUUID()
      stepIds.set(step.id, id)
      return { ...step, id }
    })
    return { ...scenario, id, projectId, steps }
  })
  for (const scenario of scenarios) {
    if (!scenario.documentationLinks) continue
    scenario.documentationLinks = scenario.documentationLinks.map((link) => {
      const sourceScenarioId = scenarioIds.get(link.sourceScenarioId)
      const sourceStepId = link.sourceStepId ? stepIds.get(link.sourceStepId) : undefined
      if (!sourceScenarioId || (link.sourceStepId && !sourceStepId)) throw new Error('Hay un vínculo de documentación sin origen en la copia.')
      return { sourceScenarioId, sourceStepId }
    })
  }
  const evidence = bundle.evidence.map((item) => {
    const scenarioId = scenarioIds.get(item.scenarioId)
    if (!scenarioId) throw new Error('Hay evidencias sin escenario en la copia.')
    return { ...item, id: crypto.randomUUID(), projectId, scenarioId, stepId: item.stepId ? stepIds.get(item.stepId) : undefined }
  })
  return saveNewBundle({ project: { ...bundle.project, id: projectId, updatedAt: new Date().toISOString() }, scenarios, evidence })
}

async function touchProject(id: string) {
  if (await db.projects.update(id, { updatedAt: new Date().toISOString() }) === 0) throw new Error('Este proyecto ya no existe.')
}

export async function updateProject(id: string, details: ProjectDetails) {
  if (await db.projects.update(id, { ...details, updatedAt: new Date().toISOString() }) === 0) throw new Error('Este proyecto ya no existe.')
}

export async function addScenario(projectId: string, draft: ScenarioDraft) {
  const id = crypto.randomUUID()
  await db.transaction('rw', db.projects, db.scenarios, async () => {
    await touchProject(projectId)
    const scenarios = await db.scenarios.where('projectId').equals(projectId).toArray()
    if (scenarios.some((scenario) => scenario.sourceId.toLocaleLowerCase() === draft.sourceId.toLocaleLowerCase())) {
      throw new Error('Ya existe un escenario con este ID.')
    }
    const order = Math.max(-1, ...scenarios.map((scenario) => scenario.order)) + 1
    await db.scenarios.add({ ...draft, id, projectId, order, steps: numberedSteps(draft.detailedSteps) })
  })
  return id
}

export async function updateScenario(scenario: Scenario, changes: Partial<ScenarioDraft & { steps: Step[] }>, expectedSteps?: Step[]) {
  await db.transaction('rw', db.projects, db.scenarios, db.evidence, async () => {
    await touchProject(scenario.projectId)
    const current = await db.scenarios.get(scenario.id)
    if (!current) throw new Error('Este escenario ya no existe.')
    if (changes.sourceId !== undefined && changes.sourceId.toLocaleLowerCase() !== current.sourceId.toLocaleLowerCase()) {
      const peers = await db.scenarios.where('projectId').equals(scenario.projectId).toArray()
      if (peers.some((peer) => peer.id !== scenario.id && peer.sourceId.toLocaleLowerCase() === changes.sourceId?.toLocaleLowerCase())) {
        throw new Error('Ya existe un escenario con este ID.')
      }
    }
    if (changes.steps && JSON.stringify(current.steps) !== JSON.stringify(expectedSteps)) {
      throw new ScenarioStepsConflictError(current.steps)
    }
    await db.scenarios.update(scenario.id, changes)
    if (changes.steps) {
      const stepIds = new Set(changes.steps.map((step) => step.id))
      await db.evidence.where('scenarioId').equals(scenario.id).filter((item) => Boolean(item.stepId && !stepIds.has(item.stepId)))
        .modify({ stepId: undefined })
      if (current.steps.some((step) => !stepIds.has(step.id))) {
        const shouldRemove = (link: DocumentationLink) => link.sourceScenarioId === scenario.id &&
          link.sourceStepId !== undefined && !stepIds.has(link.sourceStepId)
        await db.scenarios.where('projectId').equals(scenario.projectId).filter((target) =>
          target.documentationLinks?.some(shouldRemove) ?? false,
        ).modify((target) => {
          target.documentationLinks = target.documentationLinks?.filter((link) => !shouldRemove(link))
        })
      }
    }
  })
}

export async function addEvidence(scenario: Scenario, images: NewEvidence[]) {
  await db.transaction('rw', db.projects, db.scenarios, db.evidence, async () => {
    await touchProject(scenario.projectId)
    const current = await db.scenarios.get(scenario.id)
    if (!current) throw new Error('Este escenario ya no existe.')
    const evidence = await db.evidence.where('scenarioId').equals(scenario.id).sortBy('order')
    if (evidence.length + images.length > 100) throw new Error('Este escenario admite hasta 100 capturas.')
    const start = (evidence.at(-1)?.order ?? -1) + 1
    const occupied = new Set(evidence.flatMap((item) => item.stepId ? [item.stepId] : []))
    await db.evidence.bulkAdd(images.map((item, index) => ({ ...item, id: crypto.randomUUID(),
      scenarioId: scenario.id, projectId: scenario.projectId, order: start + index,
      ...assignCaptureStep(item, current.steps, occupied),
    })))
  })
}

export async function shareDocumentation(source: Scenario, targetScenarioIds: string[], sourceStepId?: string) {
  await db.transaction('rw', db.projects, db.scenarios, async () => {
    const current = await db.scenarios.get(source.id)
    if (!current || current.projectId !== source.projectId) throw new Error('El escenario de origen ya no existe.')
    if (sourceStepId && !current.steps.some((step) => step.id === sourceStepId)) throw new Error('El paso que intentas compartir ya no existe.')

    const ids = [...new Set(targetScenarioIds)]
    if (!ids.length) throw new Error('Selecciona al menos un escenario de destino.')
    const link: DocumentationLink = { sourceScenarioId: source.id, sourceStepId }
    const targets = await db.scenarios.bulkGet(ids)
    const changed = targets.flatMap((target) => {
      if (!target || target.id === source.id || target.projectId !== source.projectId) {
        throw new Error('La documentación solo se puede compartir con otros escenarios del proyecto.')
      }
      const links = target.documentationLinks ?? []
      if (links.some((entry) => sameDocumentationLink(entry, link) ||
        (entry.sourceScenarioId === source.id && !entry.sourceStepId))) return []
      const kept = sourceStepId ? links : links.filter((entry) => entry.sourceScenarioId !== source.id)
      return [{ ...target, documentationLinks: [...kept, link] }]
    })
    if (!changed.length) return
    await touchProject(source.projectId)
    await db.scenarios.bulkPut(changed)
  })
}

export async function unshareDocumentation(target: Scenario, link: DocumentationLink) {
  await db.transaction('rw', db.projects, db.scenarios, async () => {
    const current = await db.scenarios.get(target.id)
    if (!current || current.projectId !== target.projectId) throw new Error('El escenario de destino ya no existe.')
    const links = current.documentationLinks ?? []
    const remaining = links.filter((entry) => !sameDocumentationLink(entry, link))
    if (remaining.length === links.length) return
    await touchProject(target.projectId)
    await db.scenarios.update(current.id, { documentationLinks: remaining })
  })
}

export async function updateEvidence(item: Evidence, changes: Partial<Pick<Evidence, 'caption' | 'stepId'>>) {
  await db.transaction('rw', db.projects, db.scenarios, db.evidence, async () => {
    const scenario = await db.scenarios.get(item.scenarioId)
    if (!scenario) throw new Error('Este escenario ya no existe.')
    await touchProject(item.projectId)
    const patch = { ...changes }
    if ('stepId' in changes && !scenario.steps.some((step) => step.id === changes.stepId)) patch.stepId = undefined
    if (await db.evidence.update(item.id, patch) === 0) throw new Error('La captura ya no existe.')
  })
}

export async function moveEvidence(scenario: Scenario, id: string, direction: -1 | 1) {
  await db.transaction('rw', db.projects, db.evidence, async () => {
    const items = await db.evidence.where('scenarioId').equals(scenario.id).sortBy('order')
    const index = items.findIndex((item) => item.id === id)
    const neighbor = items[index + direction]
    if (index < 0 || !neighbor) return
    await touchProject(scenario.projectId)
    await db.evidence.bulkPut([{ ...items[index], order: neighbor.order }, { ...neighbor, order: items[index].order }])
  })
}

export async function deleteEvidence(scenario: Scenario, id: string) {
  await db.transaction('rw', db.projects, db.evidence, async () => {
    const item = await db.evidence.get(id)
    if (item?.scenarioId !== scenario.id) return
    await touchProject(scenario.projectId)
    await db.evidence.delete(id)
  })
}

export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.scenarios, db.evidence, async () => {
    await db.evidence.where('projectId').equals(id).delete()
    await db.scenarios.where('projectId').equals(id).delete()
    await db.projects.delete(id)
  })
}

export function storageMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'El navegador se quedó sin espacio. Exporta una copia y libera espacio antes de volver a guardar.'
  }
  return error instanceof Error ? error.message : 'Ocurrió un error al guardar en este navegador.'
}
