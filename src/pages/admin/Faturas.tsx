import { useState } from 'react'
import { adminAcoes, useAdmin } from '../../lib/adminStore'
import { dataCompleta, dinheiro, dinheiroCurto, nomeMes, deIsoDia } from '../../lib/format'
import { CabecalhoPagina, Confirmar, Metricas, Segmentos } from '../../components/ui'

export default function AdminFaturas() {
  const { faturas } = useAdmin()
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas')
  const [baixa, setBaixa] = useState<string | null>(null)
  const lista = faturas.filter((f) => filtro === 'todas' || f.status === 'aberta' || f.status === 'vencida').sort((a, b) => b.vencimento.localeCompare(a.vencimento))
  const abertas = faturas.filter((f) => f.status === 'aberta')
  const vencidas = faturas.filter((f) => f.status === 'vencida')
  const mesAtual = new Date().toISOString().slice(0, 7)
  const recebido = faturas.filter((f) => f.status === 'paga' && f.pago_em?.startsWith(mesAtual)).reduce((t, f) => t + f.valor_centavos, 0)
  const f = faturas.find((x) => x.id === baixa)

  return (
    <>
      <CabecalhoPagina titulo="Mensalidades" sub="Os barbeiros pagam no Pix direto na sua conta Nu Empresas. Confira o extrato e dê baixa aqui." />
      <Metricas itens={[
        { rot: 'Recebido no mês', val: dinheiroCurto(recebido) },
        { rot: 'Em aberto', val: abertas.length, det: dinheiroCurto(abertas.reduce((t, x) => t + x.valor_centavos, 0)) },
        { rot: 'Vencidas', val: vencidas.length, det: dinheiroCurto(vencidas.reduce((t, x) => t + x.valor_centavos, 0)) },
      ]} />
      <section className="painel" style={{ marginTop: 20 }}>
        <div className="painel-cab">
          <h2>Faturas</h2>
          <Segmentos rotulo="Filtro" valor={filtro} onChange={setFiltro} opcoes={[['abertas', 'A receber'], ['todas', 'Todas']]} />
        </div>
        <div className="tabela-wrap" style={{ marginTop: 8 }}>
          <table className="tabela">
            <thead><tr><th>Barbearia</th><th>Mês</th><th>Vencimento</th><th className="dir">Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id}>
                  <td className="forte">{x.barbearia}</td>
                  <td style={{ textTransform: 'capitalize' }}>{nomeMes(deIsoDia(x.competencia).getMonth())}</td>
                  <td className="num">{dataCompleta(x.vencimento)}</td>
                  <td className="dir num">{dinheiro(x.valor_centavos)}</td>
                  <td>{x.status === 'paga' ? <span className="tag tag-ok">Paga {x.pago_em ? dataCompleta(x.pago_em) : ''}</span> : x.status === 'vencida' ? <span className="tag tag-perigo">Vencida</span> : x.status === 'cancelada' ? <span className="tag">Cancelada</span> : <span className="tag tag-alerta">Em aberto</span>}</td>
                  <td className="dir">{(x.status === 'aberta' || x.status === 'vencida') && <button className="btn btn-primario btn-pequeno" onClick={() => setBaixa(x.id)}>Dar baixa</button>}</td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>Nada a receber.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted pequeno" style={{ marginTop: 10 }}>Quando trocar o Pix manual por um intermediário (Asaas, Woovi ou Mercado Pago), a baixa passa a ser automática pelo aviso do pagamento.</p>
      <Confirmar aberto={!!baixa} titulo="Confirmar recebimento?" texto={f ? `${f.barbearia}, ${dinheiro(f.valor_centavos)}. Confira se o Pix aparece no extrato da Nu Empresas.` : ''} acao="Dar baixa"
        aoCancelar={() => setBaixa(null)} aoConfirmar={() => { adminAcoes.darBaixa(baixa!); setBaixa(null) }} />
    </>
  )
}
