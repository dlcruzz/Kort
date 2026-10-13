// Movimento: contadores, revelar ao rolar e utilidades.
// Tudo respeita "reduzir movimento" do sistema: nesse caso o valor final
// aparece direto, sem animação.

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'

export const reduzMovimento = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const suave = (t: number) => 1 - Math.pow(1 - t, 3)

/** Anima um número de `de` até `ate` em `ms`. */
export function useContagem(ate: number, ms = 700, de = 0) {
  const [v, setV] = useState(reduzMovimento() ? ate : de)
  const anterior = useRef(de)
  useEffect(() => {
    if (reduzMovimento()) {
      setV(ate)
      return
    }
    const inicio = performance.now()
    const origem = anterior.current
    let raf = 0
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / ms)
      setV(origem + (ate - origem) * suave(t))
      if (t < 1) raf = requestAnimationFrame(passo)
      else anterior.current = ate
    }
    raf = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(raf)
      anterior.current = ate
    }
  }, [ate, ms])
  return v
}

/**
 * Recebe um texto já formatado ("R$ 1.834,98", "7%", "12 dias") e anima só
 * a parte numérica, mantendo prefixo, sufixo e o formato brasileiro.
 */
export function TextoContado({ texto, ms = 750 }: { texto: string; ms?: number }) {
  const m = texto.match(/^(.*?)(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)(.*)$/)
  const casas = m && m[2].includes(',') ? m[2].split(',')[1].length : 0
  const alvo = m ? Number(m[2].replace(/\./g, '').replace(',', '.')) : 0
  const v = useContagem(alvo, ms)
  if (!m) return <>{texto}</>
  const fmt = v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  return (
    <>
      {m[1]}
      {fmt}
      {m[3]}
    </>
  )
}

/** Marca o elemento como visível quando entra na tela (uma vez só). */
export function useRevelar<T extends HTMLElement>(margem = '-10% 0px') {
  const ref = useRef<T>(null)
  const [visivel, setVisivel] = useState(reduzMovimento())
  useEffect(() => {
    if (visivel || !ref.current) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisivel(true)
          io.disconnect()
        }
      },
      { rootMargin: margem },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [visivel, margem])
  return [ref, visivel] as const
}

export function Revelar(props: { children: ReactNode; className?: string; style?: CSSProperties; como?: 'div' | 'section' | 'li' }) {
  const [ref, visivel] = useRevelar<HTMLDivElement>()
  const Tag = (props.como ?? 'div') as 'div'
  return (
    <Tag ref={ref} className={`revelar ${visivel ? 'visivel' : ''} ${props.className ?? ''}`} style={props.style}>
      {props.children}
    </Tag>
  )
}

/** Atraso escalonado para listas: style={atraso(i)} */
export const atraso = (i: number, passo = 35, max = 14): CSSProperties => ({ ['--atraso' as string]: `${Math.min(i, max) * passo}ms` })
