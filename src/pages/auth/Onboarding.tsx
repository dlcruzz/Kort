import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Campo, Segmentos } from '../../components/ui'
import { useKort } from '../../lib/store'
import { nomeDia, paraCentavos } from '../../lib/format'

// Configuração inicial em 3 passos. No Supabase:
//   insert into barbearias (slug, nome, ..., criado_por) -> o trigger cria o dono e o teste de 14 dias
//   insert into servicos (...)  |  insert into horarios_funcionamento (...)

const slugificar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function Onboarding() {
  const nav = useNavigate()
  const { acoes } = useKort()
  const [passo, setPasso] = useState(1)
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [modo, setModo] = useState<'equipe' | 'cadeira_alugada'>('equipe')
  const [bairro, setBairro] = useState('')
  const [servicos, setServicos] = useState([
    { nome: 'Corte', preco: '40', duracao: 30 },
    { nome: 'Barba', preco: '30', duracao: 20 },
    { nome: 'Corte + barba', preco: '65', duracao: 50 },
  ])
  const [dias, setDias] = useState([2, 3, 4, 5, 6])
  const [abre, setAbre] = useState('09:00')
  const [fecha, setFecha] = useState('19:00')

  const concluir = () => {
    acoes.salvarBarbearia({ nome: nome || 'Minha barbearia', slug: slug || slugificar(nome) || 'minha-barbearia', bairro, modo_operacao: modo })
    servicos.filter((s) => s.nome.trim()).forEach((s) => acoes.salvarServico({ nome: s.nome, preco_centavos: paraCentavos(s.preco), duracao_min: s.duracao }))
    acoes.salvarHorarios(dias.map((d) => ({ dia_semana: d, abre, fecha })))
    nav('/app/agenda')
  }

  return (
    <div className="onb">
      <div className="onb-topo"><img src="/logo-sm.png" alt="Kort" /></div>
      <div className="onb-in">
        <div className="onb-passos" aria-label={`Passo ${passo} de 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= passo ? 'feito' : ''} />)}
        </div>

        {passo === 1 && (
          <>
            <h1>Sua barbearia</h1>
            <p className="sub">É assim que o cliente vai ver na página de agendamento.</p>
            <div className="coluna gap-16">
              <Campo rotulo="Nome da barbearia" id="nome">
                <input id="nome" className="input" value={nome} onChange={(e) => { setNome(e.target.value); setSlug(slugificar(e.target.value)) }} placeholder="Ex.: Barbearia do Zé" />
              </Campo>
              <Campo rotulo="Seu link" id="slug" ajuda="Coloque na bio do Instagram e no status do WhatsApp.">
                <div className="input-prefixo">
                  <span style={{ fontSize: 13 }}>kort.app/b/</span>
                  <input id="slug" className="input" style={{ paddingLeft: 88 }} value={slug} onChange={(e) => setSlug(slugificar(e.target.value))} />
                </div>
              </Campo>
              <Campo rotulo="Bairro e cidade" id="bairro">
                <input id="bairro" className="input" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Itaquera, São Paulo" />
              </Campo>
              <div className="campo">
                <span className="rotulo">Como a casa funciona</span>
                <Segmentos rotulo="Modo de operação" valor={modo} onChange={setModo} opcoes={[['equipe', 'Equipe com comissão'], ['cadeira_alugada', 'Cadeira alugada']]} />
                <span className="ajuda">
                  {modo === 'equipe'
                    ? 'Você vê tudo e o app calcula a comissão de cada barbeiro.'
                    : 'Cada barbeiro tem seus clientes e seu caixa. Você cobra o aluguel da cadeira pelo app.'}
                </span>
              </div>
            </div>
          </>
        )}

        {passo === 2 && (
          <>
            <h1>O que você faz</h1>
            <p className="sub">Comece com os principais. Dá para mudar quando quiser.</p>
            <div className="coluna gap-8">
              {servicos.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 8 }}>
                  <input className="input" aria-label="Serviço" value={s.nome} onChange={(e) => setServicos(servicos.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} />
                  <div className="input-prefixo"><span>R$</span><input className="input" aria-label="Preço" inputMode="decimal" value={s.preco} onChange={(e) => setServicos(servicos.map((x, k) => (k === i ? { ...x, preco: e.target.value } : x)))} /></div>
                  <select className="select" aria-label="Duração" value={s.duracao} onChange={(e) => setServicos(servicos.map((x, k) => (k === i ? { ...x, duracao: Number(e.target.value) } : x)))}>
                    {[10, 15, 20, 30, 40, 45, 50, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              ))}
              <button className="btn btn-sec" style={{ alignSelf: 'flex-start' }} onClick={() => setServicos([...servicos, { nome: '', preco: '', duracao: 30 }])}>Adicionar serviço</button>
            </div>
          </>
        )}

        {passo === 3 && (
          <>
            <h1>Quando abre</h1>
            <p className="sub">O link só mostra horários dentro do expediente.</p>
            <div className="campo">
              <span className="rotulo">Dias</span>
              <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} className="chip" aria-pressed={dias.includes(d)} onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d])}>
                    {nomeDia(d)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grade-campos" style={{ marginTop: 18 }}>
              <Campo rotulo="Abre às" id="abre"><input id="abre" type="time" className="input" value={abre} onChange={(e) => setAbre(e.target.value)} /></Campo>
              <Campo rotulo="Fecha às" id="fecha"><input id="fecha" type="time" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            </div>
          </>
        )}

        <div className="onb-rodape">
          {passo > 1 ? <button className="btn btn-sec" onClick={() => setPasso(passo - 1)}>Voltar</button> : <span />}
          {passo < 3 ? (
            <button className="btn btn-primario" onClick={() => setPasso(passo + 1)} disabled={passo === 1 && !nome.trim()}>Continuar</button>
          ) : (
            <button className="btn btn-primario" onClick={concluir}>Abrir minha agenda</button>
          )}
        </div>
      </div>
    </div>
  )
}
