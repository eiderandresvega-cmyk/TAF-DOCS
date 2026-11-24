import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App'
import { registerPwa } from './register-pwa'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)

registerPwa()
