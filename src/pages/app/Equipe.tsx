import { useState } from 'react'
import { Plus, Trash2, Send } from 'lucide-react'
import { useKort, useMapas } from '../../lib/store'
import { dinheiroCurto, nomeDia, nomeDiaCurto, paraCentavos } from '../../lib/format'
import type { Membro, MembroConfiguracao, PapelMembro } from '../../lib/types'
import { Avatar, CabecalhoPagina, Campo, Folha, Segmentos, Switch } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

const CORES = ['#E7F738', '#7FB8FF', '#FF9E6B', '#B79CFF', '#6FD3A6', '#FF7FA8', '#C9CAC6']
const PAPEL: Record<PapelMembro, string> = { dono: 'Dono', barbeiro: 'Barbeiro', recepcao: 'Recepção' }

type Turno = { dia_semana: number; inicio: string; fim: string }

export default function Equipe() {
  const { estado, acoes } = useKort()
  const { config } = useMapas()
  const avisar = useAvisar()
  const [aba, setAba] = useState<'dados' | 'ganhos' | 'jornada'>('dados')
  const [m, setM] = useState<Partial<Membro> | null>(null)
  const [cfg, setCfg] = useState<Partial<MembroConfiguracao> & { metaTxt?: string; aluguelTxt?: string }>({})
  const [turnos, setTurnos] = useState<Turno[]>([])
  const cadeira = estado.barbearia.modo_operacao === 'cadeira_alugada'

  const abrir = (x?: Membro) => {
    setAba('dados')
    if (x) {
      const c = config.get(x.id)
      setM({ ...x })
      setCfg({ ...c, metaTxt: c?.meta_diaria_centavos ? String(c.meta_diaria_centavos / 100) : '', aluguelTxt: c?.aluguel_cadeira_centavos ? String(c.aluguel_cadeira_centavos / 100) : '' })
      setTurnos(estado.jornadas.filter((j) => j.membro_id === x.id).map(({ dia_semana, inicio, fim }) => ({ dia_semana, inicio, fim })))
    } else {
      setM({ nome_exibicao: '', papel: 'barbeiro', cor_agenda: CORES[estado.membros.length % CORES.length], atende: true, ativo: true, bio: '' })
      setCfg({ comissao_servico_pct: 40, comissao_produto_pct: 10, metaTxt: '300', aluguelTxt: '' })
      setTurnos(estado.horarios.map((h) => ({ dia_semana: h.dia_semana, inicio: h.abre, fim: h.fecha })))
    }
  }

  const salvar = () => {
    const { metaTxt, aluguelTxt, ...resto } = cfg
    acoes.salvarMembro(m as Membro, { ...resto, meta_diaria_centavos: metaTxt ? paraCentavos(metaTxt) : null, aluguel_cadeira_centavos: aluguelTxt ? paraCentavos(aluguelTxt) : null })
    if (m?.id) acoes.salvarJornadas(m.id, turnos)
    avisar(m?.id ? 'Dados salvos' : `${m?.nome_exibicao} entrou na equipe`)
    setM(null)
  }

  const resumoJornada = (id: string) => {
    const dias = [...new Set(estado.jornadas.filter((j) => j.membro_id === id).map((j) => j.dia_semana))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    return dias.length ? dias.map(nomeDiaCurto).join(', ') : 'Sem horário'
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Equipe"
        sub={cadeira ? 'Modo cadeira alugada: cada barbeiro vê só os próprios clientes e o próprio caixa.' : 'Modo equipe: o app calcula a comissão de cada um no fechamento.'}
        acoes={<button className="btn btn-primario" onClick={() => abrir()}><Plus /> Adicionar barbeiro</button>}
      />
      <div className="painel">
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Pessoa</th><th>Função</th><th>Trabalha</th><th className="dir">Comissão</th><th className="dir">Meta do dia</th>{cadeira && <th className="dir">Aluguel</th>}<th>Acesso</th></tr></thead>
            <tbody>
              {estado.membros.map((x) => {
                const c = config.get(x.id)
                return (
                  <tr key={x.id} className="clicavel" onClick={() => abrir(x)} style={!x.ativo ? { opacity: 0.5 } : undefined}>
                    <td><div className="linha-flex"><Avatar nome={x.nome_exibicao} cor={x.cor_agenda} /><div><div className="forte">{x.nome_exibicao}</div><div className="muted pequeno trunca" style={{ maxWidth: 260 }}>{x.bio}</div></div></div></td>
                    <td>{PAPEL[x.papel]}</td>
                    <td className="muted">{resumoJornada(x.id)}</td>
                    <td className="dir num">{c?.comissao_servico_pct ? `${c.comissao_servico_pct}%` : '-'}</td>
                    <td className="dir num">{c?.meta_diaria_centavos ? dinheiroCurto(c.meta_diaria_centavos) : '-'}</td>
                    {cadeira && <td className="dir num">{c?.aluguel_cadeira_centavos ? dinheiroCurto(c.aluguel_cadeira_centavos) : '-'}</td>}
                    <td>{x.perfil_id || x.papel === 'dono' ? <span className="tag tag-ok">Tem login</span> : <span className="tag">Sem login</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Folha aberta={!!m} aoFechar={() => setM(null)} titulo={m?.id ? m.nome_exibicao ?? '' : 'Novo barbeiro'} larga
        rodape={<><button className="btn btn-sec" onClick={() => setM(null)}>Cancelar</button><button className="btn btn-primario" disabled={!m?.nome_exibicao} onClick={salvar}>Salvar</button></>}>
        {m && (
          <>
            <div className="abas" role="tablist">
              <button role="tab" aria-selected={aba === 'dados'} onClick={() => setAba('dados')}>Dados</button>
              <button role="tab" aria-selected={aba === 'ganhos'} onClick={() => setAba('ganhos')}>{cadeira ? 'Aluguel e meta' : 'Comissão e meta'}</button>
              {m.id && <button role="tab" aria-selected={aba === 'jornada'} onClick={() => setAba('jornada')}>Horário de trabalho</button>}
            </div>

            {aba === 'dados' && (
              <div className="grade-campos">
                <Campo rotulo="Nome que aparece no link" id="eq-nome" className="largo"><input id="eq-nome" className="input" value={m.nome_exibicao} onChange={(e) => setM({ ...m, nome_exibicao: e.target.value })} /></Campo>
                <Campo rotulo="Especialidade" id="eq-bio" className="largo"><input id="eq-bio" className="input" value={m.bio ?? ''} onChange={(e) => setM({ ...m, bio: e.target.value })} placeholder="Ex.: degradê navalhado e barba" /></Campo>
                <div className="campo">
                  <span className="rotulo">Função</span>
                  <Segmentos rotulo="Função" valor={m.papel ?? 'barbeiro'} onChange={(v) => setM({ ...m, papel: v })} opcoes={[['barbeiro', 'Barbeiro'], ['recepcao', 'Recepção'], ['dono', 'Dono']]} />
                </div>
                <div className="campo">
                  <span className="rotulo">Cor na agenda</span>
                  <div className="linha-flex" style={{ gap: 6 }}>
                    {CORES.map((c) => (
                      <button key={c} aria-label={`Cor ${c}`} aria-pressed={m.cor_agenda === c} onClick={() => setM({ ...m, cor_agenda: c })}
                        style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: m.cor_agenda === c ? '2.5px solid var(--preto)' : '1px solid var(--linha)' }} />
                    ))}
                  </div>
                </div>
                <div className="largo coluna gap-8">
                  <Switch checked={m.atende ?? true} onChange={(v) => setM({ ...m, atende: v })}>Atende clientes (aparece no link)</Switch>
                  <Switch checked={m.ativo ?? true} onChange={(v) => setM({ ...m, ativo: v })}>Ativo na equipe</Switch>
                </div>
                {!m.perfil_id && m.papel !== 'dono' && (
                  <div className="largo painel" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 600 }}>Acesso pelo celular</div>
                    <p className="muted pequeno" style={{ margin: '4px 0 10px' }}>Mande o convite para {m.nome_exibicao || 'o barbeiro'} criar a senha e ver a própria agenda e comissão.</p>
                    <a className="btn btn-sec btn-pequeno" target="_blank" rel="noreferrer"
                      href={`https://wa.me/?text=${encodeURIComponent(`Você foi adicionado na equipe da ${estado.barbearia.nome} no Kort. Crie seu acesso: ${window.location.origin}/criar-conta`)}`}>
                      <Send /> Enviar convite no WhatsApp
                    </a>
                  </div>
                )}
              </div>
            )}

            {aba === 'ganhos' && (
              <div className="grade-campos">
                {!cadeira && (
                  <>
                    <Campo rotulo="Comissão sobre serviços" id="eq-cs"><div className="input-prefixo"><span>%</span><input id="eq-cs" type="number" min={0} max={100} className="input" value={cfg.comissao_servico_pct ?? 0} onChange={(e) => setCfg({ ...cfg, comissao_servico_pct: Number(e.target.value) })} /></div></Campo>
                    <Campo rotulo="Comissão sobre produtos" id="eq-cp"><div className="input-prefixo"><span>%</span><input id="eq-cp" type="number" min={0} max={100} className="input" value={cfg.comissao_produto_pct ?? 0} onChange={(e) => setCfg({ ...cfg, comissao_produto_pct: Number(e.target.value) })} /></div></Campo>
                  </>
                )}
                {cadeira && (
                  <>
                    <Campo rotulo="Aluguel da cadeira por mês" id="eq-al"><div className="input-prefixo"><span>R$</span><input id="eq-al" className="input" inputMode="decimal" value={cfg.aluguelTxt} onChange={(e) => setCfg({ ...cfg, aluguelTxt: e.target.value })} /></div></Campo>
                    <Campo rotulo="Vence todo dia" id="eq-dv"><input id="eq-dv" type="number" min={1} max={28} className="input" value={cfg.dia_vencimento_aluguel ?? 5} onChange={(e) => setCfg({ ...cfg, dia_vencimento_aluguel: Number(e.target.value) })} /></Campo>
                  </>
                )}
                <Campo rotulo="Meta de faturamento por dia" id="eq-meta" ajuda="Aparece no caixa como barra de progresso." className="largo">
                  <div className="input-prefixo" style={{ maxWidth: 220 }}><span>R$</span><input id="eq-meta" className="input" inputMode="decimal" value={cfg.metaTxt} onChange={(e) => setCfg({ ...cfg, metaTxt: e.target.value })} /></div>
                </Campo>
                <div className="largo"><Switch checked={cfg.eh_mei ?? false} onChange={(v) => setCfg({ ...cfg, eh_mei: v })}>É MEI (o Kort avisa quando chegar perto do limite anual)</Switch></div>
              </div>
            )}

            {aba === 'jornada' && (
              <div className="coluna gap-8">
                <p className="muted pequeno">Para ter horário de almoço, adicione dois turnos no mesmo dia. Ex.: 09:00 às 12:00 e 13:00 às 19:00.</p>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const doDia = turnos.map((t, i) => ({ t, i })).filter((x) => x.t.dia_semana === d)
                  return (
                    <div key={d} className="linha-flex" style={{ alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--linha-fraca)' }}>
                      <span style={{ width: 82, fontWeight: 600, paddingTop: 8, textTransform: 'capitalize' }}>{nomeDia(d)}</span>
                      <div className="cresce coluna gap-8">
                        {doDia.length === 0 && <span className="muted pequeno" style={{ paddingTop: 9 }}>Folga</span>}
                        {doDia.map(({ t, i }) => (
                          <div key={i} className="linha-flex" style={{ gap: 6 }}>
                            <input type="time" className="input" style={{ width: 120 }} aria-label="Início" value={t.inicio} onChange={(e) => setTurnos(turnos.map((x, k) => (k === i ? { ...x, inicio: e.target.value } : x)))} />
                            <span className="muted">às</span>
                            <input type="time" className="input" style={{ width: 120 }} aria-label="Fim" value={t.fim} onChange={(e) => setTurnos(turnos.map((x, k) => (k === i ? { ...x, fim: e.target.value } : x)))} />
                            <button className="btn btn-fantasma btn-icone" aria-label="Remover turno" onClick={() => setTurnos(turnos.filter((_, k) => k !== i))}><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                      <button className="btn btn-sec btn-pequeno" onClick={() => setTurnos([...turnos, { dia_semana: d, inicio: doDia.length ? '13:00' : '09:00', fim: doDia.length ? '19:00' : '12:00' }])}><Plus /> Turno</button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Folha>
    </>
  )
}
