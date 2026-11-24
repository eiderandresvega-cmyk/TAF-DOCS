import { describe, expect, it } from 'vitest'
import { emptyScenario, isDocumented, progressFor, type Evidence, type Scenario } from './model'

const completed = { ...emptyScenario(), id: 'one', projectId: 'p', order: 0, steps: [], executionStatus: 'Passed',
  expectedResult: 'Se guarda el registro.', actualResult: 'El registro quedó guardado.' } satisfies Scenario
const capture = { id: 'e', projectId: 'p', scenarioId: 'one', order: 0, caption: '', width: 1, height: 1,
  image: new Blob(), thumbnail: new Blob() } satisfies Evidence

describe('avance del proyecto', () => {
  it('distingue ejecución finalizada de documentación pendiente por captura', () => {
    const scenarios = [completed, { ...completed, id: 'two', executionStatus: 'En progreso' as const }]
    expect(progressFor(scenarios, [])).toEqual({ total: 2, executed: 1, documented: 0, execution: 50, documentation: 0 })
    expect(progressFor(scenarios, [capture]).documentation).toBe(50)
  })

  it('requiere resultados y permite eximir la captura', () => {
    expect(isDocumented({ ...completed, evidenceRequired: false }, [])).toBe(true)
    expect(isDocumented({ ...completed, expectedResult: ' ' }, [capture])).toBe(false)
    expect(isDocumented({ ...completed, actualResult: '' }, [capture])).toBe(false)
  })
})
