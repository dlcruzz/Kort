import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useKort } from '../../lib/store'
import { dinheiro, paraCentavos } from '../../lib/format'
import type { Servico } from '../../lib/types'
import { Avatar, CabecalhoPagina, Campo, Folha, Switch } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

type Form = Partial<Servico> & { precoTxt: string }

export default function Servicos() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [f, setF] = useState<Form | null>(null)
  const lista = [...estado.servicos].sort((a, b) => a.ordem - b.ordem)

  const abrir = (s?: Servico) =>
    setF(s ? { ...s, precoTxt: String(s.preco_centavos / 100).replace('.', ',') } : { nome: '', descricao: '', precoTxt: '', duracao_min: 30, intervalo_min: 5, ativo: true, membros: estado.membros.filter((m) => m.atende).map((m) => m.id) })

  return (
    <>
      <CabecalhoPagina titulo="Serviços" sub="O que aparece no seu link, com preço e tempo. O tempo define quantos horários cabem no dia." acoes={<button className="btn btn-primario" onClick={() => abrir()}><Plus /> Novo serviço</button>} />
      <div className="painel">
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Serviço</th><th className="dir">Preço</th><th className="dir">Tempo</th><th>Quem faz</th><th>No link</th></tr></thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id} className="clicavel" onClick={() => abrir(s)} style={!s.ativo ? { opacity: 0.55 } : undefined}>
                  <td><div className="forte">{s.nome}</div>{s.descricao && <div className="muted pequeno">{s.descricao}</div>}</td>
                  <td className="dir num forte">{dinheiro(s.preco_centavos)}</td>
                  <td className="dir num">{s.duracao_min} min{s.intervalo_min ? <span className="muted"> +{s.intervalo_min}</span> : ''}</td>
                  <td>
                    <div className="linha-flex" style={{ gap: 0 }}>
                      {s.membros.map((id) => { const m = estado.membros.find((x) => x.id === id); return m ? <span key={id} style={{ marginRight: -6 }} title={m.nome_exibicao}><Avatar nome={m.nome_exibicao} cor={m.cor_agenda} tam={26} /></span> : null })}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Switch checked={s.ativo} label={`Mostrar ${s.nome} no link`} onChange={(v) => { acoes.salvarServico({ ...s, ativo: v }); avisar(v ? 'Serviço visível no link' : 'Serviço escondido do link') }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted pequeno" style={{ marginTop: 10 }}>O número depois do tempo é o intervalo de limpeza entre um cliente e outro.</p>

      <Folha aberta={!!f} aoFechar={() => setF(null)} titulo={f?.id ? 'Editar serviço' : 'Novo serviço'}
        rodape={<><button className="btn btn-sec" onClick={() => setF(null)}>Cancelar</button><button className="btn btn-primario" disabled={!f?.nome || !f?.membros?.length} onClick={() => {
          const { precoTxt, ...resto } = f!
          acoes.salvarServico({ ...(resto as Servico), preco_centavos: paraCentavos(precoTxt) }); setF(null); avisar('Serviço salvo')
        }}>Salvar</button></>}>
        {f && (
          <div className="grade-campos">
            <Campo rotulo="Nome" id="sv-nome" className="largo"><input id="sv-nome" className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
            <Campo rotulo="Descrição (aparece no link)" id="sv-desc" className="largo"><input id="sv-desc" className="input" value={f.descricao ?? ''} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
            <Campo rotulo="Preço" id="sv-preco"><div className="input-prefixo"><span>R$</span><input id="sv-preco" className="input" inputMode="decimal" value={f.precoTxt} onChange={(e) => setF({ ...f, precoTxt: e.target.value })} /></div></Campo>
            <Campo rotulo="Tempo" id="sv-dur">
              <select id="sv-dur" className="select" value={f.duracao_min} onChange={(e) => setF({ ...f, duracao_min: Number(e.target.value) })}>
                {[10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </Campo>
            <Campo rotulo="Intervalo depois" id="sv-int" ajuda="Para limpar a cadeira">
              <select id="sv-int" className="select" value={f.intervalo_min} onChange={(e) => setF({ ...f, intervalo_min: Number(e.target.value) })}>
                {[0, 5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </Campo>
            <div className="campo largo">
              <span className="rotulo">Quem faz</span>
              <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
                {estado.membros.filter((m) => m.atende && m.ativo).map((m) => {
                  const sel = f.membros?.includes(m.id)
                  return (
                    <button key={m.id} className="chip" aria-pressed={sel} onClick={() => setF({ ...f, membros: sel ? f.membros!.filter((x) => x !== m.id) : [...(f.membros ?? []), m.id] })}>
                      <span className="ponto" style={{ background: m.cor_agenda }} />{m.nome_exibicao}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Folha>
    </>
  )
}
