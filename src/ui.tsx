import { useEffect, useRef, type ReactNode } from 'react'
import { Check, FileText, ShieldCheck, X } from 'lucide-react'
import type { ProjectDetails } from './model'

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><Check size={18} strokeWidth={3} /></span>
}

export function LocalBadge() {
  return <span className="local-badge"><ShieldCheck size={15} /> Datos en este navegador</span>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status === 'Passed' ? 'status-pass' : status === 'Failed' ? 'status-fail' : status === 'En progreso' ? 'status-progress' : status === 'Bloqueado' ? 'status-blocked' : ''}`}><span />{status}</span>
}

export function ReportPreview() {
  return <div className="report-preview" aria-hidden="true">
    <div className="report-orbit orbit-one" /><div className="report-orbit orbit-two" />
    <div className="preview-card">
      <div className="preview-head"><div className="preview-icon"><FileText size={19} /></div><div><b>Informe de pruebas</b><small>Documentación QA</small></div><span>PDF</span></div>
      <div className="preview-results"><div><span>Ejecución</span><b>67%</b><i><em style={{ width: '67%' }} /></i></div><div><span>Documentación</span><b>33%</b><i><em style={{ width: '33%' }} /></i></div></div>
      <div className="preview-row"><span>UAT-001</span><span>Registro de pago</span><StatusBadge status="Passed" /></div>
      <div className="preview-row"><span>UAT-002</span><span>Validación de importe</span><StatusBadge status="Passed" /></div>
      <div className="preview-row"><span>UAT-003</span><span>Historial</span><StatusBadge status="En progreso" /></div>
    </div>
  </div>
}

export function Modal({ title, children, close, busy = false }: { title: string; children: ReactNode; close: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Cerrar" disabled={busy} onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>
}

export function DetailsFields({ details, onChange }: { details: ProjectDetails; onChange: (details: ProjectDetails) => void }) {
  const field = (name: keyof ProjectDetails, label: string, required = false, type = 'text') => <label key={name}>
    {label}{required && <span className="required" aria-hidden="true"> *</span>}
    <input type={type} required={required} maxLength={180} value={details[name]} onChange={(event) => onChange({ ...details, [name]: event.currentTarget.value })} />
  </label>
  return <div className="form-grid">
    <div className="span-two">{field('title', 'Nombre del proyecto', true)}</div>
    {field('qaOwner', 'QA responsable', true)}{field('poOwner', 'Responsable de producto', true)}
    {field('country', 'País')}{field('reportDate', 'Fecha del informe', false, 'date')}
    <div className="span-two">{field('authorization', 'Referencia de autorización')}</div>
  </div>
}

export function FileDrop({ accept, label, disabled, onFile }: { accept: string; label: string; disabled?: boolean; onFile: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  return <div ref={box} className="file-drop"
    onDragOver={(event) => { event.preventDefault(); if (!disabled) box.current?.classList.add('dragging'); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy' }}
    onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) box.current?.classList.remove('dragging') }}
    onDrop={(event) => { event.preventDefault(); box.current?.classList.remove('dragging'); const file = event.dataTransfer.files[0]; if (file && !disabled) onFile(file) }}>
    <span className="feature-icon"><FileText size={23} /></span>
    <strong>{label}</strong><span className="muted">o selecciona un archivo de tu equipo</span>
    <button type="button" className="button secondary" disabled={disabled} onClick={() => ref.current?.click()}>Seleccionar archivo</button>
    <input ref={ref} type="file" accept={accept} hidden disabled={disabled} onChange={(event) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file) onFile(file)
    }} />
  </div>
}
