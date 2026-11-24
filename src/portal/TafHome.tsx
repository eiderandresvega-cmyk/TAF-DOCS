import { ClipboardCheck, type LucideIcon } from 'lucide-react'
import { QA_DOCUMENTADOR } from '../site-paths'
import { BrandMark } from '../ui'
import './taf-home.css'

type TafProject = {
  title: string
  description: string
  category: string
  href: string
  icon: LucideIcon
}

const projects: readonly TafProject[] = [
  {
    title: 'Documentador QA',
    description: 'Importa escenarios de Excel, registra evidencias de prueba y genera informes PDF.',
    category: 'Calidad de software',
    href: QA_DOCUMENTADOR,
    icon: ClipboardCheck,
  },
]

export function TafHome() {
  return <div className="taf-portal">
    <header className="taf-portal-header">
      <div className="shell taf-portal-brand"><BrandMark /><span>TAF</span></div>
    </header>
    <main className="shell taf-portal-main">
      <div className="taf-portal-intro">
        <h1>Proyectos TAF</h1>
        <p>Herramientas de automatización para el trabajo diario.</p>
      </div>
      <ul className="taf-project-grid" aria-label="Proyectos disponibles" role="list">
        {projects.map(({ title, description, category, href, icon: Icon }) => <li key={href}>
          <a className="taf-project" href={href} aria-label={title}>
            <div className="taf-project-icon" aria-hidden="true"><Icon size={26} strokeWidth={1.8} /></div>
            <span className="taf-project-category">{category}</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="taf-project-action" aria-hidden="true">Abrir herramienta</span>
          </a>
        </li>)}
      </ul>
    </main>
  </div>
}
