import {
  useEffect, useRef, useState,
  type ReactNode, type DragEvent, type ChangeEvent,
} from 'react'
import {
  ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ClipboardList, FileImage,
  ImagePlus, Link2, LoaderCircle, Plus, Trash2, X,
} from 'lucide-react'
import {
  ScenarioStepsConflictError, statuses, withExecutionDefaults, type DocumentationLink,
  type Evidence, type ExecutionStatus, type NewEvidence, type Scenario, type ScenarioDraft, type SharedDocumentation, type Step,
} from '../model'
import { Modal, StatusBadge } from '../ui'
import { processImage } from './processImage'
import './scenario.css'

type ScenarioChanges = Partial<ScenarioDraft & { steps: Step[] }>
type EvidenceChanges = Partial<Pick<Evidence, 'caption' | 'stepId'>>
type ScenarioWrite = { changes: ScenarioChanges; expectedSteps?: Step[] }
const MAX_TEXT_LENGTH = 100_000
const MAX_STEPS = 5_000
const NO_UPLOAD_STEP = ':scenario'
const SHARE_SEARCH_LIMIT = 60

interface ScenarioEditorProps {
  scenario: Scenario
  evidence: Evidence[]
  projectScenarios: Scenario[]
  sharedDocumentation: SharedDocumentation[]
  onSave: (scenario: Scenario, changes: ScenarioChanges, expectedSteps?: Step[]) => Promise<void>
  onAdd: (images: NewEvidence[]) => Promise<void>
  onUpdateEvidence: (item: Evidence, changes: EvidenceChanges) => Promise<void>
  onMoveEvidence: (id: string, direction: -1 | 1) => Promise<void>
  onDeleteEvidence: (id: string) => Promise<void>
  onShare: (targetScenarioIds: string[], sourceStepId?: string) => Promise<void>
  onUnshare: (link: DocumentationLink) => Promise<void>
  onBack: () => void
  onPrevious?: () => void
  onNext?: () => void
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'El navegador alcanzó su límite de almacenamiento. Guarda un respaldo y libera espacio para continuar.'
  }
  return error instanceof Error && error.message ? error.message : fallback
}

function joinWrites(earlier: ScenarioWrite | null, later: ScenarioWrite | null): ScenarioWrite {
  return {
    changes: { ...earlier?.changes, ...later?.changes },
    expectedSteps: earlier?.expectedSteps ?? later?.expectedSteps,
  }
}

function useScenarioAutosave(scenario: Scenario, onSave: ScenarioEditorProps['onSave']) {
  const [draft, setDraft] = useState(scenario)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [stepConflict, setStepConflict] = useState<Step[]>()
  const current = useRef(scenario)
  const persisted = useRef(scenario)
  const pending = useRef<ScenarioWrite | null>(null)
  const active = useRef<ScenarioWrite | null>(null)
  const running = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(false)
  const save = useRef(onSave)

  useEffect(() => { save.current = onSave }, [onSave])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    persisted.current = scenario
    const next = { ...scenario, ...active.current?.changes, ...pending.current?.changes }
    current.current = next
    setDraft(next)
  }, [scenario])

  function flush(): Promise<boolean> {
    if (running.current) return running.current
    if (!pending.current) return Promise.resolve(true)
    if (mounted.current) setStatus('saving')

    running.current = Promise.resolve().then(async () => {
      while (pending.current) {
        const snapshot = pending.current
        pending.current = null
        active.current = snapshot
        try {
          await save.current(current.current, snapshot.changes, snapshot.expectedSteps)
        } catch (failure) {
          pending.current = joinWrites(snapshot, pending.current)
          if (mounted.current) {
            setStatus('error')
            setError(errorMessage(failure, 'No fue posible guardar el escenario.'))
            setStepConflict(failure instanceof ScenarioStepsConflictError ? failure.savedSteps : undefined)
          }
          return false
        } finally {
          active.current = null
        }
      }
      if (mounted.current) {
        setStatus('saved')
        setStepConflict(undefined)
      }
      return true
    }).finally(() => { running.current = null })
    return running.current
  }

  function update(change: ScenarioChanges | ((value: Scenario) => ScenarioChanges)) {
    const fields = typeof change === 'function' ? change(current.current) : change
    const next = { ...current.current, ...fields }
    pending.current = joinWrites(pending.current, {
      changes: fields,
      expectedSteps: fields.steps === undefined ? undefined : current.current.steps,
    })
    current.current = next
    setDraft(next)
    void flush()
  }

  function keepSavedSteps() {
    if (!pending.current) return
    const changes = { ...pending.current.changes }
    delete changes.steps
    pending.current = Object.keys(changes).length ? { changes } : null
    const next = { ...persisted.current, ...changes, steps: stepConflict ?? persisted.current.steps }
    current.current = next
    setDraft(next)
    setStepConflict(undefined)
    setStatus('saved')
    void flush()
  }

  return { draft, status, error, stepConflict, update, flush, keepSavedSteps }
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`scenario-field ${className ?? ''}`}>
    <span>{label}</span>
    {children}
  </label>
}

