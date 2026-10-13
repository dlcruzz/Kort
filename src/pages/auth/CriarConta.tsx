import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'
import { mascaraTelefone, telefoneE164 } from '../../lib/format'
import { supabase, supabaseConfigurado } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'
import { LadoAuth, erroAuth } from './Entrar'

// O trigger tg_novo_usuario cria a linha em "perfis" com nome e telefone.

export default function CriarConta() {
  const nav = useNavigate()
  const sessao = useSessao()
  const [f, setF] = useState({ nome: '', telefone: '', email: '', senha: '' })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (f.nome.trim().length < 2) er.nome = 'Escreva seu nome.'
    if (f.telefone.replace(/\D/g, '').length < 10) er.telefone = 'Número com DDD.'
    if (!f.email.includes('@')) er.email = 'Confira o e-mail.'
    if (f.senha.length < 6) er.senha = 'Use pelo menos 6 caracteres.'
    setErros(er)
    if (Object.keys(er).length) return
    if (!supabaseConfigurado || !supabase) {
      nav('/comecar')
      return
    }
    setEnviando(true)
    if (sessao.modo === 'demo') sessao.sairDemo()
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.senha,
      options: {
        data: { nome: f.nome.trim(), telefone: telefoneE164(f.telefone) },
        emailRedirectTo: `${window.location.origin}/comecar`,
      },
    })
    setEnviando(false)
    if (error) {
      setErros({ senha: erroAuth(error.message) })
      return
    }
    if (!data.session) {
      // projeto com "confirmar e-mail" ligado
      setConfirmar(true)
      return
    }
    await sessao.recarregar()
    nav('/comecar')
  }

  if (confirmar) {
    return (
      <div className="auth">
        <LadoAuth />
        <div className="auth-form">
          <div className="coluna gap-16">
            <h1>Confirme seu e-mail</h1>
            <p>Mandamos um link para <b>{f.email}</b>. Abra e você já cai na configuração da sua barbearia.</p>
            <p className="muted pequeno">Não chegou? Olhe a caixa de spam ou promoções.</p>
            <Link className="btn btn-sec" to="/entrar">Já confirmei, entrar</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <LadoAuth />
      <div className="auth-form">
        <form onSubmit={enviar} noValidate>
          <h1>Criar conta</h1>
          <p className="muted" style={{ marginTop: -6 }}>14 dias com tudo liberado. Depois você escolhe o plano.</p>
          <Campo rotulo="Seu nome" id="nome" erro={erros.nome}>
            <input id="nome" className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoComplete="name" />
          </Campo>
          <Campo rotulo="WhatsApp" id="tel" erro={erros.telefone}>
            <input id="tel" className="input" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: mascaraTelefone(e.target.value) })} placeholder="(11) 90000-0000" />
          </Campo>
          <Campo rotulo="E-mail" id="email" erro={erros.email}>
            <input id="email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha" id="senha" erro={erros.senha}>
            <input id="senha" className="input" type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} autoComplete="new-password" />
          </Campo>
          <button className="btn btn-primario btn-grande btn-bloco" type="submit" disabled={enviando}>{enviando ? 'Criando...' : 'Criar conta'}</button>
          <p className="troca">Já tem conta? <Link to="/entrar">Entrar</Link></p>
        </form>
      </div>
    </div>
  )
}
