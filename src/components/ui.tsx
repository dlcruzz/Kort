import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Clock, AlertTriangle, CircleDot, Ban, Armchair } from 'lucide-react'
import type { StatusAgendamento } from '../lib/types'
import { iniciais, LABEL_STATUS_AG } from '../lib/format'
import { TextoContado } from '../lib/movimento'

/* ---------- Folha lateral (desktop) / de baixo (celular) */
export function Folha(props: {
  aberta: boolean
  aoFechar: () => void
  titulo: ReactNode
  subtitulo?: ReactNode
  children: ReactNode
  rodape?: ReactNode
  larga?: boolean
}) {
  const { aberta, aoFechar } = props
  const ref = useRef<HTMLDivElement>(null)
  const tituloId = useId()

  useEffect(() => {
    if (!aberta) return
    const anterior = document.activeElement as HTMLElement | null
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.fechar)')?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
      anterior?.focus?.()
    }
  }, [aberta, aoFechar])

  if (!aberta) return null
  return createPortal(
    <>
      <div className="folha-fundo" onClick={aoFechar} />
      <div ref={ref} className={`folha ${props.larga ? 'larga' : ''}`} role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        <div className="folha-cab">
          <div className="cresce">
            <h2 id={tituloId}>{props.titulo}</h2>
            {props.subtitulo && <p>{props.subtitulo}</p>}
          </div>
          <button className="btn btn-fantasma btn-icone fechar" onClick={aoFechar} aria-label="Fechar">
            <X />
          </button>
        </div>
        <div className="folha-corpo">{props.children}</div>
        {props.rodape && <div className="folha-rodape">{props.rodape}</div>}
      </div>
    </>,
    document.body,
  )
}

/* ---------- Modal de confirmação */
export function Confirmar(props: {
  aberto: boolean
  titulo: string
  texto: ReactNode
  acao: string
  perigo?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  useEffect(() => {
    if (!props.aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && props.aoCancelar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [props])
  if (!props.aberto) return null
  return createPortal(
    <>
      <div className="folha-fundo" onClick={props.aoCancelar} />
      <div className="modal" role="alertdialog" aria-modal="true">
        <h2>{props.titulo}</h2>
        <div className="muted" style={{ fontSize: 14.5 }}>{props.texto}</div>
        <div className="linha-flex" style={{ justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="btn btn-sec" onClick={props.aoCancelar}>Voltar</button>
          <button className={`btn ${props.perigo ? 'btn-escuro' : 'btn-primario'}`} onClick={props.aoConfirmar} autoFocus>
            {props.acao}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ---------- Avatar com iniciais e anel na cor do barbeiro */
export function Avatar({ nome, cor, tam = 34 }: { nome: string; cor?: string; tam?: number }) {
  return (
    <span
      className="avatar"
      data-cor={cor ? '' : undefined}
      style={{ ['--tam' as string]: `${tam}px`, ['--cor' as string]: cor }}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  )
}

/* ---------- Status do horário */
const ICONE_STATUS: Record<StatusAgendamento, ReactNode> = {
  agendado: <Clock />,
  confirmado: <Check />,
  em_atendimento: <Armchair />,
  concluido: <CircleDot />,
  cancelado: <Ban />,
  faltou: <AlertTriangle />,
}
const CLASSE_STATUS: Record<StatusAgendamento, string> = {
  agendado: '',
  confirmado: 'tag-preto',
  em_atendimento: 'tag-kort',
  concluido: 'tag-ok',
  cancelado: '',
  faltou: 'tag-perigo',
}
export function StatusTag({ status }: { status: StatusAgendamento }) {
  return (
    <span className={`tag ${CLASSE_STATUS[status]}`}>
      {ICONE_STATUS[status]}
      {LABEL_STATUS_AG[status]}
    </span>
  )
}

/* ---------- Campo de formulário */
export function Campo(props: { rotulo: string; ajuda?: ReactNode; erro?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <div className={`campo ${props.className ?? ''}`}>
      <label htmlFor={props.id}>{props.rotulo}</label>
      {props.children}
      {props.erro ? <span className="erro">{props.erro}</span> : props.ajuda ? <span className="ajuda">{props.ajuda}</span> : null}
    </div>
  )
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; label?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} aria-label={props.label} />
      <span className="trilho" />
      {props.children}
    </label>
  )
}

export function Segmentos<T extends string>(props: { valor: T; opcoes: Array<[T, string]>; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div className="segmentos" role="group" aria-label={props.rotulo}>
      {props.opcoes.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={props.valor === v} onClick={() => props.onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Vazio(props: { titulo: string; texto?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <h3>{props.titulo}</h3>
      {props.texto && <p>{props.texto}</p>}
      {props.acao}
    </div>
  )
}

export function Metricas({ itens, colunas }: { itens: Array<{ rot: string; val: ReactNode; det?: ReactNode }>; colunas?: number }) {
  return (
    <div className="metricas" style={{ ['--colunas' as string]: colunas ?? itens.length }}>
      {itens.map((m) => (
        <div className="metrica" key={m.rot}>
          <div className="rot">{m.rot}</div>
          <div className="val">{typeof m.val === 'string' || typeof m.val === 'number' ? <TextoContado texto={String(m.val)} /> : m.val}</div>
          {m.det && <div className="det">{m.det}</div>}
        </div>
      ))}
    </div>
  )
}

export function CabecalhoPagina(props: { titulo: string; sub?: ReactNode; acoes?: ReactNode; voltar?: ReactNode }) {
  return (
    <div className="pagina-cab">
      <div>
        {props.voltar}
        <h1>{props.titulo}</h1>
        {props.sub && <p className="sub">{props.sub}</p>}
      </div>
      {props.acoes && <div className="pagina-acoes">{props.acoes}</div>}
    </div>
  )
}
