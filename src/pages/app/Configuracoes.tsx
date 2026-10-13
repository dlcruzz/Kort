import { useState } from 'react'
import { Copy, ThumbsUp, Plus, Smartphone } from 'lucide-react'
import { useKort } from '../../lib/store'
import { dataCompleta, dinheiro, nomeDia, nomeMes, deIsoDia } from '../../lib/format'
import { pixCopiaECola } from '../../lib/pix'
import { CabecalhoPagina, Campo, Confirmar, Folha, Segmentos, Switch } from '../../components/ui'
import { PixQr } from '../../components/PixQr'
import { useAvisar } from '../../components/avisos'
import { PLANOS } from '../Site'

type Aba = 'barbearia' | 'horarios' | 'whatsapp' | 'plano' | 'sugestoes'

const CHAVE_PIX = (import.meta.env.VITE_KORT_PIX_CHAVE as string | undefined) || 'chave-pix-do-kort'

export default function Configuracoes() {
  const [aba, setAba] = useState<Aba>('barbearia')
  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'barbearia'} onClick={() => setAba('barbearia')}>Barbearia</button>
        <button role="tab" aria-selected={aba === 'horarios'} onClick={() => setAba('horarios')}>Horário de funcionamento</button>
        <button role="tab" aria-selected={aba === 'whatsapp'} onClick={() => setAba('whatsapp')}>WhatsApp</button>
        <button role="tab" aria-selected={aba === 'plano'} onClick={() => setAba('plano')}>Plano e mensalidade</button>
        <button role="tab" aria-selected={aba === 'sugestoes'} onClick={() => setAba('sugestoes')}>Sugestões</button>
      </div>
      {aba === 'barbearia' && <DadosBarbearia />}
      {aba === 'horarios' && <Horarios />}
      {aba === 'whatsapp' && <WhatsApp />}
      {aba === 'plano' && <Plano />}
      {aba === 'sugestoes' && <Sugestoes />}
    </>
  )
}

