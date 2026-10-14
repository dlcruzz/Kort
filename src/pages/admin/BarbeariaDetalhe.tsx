import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Handshake, MessageCircle } from 'lucide-react'
import { adminAcoes, useAdmin } from '../../lib/adminStore'
import { MODULOS, NOME_MODULO } from '../../data/admin'
import { dataCompleta, dinheiro, nomeMes, deIsoDia, telefone, tempoAtras } from '../../lib/format'
import { CabecalhoPagina, Campo, Confirmar, Folha, Metricas, Vazio } from '../../components/ui'
import { BarrasHorizontais } from '../../components/graficos'
import { emRisco, StatusAssinatura } from './comum'

export default function AdminBarbeariaDetalhe() {
  const { id } = useParams()
  const { barbearias, faturas, logs } = useAdmin()
  const [acao, setAcao] = useState<null | 'suspender' | 'reativar' | 'encerrar'>(null)
  const [parceria, setParceria] = useState(false)
  const [obs, setObs] = useState('')
  const b = barbearias.find((x) => x.id === id)
  if (!b) return <Vazio titulo="Barbearia não encontrada" acao={<Link className="btn btn-sec" to="/admin/barbearias">Voltar</Link>} />

  const fats = faturas.filter((f) => f.barbearia_id === b.id)
  const risco = emRisco(b)
  const usados = MODULOS.filter((m) => b.uso_modulos[m] > 0)
  const naoUsados = MODULOS.filter((m) => !b.uso_modulos[m])

  return (
    <>
      <CabecalhoPagina
        voltar={<Link to="/admin/barbearias" className="voltar"><ArrowLeft /> Barbearias</Link>}
        titulo={b.nome}
        sub={<>{b.responsavel}, {telefone(b.telefone)}. {b.cidade}/{b.uf}. Cliente desde {dataCompleta(b.criado_em)}.</>}
        acoes={
          <>
            <a className="btn btn-sec" href={`https://wa.me/${b.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
            <a className="btn btn-sec" href={`/b/${b.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> Página pública</a>
          </>
        }
      />
      {risco && <div className="painel" style={{ padding: '12px 16px', marginBottom: 16, background: 'var(--perigo-fundo)', borderColor: '#E3B5A9', color: 'var(--perigo)', fontWeight: 600 }}>{risco}. Vale uma ligação.</div>}

      <Metricas itens={[
        b.parceiro
          ? { rot: 'Plano', val: 'Parceira', det: 'Acesso vitalício, sem mensalidade' }
          : { rot: 'Plano', val: b.plano, det: b.preco_centavos ? `${dinheiro(b.preco_centavos)} por mês` : 'Sem cobrança' },
        { rot: 'Barbeiros', val: b.barbeiros },
        { rot: 'Clientes cadastrados', val: b.clientes },
        { rot: 'Agendamentos em 30 dias', val: b.agendamentos_30d, det: `Último uso ${tempoAtras(b.ultimo_uso)}` },
      ]} />

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <div className="pilha">
          <section className="painel">
            <div className="painel-cab"><h2>O que essa barbearia usa</h2></div>
            <div className="painel-corpo" style={{ paddingTop: 4 }}>
              {usados.length ? (
                <BarrasHorizontais rotulo="Uso por função" dados={usados.map((m) => ({ rot: NOME_MODULO[m], valor: b.uso_modulos[m], texto: String(b.uso_modulos[m]), extra: 'vezes em 30 dias' }))} />
              ) : <p className="muted pequeno">Nenhum uso registrado nos últimos 30 dias.</p>}
              {naoUsados.length > 0 && (
                <p className="pequeno" style={{ marginTop: 12 }}><span className="muted">Nunca usou: </span>{naoUsados.map((m) => NOME_MODULO[m]).join(', ')}. Bom assunto para mostrar numa ligação.</p>
              )}
            </div>
          </section>

          <section className="painel">
            <div className="painel-cab"><h2>Mensalidades</h2></div>
            {fats.length ? (
              <div className="tabela-wrap" style={{ marginTop: 8 }}>
                <table className="tabela">
                  <thead><tr><th>Mês</th><th>Vencimento</th><th className="dir">Valor</th><th>Situação</th><th /></tr></thead>
                  <tbody>
                    {fats.map((f) => (
                      <tr key={f.id}>
                        <td style={{ textTransform: 'capitalize' }}>{nomeMes(deIsoDia(f.competencia).getMonth())}</td>
                        <td className="num">{dataCompleta(f.vencimento)}</td>
                        <td className="dir num">{dinheiro(f.valor_centavos)}</td>
                        <td>{f.status === 'paga' ? <span className="tag tag-ok">Paga</span> : f.status === 'vencida' ? <span className="tag tag-perigo">Vencida</span> : f.status === 'cancelada' ? <span className="tag">Cancelada</span> : <span className="tag tag-alerta">Em aberto</span>}</td>
                        <td className="dir">{(f.status === 'aberta' || f.status === 'vencida') && <button className="btn btn-sec btn-pequeno" onClick={() => adminAcoes.darBaixa(f.id)}>Dar baixa</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted pequeno" style={{ padding: '10px 18px 16px' }}>{b.parceiro ? 'Sem mensalidades: barbearia parceira.' : 'Sem mensalidades: está no teste ou no plano grátis.'}</p>}
          </section>
        </div>

        <div className="pilha">
          <section className="painel">
            <div className="painel-cab"><h2>Assinatura</h2><StatusAssinatura status={b.status_assinatura} parceiro={b.parceiro} /></div>
            <div className="painel-corpo coluna gap-8">
              {!b.parceiro && b.status_assinatura === 'teste' && <p className="pequeno">Teste até <b>{b.teste_ate ? dataCompleta(b.teste_ate) : '-'}</b>.</p>}
              {!b.parceiro && b.proximo_vencimento && <p className="pequeno">Próximo vencimento: <b>{dataCompleta(b.proximo_vencimento)}</b>.</p>}
              <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {!b.parceiro && <button className="btn btn-sec btn-pequeno" onClick={() => adminAcoes.estenderTeste(b.id, 7)}>Estender teste 7 dias</button>}
                {b.status_assinatura !== 'suspensa' && b.status_assinatura !== 'cancelada'
                  ? <button className="btn btn-perigo btn-pequeno" onClick={() => setAcao('suspender')}>Suspender acesso</button>
                  : <button className="btn btn-primario btn-pequeno" onClick={() => setAcao('reativar')}>Reativar</button>}
              </div>
            </div>
          </section>
          <section className="painel parceria" data-ativa={b.parceiro ? 'sim' : 'nao'}>
            <div className="painel-cab"><h2><Handshake size={18} style={{ display: 'inline', verticalAlign: -3, marginRight: 6 }} />Parceria</h2>{b.parceiro && <span className="tag tag-kort">Ativa</span>}</div>
            <div className="painel-corpo coluna gap-8">
              {b.parceiro ? (
                <>
                  <p className="pequeno">Acesso vitalício em troca de divulgação{b.parceiro_desde ? <>, desde <b>{dataCompleta(b.parceiro_desde)}</b></> : null}. Não paga mensalidade e não entra na receita.</p>
                  {b.parceiro_obs && <p className="pequeno parceria-obs">{b.parceiro_obs}</p>}
                  <div className="linha-flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-sec btn-pequeno" onClick={() => { setObs(b.parceiro_obs ?? ''); setParceria(true) }}>Editar combinado</button>
                    <button className="btn btn-fantasma btn-pequeno" onClick={() => setAcao('encerrar')}>Encerrar parceria</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="pequeno muted">Para influenciador ou barbearia que divulga o Kort: libera o acesso para sempre, sem mensalidade e sem contar na receita.</p>
                  <div><button className="btn btn-primario btn-pequeno" onClick={() => { setObs(''); setParceria(true) }}><Handshake size={15} /> Tornar parceira</button></div>
                </>
              )}
            </div>
          </section>
          <section className="painel">
            <div className="painel-cab"><h2>Registro de ações</h2></div>
            <div className="painel-corpo" style={{ paddingTop: 6 }}>
              <ul className="lista pequeno">
                {logs.filter((l) => l.barbearia === b.nome).map((l) => <li key={l.id}><span className="cresce">{l.acao}</span><span className="muted">{tempoAtras(l.em)}</span></li>)}
                {!logs.some((l) => l.barbearia === b.nome) && <li className="muted">Nada feito nesta conta ainda. Toda ação sua aqui fica registrada.</li>}
              </ul>
            </div>
          </section>
        </div>
      </div>

      <Confirmar aberto={!!acao}
        titulo={acao === 'suspender' ? 'Suspender acesso?' : acao === 'encerrar' ? 'Encerrar a parceria?' : 'Reativar acesso?'}
        texto={acao === 'suspender' ? 'A barbearia não consegue entrar e a página de agendamento sai do ar até reativar.'
          : acao === 'encerrar' ? `A ${b.nome} continua ativa, mas volta a ser cobrada no plano ${b.plano} a partir do próximo vencimento.`
          : 'A barbearia volta a entrar normalmente e o link volta ao ar.'}
        acao={acao === 'suspender' ? 'Suspender' : acao === 'encerrar' ? 'Encerrar parceria' : 'Reativar'} perigo={acao !== 'reativar'}
        aoCancelar={() => setAcao(null)}
        aoConfirmar={() => {
          if (acao === 'encerrar') adminAcoes.definirParceiro(b.id, false, '')
          else adminAcoes.mudarStatus(b.id, acao === 'suspender' ? 'suspensa' : 'ativa')
          setAcao(null)
        }} />

      <Folha aberta={parceria} aoFechar={() => setParceria(false)} titulo={b.parceiro ? 'Editar parceria' : 'Tornar parceira'}
        subtitulo="Acesso vitalício liberado, sem mensalidade. Mensalidades em aberto são canceladas."
        rodape={<>
          <button className="btn btn-sec" onClick={() => setParceria(false)}>Cancelar</button>
          <button className="btn btn-primario" onClick={() => { adminAcoes.definirParceiro(b.id, true, obs); setParceria(false) }}><Handshake size={16} /> {b.parceiro ? 'Salvar' : 'Liberar acesso vitalício'}</button>
        </>}>
        <Campo rotulo="O combinado (só você vê)" id="parc-obs" ajuda="Ex.: @perfil, 2 posts e 4 stories por mês marcando o Kort.">
          <textarea id="parc-obs" className="textarea" rows={4} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Quem é e o que vai divulgar" />
        </Campo>
      </Folha>
    </>
  )
}
