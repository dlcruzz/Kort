import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useKort, useMapas } from '../../lib/store'
import { dinheiro, dinheiroCurto, paraCentavos, primeiroNome } from '../../lib/format'
import type { PlanoClube, ProgramaFidelidade } from '../../lib/types'
import { CabecalhoPagina, Campo, Folha, Metricas, Segmentos, Switch, Vazio } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

type Aba = 'programa' | 'clube' | 'indicacoes'

export default function Fidelidade() {
  const [aba, setAba] = useState<Aba>('programa')
  return (
    <>
      <CabecalhoPagina titulo="Fidelidade e clube" sub="Motivos para o cliente voltar sempre com você: cartão de carimbos, clube mensal e indicação de amigos." />
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'programa'} onClick={() => setAba('programa')}>Cartão fidelidade</button>
        <button role="tab" aria-selected={aba === 'clube'} onClick={() => setAba('clube')}>Clube de assinatura</button>
        <button role="tab" aria-selected={aba === 'indicacoes'} onClick={() => setAba('indicacoes')}>Indique e ganhe</button>
      </div>
      {aba === 'programa' && <Programa />}
      {aba === 'clube' && <Clube />}
      {aba === 'indicacoes' && <Indicacoes />}
    </>
  )
}

function saldos(movs: { cliente_id: string; pontos: number }[]) {
  const m = new Map<string, number>()
  for (const x of movs) m.set(x.cliente_id, (m.get(x.cliente_id) ?? 0) + x.pontos)
  return m
}