function StatusSelect({ value, onChange }: { value: ExecutionStatus; onChange: (status: ExecutionStatus) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as ExecutionStatus)}>
    {statuses.map((status) => <option key={status}>{status}</option>)}
  </select>
}

function ExecutionText({ value, onChange, rows, placeholder }: {
  value: string; onChange: (value: string) => void; rows: number; placeholder: string
}) {
  const [editing, setEditing] = useState<string | null>(null)
  return <textarea maxLength={MAX_TEXT_LENGTH} rows={rows} placeholder={placeholder} value={editing ?? value}
    onFocus={() => setEditing(value)} onBlur={() => setEditing(null)} onChange={(event) => {
      setEditing(event.target.value)
      onChange(event.target.value)
    }} />
}

function shareSearchKey(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function ShareDocumentationDialog({ source, targets, onShare, onClose }: {
  source: Scenario; targets: Scenario[]; onShare: ScenarioEditorProps['onShare']; onClose: () => void
}) {
  const [sourceStepId, setSourceStepId] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const search = shareSearchKey(query)
  const matches = targets.filter((target) => shareSearchKey(`${target.sourceId} ${target.title}`).includes(search))

  async function submit() {
    if (busy || !selected.length) return
    setBusy(true)
    setError('')
    try {
      await onShare(selected, sourceStepId || undefined)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'No fue posible compartir la documentación.'))
      setBusy(false)
    }
  }

  return <Modal title="Compartir documentación" close={onClose} busy={busy}>
    <form className="scenario-share-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <Field label="Documentación que se comparte">
        <select value={sourceStepId} onChange={(event) => setSourceStepId(event.target.value)} disabled={busy}>
          <option value="">Todo el escenario</option>
          {source.steps.map((step, index) => <option key={step.id} value={step.id}>
            {`Paso ${index + 1}${step.action.trim() ? `: ${step.action.trim().slice(0, 95)}` : ''}`}
          </option>)}
        </select>
      </Field>
      <Field label="Buscar escenarios">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy} />
      </Field>
      <fieldset className="scenario-share-targets" disabled={busy}>
        <legend>Escenarios de destino</legend>
        {matches.length === 0 && <p className="scenario-help">No hay escenarios que coincidan.</p>}
        {matches.slice(0, SHARE_SEARCH_LIMIT).map((target) => <label key={target.id} className="scenario-check scenario-share-target">
          <input type="checkbox" checked={selected.includes(target.id)} onChange={(event) => {
            const checked = event.target.checked
            setSelected((current) => checked ? [...current, target.id] : current.filter((id) => id !== target.id))
          }} />
          <span><strong>{target.sourceId}</strong> {target.title}</span>
        </label>)}
        {matches.length > SHARE_SEARCH_LIMIT && <p className="scenario-help">Se muestran {SHARE_SEARCH_LIMIT} coincidencias. Afina la búsqueda para ver otras.</p>}
      </fieldset>
      <p className="scenario-help" aria-live="polite">{selected.length} {selected.length === 1 ? 'escenario seleccionado' : 'escenarios seleccionados'}</p>
      {error && <p className="scenario-error" role="alert">{error}</p>}
      <div className="actions modal-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy || selected.length === 0}>{busy ? 'Compartiendo…' : 'Compartir'}</button>
      </div>
    </form>
  </Modal>
}

