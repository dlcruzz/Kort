import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'
import { mensagemDeErro } from '../../lib/banco'
import { TelaCarregando } from '../../components/guardas'
import { LadoAuth } from './Entrar'

// Barbeiro convidado pelo dono: /convite?m=<membro>&t=<token>.
// O convite fica guardado no navegador enquanto a pessoa cria a conta ou entra.

const CHAVE = 'kort-convite'

export function conviteGuardado(): { m: string; t: string } | null {
  try {
    const v = localStorage.getItem(CHAVE)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

export default function Convite() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const sessao = useSessao()
  const guardado = conviteGuardado()
  const m = params.get('m') ?? guardado?.m ?? ''
  const t = params.get('t') ?? guardado?.t ?? ''
  const [info, setInfo] = useState<{ barbearia: string; nome: string } | null | undefined>(undefined)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!supabase || !m || !t) {
      setInfo(null)
      return
    }
    try { localStorage.setItem(CHAVE, JSON.stringify({ m, t })) } catch { /* sem storage */ }
    supabase.rpc('ver_convite', { p_membro: m, p_token: t }).then(({ data }) => setInfo(data ?? null))
  }, [m, t])

  const aceitar = async () => {
    if (!supabase) return
    setEnviando(true)
    setErro('')
    const { error } = await supabase.rpc('aceitar_convite', { p_membro: m, p_token: t })
    setEnviando(false)
    if (error) return setErro(mensagemDeErro(error))
    try { localStorage.removeItem(CHAVE) } catch { /* ignore */ }
    await sessao.recarregar()
    nav('/app/agenda', { replace: true })
  }

  if (info === undefined || !sessao.pronto) return <TelaCarregando />

  return (
    <div className="auth">
      <LadoAuth />
      <div className="auth-form">
        <div className="coluna gap-16">
          {!info ? (
            <>
              <h1>Convite inválido</h1>
              <p className="muted">Esse convite já foi usado ou não existe mais. Peça um novo ao dono da barbearia.</p>
              <Link className="btn btn-sec" to="/entrar" onClick={() => { try { localStorage.removeItem(CHAVE) } catch { /* ignore */ } }}>Ir para o login</Link>
            </>
          ) : (
            <>
              <h1>Bem-vindo, {info.nome.split(' ')[0]}</h1>
              <p>Você foi convidado para a equipe da <b>{info.barbearia}</b>. Com o acesso você vê sua agenda e seus ganhos no celular.</p>
              {sessao.usuario ? (
                <>
                  <p className="muted pequeno">Entrando como {sessao.usuario.email}.</p>
                  {erro && <div className="campo"><span className="erro" role="alert">{erro}</span></div>}
                  <button className="btn btn-primario btn-grande" disabled={enviando} onClick={aceitar}>{enviando ? 'Entrando...' : 'Entrar na equipe'}</button>
                </>
              ) : (
                <>
                  <Link className="btn btn-primario btn-grande" to="/criar-conta">Criar meu acesso</Link>
                  <Link className="btn btn-sec" to="/entrar" state={{ voltar: '/convite' }}>Já tenho conta</Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
