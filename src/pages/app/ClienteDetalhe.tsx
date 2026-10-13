import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, MessageCircle, Phone, Pencil, Gift } from 'lucide-react'
import { useKort, useMapas, totalComanda } from '../../lib/store'
import {
  dataCompleta, dataCurta, dataRelativa, deIsoDia, diasEntre, dinheiro, dinheiroCurto, hoje, hora, LABEL_FORMA, mascaraTelefone,
  telefone, telefoneE164, primeiroNome, linkPublico } from '../../lib/format'
import { CabecalhoPagina, Campo, Confirmar, Folha, Metricas, StatusTag, Switch, Vazio } from '../../components/ui'
import { FolhaNovoHorario, whatsLink } from '../../components/folhas'
import { useAvisar } from '../../components/avisos'

export default function ClienteDetalhe() {
  const { id } = useParams()
  const { estado, acoes } = useKort()
  const { membro } = useMapas()
  const avisar = useAvisar()
  const [editar, setEditar] = useState(false)
  const [marcar, setMarcar] = useState(false)
  const [resgatar, setResgatar] = useState(false)
  const c = estado.clientes.find((x) => x.id === id)
  const [form, setForm] = useState(() => ({ nome: c?.nome ?? '', tel: c ? telefone(c.telefone) : '', obs: c?.observacoes ?? '', msgs: c?.aceita_mensagens ?? true, nasc: c?.data_nascimento ?? '' }))

  if (!c) return <Vazio titulo="Cliente não encontrado" acao={<Link className="btn btn-sec" to="/app/clientes">Voltar para clientes</Link>} />

  const ags = estado.agendamentos.filter((a) => a.cliente_id === c.id).sort((a, b) => b.inicio.localeCompare(a.inicio))
  const futuros = ags.filter((a) => new Date(a.inicio) > new Date() && (a.status === 'agendado' || a.status === 'confirmado')).reverse()
  const passados = ags.filter((a) => !futuros.includes(a))
  const faltas = ags.filter((a) => a.status === 'faltou').length
  const saldo = estado.movimentosFidelidade.filter((m) => m.cliente_id === c.id).reduce((t, m) => t + m.pontos, 0)
  const meta = estado.fidelidade.visitas_para_premio
  const assinatura = estado.assinaturasClube.find((a) => a.cliente_id === c.id && a.status !== 'cancelada')
  const plano = assinatura ? estado.planosClube.find((p) => p.id === assinatura.plano_clube_id) : null
  const indicados = estado.clientes.filter((x) => x.indicado_por_id === c.id)
  const atraso = c.proximo_retorno_previsto ? diasEntre(deIsoDia(c.proximo_retorno_previsto), hoje()) : null
  const comandaDe = (agId: string) => estado.comandas.find((x) => x.agendamento_id === agId && x.status === 'paga')

  return (
    <>
      <CabecalhoPagina
        voltar={<Link to="/app/clientes" className="voltar"><ArrowLeft /> Clientes</Link>}
        titulo={c.nome}
        sub={<>{telefone(c.telefone)}{c.membro_preferido_id && <>, costuma cortar com {membro.get(c.membro_preferido_id)?.nome_exibicao}</>}</>}
        acoes={
          <>
            <a className="btn btn-sec btn-icone" href={`tel:${c.telefone}`} aria-label="Ligar"><Phone size={17} /></a>
            <a className="btn btn-sec" href={whatsLink(c.telefone)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
            <button className="btn btn-sec" onClick={() => setEditar(true)}><Pencil /> Editar</button>
            <button className="btn btn-primario" onClick={() => setMarcar(true)}><CalendarPlus /> Marcar horário</button>
          </>
        }
      />

      <Metricas
        itens={[
          { rot: 'Visitas', val: c.total_visitas, det: c.primeira_visita_em ? `Cliente desde ${dataCompleta(c.primeira_visita_em)}` : 'Ainda não veio' },
          { rot: 'Gasto total', val: dinheiroCurto(c.total_gasto_centavos), det: c.total_visitas ? `${dinheiroCurto(Math.round(c.total_gasto_centavos / c.total_visitas))} por visita` : undefined },
          { rot: 'Volta a cada', val: c.frequencia_media_dias ? `${Math.round(c.frequencia_media_dias)} dias` : '-', det: c.frequencia_media_dias ? 'Média das últimas visitas' : 'Precisa de 2 visitas' },
          { rot: 'Faltas', val: faltas, det: ags.length ? `${Math.round((faltas / ags.length) * 100)}% dos horários` : undefined },
        ]}
      />

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <div className="pilha">
          {futuros.length > 0 && (
            <section className="painel">
              <div className="painel-cab"><h2>Próximos horários</h2></div>
              <div className="painel-corpo" style={{ paddingTop: 6 }}>
                <ul className="lista">
                  {futuros.map((a) => (
                    <li key={a.id}>
                      <span className="display" style={{ fontSize: 24, width: 64 }}>{hora(a.inicio)}</span>
                      <div className="cresce">
                        <div style={{ fontWeight: 600 }}>{dataRelativa(a.inicio)}</div>
                        <div className="muted pequeno">{a.servicos.map((s) => s.nome).join(' + ')} com {membro.get(a.membro_id)?.nome_exibicao}</div>
                      </div>
                      <StatusTag status={a.status} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="painel">
            <div className="painel-cab"><h2>Histórico</h2></div>
            {passados.length ? (
              <div className="tabela-wrap" style={{ marginTop: 8 }}>
                <table className="tabela">
                  <thead><tr><th>Data</th><th>Serviço</th><th>Barbeiro</th><th>Situação</th><th className="dir">Pago</th></tr></thead>
                  <tbody>
                    {passados.slice(0, 25).map((a) => {
                      const co = comandaDe(a.id)
                      return (
                        <tr key={a.id}>
                          <td className="num muted">{dataCurta(a.inicio)}</td>
                          <td>{a.servicos.map((s) => s.nome).join(' + ')}</td>
                          <td>{membro.get(a.membro_id)?.nome_exibicao}</td>
                          <td><StatusTag status={a.status} /></td>
                          <td className="dir num">{co ? <span title={LABEL_FORMA[co.forma_pagamento!]}>{dinheiro(totalComanda(co))}</span> : <span className="muted">-</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vazio titulo="Sem histórico ainda" texto="As visitas aparecem aqui depois que o pagamento é confirmado no caixa." />
            )}
          </section>
        </div>

        <div className="pilha">
          <section className="painel">
            <div className="painel-cab"><h2>Retorno</h2></div>
            <div className="painel-corpo">
              {atraso === null ? (
                <p className="muted pequeno">Depois da primeira visita o Kort calcula quando ele deve voltar.</p>
              ) : (
                <>
                  <div className="display" style={{ fontSize: 30 }}>{atraso > 0 ? `${atraso} dias atrasado` : atraso === 0 ? 'Deve voltar hoje' : `Em ${-atraso} dias`}</div>
                  <p className="muted pequeno" style={{ marginTop: 4 }}>Previsto para {dataCompleta(c.proximo_retorno_previsto!)}, pelo ritmo de visitas dele.</p>
                  {atraso > 0 && c.aceita_mensagens && (
                    <a className="btn btn-escuro btn-bloco" style={{ marginTop: 14 }} target="_blank" rel="noreferrer"
                      onClick={() => acoes.registrarMensagem(c.id, 'resgate', 'manual')}
                      href={whatsLink(c.telefone, `Fala, ${primeiroNome(c.nome)}! Faz um tempo que você não aparece aqui na ${estado.barbearia.nome}. Bora dar um trato no visual essa semana? Agende aqui: ${linkPublico(estado.barbearia.slug)}`)}>
                      <MessageCircle /> Chamar de volta no WhatsApp
                    </a>
                  )}
                </>
              )}
            </div>
          </section>

          {estado.fidelidade.ativo && (
            <section className="painel">
              <div className="painel-cab"><h2>Fidelidade</h2></div>
              <div className="painel-corpo">
                {estado.fidelidade.tipo === 'cartao_visitas' ? (
                  <>
                    <div className="linha-flex" style={{ gap: 5, flexWrap: 'wrap' }} aria-label={`${saldo % meta} de ${meta} carimbos`}>
                      {Array.from({ length: meta }, (_, i) => (
                        <span key={i} style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px solid var(--preto)', background: i < saldo % meta || (saldo >= meta && i < meta) ? 'var(--kort)' : 'transparent' }} />
                      ))}
                    </div>
                    <p className="pequeno" style={{ marginTop: 10 }}>
                      {saldo >= meta ? <b>Prêmio liberado: {estado.fidelidade.premio_descricao}.</b> : <>Faltam <b>{meta - (saldo % meta)}</b> visitas para {estado.fidelidade.premio_descricao.toLowerCase()}.</>}
                    </p>
                  </>
                ) : (
                  <p><span className="display" style={{ fontSize: 30 }}>{saldo}</span> pontos</p>
                )}
                {saldo >= meta && (
                  <button className="btn btn-primario btn-bloco" style={{ marginTop: 12 }} onClick={() => setResgatar(true)}><Gift /> Usar prêmio agora</button>
                )}
              </div>
            </section>
          )}

          <section className="painel">
            <div className="painel-cab"><h2>Mais informações</h2></div>
            <div className="painel-corpo">
              <dl className="pequeno" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0 }}>
                <dt className="muted">Clube</dt>
                <dd style={{ margin: 0 }}>{plano ? <>{plano.nome} <span className={`tag ${assinatura?.pago_mes_atual ? 'tag-ok' : 'tag-alerta'}`}>{assinatura?.pago_mes_atual ? 'Mês pago' : 'Mês em aberto'}</span></> : 'Não assina'}</dd>
                <dt className="muted">Código de indicação</dt>
                <dd style={{ margin: 0 }}>{c.codigo_indicacao ?? '-'} {indicados.length > 0 && <span className="muted">({indicados.length} {indicados.length === 1 ? 'indicado' : 'indicados'})</span>}</dd>
                <dt className="muted">Aniversário</dt>
                <dd style={{ margin: 0 }}>{c.data_nascimento ? dataCurta(c.data_nascimento) : '-'}</dd>
                <dt className="muted">Mensagens</dt>
                <dd style={{ margin: 0 }}>{c.aceita_mensagens ? 'Recebe lembretes' : 'Pediu para não receber'}</dd>
              </dl>
              {c.observacoes && <p className="pequeno" style={{ marginTop: 14, padding: '10px 12px', background: 'var(--kort-suave)', borderRadius: 6 }}>{c.observacoes}</p>}
            </div>
          </section>
        </div>
      </div>

      <FolhaNovoHorario aberta={marcar} aoFechar={() => setMarcar(false)} inicial={{ clienteId: c.id, membroId: c.membro_preferido_id ?? undefined }} />

      <Folha aberta={editar} aoFechar={() => setEditar(false)} titulo="Editar cliente"
        rodape={<><button className="btn btn-sec" onClick={() => setEditar(false)}>Cancelar</button><button className="btn btn-primario" onClick={() => {
          acoes.salvarCliente({ id: c.id, nome: form.nome, telefone: telefoneE164(form.tel), observacoes: form.obs || null, aceita_mensagens: form.msgs, data_nascimento: form.nasc || null })
          avisar('Cliente atualizado'); setEditar(false)
        }}>Salvar</button></>}>
        <div className="coluna gap-16">
          <Campo rotulo="Nome" id="ed-nome"><input id="ed-nome" className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo rotulo="WhatsApp" id="ed-tel"><input id="ed-tel" className="input" value={form.tel} onChange={(e) => setForm({ ...form, tel: mascaraTelefone(e.target.value) })} /></Campo>
          <Campo rotulo="Aniversário" id="ed-nasc"><input id="ed-nasc" type="date" className="input" value={form.nasc} onChange={(e) => setForm({ ...form, nasc: e.target.value })} /></Campo>
          <Campo rotulo="Observações" id="ed-obs"><textarea id="ed-obs" className="textarea" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} /></Campo>
          <Switch checked={form.msgs} onChange={(v) => setForm({ ...form, msgs: v })}>Recebe lembretes e mensagens</Switch>
        </div>
      </Folha>

      <Confirmar aberto={resgatar} titulo="Usar o prêmio?" texto={`${estado.fidelidade.premio_descricao} para ${primeiroNome(c.nome)}. Os carimbos voltam a contar do zero.`} acao="Usar prêmio"
        aoCancelar={() => setResgatar(false)} aoConfirmar={() => { acoes.resgatarPremio(c.id); setResgatar(false); avisar('Prêmio usado') }} />
    </>
  )
}
