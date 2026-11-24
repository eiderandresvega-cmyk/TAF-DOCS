import './style.css'
import { applyPwaUpdate } from './register-pwa'
import { QA_DOCUMENTADOR } from './site-paths'

const button = document.querySelector<HTMLButtonElement>('#update-app')
const status = document.getElementById('update-status')
const fallback = document.getElementById('update-fallback')

if (button && status && fallback) {
  button.addEventListener('click', async () => {
    button.disabled = true
    fallback.hidden = true
    status.hidden = false
    status.textContent = 'Buscando la versión publicada…'
    try {
      await applyPwaUpdate()
      window.location.replace(QA_DOCUMENTADOR)
    } catch {
      status.textContent = 'La actualización no terminó. Puedes abrir el importador publicado o volver a intentarlo.'
      fallback.hidden = false
      button.disabled = false
    }
  })
}
