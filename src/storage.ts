import Dexie, { type EntityTable } from 'dexie'
import { ScenarioStepsConflictError, type Evidence, type Project, type ProjectBundle, type ProjectDetails, type Scenario, type ScenarioDraft, type Step } from './model'

const PROJECT_LIMIT = 3
const db = new Dexie('taf-docs') as Dexie & {
  projects: EntityTable<Project, 'id'>
  scenarios: EntityTable<Scenario, 'id'>
  evidence: EntityTable<Evidence, 'id'>
}

db.version(1).stores({
  projects: 'id, updatedAt',
  scenarios: 'id, projectId, [projectId+order]',
  evidence: 'id, projectId, scenarioId, [scenarioId+order]',
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
    scenarios: drafts.map((draft, order) => ({ ...draft, id: crypto.randomUUID(), projectId: id, order, steps: [] })),
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
    await db.scenarios.add({ ...draft, id, projectId, order, steps: [] })
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
    }
  })
}

type NewEvidence = Omit<Evidence, 'id' | 'projectId' | 'scenarioId' | 'order'>

export async function addEvidence(scenario: Scenario, images: NewEvidence[]) {
  await db.transaction('rw', db.projects, db.scenarios, db.evidence, async () => {
    await touchProject(scenario.projectId)
    const current = await db.scenarios.get(scenario.id)
    if (!current) throw new Error('Este escenario ya no existe.')
    const evidence = await db.evidence.where('scenarioId').equals(scenario.id).sortBy('order')
    if (evidence.length + images.length > 100) throw new Error('Este escenario admite hasta 100 capturas.')
    const start = (evidence.at(-1)?.order ?? -1) + 1
    const stepIds = new Set(current.steps.map((step) => step.id))
    await db.evidence.bulkAdd(images.map((item, index) => ({ ...item, id: crypto.randomUUID(),
      scenarioId: scenario.id, projectId: scenario.projectId, order: start + index,
      stepId: item.stepId && stepIds.has(item.stepId) ? item.stepId : undefined,
    })))
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