function DadosBarbearia() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [b, setB] = useState(estado.barbearia)
  const [reset, setReset] = useState(false)
  const set = (k: keyof typeof b, v: unknown) => setB({ ...b, [k]: v })
  return (
    <div className="duas-colunas">
      <section className="painel">
        <div className="painel-cab"><h2>Dados que aparecem no link</h2></div>
        <div className="painel-corpo grade-campos">
          <Campo rotulo="Nome" id="cf-nome" className="largo"><input id="cf-nome" className="input" value={b.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
          <Campo rotulo="Descrição" id="cf-desc" className="largo"><textarea id="cf-desc" className="textarea" value={b.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Campo>
          <Campo rotulo="Rua" id="cf-rua"><input id="cf-rua" className="input" value={b.logradouro ?? ''} onChange={(e) => set('logradouro', e.target.value)} /></Campo>
          <Campo rotulo="Número" id="cf-num"><input id="cf-num" className="input" value={b.numero ?? ''} onChange={(e) => set('numero', e.target.value)} /></Campo>
          <Campo rotulo="Bairro" id="cf-bai"><input id="cf-bai" className="input" value={b.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} /></Campo>
          <Campo rotulo="Cidade" id="cf-cid"><input id="cf-cid" className="input" value={b.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Campo>
          <Campo rotulo="Instagram" id="cf-ig"><input id="cf-ig" className="input" value={b.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} /></Campo>
          <Campo rotulo="Link" id="cf-slug"><div className="input-prefixo"><span style={{ fontSize: 13 }}>kort.app/b/</span><input id="cf-slug" className="input" style={{ paddingLeft: 88 }} value={b.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></div></Campo>
          <div className="largo"><Switch checked={b.publicada} onChange={(v) => set('publicada', v)}>Página de agendamento no ar</Switch></div>
          <button className="btn btn-primario largo" style={{ justifySelf: 'start' }} onClick={() => { acoes.salvarBarbearia(b); avisar('Dados salvos') }}>Salvar</button>
        </div>
      </section>
      <div className="pilha">
        <section className="painel">
          <div className="painel-cab"><h2>Regras da agenda</h2></div>
          <div className="painel-corpo coluna gap-16">
            <div className="campo">
              <span className="rotulo">Como a casa funciona</span>
              <Segmentos rotulo="Modo" valor={b.modo_operacao} onChange={(v) => set('modo_operacao', v)} opcoes={[['equipe', 'Equipe com comissão'], ['cadeira_alugada', 'Cadeira alugada']]} />
            </div>
            <Campo rotulo="Cliente pode cancelar até" id="cf-canc">
              <select id="cf-canc" className="select" value={b.antecedencia_cancelamento_min} onChange={(e) => set('antecedencia_cancelamento_min', Number(e.target.value))}>
                {[30, 60, 120, 240, 720, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutos` : `${m / 60} ${m === 60 ? 'hora' : 'horas'}`} antes</option>)}
              </select>
            </Campo>
            <Campo rotulo="Agenda aberta para os próximos" id="cf-max">
              <select id="cf-max" className="select" value={b.antecedencia_max_dias} onChange={(e) => set('antecedencia_max_dias', Number(e.target.value))}>
                {[7, 14, 21, 30, 60].map((d) => <option key={d} value={d}>{d} dias</option>)}
              </select>
            </Campo>
            <Campo rotulo="Intervalo entre horários no link" id="cf-grade">
              <select id="cf-grade" className="select" value={b.intervalo_slots_min} onChange={(e) => set('intervalo_slots_min', Number(e.target.value))}>
                {[10, 15, 20, 30].map((m) => <option key={m} value={m}>de {m} em {m} minutos</option>)}
              </select>
            </Campo>
            <button className="btn btn-sec" style={{ alignSelf: 'flex-start' }} onClick={() => { acoes.salvarBarbearia(b); avisar('Regras salvas') }}>Salvar regras</button>
          </div>
        </section>
        <section className="painel">
          <div className="painel-cab"><h2>Demonstração</h2></div>
          <div className="painel-corpo">
            <p className="muted pequeno" style={{ marginBottom: 12 }}>Apaga o que você testou e volta aos dados de exemplo.</p>
            <button className="btn btn-perigo" onClick={() => setReset(true)}>Recomeçar dados de exemplo</button>
          </div>
        </section>
      </div>
      <Confirmar aberto={reset} titulo="Recomeçar a demonstração?" texto="Tudo o que você criou neste navegador some." acao="Recomeçar" perigo aoCancelar={() => setReset(false)} aoConfirmar={() => { acoes.resetarDemo(); setReset(false); window.location.reload() }} />
    </div>
  )
}

function Horarios() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [h, setH] = useState(() => [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const x = estado.horarios.find((y) => y.dia_semana === d)
    return { dia_semana: d, aberto: !!x, abre: x?.abre ?? '09:00', fecha: x?.fecha ?? '19:00' }
  }))
  return (
    <section className="painel" style={{ maxWidth: 640 }}>
      <div className="painel-corpo">
        <ul className="lista">
          {h.map((d, i) => (
            <li key={d.dia_semana}>
              <span style={{ width: 90, fontWeight: 600, textTransform: 'capitalize' }}>{nomeDia(d.dia_semana)}</span>
              <Switch checked={d.aberto} label={`Abre ${nomeDia(d.dia_semana)}`} onChange={(v) => setH(h.map((x, k) => (k === i ? { ...x, aberto: v } : x)))} />
              {d.aberto ? (
                <div className="linha-flex" style={{ gap: 6 }}>
                  <input type="time" className="input" style={{ width: 120 }} aria-label="Abre" value={d.abre} onChange={(e) => setH(h.map((x, k) => (k === i ? { ...x, abre: e.target.value } : x)))} />
                  <span className="muted">às</span>
                  <input type="time" className="input" style={{ width: 120 }} aria-label="Fecha" value={d.fecha} onChange={(e) => setH(h.map((x, k) => (k === i ? { ...x, fecha: e.target.value } : x)))} />
                </div>
              ) : <span className="muted">Fechado</span>}
            </li>
          ))}
        </ul>
        <p className="muted pequeno" style={{ margin: '12px 0' }}>O horário de cada barbeiro (com almoço) fica em Equipe.</p>
        <button className="btn btn-primario" onClick={() => { acoes.salvarHorarios(h.filter((x) => x.aberto).map(({ dia_semana, abre, fecha }) => ({ dia_semana, abre, fecha }))); avisar('Horário salvo') }}>Salvar horário</button>
      </div>
    </section>
  )
}

function WhatsApp() {
  return (
    <section className="painel" style={{ maxWidth: 640 }}>
      <div className="painel-corpo">
        <div className="linha-flex" style={{ alignItems: 'flex-start', gap: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--preto)', color: 'var(--kort)', display: 'grid', placeItems: 'center', flex: 'none' }}><Smartphone /></span>
          <div>
            <h2 style={{ fontFamily: 'var(--f-texto)', fontSize: 17, fontWeight: 700 }}>WhatsApp da barbearia não conectado</h2>
            <p className="muted pequeno" style={{ marginTop: 4 }}>
              Conectando o número, a confirmação, os lembretes e os convites saem sozinhos. Sem conectar, o Kort abre a conversa pronta no seu celular e você só aperta enviar.
            </p>
          </div>
        </div>
        <ol className="pequeno" style={{ margin: '18px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Use um número de WhatsApp Business só da barbearia.</li>
          <li>Clique em conectar e leia o código com o celular.</li>
          <li>Pronto. As mensagens saem com o nome da sua barbearia.</li>
        </ol>
        <button className="btn btn-primario" disabled>Conectar WhatsApp</button>
        <p className="muted pequeno" style={{ marginTop: 8 }}>Disponível quando o envio automático for ligado no servidor.</p>
      </div>
    </section>
  )
}

function Plano() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [trocar, setTrocar] = useState(false)
  const a = estado.assinatura
  const aberta = estado.faturas.find((f) => f.status === 'aberta' || f.status === 'vencida')
  const codigo = aberta
    ? pixCopiaECola({ chave: CHAVE_PIX, valorCentavos: aberta.valor_centavos, nome: 'KORT', cidade: 'SAO PAULO', txid: `KORT${aberta.id.replace(/-/g, '').slice(0, 16)}`, descricao: `Kort ${nomeMes(deIsoDia(aberta.competencia).getMonth())}` })
    : ''
  return (
    <div className="duas-colunas">
      <div className="pilha">
        <section className="painel">
          <div className="painel-corpo linha-flex entre" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="muted pequeno">Seu plano</div>
              <div className="display" style={{ fontSize: 40 }}>{a.plano}</div>
              <div className="pequeno">{dinheiro(a.preco_centavos)} por mês, vence dia {deIsoDia(a.proximo_vencimento).getDate()}</div>
            </div>
            <div className="linha-flex">
              <span className={`tag ${a.status === 'ativa' ? 'tag-ok' : a.status === 'teste' ? 'tag-info' : 'tag-perigo'}`}>{a.status === 'ativa' ? 'Ativo' : a.status === 'teste' ? 'Em teste' : 'Pagamento atrasado'}</span>
              <button className="btn btn-sec btn-pequeno" onClick={() => setTrocar(true)}>Trocar plano</button>
            </div>
          </div>
        </section>
        <section className="painel">
          <div className="painel-cab"><h2>Mensalidades</h2></div>
          <div className="tabela-wrap" style={{ marginTop: 8 }}>
            <table className="tabela">
              <thead><tr><th>Mês</th><th>Vencimento</th><th className="dir">Valor</th><th>Situação</th></tr></thead>
              <tbody>
                {[...estado.faturas].reverse().map((f) => (
                  <tr key={f.id}>
                    <td style={{ textTransform: 'capitalize' }}>{nomeMes(deIsoDia(f.competencia).getMonth())}</td>
                    <td className="num">{dataCompleta(f.vencimento)}</td>
                    <td className="dir num">{dinheiro(f.valor_centavos)}</td>
                    <td>{f.status === 'paga' ? <span className="tag tag-ok">Paga</span> : f.status === 'vencida' ? <span className="tag tag-perigo">Vencida</span> : <span className="tag tag-alerta">Em aberto</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="painel">
        <div className="painel-cab"><h2>{aberta ? 'Pagar a mensalidade' : 'Tudo em dia'}</h2></div>
        <div className="painel-corpo">
          {aberta ? (
            <div className="coluna gap-16" style={{ alignItems: 'flex-start' }}>
              <p className="pequeno">
                {dinheiro(aberta.valor_centavos)} referente a {nomeMes(deIsoDia(aberta.competencia).getMonth())}, vence {dataCompleta(aberta.vencimento)}. Pague no Pix, pelo QR code ou copiando o código.
              </p>
              <PixQr codigo={codigo} />
              <textarea className="textarea" readOnly value={codigo} aria-label="Pix copia e cola" style={{ fontSize: 12, minHeight: 80 }} />
              <button className="btn btn-primario" onClick={async () => { await navigator.clipboard?.writeText(codigo).catch(() => {}); avisar('Código Pix copiado') }}><Copy /> Copiar código Pix</button>
              <p className="muted pequeno">A baixa acontece em até 1 dia útil depois que o Pix cair.</p>
              <button className="btn btn-fantasma btn-pequeno" onClick={() => { acoes.pagarFatura(aberta.id); avisar('Pagamento registrado (demonstração)') }}>Simular pagamento</button>
            </div>
          ) : (
            <p className="muted pequeno">Nenhuma mensalidade em aberto. A próxima aparece aqui perto do vencimento.</p>
          )}
        </div>
      </section>

      <Folha aberta={trocar} aoFechar={() => setTrocar(false)} titulo="Trocar plano" subtitulo="A diferença entra na próxima mensalidade.">
        <div className="coluna gap-8">
          {PLANOS.map((p) => (
            <div key={p.nome} className="painel linha-flex" style={{ padding: 14, borderColor: p.nome === a.plano ? 'var(--preto)' : undefined }}>
              <div className="cresce">
                <div style={{ fontWeight: 700 }}>{p.nome}</div>
                <div className="muted pequeno">{p.pq}</div>
              </div>
              <b className="num">{dinheiro(p.preco)}</b>
              {p.nome === a.plano ? <span className="tag tag-preto">Atual</span> : <button className="btn btn-sec btn-pequeno" onClick={() => { setTrocar(false); avisar(`Pedido de troca para ${p.nome} enviado`) }}>Escolher</button>}
            </div>
          ))}
        </div>
      </Folha>
    </div>
  )
}

function Sugestoes() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [nova, setNova] = useState(false)
  const [t, setT] = useState({ titulo: '', descricao: '' })
  const STATUS: Record<string, string> = { nova: 'Recebida', em_analise: 'Em análise', planejada: 'Vamos fazer', feita: 'Feita', recusada: 'Não vamos fazer' }
  return (
    <section className="painel" style={{ maxWidth: 760 }}>
      <div className="painel-cab">
        <h2>O que falta no Kort para você?</h2>
        <button className="btn btn-primario btn-pequeno" onClick={() => setNova(true)}><Plus /> Sugerir</button>
      </div>
      <ul className="lista" style={{ padding: '6px 18px 4px' }}>
        {[...estado.sugestoes].sort((a, b) => b.votos - a.votos).map((s) => (
          <li key={s.id}>
            <button className={`btn ${s.votei ? 'btn-escuro' : 'btn-sec'} btn-pequeno`} style={{ flexDirection: 'column', height: 52, width: 52, gap: 2 }} onClick={() => acoes.votarSugestao(s.id)} aria-pressed={s.votei} aria-label={`Votar em ${s.titulo}`}>
              <ThumbsUp size={15} /><span className="num">{s.votos}</span>
            </button>
            <div className="cresce">
              <div style={{ fontWeight: 600 }}>{s.titulo}</div>
              {s.descricao && <div className="muted pequeno">{s.descricao}</div>}
            </div>
            <span className={`tag ${s.status === 'planejada' ? 'tag-kort' : s.status === 'feita' ? 'tag-ok' : ''}`}>{STATUS[s.status]}</span>
          </li>
        ))}
      </ul>
      <Folha aberta={nova} aoFechar={() => setNova(false)} titulo="Nova sugestão"
        rodape={<><button className="btn btn-sec" onClick={() => setNova(false)}>Cancelar</button><button className="btn btn-primario" disabled={t.titulo.trim().length < 4} onClick={() => { acoes.criarSugestao(t.titulo, t.descricao); setNova(false); setT({ titulo: '', descricao: '' }); avisar('Sugestão enviada. Valeu!') }}>Enviar</button></>}>
        <div className="coluna gap-16">
          <Campo rotulo="O que você queria que o Kort fizesse?" id="sg-t"><input id="sg-t" className="input" value={t.titulo} onChange={(e) => setT({ ...t, titulo: e.target.value })} /></Campo>
          <Campo rotulo="Conta mais (opcional)" id="sg-d"><textarea id="sg-d" className="textarea" value={t.descricao} onChange={(e) => setT({ ...t, descricao: e.target.value })} /></Campo>
        </div>
      </Folha>
    </section>
  )
}
