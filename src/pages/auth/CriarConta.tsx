import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Campo } from '../../components/ui'
import { mascaraTelefone, telefoneE164 } from '../../lib/format'
import { supabase, supabaseConfigurado } from '../../lib/supabase'
import { useSessao } from '../../lib/sessao'
import { LadoAuth, erroAuth } from './Entrar'
import { useRegistrarVisita } from '../../lib/visitas'
import { cupomGuardado, esquecerCupom, normalizarCupom, validarCupom, type CupomValido } from '../../lib/cupom'

// O trigger tg_novo_usuario cria a linha em "perfis" com nome e telefone.

export default function CriarConta() {
  useRegistrarVisita('/criar-conta')
  const nav = useNavigate()
  const sessao = useSessao()
  const [f, setF] = useState({ nome: '', telefone: '', email: '', senha: '' })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  // cupom de divulgador (opcional): undefined = conferindo ou sem banco, null = não existe
  const [cupom, setCupom] = useState(cupomGuardado)
  const [infoCupom, setInfoCupom] = useState<CupomValido | null | undefined>(undefined)

  useEffect(() => {
    setInfoCupom(undefined)
    if (cupom.length < 3) return
    let vivo = true
    const t = setTimeout(async () => {
      const r = await validarCupom(cupom)
      if (vivo) setInfoCupom(r)
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [cupom])

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (f.nome.trim().length < 2) er.nome = 'Escreva seu nome.'
    if (f.telefone.replace(/\D/g, '').length < 10) er.telefone = 'Número com DDD.'
    if (!f.email.includes('@')) er.email = 'Confira o e-mail.'
    if (f.senha.length < 6) er.senha = 'Use pelo menos 6 caracteres.'
    if (cupom && (cupom.length < 3 || infoCupom === null)) er.cupom = 'Esse cupom não existe. Confira ou deixe em branco.'
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
        data: { nome: f.nome.trim(), telefone: telefoneE164(f.telefone), ...(cupom ? { cupom } : {}) },
        emailRedirectTo: `${window.location.origin}/comecar`,
      },
    })
    setEnviando(false)
    if (error) {
      setErros({ senha: erroAuth(error.message) })
      return
    }
    esquecerCupom()
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
          <p className="muted" style={{ marginTop: -6 }}>15 dias com tudo liberado. Depois você escolhe o plano e paga pelo Pix ou cartão.</p>
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
          <Campo rotulo="Tem cupom? Ganhe 5% de desconto" id="cupom" erro={erros.cupom}
            ajuda={infoCupom ? <span className="cupom-ok">Cupom aplicado: {String(infoCupom.desconto_pct).replace('.', ',')}% de desconto em todas as mensalidades.</span> : 'Viu o Kort no perfil de algum barbeiro? Coloque o cupom dele e ganhe 5% de desconto na mensalidade.'}>
            <input id="cupom" className="input" value={cupom} onChange={(e) => setCupom(normalizarCupom(e.target.value))} placeholder="Digite o cupom (opcional)" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          </Campo>
          <button className="btn btn-primario btn-grande btn-bloco" type="submit" disabled={enviando}>{enviando ? 'Criando...' : 'Criar conta'}</button>
          <p className="troca">Já tem conta? <Link to="/entrar">Entrar</Link></p>
        </form>
      </div>
    </div>
  )
}
