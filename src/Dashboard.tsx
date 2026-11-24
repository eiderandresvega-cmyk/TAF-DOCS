import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Camera, ChartNoAxesColumnIncreasing, CheckCircle2, Download, FileDown, FileText, LayoutGrid, List, Plus, Search, Settings2, Trash2 } from 'lucide-react'
import { emptyScenario, isDocumented, progressFor, statuses, type ProjectBundle, type ProjectDetails } from './model'
import { addScenario, deleteProject, getBundle, storageMessage, updateProject } from './storage'
import { DetailsFields, Modal, StatusBadge } from './ui'

function Meter({ label, value, count, total, kind }: { label: string; value: number; count: number; total: number; kind: 'run' | 'docs' }) {
  return <div className={`meter-card surface ${kind}`}>
    <div className="meter-label"><span className="feature-icon">{kind === 'run' ? <ChartNoAxesColumnIncreasing size={19} /> : <FileText size={19} />}</span><h2>{label}</h2></div>
    <div className="meter-value"><strong>{value}%</strong><span>{count} de {total} escenarios</span></div>
    <progress value={value} max={100} aria-label={label} />
  </div>
}

export function Dashboard({ bundle, goHome, openScenario }: { bundle: ProjectBundle; goHome: () => void; openScenario: (id: string) => void }) {
  const { project, scenarios, evidence } = bundle
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [modal, setModal] = useState<'export' | 'settings' | 'scenario'>()
  const [details, setDetails] = useState<ProjectDetails>(project)
  const [draft, setDraft] = useState(emptyScenario)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [backupReminder, setBackupReminder] = useState(false)
  const stats = useMemo(() => progressFor(scenarios, evidence), [scenarios, evidence])
  const evidenceByScenario = useMemo(() => {
    const items = new Map<string, typeof evidence>()
    for (const item of evidence) {
      const group = items.get(item.scenarioId) ?? []
      group.push(item)
      items.set(item.scenarioId, group)
    }
    return items
  }, [evidence])
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const needle = normalize(query.trim())
  const filtered = scenarios.filter((scenario) => (!status || scenario.executionStatus === status) &&
    (!priority || scenario.priority === priority) && normalize(`${scenario.sourceId} ${scenario.title} ${scenario.component} ${scenario.objective}`).includes(needle))
  const priorities = [...new Set(scenarios.map((scenario) => scenario.priority).filter(Boolean))]
  const age = (Date.now() - Date.parse(project.createdAt)) / 86_400_000

  function close() { setModal(undefined); setError(''); setConfirmDelete(false) }
  function open(value: typeof modal) { setError(''); setNotice(''); setModal(value) }
  async function act(task: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await task() } catch (failure) { setError(storageMessage(failure)) }
    finally { setBusy(false) }
  }

  async function backup() {
    await act(async () => { await (await import('./exports/backup')).downloadBackup(await latestBundle()); setNotice('Copia del proyecto descargada.') })
  }

  async function latestBundle() {
    const latest = await getBundle(project.id)
    if (!latest) throw new Error('Este proyecto ya no existe.')
    return latest
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const sourceId = draft.sourceId.trim()
    const title = draft.title.trim()
    if (!sourceId || !title) { setError('Escribe un ID y un nombre para el escenario.'); return }
    void act(async () => { const id = await addScenario(project.id, { ...draft, sourceId, title }); close(); openScenario(id) })
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault()
    const cleaned = { ...details, title: details.title.trim(), qaOwner: details.qaOwner.trim(), poOwner: details.poOwner.trim() }
    if (!cleaned.title || !cleaned.qaOwner || !cleaned.poOwner) { setError('Completa el proyecto y sus responsables para continuar.'); return }
    void act(async () => { await updateProject(project.id, cleaned); close(); setNotice('Datos del proyecto guardados.') })
  }

  return <main className="shell screen dashboard">
    <button className="text-button back" onClick={goHome}><ArrowLeft size={17} /> Proyectos</button>
    <section className="project-top">
      <div><h1>{project.title}</h1><div className="project-meta"><span>QA <b>{project.qaOwner}</b></span><span>Producto <b>{project.poOwner}</b></span>{project.country && <span>{project.country}</span>}</div></div>
      <div className="actions project-actions"><button className="button secondary" disabled={busy} onClick={() => { setDetails(project); open('settings') }}><Settings2 size={17} /> Ajustes</button><button className="button secondary" disabled={busy} onClick={backup}><Download size={17} /> Copia de respaldo</button><button className="button primary" disabled={busy} onClick={() => open('export')}><FileDown size={18} /> Exportar PDF</button></div>
    </section>
    {notice && <p className="message success" role="status"><CheckCircle2 size={18} />{notice}</p>}
    {error && !modal && <p className="message error" role="alert">{error}</p>}
    {age >= 11 && !backupReminder && <div className="message notice retention"><div><strong>{age >= 14 ? 'Este proyecto tiene 14 días o más.' : 'Este proyecto se acerca a los 14 días.'}</strong><p>Exporta una copia para recuperar tus archivos si se borra el almacenamiento del navegador.</p></div><div className="actions"><button className="button secondary" onClick={backup} disabled={busy}>Exportar copia</button><button className="text-button" onClick={() => setBackupReminder(true)}>Continuar</button></div></div>}
    <div className="meters"><Meter label="Ejecución" count={stats.executed} total={stats.total} value={stats.execution} kind="run" /><Meter label="Documentación" count={stats.documented} total={stats.total} value={stats.documentation} kind="docs" /></div>
    <section aria-labelledby="scenarios-title">
      <div className="section-heading"><div><h2 id="scenarios-title">Escenarios</h2><span className="muted">{filtered.length} de {scenarios.length}</span></div><button className="button secondary" onClick={() => { setDraft(emptyScenario()); open('scenario') }}><Plus size={18} /> Agregar escenario</button></div>
      {scenarios.length > 0 && <div className="filters">
        <label className="search"><Search size={18} /><input aria-label="Buscar escenarios" placeholder="Buscar por ID, nombre o componente" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por prioridad" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas las prioridades</option>{priorities.map((item) => <option key={item}>{item}</option>)}</select>
        <div className="view-switch" aria-label="Vista de escenarios"><button className="icon-button" aria-label="Vista de tarjetas" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={18} /></button><button className="icon-button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={20} /></button></div>
      </div>}
      {filtered.length ? <ul className={`scenario-list ${view}`}>
        {filtered.map((scenario) => {
          const attachments = evidenceByScenario.get(scenario.id) ?? []
          return <li key={scenario.id}><button className="scenario-card surface" onClick={() => openScenario(scenario.id)}>
            <div className="scenario-head"><span className="scenario-id">{scenario.sourceId}</span><StatusBadge status={scenario.executionStatus} /></div>
            <span className="scenario-main"><strong>{scenario.title}</strong>{scenario.component && <span>{scenario.component}</span>}</span>
            <div className="scenario-foot"><span>{scenario.priority ? `Prioridad ${scenario.priority}` : 'Sin prioridad'}</span><span><Camera size={15} /> {attachments.length}</span>{isDocumented(scenario, attachments) && <span className="documented"><CheckCircle2 size={15} /> Documentado</span>}</div>
          </button></li>
        })}
      </ul> : <div className="empty surface"><FileText size={27} /><strong>{scenarios.length ? 'No hay coincidencias' : 'Todavía no hay escenarios'}</strong><p>{scenarios.length ? 'Cambia la búsqueda o los filtros.' : 'Agrega un escenario para empezar a documentar tus pruebas.'}</p></div>}
    </section>
    {modal === 'export' && <Modal title="Exportar documentación" close={close} busy={busy}>
      <p className="muted">El informe contiene todos los escenarios, sus resultados y las evidencias guardadas.</p>
      <div className="export-stats"><div><strong>{stats.total}</strong><span>Escenarios</span></div><div><strong>{stats.executed}</strong><span>Ejecutados</span></div><div><strong>{stats.documented}</strong><span>Documentados</span></div><div><strong>{stats.total - stats.documented}</strong><span>Pendientes</span></div></div>
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="actions modal-actions"><button className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy} onClick={() => void act(async () => { await (await import('./exports/pdf')).downloadPdf(await latestBundle()); close(); setNotice('Informe PDF descargado.') })}><FileDown size={17} /> {busy ? 'Generando…' : 'Descargar PDF'}</button></div>
    </Modal>}
    {modal === 'settings' && <Modal title="Ajustes del proyecto" close={close} busy={busy}>
      <form onSubmit={saveDetails}><DetailsFields details={details} onChange={setDetails} />{error && <p className="message error" role="alert">{error}</p>}
        <div className="actions modal-actions"><button className="button primary" disabled={busy}>Guardar cambios</button></div>
      </form>
      <div className="danger-zone">{confirmDelete ? <><p>Se eliminarán de este navegador el proyecto, sus escenarios y sus capturas.</p><div className="actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Conservar</button><button className="button danger" disabled={busy} onClick={() => void act(async () => { await deleteProject(project.id); goHome() })}>Confirmar eliminación</button></div></> : <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={17} /> Eliminar proyecto local</button>}</div>
    </Modal>}
    {modal === 'scenario' && <Modal title="Agregar escenario" close={close} busy={busy}>
      <form onSubmit={add}>
        <div className="form-grid"><label>ID del escenario<input required maxLength={60} placeholder="UAT-001" value={draft.sourceId} onChange={(event) => setDraft({ ...draft, sourceId: event.target.value })} /></label><label>Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="">Seleccionar</option><option>Alta</option><option>Media</option><option>Baja</option></select></label><label className="span-two">Nombre del escenario<input required maxLength={180} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="span-two">Resultado esperado<textarea rows={3} value={draft.expectedResult} onChange={(event) => setDraft({ ...draft, expectedResult: event.target.value })} /></label></div>
        {error && <p className="message error" role="alert">{error}</p>}
        <div className="actions modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy}>Guardar escenario</button></div>
      </form>
    </Modal>}
  </main>
}
