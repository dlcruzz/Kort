// Tela de suporte, usada nos dois lados:
//  - lado "barbearia": /app/ajuda — abre chamado e conversa com o Kort
//  - lado "kort":      /admin/suporte — o dono do Kort responde todo mundo

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Bug, CheckCircle2, HelpCircle, Lightbulb, MessageSquare, Plus, Send } from 'lucide-react'
import { abrirConversa, NOME_STATUS, NOME_TIPO, useConversa, useConversas, type Conversa, type TipoSuporte } from '../lib/suporte'
import { supabase } from '../lib/supabase'
import { hora, dataRelativa, tempoAtras } from '../lib/format'
import { Campo, Vazio } from './ui'
import { useAvisar } from './avisos'

const ICONE: Record<TipoSuporte, typeof Bug> = { duvida: HelpCircle, problema: Bug, sugestao: Lightbulb, outro: MessageSquare }

export function PainelSuporte({ lado }: { lado: 'barbearia' | 'kort' }) {
  const { lista, carregar } = useConversas()
  const [aberta, setAberta] = useState<string | null>(null)
  const [nova, setNova] = useState(false)
  const [filtro, setFiltro] = useState<'pendentes' | 'todas'>('pendentes')

  if (!supabase) return <Vazio titulo="Suporte indisponível na demonstração" texto="Com o sistema ligado ao banco, aqui você conversa com o Kort." />
  if (!lista) return <p className="muted">Carregando...</p>

  const naoLidas = (c: Conversa) => (lado === 'kort' ? c.nao_lidas_kort : c.nao_lidas_barbearia)
  const visiveis = lado === 'kort' && filtro === 'pendentes' ? lista.filter((c) => c.status === 'aberta' || c.nao_lidas_kort > 0) : lista
  const atual = lista.find((c) => c.id === aberta) ?? null

  return (
    <div className={`suporte ${atual || nova ? 'com-conversa' : ''}`}>
      <aside className="suporte-lista painel">
        <div className="painel-cab">
          <h2>{lado === 'kort' ? 'Chamados' : 'Suas conversas'}</h2>
          {lado === 'barbearia' ? (
            <button className="btn btn-primario btn-pequeno" onClick={() => { setNova(true); setAberta(null) }}><Plus /> Nova</button>
          ) : (
            <div className="segmentos" role="group" aria-label="Filtro">
              <button aria-pressed={filtro === 'pendentes'} onClick={() => setFiltro('pendentes')}>Pendentes</button>
              <button aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</button>
            </div>
          )}
        </div>
        {visiveis.length === 0 ? (
          <p className="muted pequeno" style={{ padding: '6px 18px 18px' }}>
            {lado === 'kort' ? 'Nenhum chamado esperando resposta.' : 'Nenhuma conversa ainda. Toque em Nova para falar com a gente.'}
          </p>
        ) : (
          <ul>
            {visiveis.map((c) => {
              const Icone = ICONE[c.tipo]
              const n = naoLidas(c)
              return (
                <li key={c.id}>
                  <button aria-pressed={c.id === aberta} onClick={() => { setAberta(c.id); setNova(false) }}>
                    <span className={`suporte-tipo t-${c.tipo}`}><Icone size={16} /></span>
                    <span className="cresce">
                      <span className="linha1">
                        <b className="trunca">{lado === 'kort' ? c.barbearia_nome : c.assunto}</b>
                        <span className="quando">{tempoAtras(c.ultima_msg_em)}</span>
                      </span>
                      {lado === 'kort' && <span className="assunto trunca">{NOME_TIPO[c.tipo]}: {c.assunto}</span>}
                      <span className="previa trunca">{c.ultima_msg}</span>
                    </span>
                    {n > 0 ? <span className="cont">{n}</span> : c.status === 'resolvida' ? <CheckCircle2 size={16} className="ok" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      <section className="suporte-chat painel">
        {nova ? (
          <NovaConversa aoCriar={async (id) => { await carregar(); setNova(false); setAberta(id) }} aoVoltar={() => setNova(false)} />
        ) : atual ? (
          <Chat conversa={atual} lado={lado} aoVoltar={() => setAberta(null)} aoMudar={() => void carregar()} />
        ) : (
          <div className="suporte-vazio">
            <MessageSquare size={36} />
            <strong>{lado === 'kort' ? 'Escolha um chamado' : 'Fale com o Kort'}</strong>
            <span className="muted pequeno">
              {lado === 'kort'
                ? 'Os barbeiros abrem chamados pela aba Ajuda do app. Você é avisado aqui quando chega mensagem.'
                : 'Tirou uma dúvida, achou um problema ou tem uma ideia? Escreva aqui a qualquer hora, de dia ou de madrugada. A resposta chega nesta tela.'}
            </span>
            {lado === 'barbearia' && <button className="btn btn-primario" onClick={() => setNova(true)}><Plus /> Começar conversa</button>}
          </div>
        )}
      </section>
    </div>
  )
}

function NovaConversa({ aoCriar, aoVoltar }: { aoCriar: (id: string) => void; aoVoltar: () => void }) {
  const [tipo, setTipo] = useState<TipoSuporte>('duvida')
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const avisar = useAvisar()

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (texto.trim().length < 3) return setErro('Conte um pouco mais.')
    setEnviando(true)
    try {
      const id = await abrirConversa(tipo, assunto, texto, window.location.pathname)
      avisar('Mensagem enviada para o Kort')
      aoCriar(id)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="suporte-nova" onSubmit={enviar}>
      <button type="button" className="btn btn-fantasma btn-pequeno so-celular" onClick={aoVoltar}><ArrowLeft size={16} /> Voltar</button>
      <h2>Sobre o que é?</h2>
      <div className="suporte-tipos" role="group" aria-label="Tipo">
        {(Object.keys(NOME_TIPO) as TipoSuporte[]).map((t) => {
          const Icone = ICONE[t]
          return (
            <button type="button" key={t} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              <Icone size={20} /> {t === 'problema' ? 'Algo não funciona' : t === 'sugestao' ? 'Ideia ou sugestão' : NOME_TIPO[t]}
            </button>
          )
        })}
      </div>
      <Campo rotulo="Assunto (opcional)" id="sp-assunto">
        <input id="sp-assunto" className="input" value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder={tipo === 'problema' ? 'Ex.: o caixa não fecha a comanda' : 'Ex.: como cadastro um barbeiro novo?'} />
      </Campo>
      <Campo rotulo="Mensagem" id="sp-texto" erro={erro}>
        <textarea id="sp-texto" className="textarea" style={{ minHeight: 130 }} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={tipo === 'problema' ? 'O que você tentou fazer e o que aconteceu?' : 'Escreva do seu jeito.'} />
      </Campo>
      <button className="btn btn-primario" type="submit" disabled={enviando}><Send /> {enviando ? 'Enviando...' : 'Enviar'}</button>
    </form>
  )
}

function Chat({ conversa, lado, aoVoltar, aoMudar }: { conversa: Conversa; lado: 'barbearia' | 'kort'; aoVoltar: () => void; aoMudar: () => void }) {
  const { msgs, enviar, enviando, mudarStatus } = useConversa(conversa.id, lado, aoMudar)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length])

  const mandar = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!texto.trim()) return
    setErro('')
    try {
      await enviar(texto)
      setTexto('')
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  const meu = (m: { do_kort: boolean }) => (lado === 'kort' ? m.do_kort : !m.do_kort)
  let diaAnterior = ''

  return (
    <div className="suporte-conversa">
      <header>
        <button className="btn btn-fantasma btn-icone so-celular" aria-label="Voltar" onClick={aoVoltar}><ArrowLeft size={18} /></button>
        <div className="cresce">
          <strong className="trunca">{lado === 'kort' ? conversa.barbearia_nome : conversa.assunto}</strong>
          <span className="muted pequeno">
            {lado === 'kort' ? `${NOME_TIPO[conversa.tipo]}: ${conversa.assunto}${conversa.aberta_por ? `, por ${conversa.aberta_por}` : ''}` : `${NOME_TIPO[conversa.tipo]}, ${NOME_STATUS[conversa.status].toLowerCase()}`}
          </span>
        </div>
        {conversa.status === 'resolvida' ? (
          <button className="btn btn-sec btn-pequeno" onClick={() => void mudarStatus('aberta')}>Reabrir</button>
        ) : (
          <button className="btn btn-sec btn-pequeno" onClick={() => void mudarStatus('resolvida')}><CheckCircle2 size={15} /> Resolvido</button>
        )}
      </header>

      <div className="suporte-msgs">
        {msgs.map((m) => {
          const dia = dataRelativa(m.criado_em)
          const sep = dia !== diaAnterior
          diaAnterior = dia
          return (
            <div key={m.id}>
              {sep && <div className="suporte-dia">{dia}</div>}
              <div className={`balao ${meu(m) ? 'meu' : 'deles'} ${m.automatica ? 'auto' : ''}`}>
                {!meu(m) && <span className="autor">{m.do_kort ? (m.automatica ? 'Kort (automática)' : 'Suporte Kort') : conversa.barbearia_nome}</span>}
                <p>{m.texto}</p>
                <span className="hora">{hora(m.criado_em)}{meu(m) && (m.lida_em ? ' · lida' : ' · enviada')}</span>
              </div>
            </div>
          )
        })}
        <div ref={fim} />
      </div>

      <form className="suporte-escrever" onSubmit={mandar}>
        <textarea className="textarea" rows={1} value={texto} placeholder="Escreva uma mensagem"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void mandar() } }} />
        <button className="btn btn-primario btn-icone" type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar"><Send size={18} /></button>
      </form>
      {erro && <p className="pequeno" style={{ color: 'var(--perigo)', padding: '0 14px 10px' }}>{erro}</p>}
    </div>
  )
}
