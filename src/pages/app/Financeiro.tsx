import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useKort, useMapas, totalComanda, comissaoItem } from '../../lib/store'
import { dataCurta, dinheiro, dinheiroCurto, hoje, isoDia, nomeMes, paraCentavos } from '../../lib/format'
import { Avatar, CabecalhoPagina, Campo, Confirmar, Folha, Metricas, Vazio } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

type Aba = 'resumo' | 'despesas' | 'comissoes' | 'aluguel' | 'mei' | 'preco'

// Teto anual do MEI usado no alerta. Confira o valor vigente na Receita
// Federal e ajuste aqui (ou mova para a tabela de configurações).
const TETO_MEI = 8100000

const CATEGORIAS = ['Aluguel', 'Contas', 'Produtos', 'Marketing', 'Equipamentos', 'Impostos', 'Outros']

export default function Financeiro() {
  const { estado } = useKort()
  const cadeira = estado.barbearia.modo_operacao === 'cadeira_alugada'
  const equipe = estado.barbearia.modo_operacao === 'equipe'
  const [aba, setAba] = useState<Aba>('resumo')
  return (
    <>
      <CabecalhoPagina titulo="Financeiro" sub={`Entradas e saídas de ${nomeMes(hoje().getMonth())}. Os pagamentos dos clientes vêm do caixa, sem digitar nada de novo.`} />
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'resumo'} onClick={() => setAba('resumo')}>Resumo do mês</button>
        <button role="tab" aria-selected={aba === 'despesas'} onClick={() => setAba('despesas')}>Despesas</button>
        {equipe && <button role="tab" aria-selected={aba === 'comissoes'} onClick={() => setAba('comissoes')}>Fechamento da equipe</button>}
        {cadeira && <button role="tab" aria-selected={aba === 'aluguel'} onClick={() => setAba('aluguel')}>Aluguel de cadeira</button>}
        <button role="tab" aria-selected={aba === 'mei'} onClick={() => setAba('mei')}>Limite do MEI</button>
        <button role="tab" aria-selected={aba === 'preco'} onClick={() => setAba('preco')}>Calculadora de preço</button>
      </div>
      {aba === 'resumo' && <Resumo />}
      {aba === 'despesas' && <Despesas />}
      {aba === 'comissoes' && <Comissoes />}
      {aba === 'aluguel' && <Aluguel />}
      {aba === 'mei' && <Mei />}
      {aba === 'preco' && <Calculadora />}
    </>
  )
}

function useMes() {
  const h = hoje()
  return [new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 1, 1)] as const
}

