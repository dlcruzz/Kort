import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CalendarPlus, Share2 } from 'lucide-react'
import { usePaginaPublica } from '../../lib/publico'
import Vitrine from './Vitrine'
import { horariosLivres, type Slot } from '../../lib/agenda'
import {
  dataLonga, dinheiroCurto, hoje, isoDia, mascaraTelefone, nomeDiaCurto, plural, somaDias, telefoneE164,
  minParaHhmm,
} from '../../lib/format'
import { Avatar, Campo } from '../../components/ui'
import { atraso, TextoContado } from '../../lib/movimento'
import type { Agendamento } from '../../lib/types'
import { TelaCarregando } from '../../components/guardas'
import { IconeWhats } from '../../components/IconeWhats'

type Passo = 1 | 2 | 3 | 4 | 5
const QUALQUER = 'qualquer'

export default function Agendar() {
  const { slug } = useParams()
  const pagina = usePaginaPublica(slug)
  if (pagina.situacao === 'carregando') return <div className="pub"><TelaCarregando /></div>
  if (pagina.situacao !== 'pronto' || !pagina.dados) return <NaoEncontrada erro={pagina.situacao === 'erro'} />
  return <Pagina pagina={pagina as typeof pagina & { dados: NonNullable<typeof pagina.dados> }} />
}

function NaoEncontrada({ erro }: { erro?: boolean }) {
  return (
    <div className="pub">
      <div className="pub-wrap" style={{ paddingTop: 80 }}>
        <h1 className="display" style={{ fontSize: 48 }}>{erro ? 'Não deu para abrir' : 'Página não encontrada'}</h1>
        <p style={{ color: 'var(--txt-2)', marginTop: 12 }}>
          {erro ? 'Confira sua internet e tente de novo.' : 'Confira o link com a barbearia. O endereço é o site do Kort, /b/ e o nome dela.'}
        </p>
        <Link className="btn btn-primario" style={{ marginTop: 24 }} to="/">Conhecer o Kort</Link>
      </div>
    </div>
  )
}

