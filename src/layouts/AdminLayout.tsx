import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Gauge, Store, Activity, FileText, Lightbulb, LogOut } from 'lucide-react'
import { RailIndicador } from '../components/RailIndicador'
import { Avatar } from '../components/ui'
import { useSessao } from '../lib/sessao'
import { useCarregarAdmin } from '../lib/adminStore'

const ITENS = [
  { to: '/admin', nome: 'Visão geral', icone: Gauge, end: true },
  { to: '/admin/barbearias', nome: 'Barbearias', icone: Store },
  { to: '/admin/uso', nome: 'Uso das funções', icone: Activity },
  { to: '/admin/faturas', nome: 'Mensalidades', icone: FileText },
  { to: '/admin/sugestoes', nome: 'Sugestões', icone: Lightbulb },
]

export default function AdminLayout() {
  const { pathname } = useLocation()
  const sessao = useSessao()
  const nav = useNavigate()
  useCarregarAdmin()
  const nome = sessao.modo === 'demo' ? 'Danilo Cruz' : sessao.perfil?.nome || sessao.usuario?.email || 'Admin'
  const sair = async () => {
    if (sessao.modo === 'demo') sessao.sairDemo()
    else await sessao.sair()
    nav('/entrar')
  }
  return (
    <div className="app admin">
      <aside className="rail" aria-label="Menu do painel Kort">
        <RailIndicador />
        <div className="rail-casa" style={{ marginTop: 4 }}>
          <img src="/logo-sm.png" alt="Kort" style={{ height: 30, width: 'auto' }} />
          <div className="cresce" style={{ textAlign: 'right' }}>
            <div className="nome">Painel</div>
          </div>
        </div>
        <nav className="rail-nav">
          {ITENS.map((it) => {
            const Icone = it.icone
            return (
              <NavLink key={it.to} to={it.to} end={it.end} className="rail-item">
                <Icone />
                {it.nome}
              </NavLink>
            )
          })}
        </nav>
        <div className="rail-rodape">
          <NavLink to="/app/agenda" className="rail-item">
            <Store />
            Abrir app de barbearia
          </NavLink>
          <div className="rail-usuario">
            <Avatar nome={nome} tam={30} />
            <div className="cresce">
              <div style={{ fontWeight: 600 }}>{nome.split(' ')[0]}</div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>{sessao.modo === 'demo' ? 'Demonstração' : 'Super admin'}</div>
            </div>
            <button onClick={sair} className="btn btn-fantasma btn-icone" aria-label="Sair">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="principal">
        <header className="topo-mobile">
          <strong style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 900 }}>KORT painel</strong>
        </header>
        <main className="pagina">
          <div key={pathname} className="entrada-pagina">
            <Outlet />
          </div>
        </main>
        <nav className="abas-mobile" aria-label="Menu do painel">
          {ITENS.map((it) => {
            const Icone = it.icone
            return (
              <NavLink key={it.to} to={it.to} end={it.end}>
                <Icone />
                {it.nome.split(' ')[0]}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
