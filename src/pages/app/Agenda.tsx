import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Lock, Check, Armchair, Clock } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useKort, useMapas } from '../../lib/store'
import { expediente, pausas, horariosLivres } from '../../lib/agenda'
import { useMinuto, useTelaPequena } from '../../lib/hooks'
import {
  dataLonga, dataRelativa, dinheiroCurto, hhmmParaMin, hoje, hora, isoDia, mesmoDia, minParaHhmm, minutosDoDia, nomeDiaCurto,
  primeiroNome, somaDias,
} from '../../lib/format'
import type { Agendamento } from '../../lib/types'
import { Avatar, Campo, Folha, Segmentos } from '../../components/ui'
import { FolhaAgendamento, FolhaComanda, FolhaNovoHorario } from '../../components/folhas'
import { useAvisar } from '../../components/avisos'

type Visao = 'dia' | 'semana'

export default function Agenda() {
  const { estado, acoes } = useKort()
  const { cliente, membro } = useMapas()
  const avisar = useAvisar()
  const pequeno = useTelaPequena()
  const agora = useMinuto()

  const local = useLocation()
  const [dia, setDia] = useState(hoje())
  // "Ver na agenda" do aviso de horário novo abre no dia do horário
  useEffect(() => {
    const d = (local.state as { dia?: string } | null)?.dia
    if (d) {
      const x = new Date(d)
      x.setHours(0, 0, 0, 0)
      setDia(x)
    }
  }, [local.state])
  const [visao, setVisao] = useState<Visao>('dia')
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [comanda, setComanda] = useState<string | null>(null)
  const [novo, setNovo] = useState<null | { membroId?: string; dia?: Date; minuto?: number }>(null)
  const [remarcar, setRemarcar] = useState<Agendamento | null>(null)
  const [bloqueio, setBloqueio] = useState(false)
  const [membroMobile, setMembroMobile] = useState<string>(estado.usuarioMembroId)
  const scrollRef = useRef<HTMLDivElement>(null)

  const barbeiros = estado.membros.filter((m) => m.ativo && m.atende).sort((a, b) => a.ordem - b.ordem)
  const doDia = estado.agendamentos.filter((a) => mesmoDia(new Date(a.inicio), dia) && a.status !== 'cancelado')

  // janela de horas exibida: do primeiro expediente ao último
  const [hIni, hFim] = useMemo(() => {
    const exps = barbeiros.map((m) => expediente(estado.jornadas, m.id, dia)).filter(Boolean) as Array<[number, number]>
    if (!exps.length) return [9 * 60, 19 * 60]
    return [Math.floor(Math.min(...exps.map((e) => e[0])) / 60) * 60, Math.ceil(Math.max(...exps.map((e) => e[1])) / 60) * 60]
  }, [barbeiros, estado.jornadas, dia])

  const PX = 72 / 60 // pixels por minuto (72px por hora)
  const y = (min: number) => (min - hIni) * PX

  useEffect(() => {
    if (visao !== 'dia' || !scrollRef.current) return
    const alvo = mesmoDia(dia, new Date()) ? y(minutosDoDia(new Date())) - 120 : 0
    scrollRef.current.scrollTop = Math.max(0, alvo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, visao, pequeno])

  const previsto = doDia.filter((a) => a.status !== 'faltou').reduce((t, a) => t + a.valor_previsto_centavos, 0)
  const feitos = doDia.filter((a) => a.status === 'concluido').length
  const faltas = doDia.filter((a) => a.status === 'faltou').length

  const passo = visao === 'dia' ? 1 : 7
  const ehHoje = mesmoDia(dia, hoje())

  const abrirComanda = (id: string) => {
    setDetalhe(null)
    setComanda(id)
  }

  return (
    <div className="pagina cheia">
      <div className="agenda-barra">
        <div className="agenda-data">
          <button className="btn btn-sec btn-icone" aria-label={visao === 'dia' ? 'Dia anterior' : 'Semana anterior'} onClick={() => setDia(somaDias(dia, -passo))}><ChevronLeft size={18} /></button>
          <button className="btn btn-sec btn-icone" aria-label={visao === 'dia' ? 'Próximo dia' : 'Próxima semana'} onClick={() => setDia(somaDias(dia, passo))}><ChevronRight size={18} /></button>
          <h1>
            {visao === 'dia' ? (pequeno ? `${nomeDiaCurto(dia.getDay())}, ${dia.getDate()}` : dataLonga(dia)) : `Semana de ${somaDias(dia, -dia.getDay()).getDate()} a ${somaDias(dia, 6 - dia.getDay()).getDate()}`}
          </h1>
          {!ehHoje && <button className="btn btn-fantasma btn-pequeno" onClick={() => setDia(hoje())}>Hoje</button>}
          {ehHoje && visao === 'dia' && !pequeno && <span className="rel">hoje</span>}
        </div>
        {!pequeno && <Segmentos rotulo="Visualização" valor={visao} onChange={setVisao} opcoes={[['dia', 'Dia'], ['semana', 'Semana']]} />}
        <div className="agenda-resumo" aria-label="Resumo do dia">
          <span><b>{doDia.length - faltas}</b> horários</span>
          <span><b>{feitos}</b> atendidos</span>
          {faltas > 0 && <span><b>{faltas}</b> {faltas === 1 ? 'falta' : 'faltas'}</span>}
          <span><b>{dinheiroCurto(previsto)}</b> previsto</span>
        </div>
        <div className="linha-flex" style={{ gap: 8, marginLeft: pequeno ? 'auto' : 0 }}>
          {!pequeno && <button className="btn btn-sec" onClick={() => setBloqueio(true)}><Lock /> Bloquear</button>}
          <button className="btn btn-primario" onClick={() => setNovo({ dia })}><Plus /> {pequeno ? 'Novo' : 'Novo horário'}</button>
        </div>
      </div>

      {/* ---------- celular: um barbeiro por vez, em lista */}
      {pequeno && (
        <>
          <div className="seletor-barbeiro" role="group" aria-label="Barbeiro">
            {barbeiros.map((m) => (
              <button key={m.id} className="chip" aria-pressed={membroMobile === m.id} onClick={() => setMembroMobile(m.id)}>
                <span className="ponto" style={{ background: m.cor_agenda }} />
                {m.nome_exibicao}
                <span style={{ opacity: 0.6 }}>{doDia.filter((a) => a.membro_id === m.id && a.status !== 'faltou').length}</span>
              </button>
            ))}
          </div>
          <div className="agenda-scroll">
            <ListaDia
              dia={dia}
              membroId={membroMobile}
              aoAbrir={setDetalhe}
              aoNovo={(minuto) => setNovo({ membroId: membroMobile, dia, minuto })}
            />
          </div>
        </>
      )}

      {/* ---------- desktop: colunas por barbeiro */}
      {!pequeno && visao === 'dia' && (
        <div className="agenda-scroll" ref={scrollRef}>
          <div className="agenda-grade" key={isoDia(dia)} style={{ ['--cols' as string]: barbeiros.length }}>
            <div className="agenda-cab">
              <div />
              {barbeiros.map((m) => {
                const qtd = doDia.filter((a) => a.membro_id === m.id && a.status !== 'faltou').length
                const exp = expediente(estado.jornadas, m.id, dia)
                return (
                  <div key={m.id}>
                    <Avatar nome={m.nome_exibicao} cor={m.cor_agenda} tam={30} />
                    <div className="cresce">
                      <div className="nome trunca">{m.nome_exibicao}</div>
                      <div className="det">{exp ? `${qtd} ${qtd === 1 ? 'horário' : 'horários'}` : 'Folga'}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="agenda-regua" style={{ height: (hFim - hIni) * PX }}>
              {Array.from({ length: (hFim - hIni) / 60 + 1 }, (_, i) => (
                <span key={i} style={{ top: i * 72 + (i === 0 ? 8 : 0) }}>{minParaHhmm(hIni + i * 60)}</span>
              ))}
            </div>

            {barbeiros.map((m, col) => {
              const exp = expediente(estado.jornadas, m.id, dia)
              const pz = pausas(estado.jornadas, m.id, dia)
              const bls = estado.bloqueios.filter((b) => (b.membro_id === m.id || !b.membro_id) && mesmoDia(new Date(b.inicio), dia))
              const ags = doDia.filter((a) => a.membro_id === m.id)
              const slots: number[] = []
              if (exp) for (let t = exp[0]; t < exp[1]; t += 30) slots.push(t)
              return (
                <div key={m.id} className="agenda-col" style={{ height: (hFim - hIni) * PX, ['--cor' as string]: m.cor_agenda }}>
                  {!exp && <div className="fora" style={{ top: 0, height: '100%' }} />}
                  {exp && exp[0] > hIni && <div className="fora" style={{ top: 0, height: y(exp[0]) }} />}
                  {exp && exp[1] < hFim && <div className="fora" style={{ top: y(exp[1]), bottom: 0 }} />}
                  {pz.map(([a, b]) => <div key={a} className="fora" style={{ top: y(a), height: (b - a) * PX }} />)}

                  {slots.map((t) => (
                    <button key={t} className="agenda-slot" style={{ top: y(t), height: 30 * PX }} data-hora={minParaHhmm(t)}
                      aria-label={`Marcar com ${m.nome_exibicao} às ${minParaHhmm(t)}`} onClick={() => setNovo({ membroId: m.id, dia, minuto: t })} />
                  ))}

                  {bls.map((b) => {
                    const ini = minutosDoDia(b.inicio)
                    const fim = minutosDoDia(b.fim)
                    return (
                      <div key={b.id} className="bloqueio" style={{ top: y(ini) + 1, height: (fim - ini) * PX - 2, zIndex: 2 }}>
                        <span><Lock size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {b.motivo || 'Bloqueado'}</span>
                        <button onClick={() => { acoes.removerBloqueio(b.id); avisar('Bloqueio removido') }}>Liberar</button>
                      </div>
                    )
                  })}

                  {ags.map((a, i) => {
                    const ini = minutosDoDia(a.inicio)
                    const fim = minutosDoDia(a.fim)
                    const alt = (fim - ini) * PX - 2
                    const c = cliente.get(a.cliente_id)
                    return (
                      <button key={a.id} className={`ag ${alt < 58 ? 'curto' : ''}`} data-status={a.status}
                        style={{ top: y(ini) + 1, height: alt, ['--cor' as string]: m.cor_agenda, ['--atraso' as string]: `${Math.min(i, 10) * 40 + col * 30}ms` }} onClick={() => setDetalhe(a.id)}>
                        <span className="h">
                          {hora(a.inicio)}
                          {a.status === 'confirmado' && <Check aria-label="confirmado" />}
                          {a.status === 'em_atendimento' && <Armchair aria-label="na cadeira" />}
                          {a.status === 'agendado' && <Clock aria-label="aguardando confirmação" />}
                        </span>
                        <span className="c trunca">{c ? c.nome : 'Cliente'}</span>
                        <span className="s trunca">{a.servicos.map((s) => s.nome).join(' + ')}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}

            {ehHoje && minutosDoDia(agora) >= hIni && minutosDoDia(agora) <= hFim && (
              <div className="agora" style={{ top: 49 + y(minutosDoDia(agora)) }}>
                <span>{hora(agora)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!pequeno && visao === 'semana' && (
        <div className="agenda-scroll">
          <div className="semana">
            {Array.from({ length: 7 }, (_, i) => somaDias(dia, i - dia.getDay())).map((d) => {
              const ags = estado.agendamentos.filter((a) => mesmoDia(new Date(a.inicio), d) && a.status !== 'cancelado')
              return (
                <div key={isoDia(d)} className={`semana-dia ${mesmoDia(d, hoje()) ? 'hoje' : ''}`}>
                  <header>
                    <b>{d.getDate()}</b>
                    <span className="muted pequeno">{nomeDiaCurto(d.getDay())}, {ags.filter((a) => a.status !== 'faltou').length} horários</span>
                  </header>
                  <ul>
                    {ags.map((a) => (
                      <li key={a.id}>
                        <button style={{ ['--cor' as string]: membro.get(a.membro_id)?.cor_agenda }} onClick={() => setDetalhe(a.id)}>
                          <b>{hora(a.inicio)}</b> {primeiroNome(cliente.get(a.cliente_id)?.nome ?? '')}
                          <div className="muted trunca">{a.servicos.map((s) => s.nome).join(' + ')}</div>
                        </button>
                      </li>
                    ))}
                    {!ags.length && <li className="muted pequeno" style={{ padding: 6 }}>Sem horários</li>}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!pequeno && visao === 'dia' && (
        <div className="agenda-barra" style={{ borderTop: '1px solid var(--linha)', borderBottom: 0, paddingTop: 8, paddingBottom: 8 }}>
          <div className="agenda-legenda">
            <span><i className="agendado" />Aguardando confirmação</span>
            <span><i />Confirmado</span>
            <span><i className="em" />Na cadeira</span>
            <span><i className="conc" />Concluído</span>
            <span><i className="falt" />Faltou</span>
          </div>
          <span className="muted pequeno" style={{ marginLeft: 'auto' }}>Clique num espaço vazio para marcar</span>
        </div>
      )}

      <FolhaAgendamento agendamentoId={detalhe} aoFechar={() => setDetalhe(null)} aoAbrirComanda={abrirComanda}
        aoRemarcar={(ag) => { setDetalhe(null); setRemarcar(ag) }} />
      <FolhaComanda comandaId={comanda} aoFechar={() => setComanda(null)} />
      <FolhaNovoHorario aberta={!!novo || !!remarcar} inicial={novo ?? undefined} remarcando={remarcar}
        aoFechar={() => { setNovo(null); setRemarcar(null) }} />
      <FolhaBloqueio aberta={bloqueio} aoFechar={() => setBloqueio(false)} dia={dia} />
    </div>
  )
}

/* lista do dia no celular, com os buracos livres entre os horários */
function ListaDia(props: { dia: Date; membroId: string; aoAbrir: (id: string) => void; aoNovo: (minuto: number) => void }) {
  const { estado } = useKort()
  const { cliente, membro } = useMapas()
  const m = membro.get(props.membroId)
  const exp = expediente(estado.jornadas, props.membroId, props.dia)
  const ags = estado.agendamentos.filter((a) => a.membro_id === props.membroId && mesmoDia(new Date(a.inicio), props.dia) && a.status !== 'cancelado')
  const livres = horariosLivres({ dia: props.dia, membroId: props.membroId, duracao: 30, jornadas: estado.jornadas, agendamentos: estado.agendamentos,
    bloqueios: estado.bloqueios, grade: 30, agora: new Date(Date.now() - 31 * 60000) })

  if (!exp) return <div className="dia-lista"><p className="muted">{m?.nome_exibicao} está de folga neste dia.</p></div>

  // monta a linha do tempo: horários marcados + blocos livres agrupados
  type Linha = { tipo: 'ag'; a: Agendamento; t: number } | { tipo: 'livre'; de: number; ate: number; t: number }
  const linhas: Linha[] = ags.map((a) => ({ tipo: 'ag', a, t: minutosDoDia(a.inicio) }))
  let bloco: { de: number; ate: number } | null = null
  for (const s of livres) {
    if (bloco && s.minuto === bloco.ate) bloco.ate += 30
    else {
      if (bloco) linhas.push({ tipo: 'livre', ...bloco, t: bloco.de })
      bloco = { de: s.minuto, ate: s.minuto + 30 }
    }
  }
  if (bloco) linhas.push({ tipo: 'livre', ...bloco, t: bloco.de })
  linhas.sort((a, b) => a.t - b.t)

  return (
    <div className="dia-lista" key={`${props.membroId}${isoDia(props.dia)}`}>
      {linhas.map((l, i) =>
        l.tipo === 'ag' ? (
          <button key={l.a.id} className="item" style={{ ['--cor' as string]: m?.cor_agenda, ['--atraso' as string]: `${Math.min(i, 10) * 35}ms` }} data-status={l.a.status} onClick={() => props.aoAbrir(l.a.id)}>
            <span className="hh">{hora(l.a.inicio)}</span>
            <span className="coluna" style={{ minWidth: 0 }}>
              <b className="trunca" style={l.a.status === 'faltou' ? { textDecoration: 'line-through' } : undefined}>{cliente.get(l.a.cliente_id)?.nome}</b>
              <span className="muted pequeno trunca">{l.a.servicos.map((s) => s.nome).join(' + ')}</span>
            </span>
            <span className={`tag ${l.a.status === 'confirmado' ? 'tag-preto' : l.a.status === 'em_atendimento' ? 'tag-kort' : l.a.status === 'concluido' ? 'tag-ok' : l.a.status === 'faltou' ? 'tag-perigo' : ''}`}>
              {l.a.status === 'agendado' ? 'Aguardando' : l.a.status === 'confirmado' ? 'Confirmado' : l.a.status === 'em_atendimento' ? 'Na cadeira' : l.a.status === 'concluido' ? 'Feito' : 'Faltou'}
            </span>
          </button>
        ) : (
          <button key={`l${l.de}`} className="livre" style={{ ['--atraso' as string]: `${Math.min(i, 10) * 35}ms` }} onClick={() => props.aoNovo(l.de)}>
            <b>Livre</b> das {minParaHhmm(l.de)} às {minParaHhmm(l.ate)}. Toque para marcar.
          </button>
        ),
      )}
      {!linhas.length && <p className="muted">Nenhum horário {dataRelativa(props.dia)}.</p>}
    </div>
  )
}

function FolhaBloqueio(props: { aberta: boolean; aoFechar: () => void; dia: Date }) {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [membroId, setMembroId] = useState<string>('todos')
  const [data, setData] = useState(isoDia(props.dia))
  const [de, setDe] = useState('12:00')
  const [ate, setAte] = useState('13:00')
  const [motivo, setMotivo] = useState('')
  useEffect(() => setData(isoDia(props.dia)), [props.dia])

  const salvar = () => {
    const [a, m, d] = data.split('-').map(Number)
    const ini = new Date(a, m - 1, d, 0, hhmmParaMin(de))
    const fim = new Date(a, m - 1, d, 0, hhmmParaMin(ate))
    acoes.criarBloqueio(membroId === 'todos' ? null : membroId, ini, fim, motivo)
    avisar('Horário bloqueado')
    props.aoFechar()
  }

  return (
    <Folha aberta={props.aberta} aoFechar={props.aoFechar} titulo="Bloquear horário" subtitulo="Nesse intervalo ninguém consegue marcar pelo link."
      rodape={<><button className="btn btn-sec" onClick={props.aoFechar}>Cancelar</button><button className="btn btn-primario" onClick={salvar} disabled={hhmmParaMin(ate) <= hhmmParaMin(de)}>Bloquear</button></>}>
      <div className="grade-campos">
        <Campo rotulo="Quem" id="bq-quem" className="largo">
          <select id="bq-quem" className="select" value={membroId} onChange={(e) => setMembroId(e.target.value)}>
            <option value="todos">Barbearia inteira</option>
            {estado.membros.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome_exibicao}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Dia" id="bq-dia" className="largo"><input id="bq-dia" type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Das" id="bq-de"><input id="bq-de" type="time" className="input" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até" id="bq-ate"><input id="bq-ate" type="time" className="input" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        <Campo rotulo="Motivo (só a equipe vê)" id="bq-mot" className="largo"><input id="bq-mot" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: médico, curso, almoço longo" /></Campo>
      </div>
    </Folha>
  )
}
