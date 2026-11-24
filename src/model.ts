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
export class ScenarioStepsConflictError extends Error {
  constructor(readonly savedSteps: Step[]) {
    super('Los pasos cambiaron en otra pestaña. Recupera la última versión guardada antes de editarlos.')
    this.name = 'ScenarioStepsConflictError'
  }
}
export type Scenario = ScenarioDraft & { id: string; projectId: string; order: number; steps: Step[] }
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

export function isDocumented(scenario: Scenario, evidence: Evidence[]): boolean {
  return hasCompleteDocumentation(scenario, evidence.some((item) => item.scenarioId === scenario.id))
}

function hasCompleteDocumentation(scenario: Scenario, hasEvidence: boolean): boolean {
  return terminalStatuses.has(scenario.executionStatus) && Boolean(scenario.expectedResult.trim()) &&
    Boolean(scenario.actualResult.trim()) && (!scenario.evidenceRequired || hasEvidence)
}

export function progressFor(scenarios: Scenario[], evidence: Evidence[]) {
  const total = scenarios.length
  const withEvidence = new Set(evidence.map((item) => item.scenarioId))
  let executed = 0
  let documented = 0
  for (const scenario of scenarios) {
    if (!terminalStatuses.has(scenario.executionStatus)) continue
    executed++
    if (hasCompleteDocumentation(scenario, withEvidence.has(scenario.id))) documented++
  }
  return { total, executed, documented, execution: total ? Math.round(executed * 100 / total) : 0,
    documentation: total ? Math.round(documented * 100 / total) : 0 }
}
