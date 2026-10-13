import { useState } from 'react'
import { Plus, PackagePlus } from 'lucide-react'
import { useKort } from '../../lib/store'
import { dinheiro, paraCentavos } from '../../lib/format'
import type { Produto } from '../../lib/types'
import { CabecalhoPagina, Campo, Folha, Metricas } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

type Form = Partial<Produto> & { precoTxt: string; custoTxt: string }

export default function Estoque() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [f, setF] = useState<Form | null>(null)
  const [entrada, setEntrada] = useState<{ id: string; qtd: number } | null>(null)

  const ativos = estado.produtos.filter((p) => p.ativo)
  const baixos = ativos.filter((p) => p.estoque_atual <= p.estoque_minimo)
  const valor = ativos.reduce((t, p) => t + Math.max(0, p.estoque_atual) * (p.custo_centavos ?? 0), 0)
  const vendidos30 = estado.comandas
    .filter((c) => c.status === 'paga' && c.pago_em && Date.now() - new Date(c.pago_em).getTime() < 30 * 86400000)
    .flatMap((c) => c.itens.filter((i) => i.tipo === 'produto'))
  const qtdVendida = (id: string) => vendidos30.filter((i) => i.produto_id === id).reduce((t, i) => t + i.quantidade, 0)

  const abrir = (p?: Produto) =>
    setF(p ? { ...p, precoTxt: String(p.preco_venda_centavos / 100).replace('.', ','), custoTxt: p.custo_centavos ? String(p.custo_centavos / 100).replace('.', ',') : '' } : { nome: '', precoTxt: '', custoTxt: '', estoque_atual: 0, estoque_minimo: 2, ativo: true })

  return (
    <>
      <CabecalhoPagina titulo="Estoque" sub="Produtos vendidos no caixa saem do estoque sozinhos." acoes={<button className="btn btn-primario" onClick={() => abrir()}><Plus /> Novo produto</button>} />
      <Metricas itens={[
        { rot: 'Produtos', val: ativos.length },
        { rot: 'Acabando', val: baixos.length, det: baixos.length ? baixos.map((p) => p.nome.split(' ')[0]).join(', ') : 'Tudo em dia' },
        { rot: 'Vendidos em 30 dias', val: vendidos30.reduce((t, i) => t + i.quantidade, 0), det: dinheiro(vendidos30.reduce((t, i) => t + i.quantidade * i.preco_unit_centavos, 0)) },
        { rot: 'Valor parado no estoque', val: dinheiro(valor), det: 'Pelo preço de custo' },
      ]} />
      <div className="painel" style={{ marginTop: 20 }}>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Produto</th><th className="dir">Preço</th><th className="dir">Margem</th><th className="dir">Vendidos 30d</th><th className="dir">Em estoque</th><th /></tr></thead>
            <tbody>
              {estado.produtos.map((p) => {
                const margem = p.custo_centavos ? Math.round(((p.preco_venda_centavos - p.custo_centavos) / p.preco_venda_centavos) * 100) : null
                const baixo = p.estoque_atual <= p.estoque_minimo
                return (
                  <tr key={p.id} className="clicavel" onClick={() => abrir(p)}>
                    <td className="forte">{p.nome}</td>
                    <td className="dir num">{dinheiro(p.preco_venda_centavos)}</td>
                    <td className="dir num muted">{margem !== null ? `${margem}%` : '-'}</td>
                    <td className="dir num">{qtdVendida(p.id)}</td>
                    <td className="dir">
                      <span className={`tag ${p.estoque_atual <= 0 ? 'tag-perigo' : baixo ? 'tag-alerta' : ''}`}>{p.estoque_atual <= 0 ? 'Acabou' : `${p.estoque_atual} un.`}</span>
                    </td>
                    <td className="dir" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sec btn-pequeno" onClick={() => setEntrada({ id: p.id, qtd: 6 })}><PackagePlus /> Entrada</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Folha aberta={!!entrada} aoFechar={() => setEntrada(null)} titulo="Entrada no estoque" subtitulo={estado.produtos.find((p) => p.id === entrada?.id)?.nome}
        rodape={<><button className="btn btn-sec" onClick={() => setEntrada(null)}>Cancelar</button><button className="btn btn-primario" disabled={!entrada || entrada.qtd <= 0} onClick={() => { acoes.entradaEstoque(entrada!.id, entrada!.qtd); avisar(`${entrada!.qtd} unidades adicionadas`); setEntrada(null) }}>Adicionar</button></>}>
        {entrada && <Campo rotulo="Quantas unidades chegaram?" id="en-qtd"><input id="en-qtd" type="number" min={1} className="input" style={{ maxWidth: 160 }} value={entrada.qtd} onChange={(e) => setEntrada({ ...entrada, qtd: Number(e.target.value) })} /></Campo>}
      </Folha>

      <Folha aberta={!!f} aoFechar={() => setF(null)} titulo={f?.id ? 'Editar produto' : 'Novo produto'}
        rodape={<><button className="btn btn-sec" onClick={() => setF(null)}>Cancelar</button><button className="btn btn-primario" disabled={!f?.nome} onClick={() => {
          const { precoTxt, custoTxt, ...resto } = f!
          acoes.salvarProduto({ ...(resto as Produto), preco_venda_centavos: paraCentavos(precoTxt), custo_centavos: custoTxt ? paraCentavos(custoTxt) : null }); setF(null); avisar('Produto salvo')
        }}>Salvar</button></>}>
        {f && (
          <div className="grade-campos">
            <Campo rotulo="Nome" id="pd-nome" className="largo"><input id="pd-nome" className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
            <Campo rotulo="Preço de venda" id="pd-pv"><div className="input-prefixo"><span>R$</span><input id="pd-pv" className="input" inputMode="decimal" value={f.precoTxt} onChange={(e) => setF({ ...f, precoTxt: e.target.value })} /></div></Campo>
            <Campo rotulo="Custo (opcional)" id="pd-cu"><div className="input-prefixo"><span>R$</span><input id="pd-cu" className="input" inputMode="decimal" value={f.custoTxt} onChange={(e) => setF({ ...f, custoTxt: e.target.value })} /></div></Campo>
            {!f.id && <Campo rotulo="Quantidade agora" id="pd-q"><input id="pd-q" type="number" className="input" value={f.estoque_atual} onChange={(e) => setF({ ...f, estoque_atual: Number(e.target.value) })} /></Campo>}
            <Campo rotulo="Avisar quando ficar com" id="pd-min" ajuda="unidades ou menos"><input id="pd-min" type="number" className="input" value={f.estoque_minimo} onChange={(e) => setF({ ...f, estoque_minimo: Number(e.target.value) })} /></Campo>
          </div>
        )}
      </Folha>
    </>
  )
}
