import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

interface Aviso {
  id: number
  texto: string
}

const Ctx = createContext<(texto: string) => void>(() => {})

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const avisar = useCallback((texto: string) => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a.slice(-2), { id, texto }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div className="aviso" key={a.id}>
            <span className="ico">
              <Check />
            </span>
            {a.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useAvisar = () => useContext(Ctx)
