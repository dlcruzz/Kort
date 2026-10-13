import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays, Receipt, Users, BarChart3, MessageCircle, Megaphone, Award, Scissors, UserCog, Package, Wallet,
  Settings, ExternalLink, MoreHorizontal, LogOut, Shield, LifeBuoy,
} from 'lucide-react'
import { useNaoLidas } from '../lib/suporte'
import { avisarGlobal } from '../components/avisos'
import { useKort } from '../lib/store'
import { useSessao } from '../lib/sessao'
import { deIsoDia, hoje } from '../lib/format'
import { RailIndicador } from '../components/RailIndicador'
import { Avatar, Folha } from '../components/ui'
import { LinkAgendamento } from '../components/LinkAgendamento'
import { AvisoNovos } from '../components/AvisoNovos'

type ItemMenu = { to: string; nome: string; icone: typeof CalendarDays; contador?: 'comandas' | 'espera' | 'estoque' }

const GRUPOS: Array<{ titulo: string | null; itens: ItemMenu[] }> = [
  {
    titulo: null,
    itens: [
      { to: '/app/agenda', nome: 'Agenda', icone: CalendarDays },
      { to: '/app/caixa', nome: 'Caixa', icone: Receipt, contador: 'comandas' },
      { to: '/app/clientes', nome: 'Clientes', icone: Users },
    ],
  },
  {
    titulo: 'Fazer crescer',
    itens: [
      { to: '/app/relatorios', nome: 'Relatórios', icone: BarChart3 },
      { to: '/app/mensagens', nome: 'Mensagens', icone: MessageCircle, contador: 'espera' },
      { to: '/app/divulgacao', nome: 'Divulgação', icone: Megaphone },
      { to: '/app/fidelidade', nome: 'Fidelidade e clube', icone: Award },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { to: '/app/servicos', nome: 'Serviços', icone: Scissors },
      { to: '/app/equipe', nome: 'Equipe', icone: UserCog },
      { to: '/app/estoque', nome: 'Estoque', icone: Package, contador: 'estoque' },
      { to: '/app/financeiro', nome: 'Financeiro', icone: Wallet },
    ],
  },
]

