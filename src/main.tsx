import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { KortProvider } from './lib/store'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <KortProvider>
        <AvisosProvider>
          <App />
        </AvisosProvider>
      </KortProvider>
    </BrowserRouter>
  </StrictMode>,
)
