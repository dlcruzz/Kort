import { Link } from 'react-router-dom'
import { useAdmin } from '../../lib/adminStore'
import { NOME_MODULO } from '../../data/admin'
import { dataCurta, dinheiroCurto, hoje, nomeMes, tempoAtras } from '../../lib/format'
import { CabecalhoPagina, Metricas } from '../../components/ui'
import { BarrasHorizontais, BarrasVerticais } from '../../components/graficos'
import { emRisco, StatusAssinatura } from './comum'

export default function AdminVisao() {
  const { barbearias, faturas, uso: adminUso, mrrHistorico: adminMrrHistorico } = useAdmin()
  const ativas = barbearias.filter((b) => b.status_assinatura === 'ativa')
  const mrr = ativas.reduce((t, b) => t + b.preco_centavos, 0)
  const teste = barbearias.filter((b) => b.status_assinatura === 'teste')
  const atrasadas = barbearias.filter((b) => b.status_assinatura === 'inadimplente')
  const inicioMes = new Date(hoje().getFullYear(), hoje().getMonth(), 1)
  const novas = barbearias.filter((b) => new Date(b.criado_em) >= inicioMes).length
  const risco = barbearias.map((b) => ({ b, motivo: emRisco(b) })).filter((x) => x.motivo)
  const receber = faturas.filter((f) => f.status === 'aberta' || f.status === 'vencida')

  const historico = adminMrrHistorico.map((h) => {
    const d = new Date(hoje().getFullYear(), hoje().getMonth() + h.mes, 1)
    const v = h.mes === 0 ? mrr : h.valor
    return { rot: nomeMes(d.getMonth()).slice(0, 3), valor: v, dica: `${nomeMes(d.getMonth())}: ${dinheiroCurto(v)}`, destaque: h.mes === 0 }
  })

  return (
    <>
      <CabecalhoPagina titulo="Visão geral" sub="Como o Kort está indo: quem paga, quem está testando e quem pode estar indo embora." />
      <Metricas itens={[
        { rot: 'Receita por mês', val: dinheiroCurto(mrr), det: `${ativas.length} assinaturas ativas` },
        { rot: 'Em teste', val: teste.length, det: teste.length ? `Próximo acaba ${dataCurta([...teste].sort((a, b) => (a.teste_ate ?? '').localeCompare(b.teste_ate ?? ''))[0].teste_ate!)}` : undefined },
        { rot: 'Atrasadas', val: atrasadas.length, det: receber.length ? `${dinheiroCurto(receber.reduce((t, f) => t + f.valor_centavos, 0))} a receber` : 'Nada em aberto' },
        { rot: 'Novas no mês', val: novas },
      ]} />

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <section className="painel">
          <div className="painel-cab"><h2>Receita mensal recorrente</h2><span className="muted pequeno">Meta de validação: 4 clientes fixos</span></div>
          <div className="painel-corpo" style={{ paddingTop: 28 }}>
            <BarrasVerticais rotulo="Receita mensal recorrente" dados={historico} formatarEixo={(v) => `${Math.round(v / 100)}`} />
            <div className="linha-flex pequeno" style={{ marginTop: 16, gap: 8 }}>
              <div className="barra kort cresce" style={{ height: 10 }}><span style={{ width: `${Math.min(100, (ativas.length / 4) * 100)}%` }} /></div>
              <b>{ativas.length} de 4</b> <span className="muted">clientes pagantes para contratar o VPS</span>
            </div>
          </div>
        </section>

        <section className="painel">
          <div className="painel-cab"><h2>Precisam de atenção</h2><span className="tag tag-perigo">{risco.length}</span></div>
          <div className="painel-corpo" style={{ paddingTop: 6 }}>
            <ul className="lista">
              {risco.map(({ b, motivo }) => (
                <li key={b.id}>
                  <div className="cresce">
                    <Link to={`/admin/barbearias/${b.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{b.nome}</Link>
                    <div className="muted pequeno">{motivo}</div>
                  </div>
                  <StatusAssinatura status={b.status_assinatura} />
                </li>
              ))}
              {!risco.length && <li className="muted pequeno">Ninguém em risco agora.</li>}
            </ul>
          </div>
        </section>
      </div>

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <section className="painel">
          <div className="painel-cab"><h2>Funções mais usadas</h2><Link to="/admin/uso" className="pequeno">Ver tudo</Link></div>
          <div className="painel-corpo" style={{ paddingTop: 4 }}>
            <BarrasHorizontais rotulo="Funções mais usadas" dados={adminUso.slice(0, 6).map((u) => ({ rot: NOME_MODULO[u.modulo] ?? u.modulo, valor: u.total_30d, texto: u.total_30d.toLocaleString('pt-BR'), extra: `em ${u.barbearias_que_usam} barbearias` }))} />
          </div>
        </section>
        <section className="painel">
          <div className="painel-cab"><h2>Últimos acessos</h2></div>
          <div className="painel-corpo" style={{ paddingTop: 6 }}>
            <ul className="lista">
              {[...barbearias].sort((a, b) => (b.ultimo_uso ?? '').localeCompare(a.ultimo_uso ?? '')).slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link to={`/admin/barbearias/${b.id}`} className="cresce" style={{ textDecoration: 'none', fontWeight: 600 }}>{b.nome}</Link>
                  <span className="muted pequeno">{tempoAtras(b.ultimo_uso)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  )
}
