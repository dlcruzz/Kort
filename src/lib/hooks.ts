import { useEffect, useState } from 'react'

/** true quando a tela tem até `px` de largura */
export function useTelaPequena(px = 900) {
  const consulta = `(max-width: ${px}px)`
  const [peq, setPeq] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const fn = () => setPeq(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [consulta])
  return peq
}

/** Re-renderiza a cada minuto (para a linha do "agora" andar) */
export function useMinuto() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  return agora
}
