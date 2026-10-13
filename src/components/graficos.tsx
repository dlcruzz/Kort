// Gráficos simples em SVG/HTML, sem biblioteca.
// Uma série por gráfico, em preto sobre o papel; o amarelo só marca o
// valor em destaque (hoje / maior). Todo valor tem dica ao passar o mouse
// ou focar com o teclado.

import { useState } from 'react'

export function BarrasVerticais(props: {
  dados: Array<{ rot: string; valor: number; dica: string; destaque?: boolean }>
  altura?: number
  formatarEixo?: (v: number) => string
  rotulo: string
}) {
  const { dados, altura = 180 } = props
  const [foco, setFoco] = useState<number | null>(null)
  const max = Math.max(1, ...dados.map((d) => d.valor))
  const passoEixo = niceStep(max)
  const topo = Math.ceil(max / passoEixo) * passoEixo
  const linhas = Array.from({ length: Math.round(topo / passoEixo) + 1 }, (_, i) => i * passoEixo)
  const mostrarRot = (i: number) => dados.length <= 14 || i % Math.ceil(dados.length / 10) === 0 || i === dados.length - 1

  return (
    <figure style={{ margin: 0 }} aria-label={props.rotulo}>
      <div style={{ position: 'relative', height: altura, marginLeft: 44 }}>
        {linhas.map((v) => (
          <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: (v / topo) * altura, borderTop: `1px ${v === 0 ? 'solid var(--linha)' : 'dashed var(--linha-fraca)'}` }}>
            <span style={{ position: 'absolute', right: '100%', marginRight: 8, top: -8, fontSize: 11, color: 'var(--grafite)', whiteSpace: 'nowrap' }}>
              {props.formatarEixo ? props.formatarEixo(v) : v}
            </span>
          </div>
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          {dados.map((d, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
              aria-label={d.dica}
              style={{ flex: 1, height: '100%', border: 0, background: foco === i ? 'rgba(8,8,8,0.04)' : 'transparent', padding: 0, display: 'flex', alignItems: 'flex-end', position: 'relative', cursor: 'default' }}
            >
              <span
                className="grafico-barra"
                style={{
                  ['--atraso' as string]: `${Math.min(i, 30) * 18}ms`,
                  display: 'block', width: '100%', maxWidth: 34, margin: '0 auto',
                  height: Math.max(d.valor ? 2 : 0, (d.valor / topo) * altura),
                  background: d.destaque ? 'var(--kort)' : 'var(--preto)',
                  boxShadow: d.destaque ? 'inset 0 0 0 1.5px var(--preto)' : undefined,
                  borderRadius: '4px 4px 0 0',
                }}
              />
              {foco === i && (
                <span role="tooltip" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)', background: 'var(--preto)', color: 'var(--papel)', fontSize: 12, padding: '6px 9px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none' }}>
                  {d.dica}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, marginLeft: 44, marginTop: 6 }} aria-hidden="true">
        {dados.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--grafite)', whiteSpace: 'nowrap', overflow: 'visible' }}>
            {mostrarRot(i) ? d.rot : ''}
          </span>
        ))}
      </div>
    </figure>
  )
}

export function BarrasHorizontais(props: { dados: Array<{ rot: string; valor: number; texto: string; extra?: string }>; rotulo: string }) {
  const max = Math.max(1, ...props.dados.map((d) => d.valor))
  return (
    <ul className="lista" aria-label={props.rotulo}>
      {props.dados.map((d) => (
        <li key={d.rot} style={{ display: 'block', padding: '10px 0' }}>
          <div className="linha-flex entre pequeno" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>{d.rot}</span>
            <span className="num"><b>{d.texto}</b>{d.extra && <span className="muted"> {d.extra}</span>}</span>
          </div>
          <div className="barra"><span style={{ width: `${(d.valor / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Mapa de calor: dias da semana x horas. Um tom só (preto), do claro ao escuro. */
export function MapaCalor(props: { linhas: string[]; colunas: string[]; valores: number[][]; formatar: (v: number, l: number, c: number) => string; rotulo: string }) {
  const max = Math.max(1, ...props.valores.flat())
  const [foco, setFoco] = useState<string | null>(null)
  return (
    <figure style={{ margin: 0, overflowX: 'auto' }} aria-label={props.rotulo}>
      <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${props.colunas.length}, minmax(26px, 1fr))`, gap: 3, minWidth: 420 }}>
        <span />
        {props.colunas.map((c) => <span key={c} style={{ fontSize: 11, color: 'var(--grafite)', textAlign: 'center' }}>{c}</span>)}
        {props.linhas.map((l, li) => (
          <div key={l} style={{ display: 'contents' }}>
            <span style={{ fontSize: 12, color: 'var(--grafite)', fontWeight: 600, alignSelf: 'center' }}>{l}</span>
            {props.colunas.map((_, ci) => {
              const v = props.valores[li][ci]
              const t = v / max
              const k = `${li}-${ci}`
              return (
                <button
                  key={ci}
                  type="button"
                  aria-label={props.formatar(v, li, ci)}
                  onMouseEnter={() => setFoco(k)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(k)}
                  onBlur={() => setFoco(null)}
                  className="calor-celula"
                  style={{
                    ['--atraso' as string]: `${(li + ci) * 22}ms`,
                    position: 'relative', height: 28, border: 0, borderRadius: 4, padding: 0, cursor: 'default',
                    background: v ? `rgba(8, 8, 8, ${0.08 + t * 0.86})` : 'var(--linha-fraca)',
                  }}
                >
                  {foco === k && (
                    <span role="tooltip" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)', background: 'var(--preto)', color: 'var(--papel)', fontSize: 12, padding: '6px 9px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none' }}>
                      {props.formatar(v, li, ci)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <figcaption className="linha-flex pequeno muted" style={{ marginTop: 10, gap: 6 }}>
        Menos
        {[0.08, 0.3, 0.52, 0.74, 0.94].map((a) => <span key={a} style={{ width: 18, height: 10, borderRadius: 2, background: `rgba(8,8,8,${a})` }} />)}
        Mais
      </figcaption>
    </figure>
  )
}

function niceStep(max: number) {
  const bruto = max / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
}
