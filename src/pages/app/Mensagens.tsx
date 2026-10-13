import { useState } from 'react'
import { MessageCircle, Plus, Send } from 'lucide-react'
import { useKort, useMapas } from '../../lib/store'
import { dataRelativa, deIsoDia, diasEntre, hoje, isoDia, primeiroNome, telefone, tempoAtras } from '../../lib/format'
import type { ModeloMensagem, TipoMensagem } from '../../lib/types'
import { CabecalhoPagina, Campo, Folha, Metricas, Switch, Vazio } from '../../components/ui'
import { whatsLink } from '../../components/folhas'
import { useAvisar } from '../../components/avisos'

type Aba = 'automaticas' | 'resgate' | 'espera' | 'enviadas'

const INFO: Record<TipoMensagem, { nome: string; quando: string }> = {
  confirmacao: { nome: 'Confirmação', quando: 'Logo depois que o horário é marcado' },
  lembrete_24h: { nome: 'Lembrete do dia anterior', quando: '24 horas antes, com botão para confirmar ou remarcar' },
  lembrete_2h: { nome: 'Lembrete de 2 horas', quando: '2 horas antes do horário' },
  retorno: { nome: 'Hora de voltar', quando: 'No dia em que o cliente costuma voltar, pelo ritmo dele' },
  resgate: { nome: 'Cliente sumido', quando: 'Quando passa 10 dias do retorno previsto' },
  lista_espera: { nome: 'Vaga na lista de espera', quando: 'Quando alguém cancela e abre um horário' },
  resumo_diario: { nome: 'Resumo do dia para você', quando: 'Todo dia às 21h, no seu WhatsApp' },
}

const VARIAVEIS = ['{cliente}', '{barbeiro}', '{data}', '{horario}', '{servico}', '{barbearia}', '{link}', '{desconto}']

