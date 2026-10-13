import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { KortProvider } from './lib/store'
import { SessaoProvider } from './lib/sessao'
import { AvisosProvider } from './components/avisos'
import App from './App'

import '@fontsource-variable/big-shoulders-display'
import '@fontsource-variable/schibsted-grotesk'
import './styles/base.css'
import './styles/componentes.css'
import './styles/app.css'
import './styles/agenda.css'
import './styles/publico.css'
import './styles/site.css'
import './styles/movimento.css'

// Tela travada em 100% no celular: o Safari do iPhone ignora o
// user-scalable=no do viewport, então a pinça e o toque duplo são barrados aqui.
const travar = (e: Event) => e.preventDefault()
document.addEventListener('gesturestart', travar, { passive: false })
document.addEventListener('gesturechange', travar, { passive: false })
document.addEventListener('gestureend', travar, { passive: false })
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })
let ultimoToque = 0
document.addEventListener('touchend', (e) => {
  const agora = Date.now()
  const alvo = e.target as HTMLElement | null
  const campo = alvo?.closest('input, textarea, select, [contenteditable="true"]')
  if (!campo && agora - ultimoToque < 300) e.preventDefault()
  ultimoToque = agora
}, { passive: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessaoProvider>
        <KortProvider>
          <AvisosProvider>
            <App />
          </AvisosProvider>
        </KortProvider>
      </SessaoProvider>
    </BrowserRouter>
  </StrictMode>,
)
