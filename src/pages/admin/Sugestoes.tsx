import { adminAcoes, useAdmin } from '../../lib/adminStore'
import { tempoAtras } from '../../lib/format'
import type { StatusSugestao } from '../../lib/types'
import { CabecalhoPagina } from '../../components/ui'

const STATUS: Array<[StatusSugestao, string]> = [['nova', 'Nova'], ['em_analise', 'Em análise'], ['planejada', 'Vamos fazer'], ['feita', 'Feita'], ['recusada', 'Não vamos fazer']]

export default function AdminSugestoes() {
  const { sugestoes } = useAdmin()
  return (
    <>
      <CabecalhoPagina titulo="Sugestões" sub="O que os barbeiros pedem, ordenado por votos. O status que você escolher aparece para eles no app." />
      <section className="painel">
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th className="dir">Votos</th><th>Sugestão</th><th>De</th><th>Quando</th><th>Status</th></tr></thead>
            <tbody>
              {[...sugestoes].sort((a, b) => b.votos - a.votos).map((s) => (
                <tr key={s.id}>
                  <td className="dir"><span className="display num" style={{ fontSize: 24 }}>{s.votos}</span></td>
                  <td><div className="forte">{s.titulo}</div>{s.descricao && <div className="muted pequeno">{s.descricao}</div>}</td>
                  <td className="muted">{s.barbearia}</td>
                  <td className="muted">{tempoAtras(s.criado_em)}</td>
                  <td>
                    <select className="select" style={{ width: 160, height: 34 }} value={s.status} aria-label={`Status de ${s.titulo}`} onChange={(e) => adminAcoes.mudarSugestao(s.id, e.target.value as StatusSugestao)}>
                      {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