function LinkedDocumentation({ entry, busy, onRemove, onPreview }: {
  entry: SharedDocumentation; busy: boolean; onRemove: () => void; onPreview: (item: Evidence) => void
}) {
  const { source, step, evidence } = entry
  const stepNumber = step ? source.steps.findIndex((item) => item.id === step.id) + 1 : 0
  const result = step ?? withExecutionDefaults(source)
  const values = [
    ['Resultado esperado', step?.expectedResult ?? source.expectedResult],
    ['Resultado obtenido', result.actualResult],
    ['Comentarios', 'comments' in result ? result.comments : ''],
  ].filter(([, value]) => value.trim())

  return <li className="scenario-shared-item">
    <div className="scenario-section-heading">
      <strong>{source.sourceId} · {source.title}</strong>
      <button type="button" className="button secondary" onClick={onRemove} disabled={busy}
        aria-label={`Quitar vínculo de ${source.sourceId}${stepNumber ? `, paso ${stepNumber}` : ''}`}>
        Quitar vínculo
      </button>
    </div>
    <div className="scenario-section-actions">
      <span className="scenario-help">{stepNumber ? `Paso ${stepNumber}` : 'Todo el escenario'} · {evidence.length} {evidence.length === 1 ? 'captura' : 'capturas'}</span>
      <StatusBadge status={step?.status ?? source.executionStatus} />
    </div>
    {step?.action && <p className="scenario-shared-action">{step.action}</p>}
    {values.length > 0 && <dl className="scenario-shared-values">
      {values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>}
    {evidence.length > 0 && <ul className="scenario-shared-captures">
      {evidence.map((item, index) => <li key={item.id}>
        <button type="button" className="button secondary" onClick={() => onPreview(item)}>{item.caption || `Captura ${index + 1}`}</button>
      </li>)}
    </ul>}
  </li>
}

function useEvidenceUrl(blob: Blob) {
  // Each card is keyed by evidence ID. Editing captions and order leaves the saved bytes intact.
  const original = useRef(blob)
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(original.current)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [])
  return url
}

