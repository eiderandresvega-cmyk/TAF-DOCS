import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { liveQuery } from 'dexie'
import { ArchiveRestore, ArrowUpRight, Download, FilePlus2, FileSpreadsheet, FolderOpen, HardDrive, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Dashboard } from './Dashboard'
import { ImportScreen } from './ImportScreen'
import { ScenarioEditor } from './evidence/ScenarioEditor'
import { demoDetails, demoScenarios } from './demo'
import { emptyDetails, type Project, type ProjectBundle } from './model'
import * as storage from './storage'
import { BrandMark, DetailsFields, FileDrop, LocalBadge, Modal, ReportPreview } from './ui'
import { TAF_HOME } from './site-paths'

function subscribeRoute(update: () => void) {
  window.addEventListener('hashchange', update)
  return () => window.removeEventListener('hashchange', update)
}

function getRoute() { return window.location.hash.slice(1) || '/' }
function navigate(path: string) { if (path !== getRoute()) window.location.hash = path }
const projectPath = (id: string) => `/project/${id}`
const scenarioPath = (project: string, scenario: string) => `${projectPath(project)}/scenario/${scenario}`

function Home({ openProject }: { openProject: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>()
  const [dialog, setDialog] = useState<'new' | 'backup'>()
  const [details, setDetails] = useState(emptyDetails)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storageStatus, setStorageStatus] = useState('')
  const [quota, setQuota] = useState<number>()

  useEffect(() => {
    const subscription = liveQuery(storage.listProjects).subscribe({ next: setProjects, error: (failure) => setError(storage.storageMessage(failure)) })
    navigator.storage?.estimate?.().then(({ usage, quota: capacity }) => {
      if (usage && capacity) setQuota(Math.round(usage / capacity * 100))
    }).catch(() => {})
    return () => subscription.unsubscribe()
  }, [])

  async function act(task: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await task() } catch (failure) { setError(storage.storageMessage(failure)) }
    finally { setBusy(false) }
  }

  function newProject(event: FormEvent) {
    event.preventDefault()
    const cleaned = { ...details, title: details.title.trim(), qaOwner: details.qaOwner.trim(), poOwner: details.poOwner.trim() }
    if (!cleaned.title || !cleaned.qaOwner || !cleaned.poOwner) { setError('Completa el proyecto y sus responsables para continuar.'); return }
    void act(async () => { openProject(await storage.createProject(cleaned, [], 'manual')) })
  }

  function demo() {
    const existing = projects?.find((project) => project.source === 'demo')
    if (existing) { openProject(existing.id); return }
    void act(async () => { openProject(await storage.createProject(demoDetails, demoScenarios, 'demo')) })
  }

  return <main className="shell home">
    <section className="hero" aria-labelledby="home-title">
      <div className="hero-copy"><h1 id="home-title">Documenta tus<br className="hero-break" /> <span>pruebas QA.</span></h1>
        <p>Convierte tus test scripts y capturas en un informe PDF listo para compartir. Todo se procesa en tu navegador.</p>
        <div className="actions hero-actions"><button className="button primary" disabled={busy} onClick={() => navigate('/import')}><FileSpreadsheet size={19} /> Con Test Scripts</button><button className="button secondary" disabled={busy} onClick={() => { setDetails(emptyDetails()); setError(''); setDialog('new') }}><FilePlus2 size={19} /> Iniciar de cero</button></div>
        <div className="hero-links"><button className="text-button" disabled={busy || !projects} onClick={demo}>Abrir proyecto de ejemplo <ArrowUpRight size={15} /></button><button className="text-button" onClick={() => void act(async () => { await (await import('./excel')).downloadTemplate() })} disabled={busy}><Download size={16} /> Plantilla Excel</button></div>
      </div>
      <ReportPreview />
    </section>
    {error && !dialog && <p className="message error" role="alert">{error}</p>}
    {quota !== undefined && quota >= 80 && <p className="message notice" role="status">El almacenamiento estimado está al {quota} %. Exporta una copia de tus proyectos.</p>}
    <section className="local-projects" aria-labelledby="local-projects-title">
      <div className="section-heading"><div><h2 id="local-projects-title">Mis proyectos</h2>{projects && <span className="muted">{projects.length} de 3</span>}</div><button className="button secondary" disabled={busy} onClick={() => { setError(''); setDialog('backup') }}><ArchiveRestore size={17} /> Importar copia</button></div>
      {projects?.length ? <ul className="project-list">{projects.map((project) => <li key={project.id}>
        <button className="project-row surface" onClick={() => openProject(project.id)}><span className="feature-icon"><FolderOpen size={21} /></span><span className="project-row-title"><strong>{project.title}</strong><small>{project.qaOwner}</small></span><span className="project-updated"><small>Última edición</small>{new Date(project.updatedAt).toLocaleDateString('es-CO', { dateStyle: 'medium' })}</span><ArrowUpRight size={18} /></button>
      </li>)}</ul> : projects ? <div className="empty surface"><FolderOpen size={28} /><strong>Aún no tienes proyectos</strong><p>Crea uno, importa un Excel o usa el proyecto de ejemplo.</p></div> : !error && <p role="status" className="loading muted"><LoaderCircle className="spin" size={18} /> Abriendo almacenamiento local…</p>}
      <div className="storage-tip"><HardDrive size={18} /><span>{storageStatus || 'Los proyectos viven en este navegador. Exporta una copia para conservarlos.'}</span><button className="text-button" onClick={async () => {
        try {
          const granted = await navigator.storage?.persist?.()
          setStorageStatus(granted ? 'El navegador concedió almacenamiento persistente.' : 'El navegador no concedió persistencia. Guarda copias de respaldo.')
        } catch { setStorageStatus('La persistencia no está disponible en este navegador.') }
      }}>Solicitar persistencia</button></div>
    </section>
    {dialog === 'new' && <Modal title="Iniciar proyecto de cero" close={() => { setDialog(undefined); setError('') }} busy={busy}>
      <form onSubmit={newProject}><DetailsFields details={details} onChange={setDetails} />{error && <p className="message error" role="alert">{error}</p>}<div className="actions modal-actions"><button className="button primary" disabled={busy}>{busy ? 'Creando…' : 'Crear proyecto'}</button></div></form>
    </Modal>}
    {dialog === 'backup' && <Modal title="Importar copia de respaldo" close={() => { setDialog(undefined); setError('') }} busy={busy}>
      <p className="muted">Recupera un archivo .tafproject exportado desde TAF Docs.</p>
      <FileDrop accept=".tafproject" label={busy ? 'Verificando la copia…' : 'Arrastra tu copia aquí'} disabled={busy} onFile={(file) => void act(async () => {
        const bundle = await (await import('./exports/backup')).readBackup(file)
        openProject(await storage.restoreProject(bundle))
      })} />
      {error && <p className="message error" role="alert">{error}</p>}
    </Modal>}
  </main>
}

