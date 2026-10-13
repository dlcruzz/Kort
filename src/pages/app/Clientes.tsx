import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { useKort, useMapas } from '../../lib/store'
import { dataCurta, deIsoDia, diasEntre, dinheiroCurto, hoje, isoDia, mascaraTelefone, somaDias, telefone, telefoneE164, tempoAtras } from '../../lib/format'
import { Avatar, CabecalhoPagina, Campo, Folha, Vazio } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

type Filtro = 'todos' | 'sumidos' | 'semana' | 'novos' | 'clube'

export default function Clientes() {
  const { estado, acoes } = useKort()
  const { membro } = useMapas()
  const nav = useNavigate()
  const avisar = useAvisar()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ordem, setOrdem] = useState<'recente' | 'nome' | 'gasto'>('recente')
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ nome: '', tel: '', obs: '' })

  const h = isoDia(hoje())
  const semana = isoDia(somaDias(hoje(), 7))
  const assinantes = new Set(estado.assinaturasClube.filter((a) => a.status === 'ativa').map((a) => a.cliente_id))

  const contagem = {
    todos: estado.clientes.length,
    sumidos: estado.clientes.filter((c) => c.proximo_retorno_previsto && c.proximo_retorno_previsto < h).length,
    semana: estado.clientes.filter((c) => c.proximo_retorno_previsto && c.proximo_retorno_previsto >= h && c.proximo_retorno_previsto <= semana).length,
    novos: estado.clientes.filter((c) => c.total_visitas <= 1).length,
    clube: assinantes.size,
  }

  const lista = useMemo(() => {
    let l = estado.clientes
    const q = busca.trim().toLowerCase()
    if (q) l = l.filter((c) => c.nome.toLowerCase().includes(q) || c.telefone.includes(q.replace(/\D/g, '') || '###'))
    if (filtro === 'sumidos') l = l.filter((c) => c.proximo_retorno_previsto && c.proximo_retorno_previsto < h)
    if (filtro === 'semana') l = l.filter((c) => c.proximo_retorno_previsto && c.proximo_retorno_previsto >= h && c.proximo_retorno_previsto <= semana)
    if (filtro === 'novos') l = l.filter((c) => c.total_visitas <= 1)
    if (filtro === 'clube') l = l.filter((c) => assinantes.has(c.id))
    return [...l].sort((a, b) =>
      ordem === 'nome' ? a.nome.localeCompare(b.nome) : ordem === 'gasto' ? b.total_gasto_centavos - a.total_gasto_centavos : (b.ultima_visita_em ?? '').localeCompare(a.ultima_visita_em ?? ''),
    )
  }, [estado.clientes, busca, filtro, ordem, h, semana, assinantes])

  const salvar = () => {
    const id = acoes.salvarCliente({ nome: form.nome.trim(), telefone: telefoneE164(form.tel), observacoes: form.obs || null })
    avisar('Cliente cadastrado')
    setNovo(false)
    setForm({ nome: '', tel: '', obs: '' })
    nav(`/app/clientes/${id}`)
  }

  const FILTROS: Array<[Filtro, string]> = [
    ['todos', 'Todos'],
    ['sumidos', 'Passaram do prazo'],
    ['semana', 'Voltam esta semana'],
    ['novos', 'Novos'],
    ['clube', 'Assinantes'],
  ]

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        sub="O Kort aprende de quanto em quanto tempo cada cliente volta e avisa quando alguém passou do prazo."
        acoes={<button className="btn btn-primario" onClick={() => setNovo(true)}><UserPlus /> Novo cliente</button>}
      />

      <div className="abas" role="tablist">
        {FILTROS.map(([f, nome]) => (
          <button key={f} role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}>
            {nome} <span className="muted" style={{ fontWeight: 500 }}>{contagem[f]}</span>
          </button>
        ))}
      </div>

      <div className="linha-flex" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="input-prefixo cresce" style={{ maxWidth: 380 }}>
          <span><Search size={16} /></span>
          <input className="input" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="select" style={{ width: 190 }} value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar">
          <option value="recente">Visita mais recente</option>
          <option value="nome">Nome</option>
          <option value="gasto">Quem mais gastou</option>
        </select>
      </div>

      <div className="painel">
        {lista.length ? (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Última visita</th>
                  <th className="dir">Visitas</th>
                  <th className="dir">Gasto total</th>
                  <th>Volta a cada</th>
                  <th>Retorno</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const atraso = c.proximo_retorno_previsto ? diasEntre(deIsoDia(c.proximo_retorno_previsto), hoje()) : null
                  return (
                    <tr key={c.id} className="clicavel" onClick={() => nav(`/app/clientes/${c.id}`)}>
                      <td>
                        <div className="linha-flex">
                          <Avatar nome={c.nome} tam={32} cor={c.membro_preferido_id ? membro.get(c.membro_preferido_id)?.cor_agenda : undefined} />
                          <div>
                            <div className="forte">{c.nome}{assinantes.has(c.id) && <span className="tag tag-kort" style={{ marginLeft: 8 }}>Clube</span>}</div>
                            <div className="muted pequeno">{telefone(c.telefone)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="muted">{tempoAtras(c.ultima_visita_em)}</td>
                      <td className="dir num">{c.total_visitas}</td>
                      <td className="dir num forte">{dinheiroCurto(c.total_gasto_centavos)}</td>
                      <td className="muted">{c.frequencia_media_dias ? `${Math.round(c.frequencia_media_dias)} dias` : '-'}</td>
                      <td>
                        {atraso === null ? (
                          <span className="muted">-</span>
                        ) : atraso > 0 ? (
                          <span className="tag tag-perigo">{atraso} {atraso === 1 ? 'dia' : 'dias'} atrasado</span>
                        ) : atraso >= -7 ? (
                          <span className="tag tag-alerta">por volta de {dataCurta(c.proximo_retorno_previsto!)}</span>
                        ) : (
                          <span className="muted pequeno">{dataCurta(c.proximo_retorno_previsto!)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo="Ninguém por aqui" texto={busca ? 'Nenhum cliente com esse nome ou telefone.' : 'Os clientes entram sozinhos quando marcam pelo link. Você também pode cadastrar na mão.'} />
        )}
      </div>

      <Folha aberta={novo} aoFechar={() => setNovo(false)} titulo="Novo cliente"
        rodape={<><button className="btn btn-sec" onClick={() => setNovo(false)}>Cancelar</button><button className="btn btn-primario" disabled={form.nome.trim().length < 2 || form.tel.replace(/\D/g, '').length < 10} onClick={salvar}>Cadastrar</button></>}>
        <div className="coluna gap-16">
          <Campo rotulo="Nome" id="cl-nome"><input id="cl-nome" className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo rotulo="WhatsApp" id="cl-tel"><input id="cl-tel" className="input" inputMode="tel" value={form.tel} onChange={(e) => setForm({ ...form, tel: mascaraTelefone(e.target.value) })} placeholder="(11) 90000-0000" /></Campo>
          <Campo rotulo="Observações" id="cl-obs" ajuda="Só a equipe vê. Ex.: como gosta do corte, alergias.">
            <textarea id="cl-obs" className="textarea" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
          </Campo>
        </div>
      </Folha>
    </>
  )
}
