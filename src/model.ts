export type ExecutionStatus = 'No ejecutado' | 'En progreso' | 'Passed' | 'Failed' | 'Bloqueado' | 'No aplica'
export const statuses: ExecutionStatus[] = ['No ejecutado', 'En progreso', 'Passed', 'Failed', 'Bloqueado', 'No aplica']
const terminalStatuses = new Set<ExecutionStatus>(['Passed', 'Failed', 'Bloqueado', 'No aplica'])

export type ProjectDetails = {
  title: string
  country: string
  qaOwner: string
  poOwner: string
  reportDate: string
  authorization: string
}

export type Project = ProjectDetails & {
  id: string
  source: 'xlsx' | 'manual' | 'demo'
  createdAt: string
  updatedAt: string
}

export type ScenarioDraft = {
  sourceId: string
  title: string
  component: string
  priority: string
  objective: string
  detailedSteps: string
  expectedResult: string
  evidenceRequired: boolean
  executionStatus: ExecutionStatus
  actualResult: string
  comments: string
  defectRef: string
  metadata: Record<string, string>
}

export type Step = { id: string; action: string; expectedResult: string; actualResult: string; status: ExecutionStatus }
export type DocumentationLink = { sourceScenarioId: string; sourceStepId?: string }
export class ScenarioStepsConflictError extends Error {
  constructor(readonly savedSteps: Step[]) {
    super('Los pasos cambiaron en otra pestaña. Recupera la última versión guardada antes de editarlos.')
    this.name = 'ScenarioStepsConflictError'
  }
}
export type Scenario = ScenarioDraft & {
  id: string
  projectId: string
  order: number
  steps: Step[]
  documentationLinks?: DocumentationLink[]
}
export type Evidence = {
  id: string
  projectId: string
  scenarioId: string
  stepId?: string
  order: number
  caption: string
  width: number
  height: number
  image: Blob
  thumbnail: Blob
}
export type ProjectBundle = { project: Project; scenarios: Scenario[]; evidence: Evidence[] }
export type NewEvidence = Omit<Evidence, 'id' | 'projectId' | 'scenarioId' | 'order' | 'stepId'> & { stepId?: string | null }
export type SharedDocumentation = { link: DocumentationLink; source: Scenario; step?: Step; evidence: Evidence[] }

export function emptyDetails(): ProjectDetails {
  const now = new Date()
  const reportDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  return { title: '', country: '', qaOwner: '', poOwner: '', reportDate, authorization: '' }
}

export function emptyScenario(): ScenarioDraft {
  return {
    sourceId: '', title: '', component: '', priority: '', objective: '', detailedSteps: '',
    expectedResult: '', evidenceRequired: true, executionStatus: 'No ejecutado', actualResult: '',
    comments: '', defectRef: '', metadata: {},
  }
}

export function withExecutionDefaults(scenario: Pick<ScenarioDraft, 'actualResult' | 'comments' | 'expectedResult' | 'executionStatus'>) {
  const passed = scenario.executionStatus === 'Passed'
  return {
    actualResult: scenario.actualResult.trim() ? scenario.actualResult : passed ? scenario.expectedResult : '',
    comments: scenario.comments.trim() ? scenario.comments : passed ? 'Escenario ejecutado exitosamente' : '',
  }
}

export function sameDocumentationLink(left: DocumentationLink, right: DocumentationLink) {
  return left.sourceScenarioId === right.sourceScenarioId && left.sourceStepId === right.sourceStepId
}

export function sharedDocumentationFor(scenario: Scenario, scenarios: Scenario[], evidence: Evidence[]): SharedDocumentation[] {
  return (scenario.documentationLinks ?? []).flatMap((link) => {
    const source = scenarios.find((item) => item.id === link.sourceScenarioId)
    if (!source || source.id === scenario.id || source.projectId !== scenario.projectId) return []
    const step = link.sourceStepId ? source.steps.find((item) => item.id === link.sourceStepId) : undefined
    if (link.sourceStepId && !step) return []
    const captures = evidence.filter((item) => item.scenarioId === source.id && (!step || item.stepId === step.id))
    return [{ link, source, step, evidence: captures }]
  })
}

export function isDocumented(scenario: Scenario, evidence: Evidence[], scenarios: Scenario[] = []): boolean {
  const hasEvidence = evidence.some((item) => item.scenarioId === scenario.id) ||
    sharedDocumentationFor(scenario, scenarios, evidence).some((entry) => entry.evidence.length > 0)
  return hasCompleteDocumentation(scenario, hasEvidence)
}

function hasCompleteDocumentation(scenario: Scenario, hasEvidence: boolean): boolean {
  return terminalStatuses.has(scenario.executionStatus) && Boolean(scenario.expectedResult.trim()) &&
    Boolean(withExecutionDefaults(scenario).actualResult.trim()) && (!scenario.evidenceRequired || hasEvidence)
}

export function progressFor(scenarios: Scenario[], evidence: Evidence[]) {
  const total = scenarios.length
  const withEvidence = new Set(evidence.map((item) => item.scenarioId))
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]))
  const withStepEvidence = new Map<string, Set<string>>()
  for (const item of evidence) {
    if (!item.stepId) continue
    const stepIds = withStepEvidence.get(item.scenarioId) ?? new Set<string>()
    stepIds.add(item.stepId)
    withStepEvidence.set(item.scenarioId, stepIds)
  }
  let executed = 0
  let documented = 0
  for (const scenario of scenarios) {
    if (!terminalStatuses.has(scenario.executionStatus)) continue
    executed++
    const hasEvidence = withEvidence.has(scenario.id) || (scenario.documentationLinks ?? []).some((link) => {
      const source = byId.get(link.sourceScenarioId)
      if (!source || source.id === scenario.id || source.projectId !== scenario.projectId) return false
      return link.sourceStepId
        ? source.steps.some((step) => step.id === link.sourceStepId) && withStepEvidence.get(source.id)?.has(link.sourceStepId)
        : withEvidence.has(source.id)
    })
    if (hasCompleteDocumentation(scenario, hasEvidence)) documented++
  }
  return { total, executed, documented, execution: total ? Math.round(executed * 100 / total) : 0,
    documentation: total ? Math.round(documented * 100 / total) : 0 }
}