function Pagina({ pagina }: { pagina: ReturnType<typeof usePaginaPublica> & { dados: NonNullable<ReturnType<typeof usePaginaPublica>['dados']> } }) {
  const estado = pagina.dados
  const mapaMembro = useMemo(() => new Map(estado.membros.map((m) => [m.id, m])), [estado.membros])
  const b = estado.barbearia

  const [passo, setPasso] = useState<Passo>(1)
  const [servicoIds, setServicoIds] = useState<string[]>([])
  const [membroId, setMembroId] = useState<string>('')
  const [dia, setDia] = useState<Date>(hoje())
  const [slot, setSlot] = useState<Slot | null>(null)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [obs, setObs] = useState('')
  const [erros, setErros] = useState<{ nome?: string; tel?: string }>({})
  const [criado, setCriado] = useState<Agendamento | null>(null)
  const [linkHorario, setLinkHorario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [dir, setDir] = useState<'frente' | 'tras'>('frente')

  const servicosAtivos = estado.servicos.filter((s) => s.ativo).sort((a, c) => a.ordem - c.ordem)
  const escolhidos = servicoIds.map((id) => estado.servicos.find((s) => s.id === id)!).filter(Boolean)
  const duracao = escolhidos.reduce((t, s) => t + s.duracao_min, 0)
  const total = escolhidos.reduce((t, s) => t + s.preco_centavos, 0)

  // barbeiros que fazem TODOS os serviços escolhidos
  const barbeiros = estado.membros
    .filter((m) => m.ativo && m.atende)
    .filter((m) => escolhidos.every((s) => s.membros.includes(m.id)))
    .sort((a, c) => a.ordem - c.ordem)

  const dias = useMemo(() => Array.from({ length: b.antecedencia_max_dias }, (_, i) => somaDias(hoje(), i)), [b.antecedencia_max_dias])

  // horários livres: de um barbeiro ou a união de todos (com quem atende)
  const livres = useMemo(() => {
    if (!duracao || !membroId) return [] as Array<Slot & { membroId: string }>
    const quem = membroId === QUALQUER ? barbeiros.map((m) => m.id) : [membroId]
    const mapa = new Map<number, Slot & { membroId: string }>()
    for (const id of quem) {
      for (const s of horariosLivres({ dia, membroId: id, duracao, jornadas: estado.jornadas, agendamentos: estado.agendamentos, bloqueios: estado.bloqueios, grade: b.intervalo_slots_min })) {
        if (!mapa.has(s.minuto)) mapa.set(s.minuto, { ...s, membroId: id })
      }
    }
    return [...mapa.values()].sort((x, y) => x.minuto - y.minuto)
  }, [duracao, membroId, dia, estado.jornadas, estado.agendamentos, estado.bloqueios, barbeiros, b.intervalo_slots_min])

  const diaFechado = (d: Date) => !estado.horarios.some((h) => h.dia_semana === d.getDay())

  const notas = estado.avaliacoes
  const media = notas.length ? notas.reduce((t, a) => t + a.nota, 0) / notas.length : 0

  const alternarServico = (id: string) =>
    setServicoIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const avancar = () => {
    setDir('frente')
    if (passo === 1) {
      setMembroId(barbeiros.length === 1 ? barbeiros[0].id : '')
      setPasso(barbeiros.length === 1 ? 3 : 2)
    } else if (passo === 2) setPasso(3)
    else if (passo === 3) setPasso(4)
    else if (passo === 4) void confirmar()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const confirmar = async () => {
    const e: typeof erros = {}
    if (nome.trim().length < 2) e.nome = 'Escreva seu nome para o barbeiro saber quem é.'
    if (tel.replace(/\D/g, '').length < 10) e.tel = 'Confira o número com DDD. É por ele que chega a confirmação.'
    setErros(e)
    if (Object.keys(e).length || !slot) return
    const quem = membroId === QUALQUER ? (livres.find((l) => l.minuto === slot.minuto)?.membroId ?? barbeiros[0].id) : membroId
    const inicio = new Date(dia)
    inicio.setHours(0, slot.minuto, 0, 0)
    setEnviando(true)
    setErroEnvio('')
    try {
      const r = await pagina.agendar({
        nome: nome.trim(),
        telefone: telefoneE164(tel),
        membroId: quem,
        inicio,
        servicoIds,
        observacao: obs.trim() || undefined,
      })
      setCriado(r.agendamento)
      setLinkHorario(r.link)
      setPasso(5)
    } catch (err) {
      setErroEnvio((err as Error).message)
      if ((err as Error).message.includes('ocupado')) {
        setSlot(null)
        setPasso(3)
      }
    } finally {
      setEnviando(false)
    }
  }

  const podeAvancar =
    (passo === 1 && servicoIds.length > 0) || (passo === 2 && !!membroId) || (passo === 3 && !!slot) || passo === 4

  const voltar = () => {
    setDir('tras')
    if (passo === 3 && barbeiros.length === 1) setPasso(1)
    else setPasso((p) => (p > 1 ? ((p - 1) as Passo) : p))
  }

  const periodos = [
    { nome: 'Manhã', de: 0, ate: 12 * 60 },
    { nome: 'Tarde', de: 12 * 60, ate: 18 * 60 },
    { nome: 'Noite', de: 18 * 60, ate: 24 * 60 },
  ]

  // texto que o cliente manda para a barbearia: o "print" do horário
  const textoComprovante = () => {
    if (!criado) return ''
    const ini = new Date(criado.inicio)
    return [
      `Olá! Acabei de marcar meu horário pelo link:`,
      ``,
      `*${criado.servicos.map((s) => s.nome).join(' + ')}*`,
      `${dataLonga(ini)} às ${minParaHhmm(ini.getHours() * 60 + ini.getMinutes())}`,
      `Com ${mapaMembro.get(criado.membro_id)?.nome_exibicao ?? 'a barbearia'}`,
      `Valor: ${dinheiroCurto(criado.valor_previsto_centavos)} (pago na hora)`,
      `Nome: ${nome.trim()}`,
      ``,
      `Para ver, mudar ou cancelar: ${window.location.origin}${linkHorario}`,
      `Para marcar outro horário: ${window.location.origin}/b/${b.slug}`,
    ].join('\n')
  }

  const linkAgenda = criado
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${criado.servicos.map((s) => s.nome).join(' + ')} na ${b.nome}`)}&dates=${new Date(criado.inicio).toISOString().replace(/[-:]|\.\d{3}/g, '')}/${new Date(criado.fim).toISOString().replace(/[-:]|\.\d{3}/g, '')}&location=${encodeURIComponent(`${b.logradouro}, ${b.numero} - ${b.bairro}, ${b.cidade}`)}`
    : '#'

  return (
    <div className={`pub ${passo === 1 ? 'pub-com-vitrine' : ''}`}>
      {passo === 1 && (
        <Vitrine dados={estado} media={media} servicos={servicosAtivos} servicoIds={servicoIds} alternarServico={alternarServico}
          nome={nome} setNome={setNome} tel={tel} setTel={setTel} reservar={pagina.reservarProduto} />
      )}
      <div className="pub-wrap">
        {passo > 1 && (
          <header className="pub-capa pub-capa-mini">
            <div className="pub-titulo">
              {b.logo_url && <img className="pub-logo" src={b.logo_url} alt="" />}
              <h1>{b.nome}</h1>
            </div>
          </header>
        )}

        {passo > 1 && passo < 5 && (
          <div className="pub-passos" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <span key={n} className={n <= passo ? 'feito' : ''} />)}
          </div>
        )}
        {passo > 1 && passo < 5 && (
          <button className="pub-voltar" onClick={voltar}>
            <ArrowLeft /> Voltar
          </button>
        )}

        {passo > 1 && (
        <div key={passo} className={dir === 'frente' ? 'passo-frente' : 'passo-tras'}>
        {/* 2. barbeiro */}
        {passo === 2 && (
          <section>
            <div className="pub-passo-tit"><span className="n">2</span><h2>Com quem?</h2></div>
            <div className="pub-opcoes" role="group" aria-label="Barbeiro">
              {barbeiros.length > 1 && (
                <button className="pub-opcao barbeiro" aria-pressed={membroId === QUALQUER} onClick={() => setMembroId(QUALQUER)}>
                  <span className="avatar" style={{ ['--tam' as string]: '46px', background: 'var(--sup-2)', color: 'var(--kort)' }}>?</span>
                  <span className="t">Quem estiver livre</span>
                  <span className="d">Mostra mais horários</span>
                  <span className="p" />
                </button>
              )}
              {barbeiros.map((m, i) => (
                <button key={m.id} style={atraso(i + 1)} className="pub-opcao barbeiro" aria-pressed={membroId === m.id} onClick={() => setMembroId(m.id)}>
                  <Avatar nome={m.nome_exibicao} cor={m.cor_agenda} tam={46} />
                  <span className="t">{m.nome_exibicao}</span>
                  <span className="d">{m.bio}</span>
                  <span className="p" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 3. dia e hora */}
        {passo === 3 && (
          <section>
            <div className="pub-passo-tit"><span className="n">3</span><h2>Que dia e hora?</h2></div>
            {erroEnvio && <p className="pub-erro" role="alert">{erroEnvio}</p>}
            <div className="dias-tira" role="group" aria-label="Dia">
              {dias.map((d) => (
                <button
                  key={isoDia(d)}
                  aria-pressed={isoDia(d) === isoDia(dia)}
                  disabled={diaFechado(d)}
                  onClick={() => { setDia(d); setSlot(null) }}
                  aria-label={dataLonga(d)}
                >
                  {nomeDiaCurto(d.getDay())}
                  <b>{d.getDate()}</b>
                </button>
              ))}
            </div>
            <p style={{ margin: '16px 0 12px', fontWeight: 600 }}>{dataLonga(dia)}</p>
            {livres.length === 0 ? (
              <div className="pub-sem-horario">
                Sem horário livre nesse dia para {plural(duracao, 'minuto', 'minutos')} de serviço.
                <br />
                <button className="btn btn-sec btn-pequeno" onClick={() => { const prox = dias.find((d) => d > dia && !diaFechado(d)); if (prox) { setDia(prox); setSlot(null) } }}>
                  Ver o próximo dia
                </button>
              </div>
            ) : (
              periodos.map((p) => {
                const doPeriodo = livres.filter((l) => l.minuto >= p.de && l.minuto < p.ate)
                if (!doPeriodo.length) return null
                return (
                  <div key={p.nome}>
                    <div className="slots-periodo">{p.nome}</div>
                    <div className="slots" role="group" aria-label={`Horários da ${p.nome.toLowerCase()}`}>
                      {doPeriodo.map((s, i) => (
                        <button key={s.minuto} style={atraso(i, 18, 20)} aria-pressed={slot?.minuto === s.minuto} onClick={() => setSlot(s)}>
                          {s.hhmm}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </section>
        )}

        {/* 4. dados */}
        {passo === 4 && slot && (
          <section>
            <div className="pub-passo-tit"><span className="n">4</span><h2>Seus dados</h2></div>
            <p style={{ color: 'var(--txt-2)', marginBottom: 18, fontSize: 14.5 }}>
              {escolhidos.map((s) => s.nome).join(' + ')} {membroId !== QUALQUER && <>com {mapaMembro.get(membroId)?.nome_exibicao}</>}, {dataLonga(dia)} às {slot.hhmm}.
            </p>
            <div className="coluna gap-16">
              <Campo rotulo="Seu nome" id="nome" erro={erros.nome}>
                <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" placeholder="Como o barbeiro te chama" />
              </Campo>
              <Campo rotulo="WhatsApp" id="tel" erro={erros.tel} ajuda="A confirmação e o lembrete chegam por aqui.">
                <input id="tel" className="input" value={tel} onChange={(e) => setTel(mascaraTelefone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" />
              </Campo>
              <Campo rotulo="Recado para o barbeiro (opcional)" id="obs">
                <textarea id="obs" className="textarea" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: quero tirar bastante em cima" />
              </Campo>
            </div>
            {erroEnvio && <p className="pub-erro" role="alert">{erroEnvio}</p>}
            <p style={{ color: 'var(--txt-2)', fontSize: 12.5, marginTop: 14 }}>
              Ao confirmar você aceita receber mensagens da {b.nome} sobre este horário. O pagamento é feito na barbearia.
            </p>
          </section>
        )}

        {/* 5. confirmado */}
        {passo === 5 && criado && (
          <section>
            <div className="bilhete">
              <span className="ok"><Check /> Horário marcado</span>
              <h2>{minParaHhmm(new Date(criado.inicio).getHours() * 60 + new Date(criado.inicio).getMinutes())}</h2>
              <div className="quando">{dataLonga(criado.inicio)}</div>
              <dl>
                <dt style={{ ['--i' as string]: 0 }}>Serviço</dt>
                <dd style={{ ['--i' as string]: 1 }}>{criado.servicos.map((s) => s.nome).join(' + ')}</dd>
                <dt style={{ ['--i' as string]: 2 }}>Barbeiro</dt>
                <dd style={{ ['--i' as string]: 3 }}>{mapaMembro.get(criado.membro_id)?.nome_exibicao}</dd>
                <dt style={{ ['--i' as string]: 4 }}>Valor</dt>
                <dd style={{ ['--i' as string]: 5 }}>{dinheiroCurto(criado.valor_previsto_centavos)}, pago na hora</dd>
                <dt style={{ ['--i' as string]: 6 }}>Endereço</dt>
                <dd style={{ ['--i' as string]: 7 }}>{b.logradouro}, {b.numero}</dd>
              </dl>
            </div>
            <a className="btn btn-primario btn-grande btn-bloco btn-whats" style={{ marginTop: 20 }} target="_blank" rel="noreferrer"
              href={`https://wa.me/${(b.whatsapp ?? b.telefone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(textoComprovante())}`}>
              <IconeWhats /> Mandar o comprovante para a barbearia
            </a>
            <p style={{ color: 'var(--txt-2)', fontSize: 13.5, marginTop: 10 }}>
              Vai no WhatsApp com o horário e o link para mudar, cancelar ou marcar de novo. Assim o link fica salvo na conversa.
            </p>
            <div className="pub-acoes-final">
              <a className="btn btn-sec" href={linkAgenda} target="_blank" rel="noreferrer"><CalendarPlus /> Pôr na agenda</a>
              <Link className="btn btn-sec" to={linkHorario}>Mudar ou cancelar</Link>
              <button className="btn btn-sec" onClick={async () => {
                const url = `${window.location.origin}${linkHorario}`
                if (navigator.share) await navigator.share({ title: `Meu horário na ${b.nome}`, text: textoComprovante(), url }).catch(() => {})
                else { await navigator.clipboard?.writeText(url).catch(() => {}); setCopiado(true) }
              }}><Share2 /> {copiado ? 'Link copiado' : 'Guardar o link'}</button>
            </div>
            <button
              className="btn btn-fantasma btn-bloco"
              style={{ color: 'var(--txt-2)', marginTop: 8 }}
              onClick={() => { setPasso(1); setServicoIds([]); setSlot(null); setCriado(null); setMembroId('') }}
            >
              Marcar outro horário
            </button>
          </section>
        )}

        </div>
        )}

        <footer className="pub-rodape">
          <span>Agendamento online</span>
          <Link to="/">
            feito com <img src="/logo-sm.png" alt="Kort" />
          </Link>
        </footer>
      </div>

      {passo < 5 && (passo > 1 || servicoIds.length > 0) && (
        <div className={`pub-resumo ${passo === 1 ? 'pub-resumo-vitrine' : ''}`}>
          <div className="pub-resumo-in">
            <div>
              <div className="tot"><TextoContado texto={total ? dinheiroCurto(total) : 'R$ 0'} ms={400} /></div>
              <div className="det">
                {escolhidos.length ? `${plural(escolhidos.length, 'serviço', 'serviços')}, ${duracao} min` : 'Escolha um serviço'}
                {slot && passo >= 3 ? `, ${nomeDiaCurto(dia.getDay())} ${slot.hhmm}` : ''}
              </div>
            </div>
            <button className="btn btn-primario btn-grande" disabled={!podeAvancar || enviando} onClick={avancar}>
              {passo === 4 ? (enviando ? 'Marcando...' : 'Confirmar horário') : passo === 1 ? 'Escolher horário' : 'Continuar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
