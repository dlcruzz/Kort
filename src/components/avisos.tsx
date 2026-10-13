import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

type Tipo = 'ok' | 'erro'

interface Aviso {
  id: number
  texto: string
  tipo: Tipo
}

const EVENTO = 'kort-aviso'

/** Para quem está fora da árvore do React (ex.: a fila de gravação do store). */
export function avisarGlobal(texto: string, tipo: Tipo = 'ok') {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { texto, tipo } }))
}

const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => {})

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const avisar = useCallback((texto: string, tipo: Tipo = 'ok') => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a.slice(-2), { id, texto, tipo }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 6000 : 3200)
  }, [])

  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ texto: string; tipo: Tipo }>).detail
      avisar(d.texto, d.tipo)
    }
    window.addEventListener(EVENTO, f)
    return () => window.removeEventListener(EVENTO, f)
  }, [avisar])

  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div className={`aviso${a.tipo === 'erro' ? ' aviso-erro' : ''}`} key={a.id}>
            <span className="ico">{a.tipo === 'erro' ? <AlertTriangle /> : <Check />}</span>
            {a.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useAvisar = () => useContext(Ctx)
