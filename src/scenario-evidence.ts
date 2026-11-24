import type { NewEvidence, Step } from './model'

export function assignCaptureStep(
  capture: Pick<NewEvidence, 'stepId' | 'caption'>,
  steps: readonly Step[],
  occupied: Set<string>,
) {
  const index = capture.stepId === undefined
    ? steps.findIndex((step) => !occupied.has(step.id))
    : steps.findIndex((step) => step.id === capture.stepId)
  const step = steps[index]
  if (!step) return { stepId: undefined, caption: capture.caption }

  occupied.add(step.id)
  const action = step.action.replace(/\s+/gu, ' ').trim()
  const defaultCaption = `Paso ${index + 1}${action ? `. ${action}` : ''}`.slice(0, 1000)
  return { stepId: step.id, caption: capture.caption.trim() ? capture.caption : defaultCaption }
}
