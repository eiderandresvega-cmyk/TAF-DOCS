import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
