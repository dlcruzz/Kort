// Vitrine da barbearia: a primeira tela do link /b/<slug>.
//
// O símbolo é o poste de barbeiro: uma faixa listrada que gira devagar.
// Ele segura a página mesmo quando o barbeiro ainda não colocou foto
// nenhuma. Cada seção só aparece se tiver conteúdo.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, MapPin, Star, Instagram, X, ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, Navigation } from 'lucide-react'
import type { DadosPublicos, FotoPublica, PedidoReserva, ProdutoPublico } from '../../lib/publico'
import type { HorarioFuncionamento, Membro, Servico } from '../../lib/types'
import { dinheiro, dinheiroCurto, hhmmParaMin, mascaraTelefone, nomeDia, primeiroNome, telefoneE164 } from '../../lib/format'
import { Campo } from '../../components/ui'
import { contraste, corDe, rotulos } from '../../lib/nicho'
import { IconeWhats } from '../../components/IconeWhats'
import '../../styles/vitrine.css'

type Props = {
  dados: DadosPublicos
  media: number
  servicos: Servico[]
  servicoIds: string[]
  alternarServico: (id: string) => void
  nome: string
  setNome: (v: string) => void
  tel: string
  setTel: (v: string) => void
  reservar: (p: PedidoReserva) => Promise<{ id: string }>
}

const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]