function Resumo() {
  const { estado } = useKort()
  const [ini, fim] = useMes()
  const noMes = (iso: string | null) => !!iso && new Date(iso) >= ini && new Date(iso) < fim
  const pagas = estado.comandas.filter((c) => c.status === 'paga' && noMes(c.pago_em))
  const servicos = pagas.reduce((t, c) => t + totalComanda(c), 0)
  const comissoes = pagas.reduce((t, c) => t + c.itens.reduce((u, i) => u + comissaoItem(i), 0), 0)
  const alugueis = estado.alugueis.filter((a) => a.status === 'pago' && noMes(a.pago_em)).reduce((t, a) => t + a.valor_centavos, 0)
  const clube = estado.assinaturasClube.filter((a) => a.pago_mes_atual && a.status === 'ativa').reduce((t, a) => t + (estado.planosClube.find((p) => p.id === a.plano_clube_id)?.preco_centavos ?? 0), 0)
  const desp = estado.despesas.filter((d) => d.data >= isoDia(ini) && d.data < isoDia(fim))
  const despesas = desp.reduce((t, d) => t + d.valor_centavos, 0)
  const entradas = servicos + alugueis + clube
  const saidas = despesas + comissoes
  const lucro = entradas - saidas
  const temComissao = estado.barbearia.modo_operacao === 'equipe' || comissoes > 0
  const porCat = Object.entries(desp.reduce<Record<string, number>>((a, d) => { a[d.categoria] = (a[d.categoria] ?? 0) + d.valor_centavos; return a }, {})).sort((a, b) => b[1] - a[1])

  return (
    <>
      <Metricas itens={[
        { rot: 'Entrou', val: dinheiroCurto(entradas) },
        { rot: 'Saiu', val: dinheiroCurto(saidas), det: temComissao ? 'Despesas e comissões' : 'Despesas' },
        { rot: 'Sobrou', val: dinheiroCurto(lucro), det: entradas ? `${Math.round((lucro / entradas) * 100)}% do que entrou` : undefined },
        { rot: 'Despesas a pagar', val: dinheiroCurto(desp.filter((d) => !d.pago).reduce((t, d) => t + d.valor_centavos, 0)) },
      ]} />
      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <section className="painel">
          <div className="painel-cab"><h2>De onde veio e para onde foi</h2></div>
          <div className="painel-corpo">
            <ul className="lista">
              <li><span className="cresce">Serviços e produtos (caixa)</span><b className="num">{dinheiro(servicos)}</b></li>
              {clube > 0 && <li><span className="cresce">Mensalidades do clube</span><b className="num">{dinheiro(clube)}</b></li>}
              {alugueis > 0 && <li><span className="cresce">Aluguel de cadeiras recebido</span><b className="num">{dinheiro(alugueis)}</b></li>}
              {temComissao && <li><span className="cresce muted">Comissões da equipe</span><b className="num" style={{ color: 'var(--perigo)' }}>- {dinheiro(comissoes)}</b></li>}
              <li><span className="cresce muted">Despesas</span><b className="num" style={{ color: 'var(--perigo)' }}>- {dinheiro(despesas)}</b></li>
              <li style={{ borderTop: '1.5px solid var(--preto)' }}><b className="cresce">Resultado do mês</b><span className="display num" style={{ fontSize: 28 }}>{dinheiro(lucro)}</span></li>
            </ul>
          </div>
        </section>
        <section className="painel">
          <div className="painel-cab"><h2>Despesas por categoria</h2></div>
          <div className="painel-corpo">
            {porCat.length ? (
              <ul className="lista">
                {porCat.map(([c, v]) => (
                  <li key={c} style={{ display: 'block' }}>
                    <div className="linha-flex entre pequeno" style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{c}</span><span className="num">{dinheiro(v)}</span></div>
                    <div className="barra"><span style={{ width: `${(v / despesas) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted pequeno">Nenhuma despesa lançada no mês.</p>}
          </div>
        </section>
      </div>
    </>
  )
}

function Despesas() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [f, setF] = useState<{ id?: string; descricao: string; categoria: string; valorTxt: string; data: string; pago: boolean } | null>(null)
  const [apagar, setApagar] = useState<string | null>(null)
  const lista = [...estado.despesas].sort((a, b) => b.data.localeCompare(a.data))
  return (
    <section className="painel">
      <div className="painel-cab">
        <h2>Despesas lançadas</h2>
        <button className="btn btn-primario btn-pequeno" onClick={() => setF({ descricao: '', categoria: 'Contas', valorTxt: '', data: isoDia(new Date()), pago: true })}><Plus /> Nova despesa</button>
      </div>
      {lista.length ? (
        <div className="tabela-wrap" style={{ marginTop: 8 }}>
          <table className="tabela">
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th className="dir">Valor</th><th /></tr></thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id} className="clicavel" onClick={() => setF({ id: d.id, descricao: d.descricao, categoria: d.categoria, valorTxt: String(d.valor_centavos / 100).replace('.', ','), data: d.data, pago: d.pago })}>
                  <td className="num muted">{dataCurta(d.data)}</td>
                  <td className="forte">{d.descricao}</td>
                  <td>{d.categoria}</td>
                  <td>{d.pago ? <span className="tag tag-ok">Paga</span> : <span className="tag tag-alerta">A pagar</span>}</td>
                  <td className="dir num forte">{dinheiro(d.valor_centavos)}</td>
                  <td className="dir" onClick={(e) => e.stopPropagation()}><button className="btn btn-fantasma btn-icone" aria-label={`Apagar ${d.descricao}`} onClick={() => setApagar(d.id)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vazio titulo="Nenhuma despesa" texto="Lance aluguel, contas e compras para saber quanto sobra no fim do mês." />}

      <Folha aberta={!!f} aoFechar={() => setF(null)} titulo={f?.id ? 'Editar despesa' : 'Nova despesa'}
        rodape={<><button className="btn btn-sec" onClick={() => setF(null)}>Cancelar</button><button className="btn btn-primario" disabled={!f?.descricao || !paraCentavos(f?.valorTxt ?? '')} onClick={() => {
          acoes.salvarDespesa({ id: f!.id, descricao: f!.descricao, categoria: f!.categoria, valor_centavos: paraCentavos(f!.valorTxt), data: f!.data, pago: f!.pago }); setF(null); avisar('Despesa salva')
        }}>Salvar</button></>}>
        {f && (
          <div className="grade-campos">
            <Campo rotulo="Descrição" id="dp-d" className="largo"><input id="dp-d" className="input" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
            <Campo rotulo="Valor" id="dp-v"><div className="input-prefixo"><span>R$</span><input id="dp-v" className="input" inputMode="decimal" value={f.valorTxt} onChange={(e) => setF({ ...f, valorTxt: e.target.value })} /></div></Campo>
            <Campo rotulo="Data" id="dp-dt"><input id="dp-dt" type="date" className="input" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
            <Campo rotulo="Categoria" id="dp-c">
              <select id="dp-c" className="select" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select>
            </Campo>
            <Campo rotulo="Situação" id="dp-p">
              <select id="dp-p" className="select" value={f.pago ? '1' : '0'} onChange={(e) => setF({ ...f, pago: e.target.value === '1' })}><option value="1">Paga</option><option value="0">A pagar</option></select>
            </Campo>
          </div>
        )}
      </Folha>
      <Confirmar aberto={!!apagar} titulo="Apagar despesa?" texto="Ela sai do resumo do mês." acao="Apagar" perigo aoCancelar={() => setApagar(null)} aoConfirmar={() => { acoes.removerDespesa(apagar!); setApagar(null); avisar('Despesa apagada') }} />
    </section>
  )
}

function Comissoes() {
  const { estado } = useKort()
  const { config } = useMapas()
  const h = hoje()
  const [de, setDe] = useState(isoDia(new Date(h.getFullYear(), h.getMonth(), 1)))
  const [ate, setAte] = useState(isoDia(h))
  const linhas = useMemo(() => estado.membros.filter((m) => m.atende && (config.get(m.id)?.comissao_servico_pct ?? 0) > 0).map((m) => {
    const dele = estado.comandas.filter((c) => c.status === 'paga' && c.pago_em && c.membro_id === m.id && isoDia(new Date(c.pago_em)) >= de && isoDia(new Date(c.pago_em)) <= ate)
    const serv = dele.reduce((t, c) => t + c.itens.filter((i) => i.tipo === 'servico').reduce((u, i) => u + comissaoItem(i), 0), 0)
    const prod = dele.reduce((t, c) => t + c.itens.filter((i) => i.tipo === 'produto').reduce((u, i) => u + comissaoItem(i), 0), 0)
    const fat = dele.reduce((t, c) => t + totalComanda(c), 0)
    return { m, qtd: dele.length, fat, serv, prod, total: serv + prod }
  }), [estado.membros, estado.comandas, config, de, ate])

  return (
    <section className="painel">
      <div className="painel-cab" style={{ flexWrap: 'wrap' }}>
        <h2>Quanto pagar para cada um</h2>
        <div className="linha-flex">
          <input type="date" className="input" style={{ width: 160 }} aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} />
          <span className="muted">até</span>
          <input type="date" className="input" style={{ width: 160 }} aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      {linhas.length ? (
        <div className="tabela-wrap" style={{ marginTop: 8 }}>
          <table className="tabela">
            <thead><tr><th>Barbeiro</th><th className="dir">Atendimentos</th><th className="dir">Faturou</th><th className="dir">Comissão serviços</th><th className="dir">Comissão produtos</th><th className="dir">A pagar</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.m.id}>
                  <td><div className="linha-flex"><Avatar nome={l.m.nome_exibicao} cor={l.m.cor_agenda} tam={28} /><b style={{ fontWeight: 600 }}>{l.m.nome_exibicao}</b></div></td>
                  <td className="dir num">{l.qtd}</td>
                  <td className="dir num">{dinheiro(l.fat)}</td>
                  <td className="dir num">{dinheiro(l.serv)}</td>
                  <td className="dir num">{dinheiro(l.prod)}</td>
                  <td className="dir"><span className="display num" style={{ fontSize: 22 }}>{dinheiro(l.total)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vazio titulo="Ninguém com comissão" texto="Defina a porcentagem de cada barbeiro em Equipe." />}
      <p className="muted pequeno" style={{ padding: '0 18px 16px' }}>O pagamento da equipe é feito por fora (Pix, dinheiro). Use este fechamento como comprovante.</p>
    </section>
  )
}

function Aluguel() {
  const { estado, acoes } = useKort()
  const { membro } = useMapas()
  const avisar = useAvisar()
  return (
    <section className="painel">
      <div className="painel-cab">
        <h2>Aluguel das cadeiras deste mês</h2>
        <button className="btn btn-sec btn-pequeno" onClick={() => { acoes.gerarAlugueisDoMes(); avisar('Cobranças do mês geradas') }}>Gerar cobranças do mês</button>
      </div>
      {!estado.alugueis.length && <p className="muted pequeno" style={{ padding: '10px 18px' }}>Defina o valor do aluguel de cada barbeiro em Equipe e gere as cobranças do mês.</p>}
      <div className="tabela-wrap" style={{ marginTop: 8 }}>
        <table className="tabela">
          <thead><tr><th>Barbeiro</th><th>Vencimento</th><th className="dir">Valor</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {estado.alugueis.map((a) => {
              const vencido = a.status === 'pendente' && a.vencimento < isoDia(hoje())
              return (
                <tr key={a.id}>
                  <td className="forte">{membro.get(a.membro_id)?.nome_exibicao}</td>
                  <td className="num">{dataCurta(a.vencimento)}</td>
                  <td className="dir num forte">{dinheiro(a.valor_centavos)}</td>
                  <td>{a.status === 'pago' ? <span className="tag tag-ok">Pago {a.pago_em ? dataCurta(a.pago_em) : ''}</span> : vencido ? <span className="tag tag-perigo">Atrasado</span> : <span className="tag tag-alerta">A receber</span>}</td>
                  <td className="dir">{a.status !== 'pago' && <button className="btn btn-sec btn-pequeno" onClick={() => { acoes.marcarAluguelPago(a.id); avisar('Aluguel recebido') }}>Marcar como recebido</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Mei() {
  const { estado } = useKort()
  const ano = hoje().getFullYear()
  const fatAno = estado.comandas.filter((c) => c.status === 'paga' && c.pago_em && new Date(c.pago_em).getFullYear() === ano).reduce((t, c) => t + totalComanda(c), 0)
  const mesesPassados = hoje().getMonth() + hoje().getDate() / 30
  const projecao = Math.round((fatAno / mesesPassados) * 12)
  const pct = Math.min(100, Math.round((fatAno / TETO_MEI) * 100))
  return (
    <div className="duas-colunas">
      <section className="painel">
        <div className="painel-corpo">
          <div className="rotulo">Faturamento em {ano} até agora</div>
          <div className="display num" style={{ fontSize: 48, margin: '8px 0 14px' }}>{dinheiro(fatAno)}</div>
          <div className={`barra ${pct > 80 ? '' : 'kort'}`} style={{ height: 12 }}><span style={{ width: `${pct}%`, background: pct > 80 ? 'var(--perigo)' : undefined }} /></div>
          <div className="linha-flex entre pequeno muted" style={{ marginTop: 6 }}><span>{pct}% do teto</span><span>Teto: {dinheiroCurto(TETO_MEI)} por ano</span></div>
          <p style={{ marginTop: 18 }}>
            No ritmo atual, o ano fecha em <b>{dinheiro(projecao)}</b>.{' '}
            {projecao > TETO_MEI ? <b style={{ color: 'var(--perigo)' }}>Isso passa do teto. Converse com seu contador sobre virar ME.</b> : 'Dentro do limite.'}
          </p>
          <p className="muted pequeno" style={{ marginTop: 10 }}>Considera os pagamentos confirmados no caixa. Confira o teto vigente com seu contador ou no Portal do Empreendedor.</p>
        </div>
      </section>
      <section className="painel">
        <div className="painel-cab"><h2>Para o contador</h2></div>
        <div className="painel-corpo">
          <p className="pequeno muted" style={{ marginBottom: 12 }}>Baixe o resumo mensal com faturamento e despesas para a declaração anual (DASN).</p>
          <button className="btn btn-sec" onClick={() => {
            const linhas = ['mes;faturamento;despesas']
            for (let m = 0; m <= hoje().getMonth(); m++) {
              const fat = estado.comandas.filter((c) => c.status === 'paga' && c.pago_em && new Date(c.pago_em).getFullYear() === ano && new Date(c.pago_em).getMonth() === m).reduce((t, c) => t + totalComanda(c), 0)
              const dp = estado.despesas.filter((d) => d.data.startsWith(`${ano}-${String(m + 1).padStart(2, '0')}`)).reduce((t, d) => t + d.valor_centavos, 0)
              linhas.push(`${nomeMes(m)};${(fat / 100).toFixed(2).replace('.', ',')};${(dp / 100).toFixed(2).replace('.', ',')}`)
            }
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8' }))
            a.download = `kort-resumo-${ano}.csv`
            a.click()
          }}>Baixar resumo do ano (CSV)</button>
        </div>
      </section>
    </div>
  )
}

function Calculadora() {
  const [v, setV] = useState({ aluguel: '1200', das: '86', produtos: '300', outros: '150', horas: '8', dias: '22', ocupacao: '70', lucro: '30', duracao: '40' })
  const n = (s: string) => Number(s.replace(',', '.')) || 0
  const custos = n(v.aluguel) + n(v.das) + n(v.produtos) + n(v.outros)
  const horasMes = n(v.horas) * n(v.dias) * (n(v.ocupacao) / 100)
  const custoHora = horasMes ? custos / horasMes : 0
  const custoServico = custoHora * (n(v.duracao) / 60)
  const precoMin = custoServico / (1 - n(v.lucro) / 100)
  const campo = (k: keyof typeof v, rot: string, pre?: string, ajuda?: string) => (
    <Campo rotulo={rot} id={`calc-${k}`} ajuda={ajuda}>
      <div className={pre ? 'input-prefixo' : ''}>{pre && <span>{pre}</span>}<input id={`calc-${k}`} className="input" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
    </Campo>
  )
  return (
    <div className="duas-colunas">
      <section className="painel">
        <div className="painel-cab"><h2>Seus custos por mês</h2></div>
        <div className="painel-corpo grade-campos">
          {campo('aluguel', 'Aluguel (salão ou cadeira)', 'R$')}
          {campo('das', 'DAS do MEI', 'R$')}
          {campo('produtos', 'Produtos e lâminas', 'R$')}
          {campo('outros', 'Outros (luz, internet, transporte)', 'R$')}
          {campo('horas', 'Horas por dia na cadeira')}
          {campo('dias', 'Dias trabalhados no mês')}
          {campo('ocupacao', 'Agenda ocupada', '%', 'Quanto do tempo você está atendendo')}
          {campo('lucro', 'Quanto quer de lucro', '%')}
          {campo('duracao', 'Tempo do serviço', 'min')}
        </div>
      </section>
      <section className="painel" style={{ background: 'var(--preto)', color: 'var(--papel)', borderColor: 'var(--preto)' }}>
        <div className="painel-corpo">
          <div className="pequeno" style={{ color: 'var(--lamina)' }}>Preço mínimo para um serviço de {v.duracao} min</div>
          <div className="display num" style={{ fontSize: 64, color: 'var(--kort)', margin: '10px 0', textShadow: '4px 4px 0 var(--sombra)' }}>{dinheiro(Math.round(precoMin * 100))}</div>
          <ul className="lista pequeno" style={{ color: 'var(--lamina)' }}>
            <li style={{ borderColor: 'var(--asfalto-2)' }}><span className="cresce">Custos fixos no mês</span><b style={{ color: 'var(--papel)' }}>{dinheiro(Math.round(custos * 100))}</b></li>
            <li style={{ borderColor: 'var(--asfalto-2)' }}><span className="cresce">Horas atendendo no mês</span><b style={{ color: 'var(--papel)' }}>{Math.round(horasMes)} h</b></li>
            <li style={{ borderColor: 'var(--asfalto-2)' }}><span className="cresce">Seu custo por hora</span><b style={{ color: 'var(--papel)' }}>{dinheiro(Math.round(custoHora * 100))}</b></li>
            <li style={{ borderColor: 'var(--asfalto-2)' }}><span className="cresce">Custo deste serviço</span><b style={{ color: 'var(--papel)' }}>{dinheiro(Math.round(custoServico * 100))}</b></li>
          </ul>
          <p className="pequeno" style={{ color: 'var(--grafite-claro)', marginTop: 12 }}>Abaixo desse valor você paga para trabalhar. Some o valor do seu tempo e do seu nome em cima dele.</p>
        </div>
      </section>
    </div>
  )
}
