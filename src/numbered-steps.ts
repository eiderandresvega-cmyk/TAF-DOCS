import type { Step } from './model'

const MAX_STEPS = 5_000

const markerPattern = /(?:^[^\S\n]*|[;|][^\S\n]*|[^\S\n])(?:(?:paso|step)[^\S\n]+(?<named>\d+)(?:[^\S\n]*(?<punctuation>[.):–—-]))?|\((?<enclosed>\d+)\)|(?<numbered>\d+)[^\S\n]*[.):–—-])(?=$|[^\S\n]|\p{L}|["'¿¡])/gimu

export function numberedStepActions(text: string): string[] {
  const source = text.replace(/\r\n?|\u2028|\u2029/gu, '\n')
  const actions: string[] = []
  let previousNumber: number | undefined
  let actionStart = 0
  let introduction = ''

  for (const marker of source.matchAll(markerPattern)) {
    const { named, punctuation, enclosed, numbered } = marker.groups!
    const ordinal = Number(named ?? enclosed ?? numbered)
    if (!Number.isSafeInteger(ordinal)) continue

    const atLineStart = marker.index === 0 || source[marker.index - 1] === '\n'
    // Require consecutive markers within a line so an incidental number stays in the action.
    if (!atLineStart && (previousNumber === undefined || ordinal !== previousNumber + 1 || (named && !punctuation))) continue

    if (previousNumber === undefined) {
      introduction = source.slice(0, marker.index).trim()
    } else {
      const action = source.slice(actionStart, marker.index).trim()
      if (action) actions.push(action)
    }
    previousNumber = ordinal
    actionStart = marker.index + marker[0].length
  }

  if (previousNumber === undefined) return actions
  const lastAction = source.slice(actionStart).trim()
  if (lastAction) actions.push(lastAction)
  if (introduction && actions.length > 0) actions[0] = `${introduction}\n${actions[0]}`
  return actions
}

export function numberedSteps(text: string): Step[] {
  return numberedStepActions(text).slice(0, MAX_STEPS).map((action) => ({
    id: crypto.randomUUID(), action, expectedResult: '', actualResult: '', status: 'No ejecutado',
  }))
}