export default function Vitrine(p: Props) {
  const { dados } = p
  const b = dados.barbearia
  const equipe = dados.membros
  const mostrarEquipe = equipe.length > 1 || equipe.some((m) => m.foto_url)
  const comentarios = dados.avaliacoes.filter((a) => a.publica && a.comentario).slice(0, 6)
  const nomeDe = (id: string | null) => (id ? equipe.find((m) => m.id === id)?.nome_exibicao : undefined)
  const cor = corDe(b)
  const corTxt = contraste(cor)
  const r = rotulos(b.nicho ?? 'barbearia')

  const secoes = useMemo(
    () => [
      { id: 'servicos', nome: 'Agendar', tem: p.servicos.length > 0 },
      { id: 'cortes', nome: r.cortes[0].toUpperCase() + r.cortes.slice(1), tem: dados.portfolio.length > 0 },
      { id: 'equipe', nome: 'Equipe', tem: mostrarEquipe },
      { id: 'produtos', nome: 'Produtos', tem: dados.produtos.length > 0 },
      { id: 'avaliacoes', nome: 'Avaliações', tem: comentarios.length > 0 },
      { id: 'onde', nome: 'Onde fica', tem: true },
    ].filter((s) => s.tem),
    [p.servicos.length, dados.portfolio.length, mostrarEquipe, dados.produtos.length, comentarios.length],
  )
  const ativa = useSecaoAtiva(secoes.map((s) => s.id))

  const endereco = [b.logradouro && `${b.logradouro.trim()}${b.numero ? `, ${b.numero}` : ''}`, b.bairro, b.cidade && `${b.cidade.trim()}${b.uf ? `/${b.uf}` : ''}`]
    .filter(Boolean).join(' - ')
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${endereco} ${b.nome}`)}`
  const whats = b.whatsapp || b.telefone
  const linkWhats = whats ? `https://wa.me/${whats.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi! Vim pela página da ${b.nome}.`)}` : null
  const status = situacao(dados.horarios)

  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="vt" style={{ ['--kort' as string]: cor, ['--kort-txt' as string]: corTxt }}>
      {/* ---------- topo */}
      <header className={`vt-topo ${b.capa_url ? 'com-capa' : ''}`}>
        {b.capa_url && <img className="vt-capa" src={b.capa_url} alt="" />}
        <div className="vt-poste" aria-hidden="true"><span /></div>
        <div className="vt-topo-in">
          <div className="vt-marca">
            {b.logo_url ? <img src={b.logo_url} alt={`Logo da ${b.nome}`} /> : <span aria-hidden="true">{iniciaisDe(b.nome)}</span>}
          </div>
          <h1 className="vt-nome" aria-label={b.nome}>
            {b.nome.split(' ').map((palavra, i, todas) => (
              <span className="vt-palavra" key={i} aria-hidden="true">
                {[...palavra].map((letra, j) => (
                  <span key={j} style={{ animationDelay: `${120 + (todas.slice(0, i).join('').length + j) * 32}ms` }}>{letra}</span>
                ))}
              </span>
            ))}
          </h1>
          <div className="vt-situacao">
            <span className={`vt-luz ${status.aberto ? 'aberto' : ''}`} />
            {status.texto}
            {p.media > 0 && (
              <span className="vt-nota"><Star size={14} /> {p.media.toFixed(1).replace('.', ',')} <small>({dados.avaliacoes.length})</small></span>
            )}
          </div>
          {b.descricao && <p className="vt-sobre">{b.descricao}</p>}
          <div className="vt-acoes">
            <button className="btn btn-primario btn-grande" onClick={() => irPara('servicos')}>Agendar horário</button>
            {linkWhats && <a className="vt-acao" href={linkWhats} target="_blank" rel="noreferrer"><IconeWhats /> WhatsApp</a>}
            {endereco && <a className="vt-acao" href={mapa} target="_blank" rel="noreferrer"><Navigation size={17} /> Como chegar</a>}
          </div>
        </div>
      </header>

      {/* ---------- menu fixo */}
      <nav className="vt-menu" aria-label="Seções">
        <div className="vt-menu-in">
          {secoes.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={ativa === s.id ? 'true' : undefined}
              onClick={(e) => { e.preventDefault(); irPara(s.id) }}>{s.nome}</a>
          ))}
        </div>
      </nav>

      <div className="vt-corpo">
        {/* ---------- serviços: tabela de preços */}
        <section id="servicos" className="vt-secao">
          <h2>Agende seu horário</h2>
          <p className="vt-dica">Escolha o serviço (pode juntar mais de um). Depois você escolhe o barbeiro, o dia e a hora.</p>
          <ul className="vt-precos">
            {p.servicos.map((s) => {
              const marcado = p.servicoIds.includes(s.id)
              return (
                <li key={s.id}>
                  <button aria-pressed={marcado} onClick={() => p.alternarServico(s.id)}>
                    <span className="vt-caixa" aria-hidden="true">{marcado && <Check size={15} strokeWidth={3} />}</span>
                    <span className="vt-servico">
                      <span className="vt-servico-nome">{s.nome}</span>
                      <span className="vt-servico-det">{s.duracao_min} min{s.descricao ? `. ${s.descricao}` : ''}</span>
                    </span>
                    <span className="vt-pontos" aria-hidden="true" />
                    <span className="vt-preco">{dinheiroCurto(s.preco_centavos)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {dados.portfolio.length > 0 && <Cortes fotos={dados.portfolio} nomeDe={nomeDe} aoAgendar={() => irPara('servicos')} titulo={r.tituloCortes} />}

        {mostrarEquipe && (
          <section id="equipe" className="vt-secao">
            <h2>Quem vai te atender</h2>
            <div className="vt-equipe">
              {equipe.map((m) => <Barbeiro key={m.id} m={m} />)}
            </div>
          </section>
        )}

        {dados.produtos.length > 0 && (
          <Produtos produtos={dados.produtos} whatsapp={whats} nomeBarbearia={b.nome}
            nome={p.nome} setNome={p.setNome} tel={p.tel} setTel={p.setTel} reservar={p.reservar} />
        )}

        {comentarios.length > 0 && (
          <section id="avaliacoes" className="vt-secao">
            <h2>Quem já cortou aqui</h2>
            <div className="vt-depoimentos">
              {comentarios.map((a) => (
                <blockquote key={a.id}>
                  <span className="vt-estrelas" aria-label={`Nota ${a.nota} de 5`}>
                    {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} className={i < a.nota ? 'cheia' : ''} />)}
                  </span>
                  <p>{a.comentario}</p>
                  <cite>{a.cliente_nome ? primeiroNome(a.cliente_nome) : 'Cliente'}{nomeDe(a.membro_id) ? `, com ${nomeDe(a.membro_id)}` : ''}</cite>
                </blockquote>
              ))}
            </div>
          </section>
        )}

        {/* ---------- endereço e horários */}
        <section id="onde" className="vt-secao vt-onde">
          <h2>Onde fica</h2>
          <div className="vt-onde-grade">
            <div>
              {endereco && (
                <a className="vt-endereco" href={mapa} target="_blank" rel="noreferrer">
                  <MapPin size={20} />
                  <span>{endereco}</span>
                </a>
              )}
              <div className="vt-contatos">
                {endereco && <a className="vt-acao" href={mapa} target="_blank" rel="noreferrer"><Navigation size={17} /> Abrir no mapa</a>}
                {linkWhats && <a className="vt-acao" href={linkWhats} target="_blank" rel="noreferrer"><IconeWhats /> Chamar no WhatsApp</a>}
                {b.instagram && (
                  <a className="vt-acao" href={`https://instagram.com/${b.instagram.replace('@', '').trim()}`} target="_blank" rel="noreferrer">
                    <Instagram size={17} /> @{b.instagram.replace('@', '').trim()}
                  </a>
                )}
              </div>
            </div>
            <table className="vt-horarios">
              <caption>Horário de funcionamento</caption>
              <tbody>
                {ORDEM_SEMANA.map((d) => {
                  const h = dados.horarios.find((x) => x.dia_semana === d)
                  return (
                    <tr key={d} className={d === new Date().getDay() ? 'hoje' : ''}>
                      <th scope="row">{nomeDia(d)}</th>
                      <td>{h ? `${h.abre} às ${h.fecha}` : 'Fechado'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Ajudantes
--------------------------------------------------------------------- */
function iniciaisDe(nome: string) {
  const p = nome.replace(/barbearia|barber(shop)?/gi, '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? nome[0]) + (p[1]?.[0] ?? '')).toUpperCase()
}

/** "Aberto agora, até 20:00" ou quando abre de novo. */
function situacao(horarios: HorarioFuncionamento[]) {
  const agora = new Date()
  const min = agora.getHours() * 60 + agora.getMinutes()
  const hoje = horarios.find((h) => h.dia_semana === agora.getDay())
  if (hoje && min >= hhmmParaMin(hoje.abre) && min < hhmmParaMin(hoje.fecha)) return { aberto: true, texto: `Aberto agora, até ${hoje.fecha}` }
  if (hoje && min < hhmmParaMin(hoje.abre)) return { aberto: false, texto: `Fechado agora. Abre hoje às ${hoje.abre}` }
  for (let i = 1; i <= 7; i++) {
    const d = (agora.getDay() + i) % 7
    const h = horarios.find((x) => x.dia_semana === d)
    if (h) return { aberto: false, texto: `Fechado agora. Abre ${i === 1 ? 'amanhã' : nomeDia(d).toLowerCase()} às ${h.abre}` }
  }
  return { aberto: false, texto: 'Agende pelo link' }
}

/** Qual seção está na tela (para marcar no menu). */
function useSecaoAtiva(ids: string[]) {
  const [ativa, setAtiva] = useState(ids[0])
  const chave = ids.join(',')
  useEffect(() => {
    const vistos = new Map<string, boolean>()
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) vistos.set(e.target.id, e.isIntersecting)
        const primeira = ids.find((id) => vistos.get(id))
        if (primeira) setAtiva(primeira)
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  return ativa
}

function Barbeiro({ m }: { m: Membro }) {
  return (
    <figure className="vt-barbeiro">
      <div className="vt-barbeiro-foto">
        {m.foto_url ? <img src={m.foto_url} alt={m.nome_exibicao} loading="lazy" /> : <span>{iniciaisDe(m.nome_exibicao)}</span>}
      </div>
      <figcaption>
        <strong>{m.nome_exibicao}</strong>
        {m.bio && <span>{m.bio}</span>}
      </figcaption>
    </figure>
  )
}

/* ---------------------------------------------------------------------
   Cortes (portfólio), com tela cheia ao tocar
--------------------------------------------------------------------- */
function Cortes({ fotos, nomeDe, aoAgendar, titulo }: { fotos: FotoPublica[]; nomeDe: (id: string | null) => string | undefined; aoAgendar: () => void; titulo: string }) {
  const [aberta, setAberta] = useState<number | null>(null)
  const f = aberta !== null ? fotos[aberta] : null
  const ir = (passo: number) => setAberta((i) => (i === null ? null : (i + passo + fotos.length) % fotos.length))
  const toque = useRef<number | null>(null)

  useEffect(() => {
    if (aberta === null) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberta(null)
      if (e.key === 'ArrowRight') ir(1)
      if (e.key === 'ArrowLeft') ir(-1)
    }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = '' }
  }, [aberta]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="cortes" className="vt-secao">
      <h2>{titulo}</h2>
      <div className={`vt-galeria n${Math.min(fotos.length, 5)}`}>
        {fotos.slice(0, 12).map((x, i) => (
          <button key={x.id} className="vt-foto" onClick={() => setAberta(i)} aria-label={x.legenda ? `Ver ${x.legenda}` : 'Ver foto'}>
            <img src={x.url} alt={x.legenda ?? 'Corte'} loading="lazy" />
            {x.legenda && <span>{x.legenda}</span>}
          </button>
        ))}
      </div>
      <button className="btn btn-sec vt-mais" onClick={aoAgendar}>Quero um desses</button>

      {f && (
        <div className="vt-zoom" role="dialog" aria-modal="true" aria-label="Foto do corte" onClick={() => setAberta(null)}
          onTouchStart={(e) => { toque.current = e.touches[0].clientX }}
          onTouchEnd={(e) => {
            if (toque.current === null) return
            const dx = e.changedTouches[0].clientX - toque.current
            toque.current = null
            if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1)
          }}>
          <button className="vt-zoom-fechar" aria-label="Fechar"><X /></button>
          <img key={f.id} src={f.url} alt={f.legenda ?? 'Corte'} onClick={(e) => e.stopPropagation()} />
          <div className="vt-zoom-leg">
            {[f.legenda, nomeDe(f.membro_id) && `por ${nomeDe(f.membro_id)}`].filter(Boolean).join(' ')}
            {fotos.length > 1 && <small>{aberta! + 1} de {fotos.length}</small>}
          </div>
          {fotos.length > 1 && (
            <>
              <button className="vt-zoom-seta esq" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); ir(-1) }}><ChevronLeft /></button>
              <button className="vt-zoom-seta dir" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); ir(1) }}><ChevronRight /></button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------------
   Produtos: preço, quantos tem e reserva
--------------------------------------------------------------------- */
function Produtos(props: {
  produtos: ProdutoPublico[]
  whatsapp: string | null
  nomeBarbearia: string
  nome: string
  setNome: (v: string) => void
  tel: string
  setTel: (v: string) => void
  reservar: (p: PedidoReserva) => Promise<{ id: string }>
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [qtd, setQtd] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<{ produto: ProdutoPublico; qtd: number } | null>(null)

  const abrir = (id: string) => { setAberto(id); setQtd(1); setErro('') }

  const confirmar = async (p: ProdutoPublico) => {
    if (props.nome.trim().length < 2) return setErro('Escreva seu nome.')
    if (props.tel.replace(/\D/g, '').length < 10) return setErro('Confira o número com DDD.')
    setEnviando(true)
    setErro('')
    try {
      await props.reservar({ produtoId: p.id, quantidade: qtd, nome: props.nome.trim(), telefone: telefoneE164(props.tel) })
      setFeito({ produto: p, qtd })
      setAberto(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para reservar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section id="produtos" className="vt-secao">
      <h2>Produtos</h2>
      <p className="vt-dica">Reserve aqui e pague quando for retirar na barbearia.</p>

      {feito && (
        <div className="vt-reservado" role="status">
          <span className="vt-reservado-ico"><Check /></span>
          <div>
            <strong>Reservado: {feito.qtd}x {feito.produto.nome}</strong>
            <p>Fica separado no seu nome. Paga na hora de retirar.</p>
            {props.whatsapp && (
              <a className="vt-acao" target="_blank" rel="noreferrer"
                href={`https://wa.me/${props.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi! Reservei ${feito.qtd}x ${feito.produto.nome} pela página. Meu nome é ${primeiroNome(props.nome)}.`)}`}>
                <IconeWhats /> Avisar a {props.nomeBarbearia}
              </a>
            )}
          </div>
          <button className="vt-reservado-fechar" aria-label="Fechar aviso" onClick={() => setFeito(null)}><X size={18} /></button>
        </div>
      )}

      <div className="vt-produtos">
        {props.produtos.map((p) => {
          const acabou = p.disponivel <= 0
          const reservando = aberto === p.id
          return (
            <article key={p.id} className={`vt-produto ${acabou ? 'acabou' : ''} ${reservando ? 'aberto' : ''}`}>
              <div className="vt-produto-foto">
                {p.foto_url ? <img src={p.foto_url} alt={p.nome} loading="lazy" /> : <ShoppingBag size={28} />}
                <span className={`vt-estoque ${acabou ? 'zero' : p.disponivel <= 3 ? 'pouco' : ''}`}>
                  {acabou ? 'Acabou' : p.disponivel <= 3 ? `Só ${p.disponivel}` : `${p.disponivel} em estoque`}
                </span>
              </div>
              <div className="vt-produto-info">
                <h3>{p.nome}</h3>
                {p.descricao && <p>{p.descricao}</p>}
                <div className="vt-produto-pe">
                  <span className="vt-produto-preco">{dinheiro(p.preco_venda_centavos)}</span>
                  {!reservando && (
                    <button className="btn btn-primario btn-pequeno" disabled={acabou} onClick={() => abrir(p.id)}>{acabou ? 'Sem estoque' : 'Reservar'}</button>
                  )}
                </div>
              </div>
              {reservando && (
                <div className="vt-reservar">
                  <div className="vt-qtd" role="group" aria-label="Quantidade">
                    <button type="button" aria-label="Menos" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)}><Minus size={16} /></button>
                    <span>{qtd}</span>
                    <button type="button" aria-label="Mais" disabled={qtd >= Math.min(10, p.disponivel)} onClick={() => setQtd(qtd + 1)}><Plus size={16} /></button>
                    <strong>{dinheiro(p.preco_venda_centavos * qtd)}</strong>
                  </div>
                  <Campo rotulo="Seu nome" id={`rv-nome-${p.id}`}>
                    <input id={`rv-nome-${p.id}`} className="input" autoComplete="name" value={props.nome} onChange={(e) => props.setNome(e.target.value)} />
                  </Campo>
                  <Campo rotulo="WhatsApp" id={`rv-tel-${p.id}`}>
                    <input id={`rv-tel-${p.id}`} className="input" inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000"
                      value={props.tel} onChange={(e) => props.setTel(mascaraTelefone(e.target.value))} />
                  </Campo>
                  {erro && <p className="pub-erro" role="alert">{erro}</p>}
                  <div className="vt-reservar-botoes">
                    <button className="btn btn-sec" onClick={() => setAberto(null)}>Cancelar</button>
                    <button className="btn btn-primario" disabled={enviando} onClick={() => void confirmar(p)}>
                      {enviando ? 'Reservando...' : 'Confirmar reserva'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
