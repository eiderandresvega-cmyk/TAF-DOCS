import { describe, expect, it } from 'vitest'
import type { Step } from './model'
import { assignCaptureStep } from './scenario-evidence'

const steps: Step[] = ['Abrir el menú', 'Guardar el registro'].map((action, index) => ({
  id: `step-${index + 1}`, action, expectedResult: '', actualResult: '', status: 'No ejecutado',
}))

describe('asociación de capturas', () => {
  it('ocupa un paso pendiente por captura hasta agotar la lista', () => {
    const occupied = new Set<string>()
    expect(assignCaptureStep({ caption: '' }, steps, occupied)).toEqual({ stepId: 'step-1', caption: 'Paso 1. Abrir el menú' })
    expect(assignCaptureStep({ caption: '' }, steps, occupied)).toEqual({ stepId: 'step-2', caption: 'Paso 2. Guardar el registro' })
    expect(assignCaptureStep({ caption: '' }, steps, occupied)).toEqual({ stepId: undefined, caption: '' })
  })

  it('respeta un paso y una descripción elegidos por el usuario, y permite dejar una captura libre', () => {
    const occupied = new Set<string>()
    expect(assignCaptureStep({ stepId: 'step-2', caption: 'Captura de varias opciones' }, steps, occupied))
      .toEqual({ stepId: 'step-2', caption: 'Captura de varias opciones' })
    expect(assignCaptureStep({ stepId: null, caption: '' }, steps, occupied)).toEqual({ stepId: undefined, caption: '' })
    expect(assignCaptureStep({ caption: '' }, steps, occupied).stepId).toBe('step-1')
  })
})
