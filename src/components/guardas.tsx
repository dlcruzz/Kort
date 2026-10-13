// Portões das rotas: quem pode entrar em /app e /admin.

import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useSessao } from '../lib/sessao'
import { useSituacao } from '../lib/store'

export function TelaCarregando({ texto = 'Carregando' }: { texto?: string }) {
  return (
    <div className="tela-carregando" role="status">
      <img src="/logo-sm.png" alt="" />
      <span>{texto}</span>
    </div>
  )
}

function TelaErro({ msg, tentar }: { msg: string; tentar: () => void }) {
  return (
    <div className="tela-carregando" role="alert">
      <img src="/logo-sm.png" alt="" />
      <strong>Não deu para abrir sua agenda</strong>
      <span>{msg}</span>
      <button className="btn btn-primario" onClick={tentar}>Tentar de novo</button>
    </div>
  )
}

/** /app: precisa de login e de uma barbearia; espera os dados carregarem. */
export function ExigeBarbearia({ children }: { children: ReactNode }) {
  const sessao = useSessao()
  const { situacao, temEstado, recarregar } = useSituacao()
  const local = useLocation()

  if (sessao.modo === 'demo') return temEstado ? <>{children}</> : <TelaCarregando />
  if (!sessao.pronto) return <TelaCarregando />
  if (!sessao.usuario) return <Navigate to="/entrar" replace state={{ voltar: local.pathname }} />
  if (!sessao.vinculo) return <Navigate to={sessao.perfil?.super_admin ? '/admin' : '/comecar'} replace />
  if (situacao.tipo === 'erro' && !temEstado) return <TelaErro msg={situacao.msg} tentar={() => void recarregar()} />
  if (!temEstado) return <TelaCarregando texto="Abrindo sua agenda" />
  return <>{children}</>
}

/** /admin: só o super admin (na demonstração, abre com os dados de exemplo). */
export function ExigeAdmin({ children }: { children: ReactNode }) {
  const sessao = useSessao()
  if (sessao.modo === 'demo') return <>{children}</>
  if (!sessao.pronto) return <TelaCarregando />
  if (!sessao.usuario) return <Navigate to="/entrar" replace />
  if (!sessao.perfil?.super_admin) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** /demo: só existe com o banco desligado; em produção volta para o site. */
export function EntrarDemo() {
  const sessao = useSessao()
  const nav = useNavigate()
  useEffect(() => {
    if (sessao.modo === 'demo') nav('/app/agenda', { replace: true })
    else nav('/', { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <TelaCarregando />
}
