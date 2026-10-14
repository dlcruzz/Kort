import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { useAdmin } from '../../lib/adminStore'
import { dataCurta, dinheiroCurto, tempoAtras } from '../../lib/format'
import type { StatusAssinSaas } from '../../lib/types'
import { CabecalhoPagina, Vazio } from '../../components/ui'
import { emRisco, NOME_STATUS, StatusAssinatura } from './comum'

export default function AdminBarbearias() {
  const { barbearias } = useAdmin()
  const nav = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<StatusAssinSaas | 'todas' | 'parceiras'>('todas')
  const [plano, setPlano] = useState('todos')

  const lista = useMemo(() => barbearias.filter((b) =>
    (status === 'todas' || (status === 'parceiras' ? !!b.parceiro : b.status_assinatura === status && !b.parceiro)) &&
    (plano === 'todos' || b.plano === plano) &&
    (!busca || `${b.nome} ${b.responsavel} ${b.cidade}`.toLowerCase().includes(busca.toLowerCase())),
  ), [barbearias, busca, status, plano])

  const exportar = () => {
    const cab = 'nome;responsavel;telefone;cidade;plano;status;barbeiros;clientes;agendamentos_30d;ultimo_uso;criado_em'
    const linhas = lista.map((b) => [b.nome, b.responsavel, b.telefone, `${b.cidade}/${b.uf}`, b.plano, b.parceiro ? 'parceira' : b.status_assinatura, b.barbeiros, b.clientes, b.agendamentos_30d, b.ultimo_uso ?? '', b.criado_em.slice(0, 10)].join(';'))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([[cab, ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' }))
    a.download = 'kort-barbearias.csv'
    a.click()
  }

  return (
    <>
      <CabecalhoPagina titulo="Barbearias" sub={`${barbearias.length} cadastradas no Kort.`} acoes={<button className="btn btn-sec" onClick={exportar}><Download /> Exportar CSV</button>} />
      <div className="linha-flex" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="input-prefixo cresce" style={{ maxWidth: 360 }}>
          <span><Search size={16} /></span>
          <input className="input" placeholder="Nome, responsável ou cidade" aria-label="Buscar barbearia" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="select" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value as StatusAssinSaas | 'todas' | 'parceiras')} aria-label="Status">
          <option value="todas">Todos os status</option>
          {Object.entries(NOME_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="parceiras">Parceiras</option>
        </select>
        <select className="select" style={{ width: 150 }} value={plano} onChange={(e) => setPlano(e.target.value)} aria-label="Plano">
          <option value="todos">Todos os planos</option>
          {['Grátis', 'Solo', 'Barbearia', 'Pro'].map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="painel">
        {lista.length ? (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Barbearia</th><th>Plano</th><th>Status</th><th className="dir">Barbeiros</th><th className="dir">Clientes</th><th className="dir">Agend. 30d</th><th>Último uso</th><th>Desde</th></tr></thead>
              <tbody>
                {lista.map((b) => {
                  const risco = emRisco(b)
                  return (
                    <tr key={b.id} className="clicavel" onClick={() => nav(`/admin/barbearias/${b.id}`)}>
                      <td>
                        <div className="forte">{b.nome}</div>
                        <div className="muted pequeno">{b.responsavel}, {b.cidade}/{b.uf}</div>
                      </td>
                      <td>{b.plano} <span className="muted pequeno">{b.parceiro ? 'sem cobrança' : b.preco_centavos ? dinheiroCurto(b.preco_centavos) : ''}</span></td>
                      <td><StatusAssinatura status={b.status_assinatura} parceiro={b.parceiro} />{b.status_assinatura === 'teste' && b.teste_ate && <div className="muted pequeno">até {dataCurta(b.teste_ate)}</div>}</td>
                      <td className="dir num">{b.barbeiros}</td>
                      <td className="dir num">{b.clientes}</td>
                      <td className="dir num">{b.agendamentos_30d}</td>
                      <td><span style={risco ? { color: 'var(--perigo)', fontWeight: 600 } : undefined}>{tempoAtras(b.ultimo_uso)}</span></td>
                      <td className="muted num">{dataCurta(b.criado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Vazio titulo="Nenhuma barbearia com esses filtros" />}
      </div>
    </>
  )
}