export default function AppLayout() {
  const { estado, acoes, modo, salvando } = useKort()
  const sessao = useSessao()
  const nav = useNavigate()
  const [mais, setMais] = useState(false)
  const local = useLocation()
  const eu = estado.membros.find((m) => m.id === estado.usuarioMembroId)
  const a = estado.assinatura
  const diasTeste = a.status === 'teste' && a.teste_ate ? Math.round((deIsoDia(a.teste_ate).getTime() - hoje().getTime()) / 86400000) : null
  const PAPEL = { dono: 'Dono', barbeiro: 'Barbeiro', recepcao: 'Recepção' }
  const respostas = useNaoLidas('barbearia', () => avisarGlobal('O suporte do Kort respondeu. Veja em Ajuda.'))

  const sair = async () => {
    if (modo === 'demo') {
      sessao.sairDemo()
      nav('/')
      return
    }
    await sessao.sair()
    nav('/entrar')
  }

  const contadores = {
    comandas: estado.comandas.filter((c) => c.status === 'aberta').length,
    espera: estado.listaEspera.filter((l) => l.status === 'aguardando').length,
    estoque: estado.produtos.filter((p) => p.ativo && p.estoque_atual <= p.estoque_minimo).length,
  }

  const telaCheia = local.pathname.startsWith('/app/agenda')

  return (
    <div className="app">
      <aside className="rail" aria-label="Menu principal">
        <RailIndicador />
        <NavLink to="/app/agenda" className="rail-logo" aria-label="Kort, ir para a agenda">
          <img src="/logo-marca.png" alt="" width={1110} height={710} />
        </NavLink>
        <a className="rail-casa" href={`/b/${estado.barbearia.slug}`} target="_blank" rel="noreferrer">
          <div className="cresce">
            <div className="nome trunca">{estado.barbearia.nome}</div>
            <div className="rail-sub">Ver minha página</div>
          </div>
          <ExternalLink size={16} color="#84847D" />
        </a>

        {GRUPOS.map((g, i) => (
          <div className="rail-grupo" key={i}>
            {g.titulo && <div className="rail-grupo-tit">{g.titulo}</div>}
            <nav className="rail-nav">
              {g.itens.map((it) => {
                const Icone = it.icone
                const n = it.contador ? contadores[it.contador] : 0
                return (
                  <NavLink key={it.to} to={it.to} className="rail-item">
                    <Icone />
                    {it.nome}
                    {n > 0 && <span className="cont">{n}</span>}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        ))}

        <div className="rail-rodape">
          <NavLink to="/app/ajuda" className="rail-item">
            <LifeBuoy />
            Ajuda
            {respostas > 0 && <span className="cont">{respostas}</span>}
          </NavLink>
          <NavLink to="/app/configuracoes" className="rail-item">
            <Settings />
            Configurações
          </NavLink>
          <div className="rail-usuario">
            {eu && <Avatar nome={eu.nome_exibicao} cor={eu.cor_agenda} tam={30} />}
            <div className="cresce">
              <div style={{ fontWeight: 600 }}>{eu?.nome_exibicao}</div>
              <div style={{ fontSize: 12, color: '#84847D' }}>{salvando ? 'Salvando...' : PAPEL[estado.usuarioPapel]}</div>
            </div>
            {sessao.perfil?.super_admin && (
              <NavLink to="/admin" className="btn btn-fantasma btn-icone" aria-label="Painel Kort" title="Painel Kort" style={{ color: '#A3A39C' }}>
                <Shield size={17} />
              </NavLink>
            )}
            <button onClick={sair} className="btn btn-fantasma btn-icone" aria-label="Sair" title="Sair" style={{ color: '#A3A39C' }}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className={`principal ${telaCheia ? 'cheia' : ''}`}>
        <header className="topo-mobile">
          <img src="/logo-sm.png" alt="Kort" />
          <a className="btn btn-pequeno" style={{ color: '#E7F738' }} href={`/b/${estado.barbearia.slug}`} target="_blank" rel="noreferrer">
            Minha página <ExternalLink size={14} />
          </a>
        </header>

        {modo === 'demo' ? (
          <div className="faixa-demo">
            Modo demonstração<span className="longo">: os dados ficam só neste navegador</span>.
            <button onClick={() => acoes.resetarDemo()}>Recomeçar dados</button>
            <button onClick={sair}>Sair</button>
          </div>
        ) : a.status === 'inadimplente' || a.status === 'suspensa' ? (
          <div className="faixa-demo faixa-perigo">
            {a.status === 'suspensa' ? 'Sua página de agendamento está fora do ar.' : 'A mensalidade do Kort está atrasada.'}
            <Link to="/app/configuracoes?aba=plano">Pagar agora</Link>
          </div>
        ) : diasTeste !== null && diasTeste <= 5 ? (
          <div className="faixa-demo">
            {diasTeste <= 0 ? 'Seu teste grátis acaba hoje.' : `Faltam ${diasTeste} ${diasTeste === 1 ? 'dia' : 'dias'} de teste grátis.`}
            <Link to="/app/configuracoes?aba=plano">Escolher plano</Link>
          </div>
        ) : null}

        <LinkAgendamento />
        <AvisoNovos />

        <main className={telaCheia ? 'main-cheia' : 'pagina'}>
          <div key={local.pathname} className={telaCheia ? 'main-cheia' : 'entrada-pagina'}>
            <Outlet />
          </div>
        </main>

        <nav className="abas-mobile" aria-label="Menu">
          <NavLink to="/app/agenda"><CalendarDays />Agenda</NavLink>
          <NavLink to="/app/clientes"><Users />Clientes</NavLink>
          <NavLink to="/app/caixa"><Receipt />Caixa</NavLink>
          <NavLink to="/app/relatorios"><BarChart3 />Relatórios</NavLink>
          <button onClick={() => setMais(true)} className={mais ? 'active' : ''}>
            <MoreHorizontal />
            Mais
          </button>
        </nav>
      </div>

      <Folha aberta={mais} aoFechar={() => setMais(false)} titulo="Mais opções">
        <div className="menu-mais" onClick={() => setMais(false)}>
          {[...GRUPOS.flatMap((g) => g.itens), { to: '/app/ajuda', nome: respostas ? `Ajuda (${respostas} nova${respostas > 1 ? 's' : ''})` : 'Ajuda', icone: LifeBuoy } as ItemMenu, { to: '/app/configuracoes', nome: 'Configurações', icone: Settings } as ItemMenu].map((it) => {
            const Icone = it.icone
            return (
              <NavLink key={it.to} to={it.to}>
                <Icone />
                {it.nome}
              </NavLink>
            )
          })}
        </div>
      </Folha>
    </div>
  )
}
