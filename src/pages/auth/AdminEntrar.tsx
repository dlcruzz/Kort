import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'
import { erroAuth } from './Entrar'

// Login do painel interno do Kort, num endereço que só o dono conhece
// (ROTA_LOGIN_ADMIN). Não tem cadastro: a conta de admin é criada no
// painel do Supabase e marcada com perfis.super_admin = true por SQL.
// Qualquer outra conta é recusada e desconectada. O endereço escondido é
// só uma camada a mais: quem protege de verdade é o banco (RLS).

export const ROTA_LOGIN_ADMIN = '/k-n11d8sw9b9'

async function ehSuperAdmin(id: string) {
  const { data } = await supabase!.from('perfis').select('super_admin').eq('id', id).maybeSingle()
  return !!data?.super_admin
}

export default function AdminEntrar() {
  const nav = useNavigate()
  const sessao = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!supabase) return nav('/admin')
    if (!email.includes('@') || senha.length < 6) return setErro('Confira o e-mail e a senha (mínimo 6 caracteres).')
    setEnviando(true)
    const r = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (r.error || !r.data.user) {
      setEnviando(false)
      return setErro(erroAuth(r.error?.message ?? 'Não foi possível entrar.'))
    }
    if (!(await ehSuperAdmin(r.data.user.id))) {
      await supabase.auth.signOut()
      setEnviando(false)
      return setErro('E-mail ou senha errados.')
    }
    await sessao.recarregar()
    nav('/admin', { replace: true })
  }

  return (
    <div className="auth auth-admin">
      <aside className="auth-lado">
        <Link to="/" aria-label="Kort, página inicial"><img src="/logo-marca.png" alt="Kort" /></Link>
        <span />
        <span />
      </aside>
      <div className="auth-form">
        <form onSubmit={enviar} noValidate>
          <h1>Painel Kort</h1>
          <Campo rotulo="E-mail" id="adm-email">
            <input id="adm-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha" id="adm-senha" erro={erro}>
            <input id="adm-senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </Campo>
          <button className="btn btn-escuro btn-grande btn-bloco" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
