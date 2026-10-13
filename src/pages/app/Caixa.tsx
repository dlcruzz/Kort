import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useKort, useMapas, totalComanda, comissaoItem } from '../../lib/store'
import { dataLonga, dataRelativa, dinheiro, dinheiroCurto, hoje, hora, LABEL_FORMA, mesmoDia, somaDias } from '../../lib/format'
import { Avatar, CabecalhoPagina, Folha, Metricas, Vazio } from '../../components/ui'
import { FolhaComanda } from '../../components/folhas'

export default function Caixa() {
  const { estado, acoes } = useKort()
  const { cliente, membro, config } = useMapas()
  const [dia, setDia] = useState(hoje())
  const [aberta, setAberta] = useState<string | null>(null)
  const [avulsa, setAvulsa] = useState(false)

  const abertas = estado.comandas.filter((c) => c.status === 'aberta')
  const pagas = estado.comandas
    .filter((c) => c.status === 'paga' && c.pago_em && mesmoDia(new Date(c.pago_em), dia))
    .sort((a, b) => b.pago_em!.localeCompare(a.pago_em!))
  const total = pagas.reduce((t, c) => t + totalComanda(c), 0)

  const porForma = Object.entries(
    pagas.reduce<Record<string, number>>((acc, c) => {
      acc[c.forma_pagamento!] = (acc[c.forma_pagamento!] ?? 0) + totalComanda(c)
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  // horários do dia: o que ainda vai entrar
  const doDia = estado.agendamentos
    .filter((a) => mesmoDia(new Date(a.inicio), dia) && a.status !== 'cancelado' && a.status !== 'faltou')
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const aReceber = doDia.filter((a) => a.status === 'agendado' || a.status === 'confirmado' || a.status === 'em_atendimento')
  const previstoAReceber = aReceber.reduce((t, a) => t + a.valor_previsto_centavos, 0)
  const comandaDe = (agId: string) => estado.comandas.find((c) => c.agendamento_id === agId && c.status !== 'cancelada')

  const barbeiros = estado.membros.filter((m) => m.ativo && m.atende)
  const porBarbeiro = barbeiros.map((m) => {
    const dele = pagas.filter((c) => c.membro_id === m.id)
    const fat = dele.reduce((t, c) => t + totalComanda(c), 0)
    const com = dele.reduce((t, c) => t + c.itens.reduce((u, i) => u + comissaoItem(i), 0), 0)
    const meta = config.get(m.id)?.meta_diaria_centavos ?? 0
    const restantes = estado.agendamentos.filter((a) => a.membro_id === m.id && mesmoDia(new Date(a.inicio), dia) && (a.status === 'agendado' || a.status === 'confirmado'))
    return { m, fat, com, meta, qtd: dele.length, restantes: restantes.length, previstoRestante: restantes.reduce((t, a) => t + a.valor_previsto_centavos, 0) }
  })

  return (
    <>
      <CabecalhoPagina
        titulo="Caixa"
        sub="O cliente paga direto para o barbeiro. Aqui vocês só confirmam, e o caixa fecha sozinho."
        acoes={<button className="btn btn-primario" onClick={() => setAvulsa(true)}><Plus /> Venda avulsa</button>}
      />

      <div className="linha-flex" style={{ marginBottom: 16 }}>
        <button className="btn btn-sec btn-icone" aria-label="Dia anterior" onClick={() => setDia(somaDias(dia, -1))}><ChevronLeft size={18} /></button>
        <button className="btn btn-sec btn-icone" aria-label="Próximo dia" onClick={() => setDia(somaDias(dia, 1))}><ChevronRight size={18} /></button>
        <strong style={{ fontSize: 16 }}>{dataLonga(dia)}</strong>
        {!mesmoDia(dia, hoje()) && <button className="btn btn-fantasma btn-pequeno" onClick={() => setDia(hoje())}>Hoje</button>}
      </div>

      <Metricas
        itens={[
          { rot: 'Previsto do dia', val: dinheiro(total + previstoAReceber), det: `${doDia.length} ${doDia.length === 1 ? 'horário marcado' : 'horários marcados'}` },
          { rot: 'Já entrou', val: dinheiro(total), det: pagas.length ? `${pagas.length} pagos, ticket ${dinheiroCurto(Math.round(total / pagas.length))}` : 'Nenhum pagamento ainda' },
          { rot: 'Falta receber', val: dinheiro(previstoAReceber), det: `${aReceber.length} ${aReceber.length === 1 ? 'horário' : 'horários'} pela frente` },
          { rot: 'Comandas abertas', val: abertas.length, det: abertas.length ? 'Aguardando pagamento' : 'Tudo fechado' },
        ]}
      />

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <div className="pilha">
          {abertas.length > 0 && (
            <section className="painel">
              <div className="painel-cab"><h2>Abertas agora</h2></div>
              <div className="painel-corpo" style={{ paddingTop: 8 }}>
                <ul className="lista">
                  {abertas.map((c) => {
                    const cl = c.cliente_id ? cliente.get(c.cliente_id) : null
                    return (
                      <li key={c.id}>
                        <span className="ponto" style={{ background: membro.get(c.membro_id)?.cor_agenda }} />
                        <div className="cresce">
                          <div style={{ fontWeight: 600 }}>{cl?.nome ?? 'Venda avulsa'}</div>
                          <div className="muted pequeno trunca">{c.itens.map((i) => i.descricao).join(', ') || 'Sem itens'}, com {membro.get(c.membro_id)?.nome_exibicao}</div>
                        </div>
                        <span className="num" style={{ fontWeight: 700 }}>{dinheiro(totalComanda(c))}</span>
                        <button className="btn btn-primario btn-pequeno" onClick={() => setAberta(c.id)}>Fechar</button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>
          )}

          <section className="painel">
            <div className="painel-cab"><h2>Horários {dataRelativa(dia) === 'hoje' ? 'de hoje' : `de ${dataRelativa(dia)}`}</h2><span className="muted pequeno">{dinheiroCurto(previstoAReceber)} a receber</span></div>
            {doDia.length ? (
              <ul className="lista" style={{ padding: '6px 18px 4px' }}>
                {doDia.map((a) => {
                  const cl = cliente.get(a.cliente_id)
                  const cmd = comandaDe(a.id)
                  const pago = a.status === 'concluido' || cmd?.status === 'paga'
                  return (
                    <li key={a.id}>
                      <span className="num" style={{ fontWeight: 700, minWidth: 48 }}>{hora(a.inicio)}</span>
                      <span className="ponto" style={{ background: membro.get(a.membro_id)?.cor_agenda }} />
                      <div className="cresce">
                        <div style={{ fontWeight: 600 }}>{cl?.nome ?? 'Cliente'}{a.origem === 'link' && <span className="tag tag-kort" style={{ marginLeft: 6 }}>pelo link</span>}</div>
                        <div className="muted pequeno trunca">{a.servicos.map((x) => x.nome).join(' + ')}, com {membro.get(a.membro_id)?.nome_exibicao}</div>
                      </div>
                      <span className="num" style={{ fontWeight: 700 }}>{dinheiroCurto(a.valor_previsto_centavos)}</span>
                      {pago ? (
                        <span className="tag tag-ok">Pago</span>
                      ) : (
                        <button className="btn btn-sec btn-pequeno" onClick={() => setAberta(cmd?.id ?? acoes.abrirComanda({ agendamentoId: a.id, membroId: a.membro_id }))}>
                          {cmd ? 'Ver comanda' : 'Receber'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Vazio titulo="Nenhum horário nesse dia" texto="Os horários marcados pelo link e no balcão aparecem aqui com o valor previsto." />
            )}
          </section>

          <section className="painel">
            <div className="painel-cab"><h2>Pagamentos {dataRelativa(dia) === 'hoje' ? 'de hoje' : `de ${dataRelativa(dia)}`}</h2></div>
            {pagas.length ? (
              <div className="tabela-wrap" style={{ marginTop: 8 }}>
                <table className="tabela">
                  <thead>
                    <tr><th>Hora</th><th>Cliente</th><th>Barbeiro</th><th>Forma</th><th className="dir">Valor</th></tr>
                  </thead>
                  <tbody>
                    {pagas.map((c) => (
                      <tr key={c.id} className="clicavel" onClick={() => setAberta(c.id)}>
                        <td className="num muted">{hora(c.pago_em!)}</td>
                        <td className="forte">{c.cliente_id ? cliente.get(c.cliente_id)?.nome : 'Venda avulsa'}</td>
                        <td><span className="linha-flex" style={{ gap: 6 }}><span className="ponto" style={{ background: membro.get(c.membro_id)?.cor_agenda }} />{membro.get(c.membro_id)?.nome_exibicao}</span></td>
                        <td>{LABEL_FORMA[c.forma_pagamento!]}</td>
                        <td className="dir num forte">{dinheiro(totalComanda(c))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vazio titulo="Nenhum pagamento confirmado" texto="Quando um atendimento terminar, abra o horário na agenda e confirme como o cliente pagou." />
            )}
          </section>
        </div>

        <div className="pilha">
          <section className="painel">
            <div className="painel-cab"><h2>Meta do dia por barbeiro</h2></div>
            <div className="painel-corpo">
              <div className="coluna gap-16">
                {porBarbeiro.map(({ m, fat, com, meta, qtd, restantes, previstoRestante }) => {
                  const pct = meta ? Math.min(100, Math.round((fat / meta) * 100)) : 0
                  return (
                    <div key={m.id}>
                      <div className="linha-flex" style={{ marginBottom: 8 }}>
                        <Avatar nome={m.nome_exibicao} cor={m.cor_agenda} tam={28} />
                        <div className="cresce">
                          <div style={{ fontWeight: 600 }}>{m.nome_exibicao}</div>
                          <div className="muted pequeno">{qtd} atendidos{com ? `, comissão ${dinheiroCurto(com)}` : ''}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="num" style={{ fontWeight: 700 }}>{dinheiroCurto(fat)}</div>
                          {meta > 0 && <div className="muted pequeno">de {dinheiroCurto(meta)}</div>}
                        </div>
                      </div>
                      {meta > 0 && (
                        <>
                          <div className={`barra ${pct >= 100 ? 'kort' : ''}`}><span style={{ width: `${pct}%` }} /></div>
                          <div className="muted pequeno" style={{ marginTop: 5 }}>
                            {pct >= 100
                              ? 'Meta batida.'
                              : restantes
                                ? `Faltam ${dinheiroCurto(meta - fat)}. Tem ${restantes} ${restantes === 1 ? 'horário' : 'horários'} pela frente (${dinheiroCurto(previstoRestante)}).`
                                : `Faltam ${dinheiroCurto(meta - fat)}.`}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="painel">
            <div className="painel-cab"><h2>Por forma de pagamento</h2></div>
            <div className="painel-corpo">
              {porForma.length ? (
                <ul className="lista">
                  {porForma.map(([f, v]) => (
                    <li key={f}>
                      <span className="cresce">{LABEL_FORMA[f]}</span>
                      <span className="muted pequeno">{Math.round((v / total) * 100)}%</span>
                      <span className="num" style={{ fontWeight: 600, minWidth: 90, textAlign: 'right' }}>{dinheiro(v)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted pequeno">Aparece aqui quando houver pagamentos.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <FolhaComanda comandaId={aberta} aoFechar={() => setAberta(null)} />
      <Folha aberta={avulsa} aoFechar={() => setAvulsa(false)} titulo="Venda avulsa" subtitulo="Produto ou serviço sem horário marcado. Quem está vendendo?">
        <div className="coluna gap-8">
          {estado.membros.filter((m) => m.ativo).map((m) => (
            <button key={m.id} className="btn btn-sec btn-grande" style={{ justifyContent: 'flex-start' }}
              onClick={() => { setAvulsa(false); setAberta(acoes.abrirComanda({ membroId: m.id })) }}>
              <Avatar nome={m.nome_exibicao} cor={m.cor_agenda} tam={30} /> {m.nome_exibicao}
            </button>
          ))}
        </div>
      </Folha>
    </>
  )
}
