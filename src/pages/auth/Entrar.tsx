import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'
import { supabase, supabaseConfigurado } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'

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

/** Mensagens do Supabase Auth em português */
export function erroAuth(msg: string) {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'E-mail ou senha errados.'
  if (m.includes('email not confirmed')) return 'Falta confirmar o e-mail. Abra o link que mandamos para você.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Entre com ele.'
  if (m.includes('password should be')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere um minuto e tente de novo.'
  if (m.includes('failed to fetch')) return 'Sem internet. Confira a conexão.'
  return msg
}

export default function Entrar() {
  const nav = useNavigate()
  const local = useLocation()
  const sessao = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const voltar = (local.state as { voltar?: string } | null)?.voltar

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setInfo('')
    if (!email.includes('@') || senha.length < 6) {
      setErro('Confira o e-mail e a senha. A senha tem pelo menos 6 caracteres.')
      return
    }
    if (!supabaseConfigurado || !supabase) {
      nav(email.startsWith('admin') ? '/admin' : '/app/agenda')
      return
    }
    setEnviando(true)
    if (sessao.modo === 'demo') sessao.sairDemo()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) {
      setEnviando(false)
      setErro(erroAuth(error.message))
      return
    }
    await sessao.recarregar()
    nav(voltar ?? '/app/agenda', { replace: true })
  }

  const esqueci = async () => {
    setErro('')
    if (!supabase) return
    if (!email.includes('@')) {
      setErro('Escreva seu e-mail acima e clique de novo em "Esqueci minha senha".')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` })
    if (error) setErro(erroAuth(error.message))
    else setInfo('Mandamos um link para criar uma senha nova. Veja seu e-mail (e a caixa de spam).')
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
          {info && <p className="pequeno" role="status">{info}</p>}
          <button className="btn btn-primario btn-grande btn-bloco" type="submit" disabled={enviando}>{enviando ? 'Entrando...' : 'Entrar'}</button>
          {supabaseConfigurado && (
            <button type="button" className="btn btn-fantasma btn-pequeno" style={{ alignSelf: 'center' }} onClick={esqueci}>Esqueci minha senha</button>
          )}
          <p className="troca">Ainda não usa o Kort? <Link to="/criar-conta">Criar conta grátis</Link></p>
          {supabaseConfigurado ? (
            <p className="troca pequeno">Só quer olhar? <Link to="/demo">Abrir a demonstração</Link></p>
          ) : (
            <p className="troca pequeno">Na demonstração, qualquer e-mail e senha entram. Use um e-mail começando com "admin" para abrir o painel Kort.</p>
          )}
        </form>
      </div>
    </div>
  )
}