function ProjectScreen({ projectId, scenarioId }: { projectId: string; scenarioId?: string }) {
  const [bundle, setBundle] = useState<ProjectBundle | null>()
  const [error, setError] = useState('')
  useEffect(() => {
    const subscription = liveQuery(() => storage.getBundle(projectId)).subscribe({ next: (data) => setBundle(data ?? null), error: (failure) => setError(storage.storageMessage(failure)) })
    return () => subscription.unsubscribe()
  }, [projectId])
  const goHome = () => navigate('/')
  const openScenario = (id: string) => navigate(scenarioPath(projectId, id))
  const goProject = () => navigate(projectPath(projectId))

  if (!bundle) return <main className="shell screen">
    {error ? <p className="message error" role="alert">{error}</p> : bundle === null ? <h1>Proyecto no encontrado en este navegador</h1> : <p className="loading muted" role="status"><LoaderCircle className="spin" size={19} /> Abriendo proyecto…</p>}
    <button className="button secondary" onClick={goHome}>Volver a proyectos</button>
  </main>
  if (!scenarioId) return <Dashboard bundle={bundle} goHome={goHome} openScenario={openScenario} />
  const { scenarios, evidence } = bundle
  const index = scenarios.findIndex((item) => item.id === scenarioId)
  const scenario = scenarios[index]
  if (!scenario) return <main className="shell screen"><h1>Escenario no encontrado</h1><button className="button secondary" onClick={goProject}>Volver a escenarios</button></main>

  return <main className="shell screen scenario-screen"><ScenarioEditor scenario={scenario} evidence={evidence.filter((item) => item.scenarioId === scenario.id)}
    onSave={storage.updateScenario} onAdd={(images) => storage.addEvidence(scenario, images)} onUpdateEvidence={storage.updateEvidence}
    onMoveEvidence={(id, direction) => storage.moveEvidence(scenario, id, direction)} onDeleteEvidence={(id) => storage.deleteEvidence(scenario, id)}
    onBack={goProject} onPrevious={index > 0 ? () => openScenario(scenarios[index - 1].id) : undefined}
    onNext={index < scenarios.length - 1 ? () => openScenario(scenarios[index + 1].id) : undefined} /></main>
}

export default function App() {
  const route = useSyncExternalStore(subscribeRoute, getRoute)
  const match = /^\/project\/([\w-]+)(?:\/scenario\/([\w-]+))?$/.exec(route)
  const openProject = (id: string) => navigate(projectPath(id))
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [route])
  const brand = <><BrandMark /><span>TAF<span className="brand-sub"> Docs</span></span></>
  return <>
    <header className="topbar"><div className="shell top-inner">
      {match?.[2] ? <div className="brand">{brand}</div> : <a className="brand" href={TAF_HOME} aria-label="Inicio TAF">{brand}</a>}
      <div className="top-status">{offline && <span className="offline-badge" role="status">Sin conexión</span>}<LocalBadge /></div>
    </div></header>
    {match ? <ProjectScreen key={match[1]} projectId={match[1]} scenarioId={match[2]} /> : route === '/import' ? <ImportScreen goHome={() => navigate('/')} openProject={openProject} /> : <Home openProject={openProject} />}
    <footer className="footer"><div className="shell"><span>TAF Docs</span><span><ShieldCheck size={15} /> Procesamiento local de archivos</span></div></footer>
  </>
}
