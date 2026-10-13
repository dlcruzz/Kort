import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * O bloco amarelo do menu: mede o item ativo e desliza até ele.
 * Fica dentro do <aside class="rail"> e usa o próprio pai para medir.
 */
export function RailIndicador() {
  const { pathname } = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const primeira = useRef(true)
  useLayoutEffect(() => {
    if (pos) requestAnimationFrame(() => (primeira.current = false))
  }, [pos])

  useLayoutEffect(() => {
    const medir = () => {
      const el = ref.current?.parentElement?.querySelector<HTMLElement>('.rail-item.active')
      setPos(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [pathname])

  return (
    <div
      ref={ref}
      className="rail-indicador"
      aria-hidden="true"
      style={pos ? { transform: `translate(${pos.x}px, ${pos.y}px)`, width: pos.w, height: pos.h, transition: primeira.current ? 'none' : undefined } : { opacity: 0 }}
    />
  )
}
