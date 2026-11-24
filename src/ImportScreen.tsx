import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { type ImportResult } from './excel'
import type { ProjectDetails } from './model'
import { createProject, storageMessage } from './storage'
import { DetailsFields, FileDrop } from './ui'

export function ImportScreen({ goHome, openProject }: { goHome: () => void; openProject: (id: string) => void }) {
  const [result, setResult] = useState<ImportResult>()
  const [details, setDetails] = useState<ProjectDetails>()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [creating, setCreating] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function select(file: File) {
    controller.current?.abort()
    const task = new AbortController()
    controller.current = task
    setError(''); setResult(undefined); setName(file.name); setWorking(true)
    try {
      const { parseExcel } = await import('./excel')
      if (task.signal.aborted) return
      const parsed = await parseExcel(file, task.signal)
      if (task.signal.aborted) return
      setResult(parsed); setDetails(parsed.details)
    } catch (failure) {
      if (!task.signal.aborted) setError(storageMessage(failure))
    } finally {
      if (controller.current === task) { controller.current = null; setWorking(false) }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!result || !details || creating) return
    const cleaned = { ...details, title: details.title.trim(), qaOwner: details.qaOwner.trim(), poOwner: details.poOwner.trim() }
    if (!cleaned.title || !cleaned.qaOwner || !cleaned.poOwner) { setError('Completa el proyecto y sus responsables para continuar.'); return }
    setCreating(true); setError('')
    try { openProject(await createProject(cleaned, result.scenarios, 'xlsx')) }
    catch (failure) { setError(storageMessage(failure)); setCreating(false) }
  }

  return <main className="shell narrow screen">
    <button className="text-button back" onClick={goHome}><ArrowLeft size={17} /> Proyectos</button>
    <div className="screen-title"><span className="feature-icon"><FileSpreadsheet size={25} /></span><h1>Importar Test Script</h1><p>Agrega un Excel con la hoja Escenarios para crear tu proyecto de pruebas.</p></div>
    {error && <p className="message error" role="alert">{error}</p>}
    {working ? <div className="surface validating" role="status"><LoaderCircle className="spin" size={30} /><h2>Validando Excel</h2><p className="muted">{name}</p><button className="button secondary" onClick={() => { controller.current?.abort(); controller.current = null; setWorking(false) }}>Cancelar</button></div> : result && details ?
      <form className="surface panel import-result" onSubmit={submit}>
        <div className="result-title"><CheckCircle2 size={25} /><div><h2>Test Script listo</h2><p className="muted">{name}</p></div></div>
        <div className="import-counts"><span><b>{result.scenarios.length}</b> escenarios</span><span><b>{result.columnCount}</b> columnas válidas</span><span><b>{result.headerRow}</b> fila de encabezados</span></div>
        {result.warnings.length > 0 && <details className="message notice" open><summary>{result.warnings.length} advertencias de importación</summary><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        <DetailsFields details={details} onChange={setDetails} />
        <div className="actions modal-actions"><button type="button" className="button secondary" disabled={creating} onClick={() => { setResult(undefined); setError('') }}>Elegir otro archivo</button><button className="button primary" disabled={creating}>{creating ? 'Creando…' : 'Crear proyecto'}</button></div>
      </form> : <><FileDrop accept=".xlsx" label="Arrastra tu archivo Excel aquí" onFile={select} /><div className="import-foot"><span className="muted">Formato XLSX · Procesamiento local</span><button className="text-button" onClick={async () => {
        try { await (await import('./excel')).downloadTemplate() } catch (failure) { setError(storageMessage(failure)) }
      }}><Download size={16} /> Descargar plantilla Excel</button></div></>}
  </main>
}
