import { createRoot } from 'react-dom/client'
import '../style.css'
import { registerPwa } from '../register-pwa'
import { QA_DOCUMENTADOR } from '../site-paths'
import { TafHome } from './TafHome'

const { hash, search } = window.location
const previousDocumentadorLink = /^#\/(?:import|project\/[\w-]+(?:\/scenario\/[\w-]+)?)$/.test(hash)

if (previousDocumentadorLink) {
  window.location.replace(`${QA_DOCUMENTADOR}${search}${hash}`)
} else {
  const root = document.getElementById('root')
  if (root) createRoot(root).render(<TafHome />)
  registerPwa()
}