function Programa() {
  const { estado, acoes } = useKort()
  const { cliente } = useMapas()
  const avisar = useAvisar()
  const [f, setF] = useState<ProgramaFidelidade>(estado.fidelidade)
  const s = saldos(estado.movimentosFidelidade)
  const meta = f.visitas_para_premio
  const perto = [...s.entries()]
    .map(([id, pts]) => ({ c: cliente.get(id)!, pts }))
    .filter((x) => x.c)
    .sort((a, b) => (b.pts % meta) - (a.pts % meta))
  const liberados = perto.filter((x) => x.pts >= meta)
  const resgates = estado.movimentosFidelidade.filter((m) => m.tipo === 'resgate').length

  return (
    <div className="duas-colunas">
      <section className="painel">
        <div className="painel-cab"><h2>Regra do cartão</h2><Switch checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })}>{f.ativo ? 'Ligado' : 'Desligado'}</Switch></div>
        <div className="painel-corpo coluna gap-16">
          <div className="campo">
            <span className="rotulo">Como conta</span>
            <Segmentos rotulo="Tipo" valor={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} opcoes={[['cartao_visitas', 'Carimbo por visita'], ['pontos', 'Pontos por real gasto']]} />
          </div>
          <div className="grade-campos">
            {f.tipo === 'cartao_visitas' ? (
              <Campo rotulo="Visitas para ganhar" id="fd-vis"><input id="fd-vis" type="number" min={2} className="input" value={f.visitas_para_premio} onChange={(e) => setF({ ...f, visitas_para_premio: Number(e.target.value) })} /></Campo>
            ) : (
              <Campo rotulo="Pontos por real" id="fd-pts"><input id="fd-pts" type="number" min={0.1} step={0.1} className="input" value={f.pontos_por_real} onChange={(e) => setF({ ...f, pontos_por_real: Number(e.target.value) })} /></Campo>
            )}
            <Campo rotulo="Carimbos por indicação" id="fd-ind"><input id="fd-ind" type="number" min={0} className="input" value={f.pontos_por_indicacao} onChange={(e) => setF({ ...f, pontos_por_indicacao: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Prêmio" id="fd-pre" className="largo"><input id="fd-pre" className="input" value={f.premio_descricao} onChange={(e) => setF({ ...f, premio_descricao: e.target.value })} /></Campo>
          </div>
          <div className="painel" style={{ background: 'var(--preto)', color: 'var(--papel)', padding: 18, border: 0 }}>
            <div className="display" style={{ fontSize: 26, color: 'var(--kort)' }}>{estado.barbearia.nome}</div>
            <div className="pequeno" style={{ color: 'var(--lamina)', margin: '4px 0 14px' }}>A cada {meta} visitas: {f.premio_descricao.toLowerCase()}</div>
            <div className="linha-flex" style={{ gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(meta, 12) }, (_, i) => (
                <span key={i} style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--kort)', background: i < 6 ? 'var(--kort)' : 'transparent' }} />
              ))}
            </div>
          </div>
          <button className="btn btn-primario" style={{ alignSelf: 'flex-start' }} onClick={() => { acoes.salvarFidelidade(f); avisar('Regra salva') }}>Salvar regra</button>
        </div>
      </section>

      <div className="pilha">
        <Metricas colunas={2} itens={[{ rot: 'Prêmios liberados', val: liberados.length }, { rot: 'Prêmios já usados', val: resgates }]} />
        <section className="painel">
          <div className="painel-cab"><h2>Quase lá</h2></div>
          <div className="painel-corpo" style={{ paddingTop: 6 }}>
            <ul className="lista">
              {perto.slice(0, 8).map(({ c, pts }) => (
                <li key={c.id}>
                  <Link to={`/app/clientes/${c.id}`} className="cresce" style={{ textDecoration: 'none', fontWeight: 600 }}>{c.nome}</Link>
                  {pts >= meta ? <span className="tag tag-kort">Prêmio liberado</span> : <span className="muted pequeno">{pts % meta} de {meta}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

function Clube() {
  const { estado, acoes } = useKort()
  const { cliente } = useMapas()
  const avisar = useAvisar()
  const [plano, setPlano] = useState<(Partial<PlanoClube> & { precoTxt?: string }) | null>(null)
  const [assinar, setAssinar] = useState(false)
  const [nova, setNova] = useState({ clienteId: '', planoId: '', dia: 10 })

  const ativas = estado.assinaturasClube.filter((a) => a.status !== 'cancelada')
  const mrr = ativas.filter((a) => a.status === 'ativa').reduce((t, a) => t + (estado.planosClube.find((p) => p.id === a.plano_clube_id)?.preco_centavos ?? 0), 0)
  const pendentes = ativas.filter((a) => a.status === 'ativa' && !a.pago_mes_atual)

  return (
    <>
      <Metricas itens={[
        { rot: 'Assinantes ativos', val: ativas.filter((a) => a.status === 'ativa').length },
        { rot: 'Receita fixa por mês', val: dinheiroCurto(mrr), det: 'Garantida antes do mês começar' },
        { rot: 'Mensalidades em aberto', val: pendentes.length, det: pendentes.length ? dinheiroCurto(pendentes.reduce((t, a) => t + (estado.planosClube.find((p) => p.id === a.plano_clube_id)?.preco_centavos ?? 0), 0)) : 'Tudo pago' },
      ]} />
      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <section className="painel">
          <div className="painel-cab">
            <h2>Assinantes</h2>
            <button className="btn btn-primario btn-pequeno" onClick={() => { setNova({ clienteId: '', planoId: estado.planosClube[0]?.id ?? '', dia: 10 }); setAssinar(true) }}><Plus /> Novo assinante</button>
          </div>
          {ativas.length ? (
            <div className="tabela-wrap" style={{ marginTop: 8 }}>
              <table className="tabela">
                <thead><tr><th>Cliente</th><th>Plano</th><th>Vence dia</th><th>Mês atual</th><th /></tr></thead>
                <tbody>
                  {ativas.map((a) => {
                    const p = estado.planosClube.find((x) => x.id === a.plano_clube_id)
                    return (
                      <tr key={a.id}>
                        <td className="forte">{cliente.get(a.cliente_id)?.nome}</td>
                        <td>{p?.nome}</td>
                        <td className="num">{a.dia_vencimento}</td>
                        <td>{a.status === 'pausada' ? <span className="tag">Pausada</span> : a.pago_mes_atual ? <span className="tag tag-ok">Pago</span> : <span className="tag tag-alerta">Em aberto</span>}</td>
                        <td className="dir">
                          {a.status === 'ativa' && !a.pago_mes_atual && (
                            <button className="btn btn-sec btn-pequeno" onClick={() => { acoes.atualizarAssinaturaClube(a.id, { pago_mes_atual: true }); avisar(`Mensalidade de ${primeiroNome(cliente.get(a.cliente_id)?.nome ?? '')} confirmada`) }}>
                              Confirmar pagamento
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Nenhum assinante ainda" texto="Ofereça o clube para quem vem toda semana. É receita certa todo mês." />}
          <p className="muted pequeno" style={{ padding: '0 18px 16px' }}>O assinante paga a mensalidade direto para a barbearia. Aqui você confirma que recebeu, e o cliente pode usar "Clube" como forma de pagamento no caixa.</p>
        </section>

        <section className="painel">
          <div className="painel-cab">
            <h2>Planos</h2>
            <button className="btn btn-sec btn-pequeno" onClick={() => setPlano({ nome: '', descricao: '', precoTxt: '', usos_por_mes: null, ativo: true })}><Plus /> Novo plano</button>
          </div>
          <div className="painel-corpo" style={{ paddingTop: 6 }}>
            <ul className="lista">
              {estado.planosClube.map((p) => (
                <li key={p.id}>
                  <div className="cresce">
                    <div style={{ fontWeight: 600 }}>{p.nome}</div>
                    <div className="muted pequeno">{p.descricao}</div>
                  </div>
                  <span className="num" style={{ fontWeight: 700 }}>{dinheiro(p.preco_centavos)}</span>
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => setPlano({ ...p, precoTxt: String(p.preco_centavos / 100).replace('.', ',') })}>Editar</button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <Folha aberta={!!plano} aoFechar={() => setPlano(null)} titulo={plano?.id ? 'Editar plano' : 'Novo plano'}
        rodape={<><button className="btn btn-sec" onClick={() => setPlano(null)}>Cancelar</button><button className="btn btn-primario" disabled={!plano?.nome} onClick={() => {
          const { precoTxt, ...resto } = plano!
          acoes.salvarPlanoClube({ ...(resto as PlanoClube), preco_centavos: paraCentavos(precoTxt ?? '0') }); setPlano(null); avisar('Plano salvo')
        }}>Salvar</button></>}>
        {plano && (
          <div className="grade-campos">
            <Campo rotulo="Nome" id="pl-nome" className="largo"><input id="pl-nome" className="input" value={plano.nome} onChange={(e) => setPlano({ ...plano, nome: e.target.value })} /></Campo>
            <Campo rotulo="O que inclui" id="pl-desc" className="largo"><input id="pl-desc" className="input" value={plano.descricao ?? ''} onChange={(e) => setPlano({ ...plano, descricao: e.target.value })} /></Campo>
            <Campo rotulo="Preço por mês" id="pl-preco"><div className="input-prefixo"><span>R$</span><input id="pl-preco" className="input" inputMode="decimal" value={plano.precoTxt} onChange={(e) => setPlano({ ...plano, precoTxt: e.target.value })} /></div></Campo>
            <Campo rotulo="Usos por mês" id="pl-usos" ajuda="Vazio = ilimitado"><input id="pl-usos" type="number" className="input" value={plano.usos_por_mes ?? ''} onChange={(e) => setPlano({ ...plano, usos_por_mes: e.target.value ? Number(e.target.value) : null })} /></Campo>
          </div>
        )}
      </Folha>

      <Folha aberta={assinar} aoFechar={() => setAssinar(false)} titulo="Novo assinante"
        rodape={<><button className="btn btn-sec" onClick={() => setAssinar(false)}>Cancelar</button><button className="btn btn-primario" disabled={!nova.clienteId || !nova.planoId} onClick={() => { acoes.assinarClube(nova.clienteId, nova.planoId, nova.dia); setAssinar(false); avisar('Assinatura criada') }}>Criar assinatura</button></>}>
        <div className="grade-campos">
          <Campo rotulo="Cliente" id="as-cli" className="largo">
            <select id="as-cli" className="select" value={nova.clienteId} onChange={(e) => setNova({ ...nova, clienteId: e.target.value })}>
              <option value="">Escolha...</option>
              {[...estado.clientes].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Plano" id="as-pl">
            <select id="as-pl" className="select" value={nova.planoId} onChange={(e) => setNova({ ...nova, planoId: e.target.value })}>
              {estado.planosClube.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Dia do vencimento" id="as-dia"><input id="as-dia" type="number" min={1} max={28} className="input" value={nova.dia} onChange={(e) => setNova({ ...nova, dia: Number(e.target.value) })} /></Campo>
        </div>
      </Folha>
    </>
  )
}

function Indicacoes() {
  const { estado } = useKort()
  const { cliente } = useMapas()
  const ranking = estado.clientes
    .map((c) => ({ c, indicados: estado.clientes.filter((x) => x.indicado_por_id === c.id) }))
    .filter((x) => x.indicados.length)
    .sort((a, b) => b.indicados.length - a.indicados.length)
  const total = estado.clientes.filter((c) => c.indicado_por_id).length
  const receita = estado.clientes.filter((c) => c.indicado_por_id).reduce((t, c) => t + c.total_gasto_centavos, 0)

  return (
    <>
      <Metricas itens={[
        { rot: 'Clientes que vieram por indicação', val: total },
        { rot: 'Quanto eles já gastaram', val: dinheiroCurto(receita) },
        { rot: 'Prêmio por indicação', val: `${estado.fidelidade.pontos_por_indicacao} carimbos`, det: 'Muda em Cartão fidelidade' },
      ]} />
      <section className="painel" style={{ marginTop: 20 }}>
        <div className="painel-cab"><h2>Quem mais indica</h2></div>
        {ranking.length ? (
          <div className="tabela-wrap" style={{ marginTop: 8 }}>
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Código</th><th>Indicou</th></tr></thead>
              <tbody>
                {ranking.map(({ c, indicados }) => (
                  <tr key={c.id}>
                    <td className="forte"><Link to={`/app/clientes/${c.id}`} style={{ textDecoration: 'none' }}>{c.nome}</Link></td>
                    <td><code>{c.codigo_indicacao}</code></td>
                    <td className="pequeno">{indicados.map((i) => cliente.get(i.id)?.nome.split(' ')[0]).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vazio titulo="Ninguém indicou ainda" />}
        <p className="muted pequeno" style={{ padding: '0 18px 16px' }}>Cada cliente tem um código. Quem chega pelo link com o código de alguém conta como indicado, e quem indicou ganha os carimbos na primeira visita do amigo.</p>
      </section>
    </>
  )
}
