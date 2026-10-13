import { useAdmin } from '../../lib/adminStore'
import { MODULOS, NOME_MODULO } from '../../data/admin'
import { CabecalhoPagina } from '../../components/ui'
import { BarrasHorizontais } from '../../components/graficos'

export default function AdminUso() {
  const { barbearias, uso: adminUso } = useAdmin()
  const ativas = barbearias.filter((b) => b.status_assinatura !== 'cancelada')
  const ninguem = MODULOS.filter((m) => ativas.filter((b) => b.uso_modulos[m] > 0).length <= 1)

  return (
    <>
      <CabecalhoPagina titulo="Uso das funções" sub="O que os barbeiros usam de verdade nos últimos 30 dias. Use para decidir o que melhorar e o que mostrar para quem está testando." />
      <div className="duas-colunas">
        <section className="painel">
          <div className="painel-cab"><h2>Ações registradas</h2></div>
          <div className="painel-corpo" style={{ paddingTop: 4 }}>
            <BarrasHorizontais rotulo="Ações registradas em 30 dias" dados={adminUso.map((u) => ({ rot: NOME_MODULO[u.modulo] ?? u.modulo, valor: u.total_30d, texto: u.total_30d.toLocaleString('pt-BR'), extra: u.evento }))} />
          </div>
        </section>
        <section className="painel">
          <div className="painel-cab"><h2>Quantas barbearias usam cada função</h2></div>
          <div className="painel-corpo" style={{ paddingTop: 4 }}>
            <BarrasHorizontais rotulo="Adoção por função" dados={MODULOS.map((m) => {
              const n = ativas.filter((b) => b.uso_modulos[m] > 0).length
              return { rot: NOME_MODULO[m], valor: n, texto: `${n} de ${ativas.length}`, extra: `${Math.round((n / ativas.length) * 100)}%` }
            }).sort((a, b) => b.valor - a.valor)} />
            {ninguem.length > 0 && (
              <p className="pequeno" style={{ marginTop: 14, padding: '10px 12px', background: 'var(--alerta-fundo)', borderRadius: 6, color: 'var(--alerta)' }}>
                Quase ninguém usa: <b>{ninguem.map((m) => NOME_MODULO[m]).join(', ')}</b>. Ou falta divulgar dentro do app, ou não faz falta.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="painel" style={{ marginTop: 20 }}>
        <div className="painel-cab"><h2>Por barbearia</h2></div>
        <div className="tabela-wrap" style={{ marginTop: 8 }}>
          <table className="tabela">
            <thead><tr><th>Barbearia</th>{MODULOS.map((m) => <th key={m} className="dir">{NOME_MODULO[m]}</th>)}</tr></thead>
            <tbody>
              {ativas.map((b) => (
                <tr key={b.id}>
                  <td className="forte">{b.nome}</td>
                  {MODULOS.map((m) => (
                    <td key={m} className="dir num" style={!b.uso_modulos[m] ? { color: 'var(--grafite-claro)' } : undefined}>{b.uso_modulos[m] || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