export default function Mensagens() {
  const { estado, acoes } = useKort()
  const { cliente, membro, servico } = useMapas()
  const avisar = useAvisar()
  const [aba, setAba] = useState<Aba>('automaticas')
  const [editando, setEditando] = useState<ModeloMensagem | null>(null)
  const [novaEspera, setNovaEspera] = useState(false)
  const [esp, setEsp] = useState({ clienteId: '', membroId: '', servicoId: '', data: isoDia(hoje()), de: '', ate: '' })

  const b = estado.barbearia
  const exemplo = (t: string) =>
    t.replace('{cliente}', 'Matheus').replace('{barbeiro}', 'Pedrinho').replace('{data}', 'quinta, 15/10').replace('{horario}', '15:30')
      .replace('{servico}', 'Corte degradê').replace('{barbearia}', b.nome).replace('{link}', `kort.app/b/${b.slug}`).replace('{desconto}', '10%')
      .replace('{faturamento}', 'R$ 1.385').replace('{atendimentos}', '23').replace('{faltas}', '1').replace('{agendados}', '19')

  const sumidos = estado.clientes
    .filter((c) => c.aceita_mensagens && c.proximo_retorno_previsto && c.proximo_retorno_previsto < isoDia(hoje()))
    .map((c) => ({ c, atraso: diasEntre(deIsoDia(c.proximo_retorno_previsto!), hoje()) }))
    .sort((a, b2) => a.atraso - b2.atraso)
  const jaChamados = new Set(estado.mensagens.filter((m) => m.tipo === 'resgate' && m.enviada_em && diasEntre(m.enviada_em, new Date()) < 14).map((m) => m.cliente_id))

  const espera = estado.listaEspera.filter((l) => l.status === 'aguardando' || l.status === 'avisado').sort((a, b2) => a.data.localeCompare(b2.data))

  const mes = estado.mensagens.filter((m) => m.enviada_em && diasEntre(m.enviada_em, new Date()) < 30)
  const lidas = mes.filter((m) => m.status === 'lida').length
  const geraram = mes.filter((m) => m.gerou_agendamento).length

  const modeloResgate = estado.modelos.find((m) => m.tipo === 'resgate')?.texto ?? ''
  const textoResgate = (nome: string) =>
    modeloResgate.replace('{cliente}', primeiroNome(nome)).replace('{barbearia}', b.nome).replace('{desconto}', '10%').replace('{link}', `kort.app/b/${b.slug}`)

  return (
    <>
      <CabecalhoPagina titulo="Mensagens" sub="Lembretes e convites que saem sozinhos pelo WhatsApp da barbearia. Você escreve uma vez, do seu jeito." />

      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'automaticas'} onClick={() => setAba('automaticas')}>Automáticas</button>
        <button role="tab" aria-selected={aba === 'resgate'} onClick={() => setAba('resgate')}>Clientes sumidos <span className="muted">{sumidos.length}</span></button>
        <button role="tab" aria-selected={aba === 'espera'} onClick={() => setAba('espera')}>Lista de espera <span className="muted">{espera.length}</span></button>
        <button role="tab" aria-selected={aba === 'enviadas'} onClick={() => setAba('enviadas')}>Resultado</button>
      </div>

      {aba === 'automaticas' && (
        <div className="painel">
          <ul className="lista" style={{ padding: '0 18px' }}>
            {estado.modelos.map((m) => (
              <li key={m.id} style={{ alignItems: 'flex-start', padding: '16px 0' }}>
                <Switch checked={m.ativo} label={`Ativar ${INFO[m.tipo].nome}`} onChange={(v) => { acoes.salvarModelo({ ...m, ativo: v }); avisar(v ? 'Mensagem ativada' : 'Mensagem desativada') }} />
                <div className="cresce">
                  <div style={{ fontWeight: 700 }}>{INFO[m.tipo].nome}</div>
                  <div className="muted pequeno">{INFO[m.tipo].quando}</div>
                  <p className="pequeno" style={{ marginTop: 8, color: m.ativo ? 'var(--preto)' : 'var(--grafite-claro)', maxWidth: '70ch' }}>{exemplo(m.texto)}</p>
                </div>
                <button className="btn btn-sec btn-pequeno" onClick={() => setEditando({ ...m })}>Editar texto</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aba === 'resgate' && (
        <div className="painel">
          <div className="painel-cab">
            <h2>Passaram do prazo de voltar</h2>
            <span className="muted pequeno">Ordenado por quem sumiu há menos tempo: é mais fácil de trazer de volta.</span>
          </div>
          {sumidos.length ? (
            <div className="tabela-wrap" style={{ marginTop: 8 }}>
              <table className="tabela">
                <thead><tr><th>Cliente</th><th>Costuma voltar</th><th>Atraso</th><th>Última visita</th><th /></tr></thead>
                <tbody>
                  {sumidos.map(({ c, atraso }) => (
                    <tr key={c.id}>
                      <td><div className="forte">{c.nome}</div><div className="muted pequeno">{telefone(c.telefone)}</div></td>
                      <td className="muted">a cada {Math.round(c.frequencia_media_dias ?? 30)} dias</td>
                      <td><span className={`tag ${atraso > 30 ? 'tag-perigo' : 'tag-alerta'}`}>{atraso} dias</span></td>
                      <td className="muted">{tempoAtras(c.ultima_visita_em)}</td>
                      <td className="dir">
                        {jaChamados.has(c.id) ? (
                          <span className="muted pequeno">Chamado recentemente</span>
                        ) : (
                          <a className="btn btn-sec btn-pequeno" href={whatsLink(c.telefone, textoResgate(c.nome))} target="_blank" rel="noreferrer"
                            onClick={() => { acoes.registrarMensagem(c.id, 'resgate', textoResgate(c.nome)); avisar(`Mensagem aberta para ${primeiroNome(c.nome)}`) }}>
                            <MessageCircle /> Chamar
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vazio titulo="Ninguém sumido" texto="Todo mundo está voltando no ritmo de sempre." />
          )}
        </div>
      )}

      {aba === 'espera' && (
        <div className="painel">
          <div className="painel-cab">
            <h2>Quem quer um horário que está cheio</h2>
            <button className="btn btn-sec btn-pequeno" onClick={() => setNovaEspera(true)}><Plus /> Adicionar</button>
          </div>
          {espera.length ? (
            <ul className="lista" style={{ padding: '6px 18px 4px' }}>
              {espera.map((l) => {
                const c = cliente.get(l.cliente_id)
                return (
                  <li key={l.id}>
                    <div className="cresce">
                      <div style={{ fontWeight: 600 }}>{c?.nome}</div>
                      <div className="muted pequeno">
                        {dataRelativa(l.data)}{l.hora_de ? ` entre ${l.hora_de} e ${l.hora_ate}` : ', qualquer hora'}
                        {l.servico_id && `, ${servico.get(l.servico_id)?.nome}`}
                        {l.membro_id ? ` com ${membro.get(l.membro_id)?.nome_exibicao}` : ', com qualquer barbeiro'}
                      </div>
                    </div>
                    {l.status === 'avisado' && <span className="tag tag-info">Avisado</span>}
                    {c && (
                      <a className="btn btn-sec btn-pequeno" target="_blank" rel="noreferrer"
                        href={whatsLink(c.telefone, `${primeiroNome(c.nome)}, abriu um horário ${dataRelativa(l.data)} aqui na ${b.nome}. Quer? Garanta: kort.app/b/${b.slug}`)}
                        onClick={() => { acoes.mudarListaEspera(l.id, 'avisado'); acoes.registrarMensagem(c.id, 'lista_espera', '') }}>
                        <Send /> Avisar
                      </a>
                    )}
                    <button className="btn btn-fantasma btn-pequeno" onClick={() => { acoes.mudarListaEspera(l.id, 'cancelado'); avisar('Removido da lista') }}>Remover</button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Vazio titulo="Lista vazia" texto="Quando o dia estiver cheio, o link oferece a lista de espera. Se alguém cancelar, o Kort avisa o primeiro da fila." />
          )}
        </div>
      )}

      {aba === 'enviadas' && (
        <>
          <Metricas itens={[
            { rot: 'Enviadas em 30 dias', val: mes.length },
            { rot: 'Lidas', val: mes.length ? `${Math.round((lidas / mes.length) * 100)}%` : '0%' },
            { rot: 'Viraram horário', val: geraram, det: 'Convites de retorno, resgate e lista de espera' },
            { rot: 'Falharam', val: mes.filter((m) => m.status === 'falhou').length, det: 'Número errado ou sem WhatsApp' },
          ]} />
          <p className="muted pequeno" style={{ marginTop: 14 }}>
            O envio automático usa o WhatsApp da barbearia conectado em Configurações. Até lá, os botões "Chamar" e "Avisar" abrem a conversa pronta no seu WhatsApp.
          </p>
        </>
      )}

      <Folha aberta={!!editando} aoFechar={() => setEditando(null)} titulo={editando ? INFO[editando.tipo].nome : ''} subtitulo={editando ? INFO[editando.tipo].quando : ''}
        rodape={<><button className="btn btn-sec" onClick={() => setEditando(null)}>Cancelar</button><button className="btn btn-primario" onClick={() => { acoes.salvarModelo(editando!); setEditando(null); avisar('Texto salvo') }}>Salvar texto</button></>}>
        {editando && (
          <div className="coluna gap-16">
            <Campo rotulo="Texto" id="msg-txt" ajuda="As palavras entre chaves são trocadas pelos dados de cada cliente.">
              <textarea id="msg-txt" className="textarea" style={{ minHeight: 140 }} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
            </Campo>
            <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
              {VARIAVEIS.map((v) => <button key={v} className="chip" style={{ minHeight: 30, fontSize: 13 }} onClick={() => setEditando({ ...editando, texto: `${editando.texto} ${v}` })}>{v}</button>)}
            </div>
            <div>
              <div className="rotulo" style={{ marginBottom: 8 }}>Como o cliente recebe</div>
              <div className="exemplo whats" style={{ fontSize: 14, padding: '10px 12px', border: '1px solid', borderRadius: 10 }}>{exemplo(editando.texto)}</div>
            </div>
          </div>
        )}
      </Folha>

      <Folha aberta={novaEspera} aoFechar={() => setNovaEspera(false)} titulo="Adicionar à lista de espera"
        rodape={<><button className="btn btn-sec" onClick={() => setNovaEspera(false)}>Cancelar</button><button className="btn btn-primario" disabled={!esp.clienteId} onClick={() => {
          acoes.adicionarListaEspera({ cliente_id: esp.clienteId, membro_id: esp.membroId || null, servico_id: esp.servicoId || null, data: esp.data, hora_de: esp.de || null, hora_ate: esp.ate || null })
          setNovaEspera(false); avisar('Adicionado à lista de espera')
        }}>Adicionar</button></>}>
        <div className="grade-campos">
          <Campo rotulo="Cliente" id="le-cli" className="largo">
            <select id="le-cli" className="select" value={esp.clienteId} onChange={(e) => setEsp({ ...esp, clienteId: e.target.value })}>
              <option value="">Escolha...</option>
              {[...estado.clientes].sort((a, c) => a.nome.localeCompare(c.nome)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Serviço" id="le-serv">
            <select id="le-serv" className="select" value={esp.servicoId} onChange={(e) => setEsp({ ...esp, servicoId: e.target.value })}>
              <option value="">Qualquer</option>
              {estado.servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Barbeiro" id="le-mem">
            <select id="le-mem" className="select" value={esp.membroId} onChange={(e) => setEsp({ ...esp, membroId: e.target.value })}>
              <option value="">Qualquer</option>
              {estado.membros.filter((m) => m.atende).map((m) => <option key={m.id} value={m.id}>{m.nome_exibicao}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Dia" id="le-dia" className="largo"><input id="le-dia" type="date" className="input" value={esp.data} onChange={(e) => setEsp({ ...esp, data: e.target.value })} /></Campo>
          <Campo rotulo="A partir de (opcional)" id="le-de"><input id="le-de" type="time" className="input" value={esp.de} onChange={(e) => setEsp({ ...esp, de: e.target.value })} /></Campo>
          <Campo rotulo="Até (opcional)" id="le-ate"><input id="le-ate" type="time" className="input" value={esp.ate} onChange={(e) => setEsp({ ...esp, ate: e.target.value })} /></Campo>
        </div>
      </Folha>
    </>
  )
}