function EvidencePreview({ item, onClose }: { item: Evidence; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const url = useEvidenceUrl(item.image)
  useEffect(() => { dialog.current?.showModal() }, [])

  return <dialog ref={dialog} className="scenario-preview" aria-label="Vista previa de captura" onClose={onClose}>
    <div className="scenario-preview-bar">
      <strong>{item.caption || 'Captura de evidencia'}</strong>
      <button type="button" className="scenario-icon-button" aria-label="Cerrar vista previa" onClick={() => dialog.current?.close()}>
        <X size={19} aria-hidden="true" />
      </button>
    </div>
    {url && <img src={url} alt={item.caption || 'Captura de evidencia'} />}
  </dialog>
}

function EvidenceCard({ item, index, total, steps, onPreview, onPatch, onMove, onDelete }: {
  item: Evidence
  index: number
  total: number
  steps: Step[]
  onPreview: () => void
  onPatch: (changes: EvidenceChanges) => Promise<void>
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const thumbnail = useEvidenceUrl(item.thumbnail)
  const [caption, setCaption] = useState(item.caption)
  const [stepId, setStepId] = useState(item.stepId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const captionWrites = useRef(0)
  const stepWrites = useRef(0)
  const number = index + 1

  useEffect(() => {
    if (captionWrites.current === 0) setCaption(item.caption)
  }, [item.caption])

  useEffect(() => {
    if (stepWrites.current === 0) setStepId(item.stepId)
  }, [item.stepId])

  return <li className="scenario-evidence-card">
    <button type="button" className="scenario-thumbnail" aria-label={`Ampliar captura ${number}`} onClick={onPreview}>
      {thumbnail && <img src={thumbnail} alt={caption || `Captura ${number}`} loading="lazy" />}
    </button>
    <div className="scenario-evidence-body">
      <div className="scenario-evidence-title">
        <span>Captura {number}</span>
        <div className="scenario-evidence-actions">
          <button type="button" className="scenario-icon-button" aria-label={`Subir captura ${number}`} onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button type="button" className="scenario-icon-button" aria-label={`Bajar captura ${number}`} onClick={() => onMove(1)} disabled={index === total - 1}>
            <ArrowDown size={16} aria-hidden="true" />
          </button>
          <button type="button" className="scenario-icon-button scenario-delete" aria-label={`Eliminar captura ${number}`} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {confirmDelete && <div className="scenario-confirm-delete">
        <span>¿Eliminar captura?</span>
        <button type="button" onClick={() => { setConfirmDelete(false); onDelete() }}>Eliminar</button>
        <button type="button" onClick={() => setConfirmDelete(false)}>Cancelar</button>
      </div>}
      <input type="text" aria-label={`Descripción de captura ${number}`} placeholder="Añade una descripción"
        maxLength={1000} value={caption} onChange={(event) => {
          const next = event.target.value
          setCaption(next)
          captionWrites.current++
          void onPatch({ caption: next }).finally(() => { captionWrites.current-- })
        }} />
      {steps.length > 0 && <select aria-label={`Paso asociado a la captura ${number}`} value={stepId ?? ''} onChange={(event) => {
        const next = event.target.value || undefined
        setStepId(next)
        stepWrites.current++
        void onPatch({ stepId: next }).finally(() => { stepWrites.current-- })
      }}>
        <option value="">Escenario general</option>
        {steps.map((step, position) => <option key={step.id} value={step.id}>Paso {position + 1}</option>)}
      </select>}
    </div>
  </li>
}

function ScenarioEditorView({
  scenario, evidence, projectScenarios, sharedDocumentation,
  onSave, onAdd, onUpdateEvidence, onMoveEvidence, onDeleteEvidence, onShare, onUnshare,
  onBack, onPrevious, onNext,
}: ScenarioEditorProps) {
  const { draft, status, error, stepConflict, update, flush, keepSavedSteps } = useScenarioAutosave(scenario, onSave)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [evidenceError, setEvidenceError] = useState('')
  const [evidenceWrites, setEvidenceWrites] = useState(0)
  const [uploadStep, setUploadStep] = useState<string | null>()
  const [preview, setPreview] = useState<Evidence>()
  const [leaving, setLeaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [sharingNotice, setSharingNotice] = useState('')
  const [sharingError, setSharingError] = useState('')
  const [unlinking, setUnlinking] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadController = useRef<AbortController | null>(null)
  const evidenceQueue = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(false)
  const pasteHandler = useRef<(files: File[]) => void>(() => {})
  const orderedEvidence = [...evidence].sort((a, b) => a.order - b.order)
  const targets = projectScenarios.filter((candidate) => candidate.id !== scenario.id && candidate.projectId === scenario.projectId)

  useEffect(() => {
    mounted.current = true
    const handlePaste = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      const files = Array.from(event.clipboardData.items).flatMap((item) => {
        if (item.kind !== 'file' || !item.type.startsWith('image/')) return []
        const file = item.getAsFile()
        return file ? [file] : []
      })
      if (!files.length) files.push(...Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/')))
      if (!files.length) return
      event.preventDefault()
      pasteHandler.current(files)
    }
    window.addEventListener('paste', handlePaste)
    return () => {
      mounted.current = false
      window.removeEventListener('paste', handlePaste)
      uploadController.current?.abort()
    }
  }, [])

  function queueEvidence(action: () => Promise<void>): Promise<void> {
    setEvidenceWrites((count) => count + 1)
    const task = evidenceQueue.current.then(async () => {
      try {
        await action()
      } catch (failure) {
        if (mounted.current) setEvidenceError(errorMessage(failure, 'No fue posible guardar el cambio de evidencia.'))
      } finally {
        if (mounted.current) setEvidenceWrites((count) => count - 1)
      }
    })
    evidenceQueue.current = task
    return task
  }

  async function addFiles(files: File[]) {
    if (!files.length || uploadController.current || leaving || sharing) return
    if (files.length > 12) {
      setEvidenceError('Selecciona hasta 12 capturas por operación.')
      return
    }
    const controller = new AbortController()
    uploadController.current = controller
    const images: NewEvidence[] = []
    const errors: string[] = []
    setEvidenceError('')
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`Procesando captura ${index + 1} de ${files.length}`)
        try {
          const optimized = await processImage(file, controller.signal)
          images.push({ ...optimized, stepId: uploadStep, caption: '' })
        } catch (failure) {
          if (controller.signal.aborted) return
          errors.push(`${file.name || 'Captura'} · ${errorMessage(failure, 'No se pudo procesar el archivo.')}`)
        }
      }
      if (images.length && !controller.signal.aborted) {
        setUploadProgress('Guardando capturas')
        await queueEvidence(async () => {
          if (uploadStep !== null && !await flush()) throw new Error('Guarda el escenario antes de asociar capturas a un paso.')
          await onAdd(images)
        })
      }
      if (errors.length && mounted.current) {
        setEvidenceError((previous) => [previous, ...errors].filter(Boolean).join('\n'))
      }
    } finally {
      uploadController.current = null
      if (mounted.current) setUploadProgress('')
    }
  }

  useEffect(() => {
    pasteHandler.current = (files) => { void addFiles(files) }
  })

  async function navigate(destination: () => void) {
    if (leaving || uploadController.current || unlinking) return
    setLeaving(true)
    const [scenarioSaved] = await Promise.all([flush(), evidenceQueue.current])
    if (scenarioSaved) destination()
    else setLeaving(false)
  }

  function updateStep(id: string, patch: Partial<Step>) {
    update((value) => ({
      steps: value.steps.map((step) => step.id === id ? { ...step, ...patch } : step),
    }))
  }

  function addStep() {
    if (draft.steps.length >= MAX_STEPS) return
    const step: Step = { id: crypto.randomUUID(), action: '', expectedResult: '', actualResult: '', status: 'No ejecutado' }
    update((value) => ({ steps: [...value.steps, step] }))
  }

  function removeStep(id: string) {
    if (uploadStep === id) setUploadStep(undefined)
    update((value) => ({ steps: value.steps.filter((step) => step.id !== id) }))
  }

  async function share(targetScenarioIds: string[], sourceStepId?: string) {
    const [saved] = await Promise.all([flush(), evidenceQueue.current])
    if (!saved) throw new Error('Guarda el escenario antes de compartir su documentación.')
    await onShare(targetScenarioIds, sourceStepId)
    const count = targetScenarioIds.length
    setSharingNotice(`Documentación vinculada a ${count} ${count === 1 ? 'escenario' : 'escenarios'}.`)
  }

  async function unshare(link: DocumentationLink) {
    if (unlinking) return
    setUnlinking(true)
    setSharingError('')
    setSharingNotice('')
    try {
      await onUnshare(link)
      setSharingNotice('Vínculo eliminado.')
    } catch (failure) {
      setSharingError(errorMessage(failure, 'No fue posible quitar el vínculo.'))
    } finally {
      setUnlinking(false)
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setIsDragging(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void addFiles(files)
  }

  const navigationDisabled = leaving || Boolean(uploadProgress) || unlinking
  const saveStatus = status === 'saved' && evidenceWrites > 0 ? 'saving' : status
  const extraFields = Object.entries(draft.metadata).filter(([, value]) => value.trim())
  const { actualResult, comments } = withExecutionDefaults(draft)

  return <div className="scenario-editor">
    <button type="button" className="scenario-back" onClick={() => void navigate(onBack)} disabled={navigationDisabled}>
      <ChevronLeft size={18} aria-hidden="true" /> Escenarios
    </button>

    <header className="scenario-header">
      <div>
        <p className="scenario-identifier">{draft.sourceId || 'Escenario'}</p>
        <h1>{draft.title || 'Escenario sin título'}</h1>
        <div className="scenario-header-meta">
          {draft.component && <span>{draft.component}</span>}
          {draft.priority && <span>Prioridad {draft.priority.toLocaleLowerCase('es')}</span>}
        </div>
      </div>
      <div className={`scenario-save scenario-save--${saveStatus}`} role="status">
        {saveStatus === 'saving' && <><LoaderCircle className="scenario-spinner" size={16} aria-hidden="true" /> Guardando</>}
        {saveStatus === 'saved' && <><Check size={17} aria-hidden="true" /> Guardado localmente</>}
        {saveStatus === 'error' && <span>Error de almacenamiento</span>}
      </div>
    </header>
    {status === 'error' && <div className="scenario-error" role="alert">
      <span>{error}</span>
      {stepConflict
        ? <button type="button" className="button secondary" onClick={keepSavedSteps}>Usar los pasos guardados</button>
        : <button type="button" className="button secondary" onClick={() => void flush()}>Reintentar</button>}
    </div>}

    <div className="scenario-layout">
      <div className="scenario-editor-main">
        <section className="scenario-panel" aria-labelledby="scenario-results-title">
          <h2 id="scenario-results-title">Resultado de ejecución</h2>
          <div className="scenario-field-grid">
            <Field label="Estado de ejecución">
              <StatusSelect value={draft.executionStatus} onChange={(executionStatus) => update({ executionStatus })} />
            </Field>
            <Field label="Referencia del defecto">
              <input maxLength={MAX_TEXT_LENGTH} value={draft.defectRef} onChange={(event) => update({ defectRef: event.target.value })} placeholder="Por ejemplo, BUG-204" />
            </Field>
          </div>
          <Field label="Resultado obtenido">
            <ExecutionText value={actualResult} onChange={(value) => update({ actualResult: value })} rows={3} placeholder="Describe qué ocurrió durante la prueba." />
          </Field>
          <Field label="Comentarios">
            <ExecutionText value={comments} onChange={(value) => update({ comments: value })} rows={2} placeholder="Registra observaciones o motivos de bloqueo." />
          </Field>
        </section>

        <section className="scenario-panel" aria-labelledby="scenario-evidence-title">
          <div className="scenario-section-heading">
            <h2 id="scenario-evidence-title">Evidencias</h2>
            <div className="scenario-section-actions">
              <span className="scenario-count">{evidence.length} {evidence.length === 1 ? 'captura' : 'capturas'}</span>
              {targets.length > 0 && <button type="button" className="button secondary" onClick={() => {
                setSharingNotice('')
                setSharingError('')
                setSharing(true)
              }} disabled={navigationDisabled}>
                <Link2 size={17} aria-hidden="true" /> Compartir documentación
              </button>}
            </div>
          </div>
          {draft.steps.length > 0 && <Field label="Asociar nuevas capturas">
            <select value={uploadStep === null ? NO_UPLOAD_STEP : uploadStep ?? ''} onChange={(event) => {
              setUploadStep(event.target.value === NO_UPLOAD_STEP ? null : event.target.value || undefined)
            }} disabled={Boolean(uploadProgress)}>
              <option value="">Automática (siguiente paso)</option>
              <option value={NO_UPLOAD_STEP}>Escenario general (sin paso)</option>
              {draft.steps.map((step, index) => <option key={step.id} value={step.id}>Paso {index + 1}</option>)}
            </select>
          </Field>}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handleFiles} aria-label="Seleccionar archivos de evidencia" />
          <div className={`scenario-drop ${isDragging ? 'scenario-drop--active' : ''}`}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('Files')) return
              event.preventDefault()
              if (!uploadProgress) setIsDragging(true)
            }}
            onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsDragging(false) }}
            onDrop={handleDrop}>
            <span className="scenario-drop-icon">{uploadProgress ? <LoaderCircle className="scenario-spinner" size={23} aria-hidden="true" /> : <ImagePlus size={23} aria-hidden="true" />}</span>
            <strong>{uploadProgress || 'Pega o arrastra una captura aquí'}</strong>
            {!uploadProgress && <span>Ctrl / ⌘ + V · PNG, JPEG o WebP · hasta 25 MB por archivo</span>}
            <div>
              {!uploadProgress && <button type="button" className="button secondary" onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>}
              {uploadProgress && uploadProgress !== 'Guardando capturas' && <button type="button" className="button secondary" onClick={() => uploadController.current?.abort()}>Cancelar procesamiento</button>}
            </div>
            <span className="scenario-sr-only" role="status">{uploadProgress}</span>
          </div>
          {evidenceError && <div className="scenario-error" role="alert">
            <span>{evidenceError}</span>
            <button type="button" className="scenario-icon-button" aria-label="Cerrar mensaje" onClick={() => setEvidenceError('')}><X size={16} aria-hidden="true" /></button>
          </div>}
          {orderedEvidence.length > 0 && <ol className="scenario-evidence-list">
            {orderedEvidence.map((item, index) => <EvidenceCard key={item.id} item={item} index={index} total={orderedEvidence.length}
              steps={draft.steps} onPreview={() => setPreview(item)}
              onPatch={(changes) => queueEvidence(async () => {
                if (changes.stepId && !await flush()) throw new Error('Guarda el escenario antes de asociar capturas a un paso.')
                await onUpdateEvidence(item, changes)
              })}
              onMove={(direction) => { void queueEvidence(() => onMoveEvidence(item.id, direction)) }}
              onDelete={() => { void queueEvidence(() => onDeleteEvidence(item.id)) }} />)}
          </ol>}
        </section>

        {(sharedDocumentation.length > 0 || sharingNotice || sharingError) && <section className="scenario-panel" aria-labelledby="scenario-shared-title">
          <h2 id="scenario-shared-title">Documentación compartida</h2>
          {sharingNotice && <p className="scenario-share-feedback" role="status">{sharingNotice}</p>}
          {sharingError && <p className="scenario-error" role="alert">{sharingError}</p>}
          {sharedDocumentation.length > 0 && <ul className="scenario-shared-list">
            {sharedDocumentation.map((entry) => <LinkedDocumentation key={`${entry.link.sourceScenarioId}/${entry.link.sourceStepId ?? ''}`}
              entry={entry} busy={unlinking} onRemove={() => void unshare(entry.link)} onPreview={setPreview} />)}
          </ul>}
        </section>}

        <section className="scenario-panel" aria-labelledby="scenario-steps-title">
          <div className="scenario-section-heading">
            <h2 id="scenario-steps-title">Pasos de prueba</h2>
            <button type="button" className="button secondary" onClick={addStep} disabled={draft.steps.length >= MAX_STEPS}><Plus size={17} aria-hidden="true" /> Agregar paso</button>
          </div>
          <Field label="Pasos del guion">
            <textarea maxLength={MAX_TEXT_LENGTH} value={draft.detailedSteps} onChange={(event) => update({ detailedSteps: event.target.value })} rows={3} placeholder="Describe los pasos para ejecutar el escenario." />
          </Field>
          {draft.steps.map((step, index) => {
            const linked = evidence.some((item) => item.stepId === step.id)
            return <fieldset key={step.id} className="scenario-step">
              <legend>Paso {index + 1}</legend>
              <div className="scenario-field-grid">
                <Field label="Acción">
                  <textarea maxLength={MAX_TEXT_LENGTH} rows={2} value={step.action} onChange={(event) => updateStep(step.id, { action: event.target.value })} />
                </Field>
                <Field label="Resultado esperado">
                  <textarea maxLength={MAX_TEXT_LENGTH} rows={2} value={step.expectedResult} onChange={(event) => updateStep(step.id, { expectedResult: event.target.value })} />
                </Field>
                <Field label="Estado del paso">
                  <StatusSelect value={step.status} onChange={(status) => updateStep(step.id, { status })} />
                </Field>
                <Field label="Resultado del paso">
                  <input maxLength={MAX_TEXT_LENGTH} value={step.actualResult} onChange={(event) => updateStep(step.id, { actualResult: event.target.value })} />
                </Field>
              </div>
              <button type="button" className="button secondary scenario-delete" onClick={() => removeStep(step.id)}
                disabled={linked || Boolean(uploadProgress)}>
                <Trash2 size={16} aria-hidden="true" /> Eliminar paso
              </button>
              {linked && <span className="scenario-help">Reasigna las capturas de este paso para quitarlo.</span>}
            </fieldset>
          })}
        </section>
      </div>

      <aside className="scenario-side">
        <section className="scenario-panel" aria-labelledby="scenario-context-title">
          <h2 id="scenario-context-title"><ClipboardList size={20} aria-hidden="true" /> Ficha del escenario</h2>
          <Field label="Nombre del escenario">
            <input maxLength={MAX_TEXT_LENGTH} value={draft.title} onChange={(event) => update({ title: event.target.value })} />
          </Field>
          <div className="scenario-field-grid">
            <Field label="Identificador">
              <input maxLength={MAX_TEXT_LENGTH} value={draft.sourceId} onChange={(event) => update({ sourceId: event.target.value })} />
            </Field>
            <Field label="Prioridad">
              <input maxLength={MAX_TEXT_LENGTH} value={draft.priority} onChange={(event) => update({ priority: event.target.value })} />
            </Field>
          </div>
          <Field label="Componente">
            <input maxLength={MAX_TEXT_LENGTH} value={draft.component} onChange={(event) => update({ component: event.target.value })} />
          </Field>
          <Field label="Objetivo">
            <textarea maxLength={MAX_TEXT_LENGTH} value={draft.objective} onChange={(event) => update({ objective: event.target.value })} rows={2} />
          </Field>
          <Field label="Resultado esperado del escenario">
            <textarea maxLength={MAX_TEXT_LENGTH} value={draft.expectedResult} onChange={(event) => update({ expectedResult: event.target.value })} rows={3} />
          </Field>
          <label className="scenario-check">
            <input type="checkbox" checked={draft.evidenceRequired} onChange={(event) => update({ evidenceRequired: event.target.checked })} />
            <span>Requiere evidencia para documentar</span>
          </label>
        </section>
        {extraFields.length > 0 && <details className="scenario-panel scenario-metadata">
          <summary><FileImage size={18} aria-hidden="true" /> Datos del guion importado</summary>
          <dl>
            {extraFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </details>}
      </aside>
    </div>

    {(onPrevious || onNext) && <nav className="scenario-pagination" aria-label="Navegar entre escenarios">
      {onPrevious && <button type="button" className="button secondary" onClick={() => void navigate(onPrevious)} disabled={navigationDisabled}>
        <ChevronLeft size={17} aria-hidden="true" /> Escenario anterior
      </button>}
      {onNext && <button type="button" className="button secondary scenario-next" onClick={() => void navigate(onNext)} disabled={navigationDisabled}>
        Siguiente escenario <ChevronRight size={17} aria-hidden="true" />
      </button>}
    </nav>}
    {preview && <EvidencePreview key={preview.id} item={preview} onClose={() => setPreview(undefined)} />}
    {sharing && <ShareDocumentationDialog source={draft} targets={targets} onShare={share} onClose={() => setSharing(false)} />}
  </div>
}

export function ScenarioEditor(props: ScenarioEditorProps) {
  return <ScenarioEditorView key={props.scenario.id} {...props} />
}
