// Folhas usadas em mais de uma tela: detalhe do horário, novo horário e comanda.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, MessageCircle, Minus, Plus, Search, UserPlus, CalendarClock, Armchair, Check, X, AlertTriangle, Receipt } from 'lucide-react'
import { useKort, useMapas, totalComanda, subtotalComanda } from '../lib/store'
import { horariosLivres } from '../lib/agenda'
import {
  dataLonga, dataRelativa, dinheiro, dinheiroCurto, hora, hoje, isoDia, LABEL_FORMA, LABEL_ORIGEM, mascaraTelefone,
  nomeDiaCurto, paraCentavos, somaDias, telefone, telefoneE164, tempoAtras,
} from '../lib/format'
import type { Agendamento, FormaPagamento } from '../lib/types'
import { Avatar, Confirmar, Folha, StatusTag } from './ui'
import { useAvisar } from './avisos'

const whatsLink = (tel: string, texto = '') => `https://wa.me/${tel.replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`

/* =====================================================================
   Detalhe do horário
   ===================================================================== */
export function FolhaAgendamento(props: { agendamentoId: string | null; aoFechar: () => void; aoAbrirComanda: (id: string) => void; aoRemarcar: (ag: Agendamento) => void }) {
  const { estado, acoes } = useKort()
  const { cliente, membro } = useMapas()
  const avisar = useAvisar()
  const [confirmar, setConfirmar] = useState<null | 'cancelado' | 'faltou'>(null)
  const ag = estado.agendamentos.find((a) => a.id === props.agendamentoId)
  if (!ag) return null
  const c = cliente.get(ag.cliente_id)
  const m = membro.get(ag.membro_id)
  const comanda = estado.comandas.find((x) => x.agendamento_id === ag.id && x.status !== 'cancelada')
  const historico = estado.agendamentos.filter((a) => a.cliente_id === ag.cliente_id && a.status === 'concluido' && a.id !== ag.id).slice(-3).reverse()
  const ativo = ag.status === 'agendado' || ag.status === 'confirmado' || ag.status === 'em_atendimento'

  return (
    <>
      <Folha
        aberta={!!ag}
        aoFechar={props.aoFechar}
        titulo={`${hora(ag.inicio)} às ${hora(ag.fim)}`}
        subtitulo={<>{dataLonga(ag.inicio)}, com {m?.nome_exibicao}</>}
        rodape={
          ativo ? (
            <>
              {ag.status === 'agendado' && (
                <button className="btn btn-sec" onClick={() => { acoes.mudarStatus(ag.id, 'confirmado'); avisar('Horário confirmado') }}>
                  <Check /> Confirmar
                </button>
              )}
              <button className="btn btn-primario" onClick={() => props.aoAbrirComanda(acoes.abrirComanda({ agendamentoId: ag.id, membroId: ag.membro_id }))}>
                {comanda ? <><Receipt /> Ver comanda</> : <><Armchair /> Começar atendimento</>}
              </button>
            </>
          ) : comanda ? (
            <button className="btn btn-sec" onClick={() => props.aoAbrirComanda(comanda.id)}><Receipt /> Ver comanda</button>
          ) : undefined
        }
      >
        <div className="linha-flex" style={{ marginBottom: 16 }}>
          <StatusTag status={ag.status} />
          <span className="tag">{LABEL_ORIGEM[ag.origem]}</span>
        </div>

        {c && (
          <div className="painel" style={{ padding: 14, marginBottom: 18 }}>
            <div className="linha-flex">
              <Avatar nome={c.nome} tam={42} />
              <div className="cresce">
                <Link to={`/app/clientes/${c.id}`} style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>{c.nome}</Link>
                <div className="muted pequeno">{telefone(c.telefone)}</div>
              </div>
              <a className="btn btn-sec btn-icone" href={`tel:${c.telefone}`} aria-label="Ligar"><Phone size={17} /></a>
              <a className="btn btn-sec btn-icone" href={whatsLink(c.telefone)} target="_blank" rel="noreferrer" aria-label="Abrir conversa no WhatsApp"><MessageCircle size={17} /></a>
            </div>
            <div className="linha-flex pequeno" style={{ marginTop: 12, gap: 18, flexWrap: 'wrap' }}>
              <span><b>{c.total_visitas}</b> <span className="muted">visitas</span></span>
              <span><b>{dinheiroCurto(c.total_gasto_centavos)}</b> <span className="muted">no total</span></span>
              {c.frequencia_media_dias && <span className="muted">volta a cada {Math.round(c.frequencia_media_dias)} dias</span>}
            </div>
            {c.observacoes && <p className="pequeno" style={{ marginTop: 10, padding: '8px 10px', background: 'var(--kort-suave)', borderRadius: 6 }}>{c.observacoes}</p>}
          </div>
        )}

        <div className="rotulo" style={{ marginBottom: 6 }}>Serviços</div>
        <ul className="lista" style={{ marginBottom: 6 }}>
          {ag.servicos.map((s, i) => (
            <li key={i}>
              <span className="cresce">{s.nome}</span>
              <span className="muted pequeno">{s.duracao_min} min</span>
              <span className="num" style={{ fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{dinheiroCurto(s.preco_centavos)}</span>
            </li>
          ))}
        </ul>
        <div className="linha-flex entre" style={{ fontWeight: 700, padding: '8px 0 0', borderTop: '1px solid var(--linha)' }}>
          <span>Previsto</span>
          <span className="num">{dinheiroCurto(ag.valor_previsto_centavos)}</span>
        </div>

        {ag.observacao_cliente && (
          <>
            <div className="rotulo" style={{ marginTop: 18, marginBottom: 6 }}>Recado do cliente</div>
            <p className="pequeno">{ag.observacao_cliente}</p>
          </>
        )}

        {historico.length > 0 && (
          <>
            <div className="rotulo" style={{ marginTop: 20, marginBottom: 4 }}>Últimas visitas</div>
            <ul className="lista">
              {historico.map((h) => (
                <li key={h.id} className="pequeno">
                  <span className="muted" style={{ width: 80 }}>{dataRelativa(h.inicio)}</span>
                  <span className="cresce trunca">{h.servicos.map((s) => s.nome).join(' + ')}</span>
                  <span className="muted">{membro.get(h.membro_id)?.nome_exibicao}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {ativo && (
          <>
            <div className="separador" />
            <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-sec btn-pequeno" onClick={() => props.aoRemarcar(ag)}><CalendarClock /> Remarcar</button>
              {c && (
                <a className="btn btn-sec btn-pequeno" target="_blank" rel="noreferrer"
                  href={whatsLink(c.telefone, `E aí, ${c.nome.split(' ')[0]}! Confirmando seu horário ${dataRelativa(ag.inicio)} às ${hora(ag.inicio)} com ${m?.nome_exibicao}.`)}>
                  <MessageCircle /> Lembrar agora
                </a>
              )}
              <button className="btn btn-perigo btn-pequeno" onClick={() => setConfirmar('faltou')}><AlertTriangle /> Faltou</button>
              <button className="btn btn-perigo btn-pequeno" onClick={() => setConfirmar('cancelado')}><X /> Cancelar</button>
            </div>
          </>
        )}
      </Folha>
      <Confirmar
        aberto={!!confirmar}
        titulo={confirmar === 'faltou' ? 'Marcar falta?' : 'Cancelar horário?'}
        texto={confirmar === 'faltou' ? 'O horário fica registrado como falta no histórico do cliente e entra na taxa de faltas do mês.' : 'O horário volta a ficar livre na agenda e no link.'}
        acao={confirmar === 'faltou' ? 'Marcar falta' : 'Cancelar horário'}
        perigo
        aoCancelar={() => setConfirmar(null)}
        aoConfirmar={() => {
          acoes.mudarStatus(ag.id, confirmar!)
          avisar(confirmar === 'faltou' ? 'Falta registrada' : 'Horário cancelado')
          setConfirmar(null)
          props.aoFechar()
        }}
      />
    </>
  )
}

/* =====================================================================
   Novo horário (ou remarcar)
   ===================================================================== */
export function FolhaNovoHorario(props: {
  aberta: boolean
  aoFechar: () => void
  inicial?: { membroId?: string; dia?: Date; minuto?: number; clienteId?: string }
  remarcando?: Agendamento | null
}) {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState<string>('')
  const [novo, setNovo] = useState<{ nome: string; tel: string } | null>(null)
  const [servicoIds, setServicoIds] = useState<string[]>([])
  const [membroId, setMembroId] = useState('')
  const [dia, setDia] = useState(hoje())
  const [minuto, setMinuto] = useState<number | null>(null)
  const [encaixe, setEncaixe] = useState(false)

  useEffect(() => {
    if (!props.aberta) return
    const r = props.remarcando
    setBusca('')
    setNovo(null)
    setEncaixe(false)
    setClienteId(r?.cliente_id ?? props.inicial?.clienteId ?? '')
    setServicoIds(r ? r.servicos.map((s) => s.servico_id!).filter(Boolean) : [])
    setMembroId(r?.membro_id ?? props.inicial?.membroId ?? estado.membros.find((m) => m.atende && m.ativo)?.id ?? '')
    const d = r ? new Date(r.inicio) : props.inicial?.dia ?? hoje()
    const d0 = new Date(d)
    d0.setHours(0, 0, 0, 0)
    setDia(d0)
    setMinuto(r ? null : props.inicial?.minuto ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.aberta])

  const servs = servicoIds.map((id) => estado.servicos.find((s) => s.id === id)!).filter(Boolean)
  const duracao = props.remarcando
    ? (new Date(props.remarcando.fim).getTime() - new Date(props.remarcando.inicio).getTime()) / 60000
    : servs.reduce((t, s) => t + s.duracao_min, 0)

  const livres = useMemo(
    () =>
      duracao && membroId
        ? horariosLivres({ dia, membroId, duracao, jornadas: estado.jornadas, agendamentos: estado.agendamentos, bloqueios: estado.bloqueios,
            grade: estado.barbearia.intervalo_slots_min, ignorarAgendamentoId: props.remarcando?.id, agora: new Date(Date.now() - 31 * 60000) })
        : [],
    [duracao, membroId, dia, estado.jornadas, estado.agendamentos, estado.bloqueios, estado.barbearia.intervalo_slots_min, props.remarcando],
  )

  const resultados = busca.trim().length >= 2
    ? estado.clientes.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca.replace(/\D/g, ''))).slice(0, 6)
    : []
  const cli = estado.clientes.find((c) => c.id === clienteId)
  const minutoValido = minuto !== null && (encaixe || livres.some((l) => l.minuto === minuto))
  const pronto = (props.remarcando || ((cli || (novo && novo.nome && novo.tel.replace(/\D/g, '').length >= 10)) && servs.length)) && membroId && minutoValido

  const salvar = () => {
    const ini = new Date(dia)
    ini.setHours(0, minuto!, 0, 0)
    if (props.remarcando) {
      acoes.remarcar(props.remarcando.id, membroId, ini)
      avisar(`Remarcado para ${dataRelativa(ini)} às ${hora(ini)}`)
    } else {
      acoes.criarAgendamento({
        clienteId: cli?.id,
        novoCliente: !cli && novo ? { nome: novo.nome, telefone: telefoneE164(novo.tel) } : undefined,
        membroId, inicio: ini, servicoIds, origem: encaixe ? 'encaixe' : 'balcao', status: 'confirmado',
      })
      avisar(`Horário marcado ${dataRelativa(ini)} às ${hora(ini)}`)
    }
    props.aoFechar()
  }

  const barbeiros = estado.membros.filter((m) => m.ativo && m.atende && (servs.length === 0 || servs.every((s) => s.membros.includes(m.id))))

  return (
    <Folha
      aberta={props.aberta}
      aoFechar={props.aoFechar}
      titulo={props.remarcando ? 'Remarcar' : 'Novo horário'}
      subtitulo={props.remarcando ? `${estado.clientes.find((c) => c.id === props.remarcando!.cliente_id)?.nome}, ${props.remarcando.servicos.map((s) => s.nome).join(' + ')}` : 'O cliente recebe a confirmação no WhatsApp.'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={props.aoFechar}>Cancelar</button>
          <button className="btn btn-primario" disabled={!pronto} onClick={salvar}>
            {props.remarcando ? 'Salvar novo horário' : 'Marcar horário'}
          </button>
        </>
      }
    >
      <div className="coluna gap-16">
        {!props.remarcando && (
          <div className="campo">
            <span className="rotulo">Cliente</span>
            {cli ? (
              <div className="linha-flex painel" style={{ padding: 10 }}>
                <Avatar nome={cli.nome} tam={32} />
                <div className="cresce">
                  <div style={{ fontWeight: 600 }}>{cli.nome}</div>
                  <div className="muted pequeno">{telefone(cli.telefone)}, última visita {tempoAtras(cli.ultima_visita_em)}</div>
                </div>
                <button className="btn btn-fantasma btn-pequeno" onClick={() => setClienteId('')}>Trocar</button>
              </div>
            ) : novo ? (
              <div className="grade-campos">
                <input className="input" placeholder="Nome" aria-label="Nome do cliente" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
                <input className="input" placeholder="WhatsApp" aria-label="WhatsApp do cliente" inputMode="tel" value={novo.tel} onChange={(e) => setNovo({ ...novo, tel: mascaraTelefone(e.target.value) })} />
                <button className="btn btn-fantasma btn-pequeno largo" style={{ justifySelf: 'start' }} onClick={() => setNovo(null)}>Buscar cliente cadastrado</button>
              </div>
            ) : (
              <>
                <div className="input-prefixo">
                  <span><Search size={16} /></span>
                  <input className="input" placeholder="Nome ou telefone" aria-label="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                {resultados.length > 0 && (
                  <ul className="lista painel" style={{ padding: '0 10px' }}>
                    {resultados.map((c) => (
                      <li key={c.id} style={{ padding: '8px 0' }}>
                        <button className="linha-flex" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', padding: 0 }} onClick={() => setClienteId(c.id)}>
                          <Avatar nome={c.nome} tam={28} />
                          <span className="cresce"><b style={{ fontWeight: 600 }}>{c.nome}</b> <span className="muted pequeno">{telefone(c.telefone)}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="btn btn-sec btn-pequeno" style={{ alignSelf: 'flex-start' }} onClick={() => setNovo({ nome: busca.replace(/\d/g, '').trim(), tel: '' })}>
                  <UserPlus /> Cliente novo
                </button>
              </>
            )}
          </div>
        )}

        {!props.remarcando && (
          <div className="campo">
            <span className="rotulo">Serviços</span>
            <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
              {estado.servicos.filter((s) => s.ativo).map((s) => (
                <button key={s.id} className="chip" aria-pressed={servicoIds.includes(s.id)}
                  onClick={() => setServicoIds(servicoIds.includes(s.id) ? servicoIds.filter((x) => x !== s.id) : [...servicoIds, s.id])}>
                  {s.nome} <span style={{ opacity: 0.6 }}>{dinheiroCurto(s.preco_centavos)}</span>
                </button>
              ))}
            </div>
            {servs.length > 0 && <span className="ajuda">{duracao} min, {dinheiroCurto(servs.reduce((t, s) => t + s.preco_centavos, 0))}</span>}
          </div>
        )}

        <div className="campo">
          <span className="rotulo">Barbeiro</span>
          <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
            {barbeiros.map((m) => (
              <button key={m.id} className="chip" aria-pressed={membroId === m.id} onClick={() => { setMembroId(m.id); setMinuto(null) }}>
                <span className="ponto" style={{ background: m.cor_agenda }} /> {m.nome_exibicao}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <span className="rotulo">Dia</span>
          <div className="dias-tira">
            {Array.from({ length: 21 }, (_, i) => somaDias(hoje(), i)).map((d) => (
              <button key={isoDia(d)} aria-pressed={isoDia(d) === isoDia(dia)} onClick={() => { setDia(d); setMinuto(null) }}>
                {nomeDiaCurto(d.getDay())}
                <b>{d.getDate()}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <div className="linha-flex entre">
            <span className="rotulo">Horário</span>
            <label className="pequeno linha-flex" style={{ gap: 6 }}>
              <input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} /> Encaixe fora da grade
            </label>
          </div>
          {encaixe ? (
            <input type="time" className="input" style={{ maxWidth: 160 }} aria-label="Horário do encaixe"
              value={minuto !== null ? `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}` : ''}
              onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setMinuto(h * 60 + m) }} />
          ) : !duracao ? (
            <span className="ajuda">Escolha um serviço para ver os horários.</span>
          ) : livres.length ? (
            <div className="slots">
              {livres.map((s) => <button key={s.minuto} aria-pressed={minuto === s.minuto} onClick={() => setMinuto(s.minuto)}>{s.hhmm}</button>)}
            </div>
          ) : (
            <span className="ajuda">Nenhum horário livre para {duracao} min nesse dia. Tente outro dia ou marque como encaixe.</span>
          )}
        </div>
      </div>
    </Folha>
  )
}

/* =====================================================================
   Comanda: o cliente paga o barbeiro por fora, aqui só se registra.
   ===================================================================== */
const FORMAS: FormaPagamento[] = ['pix', 'dinheiro', 'debito', 'credito', 'clube', 'outro']

export function FolhaComanda(props: { comandaId: string | null; aoFechar: () => void }) {
  const { estado, acoes } = useKort()
  const { cliente, membro } = useMapas()
  const avisar = useAvisar()
  const [forma, setForma] = useState<FormaPagamento | null>(null)
  const [desconto, setDesconto] = useState('')
  const [addTipo, setAddTipo] = useState<'servico' | 'produto'>('servico')
  const [cancelar, setCancelar] = useState(false)
  const [carimbo, setCarimbo] = useState<string | null>(null)
  const c = estado.comandas.find((x) => x.id === props.comandaId)

  useEffect(() => {
    setForma(c?.forma_pagamento ?? null)
    setDesconto(c && c.desconto_centavos ? String(c.desconto_centavos / 100).replace('.', ',') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.comandaId])

  if (!c) return null
  const cl = c.cliente_id ? cliente.get(c.cliente_id) : null
  const aberta = c.status === 'aberta'
  const total = totalComanda(c)
  const temClube = cl && estado.assinaturasClube.some((a) => a.cliente_id === cl.id && a.status === 'ativa')
  const comissao = c.itens.reduce((t, i) => t + Math.round((i.quantidade * i.preco_unit_centavos * i.comissao_pct) / 100), 0)

  return (
    <>
      <Folha
        aberta
        aoFechar={props.aoFechar}
        titulo={cl ? cl.nome : 'Venda avulsa'}
        subtitulo={<>Comanda de {membro.get(c.membro_id)?.nome_exibicao}{c.pago_em ? `, paga ${dataRelativa(c.pago_em)} às ${hora(c.pago_em)}` : ''}</>}
        rodape={
          aberta ? (
            <>
              <button className="btn btn-sec" onClick={() => setCancelar(true)}>Cancelar comanda</button>
              <button
                className="btn btn-primario"
                disabled={!forma || c.itens.length === 0}
                onClick={() => {
                  acoes.definirDesconto(c.id, paraCentavos(desconto))
                  acoes.confirmarPagamento(c.id, forma!)
                  const valor = dinheiro(Math.max(subtotalComanda(c) - paraCentavos(desconto), 0))
                  setCarimbo(valor)
                  setTimeout(() => {
                    setCarimbo(null)
                    avisar(`Pagamento de ${valor} confirmado`)
                    props.aoFechar()
                  }, 950)
                }}
              >
                Confirmar pagamento
              </button>
            </>
          ) : undefined
        }
      >
        {carimbo && (
          <div className="carimbo" role="status">
            <span>PAGO<small>{carimbo} no {LABEL_FORMA[forma ?? 'pix']}</small></span>
          </div>
        )}
        {!aberta && !carimbo && (
          <div className="linha-flex" style={{ marginBottom: 16 }}>
            <span className={`tag ${c.status === 'paga' ? 'tag-ok' : ''}`}>{c.status === 'paga' ? `Paga no ${LABEL_FORMA[c.forma_pagamento!]}` : 'Cancelada'}</span>
          </div>
        )}

        <ul className="lista">
          {c.itens.map((i) => (
            <li key={i.id}>
              <div className="cresce">
                <div style={{ fontWeight: 600 }}>{i.descricao}</div>
                <div className="muted pequeno">{i.tipo === 'produto' ? 'Produto' : 'Serviço'}{i.comissao_pct ? `, comissão ${i.comissao_pct}%` : ''}</div>
              </div>
              {aberta ? (
                <div className="linha-flex" style={{ gap: 4 }}>
                  <button className="btn btn-sec btn-icone" style={{ width: 30, height: 30 }} aria-label="Diminuir" onClick={() => acoes.alterarQuantidade(c.id, i.id, -1)}><Minus size={14} /></button>
                  <span className="num" style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{i.quantidade}</span>
                  <button className="btn btn-sec btn-icone" style={{ width: 30, height: 30 }} aria-label="Aumentar" onClick={() => acoes.alterarQuantidade(c.id, i.id, 1)}><Plus size={14} /></button>
                </div>
              ) : (
                i.quantidade > 1 && <span className="muted">{i.quantidade}x</span>
              )}
              <span className="num" style={{ minWidth: 76, textAlign: 'right', fontWeight: 600 }}>{dinheiro(i.quantidade * i.preco_unit_centavos)}</span>
            </li>
          ))}
        </ul>

        {aberta && (
          <div className="linha-flex" style={{ margin: '10px 0 18px', gap: 6 }}>
            <select className="select" style={{ width: 120 }} value={addTipo} onChange={(e) => setAddTipo(e.target.value as 'servico' | 'produto')} aria-label="Tipo de item">
              <option value="servico">Serviço</option>
              <option value="produto">Produto</option>
            </select>
            <select
              className="select cresce"
              value=""
              aria-label="Adicionar item"
              onChange={(e) => e.target.value && acoes.adicionarItem(c.id, { tipo: addTipo, refId: e.target.value })}
            >
              <option value="">Adicionar {addTipo === 'servico' ? 'serviço' : 'produto'}...</option>
              {addTipo === 'servico'
                ? estado.servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}, {dinheiroCurto(s.preco_centavos)}</option>)
                : estado.produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id} disabled={p.estoque_atual <= 0}>{p.nome}, {dinheiroCurto(p.preco_venda_centavos)}{p.estoque_atual <= 0 ? ' (sem estoque)' : ''}</option>)}
            </select>
          </div>
        )}

        <div className="coluna gap-8" style={{ borderTop: '1px solid var(--linha)', paddingTop: 12 }}>
          <div className="linha-flex entre pequeno"><span className="muted">Subtotal</span><span className="num">{dinheiro(subtotalComanda(c))}</span></div>
          <div className="linha-flex entre pequeno">
            <span className="muted">Desconto</span>
            {aberta ? (
              <div className="input-prefixo" style={{ width: 120 }}>
                <span>R$</span>
                <input className="input" style={{ height: 34, textAlign: 'right' }} inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" aria-label="Desconto em reais" />
              </div>
            ) : (
              <span className="num">{dinheiro(c.desconto_centavos)}</span>
            )}
          </div>
          <div className="linha-flex entre" style={{ alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span className="display num" style={{ fontSize: 38 }}>{dinheiro(aberta ? Math.max(subtotalComanda(c) - paraCentavos(desconto), 0) : total)}</span>
          </div>
          {comissao > 0 && <div className="muted pequeno" style={{ textAlign: 'right' }}>Comissão do barbeiro: {dinheiro(comissao)}</div>}
        </div>

        {aberta && (
          <div className="campo" style={{ marginTop: 22 }}>
            <span className="rotulo">Como o cliente pagou?</span>
            <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
              {FORMAS.filter((f) => f !== 'clube' || temClube).map((f) => (
                <button key={f} className="chip" aria-pressed={forma === f} onClick={() => setForma(f)}>{LABEL_FORMA[f]}</button>
              ))}
            </div>
            <span className="ajuda">O dinheiro vai direto para você. Aqui você só registra para o caixa e os relatórios fecharem.</span>
          </div>
        )}
      </Folha>
      <Confirmar
        aberto={cancelar}
        titulo="Cancelar comanda?"
        texto="Os itens não entram no caixa. O horário continua na agenda."
        acao="Cancelar comanda"
        perigo
        aoCancelar={() => setCancelar(false)}
        aoConfirmar={() => { acoes.cancelarComanda(c.id); setCancelar(false); props.aoFechar() }}
      />
    </>
  )
}

export { whatsLink }
