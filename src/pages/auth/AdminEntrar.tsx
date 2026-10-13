import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'
import { erroAuth } from './Entrar'

// Login do painel interno do Kort (/admin/entrar). Separado do login dos
// barbeiros: só entra quem é super admin (perfis.super_admin). Qualquer
// outra conta é recusada e desconectada.

async function ehSuperAdmin(id: string) {
  const { data } = await supabase!.from('perfis').select('super_admin').eq('id', id).maybeSingle()
  return !!data?.super_admin
}

export default function AdminEntrar() {
  const nav = useNavigate()
  const sessao = useSessao()
  const [modo, setModo] = useState<'entrar' | 'primeiro'>('entrar')
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
    const r = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      : await supabase.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome: 'Kort' } } })
    if (r.error || !r.data.user) {
      setEnviando(false)
      return setErro(erroAuth(r.error?.message ?? 'Não foi possível entrar.'))
    }
    if (!(await ehSuperAdmin(r.data.user.id))) {
      await supabase.auth.signOut()
      setEnviando(false)
      return setErro('Esse acesso é só da equipe Kort. Barbeiro entra pela tela normal de login.')
    }
    await sessao.recarregar()
    nav('/admin', { replace: true })
  }

  return (
    <div className="auth auth-admin">
      <aside className="auth-lado">
        <Link to="/" aria-label="Kort, página inicial"><img src="/logo-marca.png" alt="Kort" /></Link>
        <blockquote>
          Painel interno
          <cite>Barbearias, uso das funções, mensalidades e sugestões.</cite>
        </blockquote>
        <span />
      </aside>
      <div className="auth-form">
        <form onSubmit={enviar} noValidate>
          <h1>{modo === 'entrar' ? 'Painel Kort' : 'Primeiro acesso'}</h1>
          <p className="muted" style={{ marginTop: -6 }}>
            {modo === 'entrar' ? 'Acesso do super administrador.' : 'Crie a senha do painel com o e-mail de administrador do Kort.'}
          </p>
          <Campo rotulo="E-mail" id="adm-email">
            <input id="adm-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha" id="adm-senha" erro={erro}>
            <input id="adm-senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
          </Campo>
          <button className="btn btn-escuro btn-grande btn-bloco" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : modo === 'entrar' ? 'Entrar no painel' : 'Criar senha e entrar'}
          </button>
          <button type="button" className="btn btn-fantasma btn-pequeno" style={{ alignSelf: 'center' }} onClick={() => { setModo(modo === 'entrar' ? 'primeiro' : 'entrar'); setErro('') }}>
            {modo === 'entrar' ? 'Primeiro acesso? Criar senha' : 'Já tenho senha'}
          </button>
          <p className="troca pequeno">É barbeiro? <Link to="/entrar">Entre por aqui</Link></p>
        </form>
      </div>
    </div>
  )
}
