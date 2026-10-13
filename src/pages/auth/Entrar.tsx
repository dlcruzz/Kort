import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'

// Supabase: supabase.auth.signInWithPassword({ email, password })
// ou supabase.auth.signInWithOtp({ phone }) para entrar com código no WhatsApp/SMS.

export function LadoAuth() {
  return (
    <aside className="auth-lado">
      <Link to="/" aria-label="Kort, página inicial"><img src="/logo-marca.png" alt="Kort" /></Link>
      <blockquote>
        Menos celular no meio do corte. Mais gente na cadeira.
        <cite>Agenda, lembretes e caixa da sua barbearia num lugar só.</cite>
      </blockquote>
      <span />
    </aside>
  )
}

export default function Entrar() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes('@') || senha.length < 6) {
      setErro('Confira o e-mail e a senha. A senha tem pelo menos 6 caracteres.')
      return
    }
    nav(email.startsWith('admin') ? '/admin' : '/app/agenda')
  }

  return (
    <div className="auth">
      <LadoAuth />
      <div className="auth-form">
        <form onSubmit={enviar} noValidate>
          <h1>Entrar</h1>
          <Campo rotulo="E-mail" id="email">
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha" id="senha" erro={erro}>
            <input id="senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </Campo>
          <button className="btn btn-primario btn-grande btn-bloco" type="submit">Entrar</button>
          <button type="button" className="btn btn-fantasma btn-pequeno" style={{ alignSelf: 'center' }}>Esqueci minha senha</button>
          <p className="troca">Ainda não usa o Kort? <Link to="/criar-conta">Criar conta grátis</Link></p>
          <p className="troca pequeno">Na demonstração, qualquer e-mail e senha entram. Use um e-mail começando com "admin" para abrir o painel Kort.</p>
        </form>
      </div>
    </div>
  )
}
