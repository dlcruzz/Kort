import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'
import { LadoAuth, erroAuth } from './Entrar'

// Destino do link "esqueci minha senha". O Supabase já abre a sessão pelo
// link; aqui a pessoa só escolhe a senha nova.

export default function NovaSenha() {
  const nav = useNavigate()
  const sessao = useSessao()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (senha.length < 6) return setErro('Use pelo menos 6 caracteres.')
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return setErro(erroAuth(error.message))
    await sessao.recarregar()
    nav('/app/agenda', { replace: true })
  }

  return (
    <div className="auth">
      <LadoAuth />
      <div className="auth-form">
        <form onSubmit={enviar} noValidate>
          <h1>Senha nova</h1>
          {!sessao.usuario && sessao.pronto ? (
            <p className="muted">O link expirou. Volte em Entrar e peça outro em "Esqueci minha senha".</p>
          ) : (
            <>
              <Campo rotulo="Nova senha" id="senha" erro={erro}>
                <input id="senha" className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
              </Campo>
              <button className="btn btn-primario btn-grande btn-bloco" type="submit">Salvar senha</button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
