// Quem está usando o app e em qual modo.
//
// - Modo real: login do Supabase. O usuário é dono/barbeiro de uma barbearia
//   (tabela membros) e/ou super admin do Kort (perfis.super_admin).
// - Modo demonstração: dados de exemplo no navegador. Só quando o banco
//   está desligado (VITE_KORT_DEMO=1), para desenvolver as telas.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigurado } from './supabase'
import type { PapelMembro } from './types'

const CHAVE_MODO = 'kort-modo'

export interface Vinculo {
  barbearia_id: string
  membro_id: string
  papel: PapelMembro
  slug: string
  nome: string
}

interface Sessao {
  modo: 'demo' | 'real'
  /** já sabemos se tem login (no modo demo é sempre true) */
  pronto: boolean
  usuario: { id: string; email: string } | null
  perfil: { nome: string; super_admin: boolean } | null
  vinculo: Vinculo | null
  entrarDemo(): void
  sairDemo(): void
  sair(): Promise<void>
  recarregar(): Promise<void>
}

const Ctx = createContext<Sessao | null>(null)

// Com o banco ligado o app é sempre real: nada de dados de exemplo.
function lerModo(): 'demo' | 'real' {
  if (supabaseConfigurado) {
    try { sessionStorage.removeItem(CHAVE_MODO) } catch { /* ignore */ }
    return 'real'
  }
  return 'demo'
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState(lerModo)
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(modo === 'demo')
  const [perfil, setPerfil] = useState<Sessao['perfil']>(null)
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)

  const carregarUsuario = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setPerfil(null)
      setVinculo(null)
      setPronto(true)
      return
    }
    const [p, m] = await Promise.all([
      supabase.from('perfis').select('nome, super_admin').eq('id', s.user.id).maybeSingle(),
      supabase.from('membros').select('id, papel, barbearia_id, barbearias(slug, nome)').eq('perfil_id', s.user.id).eq('ativo', true)
        .order('criado_em').limit(1),
    ])
    setPerfil(p.data ? { nome: p.data.nome, super_admin: p.data.super_admin } : { nome: '', super_admin: false })
    const v = m.data?.[0] as { id: string; papel: PapelMembro; barbearia_id: string; barbearias: { slug: string; nome: string } | null } | undefined
    setVinculo(v ? { barbearia_id: v.barbearia_id, membro_id: v.id, papel: v.papel, slug: v.barbearias?.slug ?? '', nome: v.barbearias?.nome ?? '' } : null)
    setPronto(true)
    // último acesso (base do alerta "sem uso há 7 dias" do painel)
    supabase.from('perfis').update({ ultimo_acesso_em: new Date().toISOString() }).eq('id', s.user.id).then(() => undefined, () => undefined)
  }, [])

  useEffect(() => {
    if (modo === 'demo' || !supabase) return
    let vivo = true
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSession(data.session)
      void carregarUsuario(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'INITIAL_SESSION') return
      setSession(s)
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        setPronto(false)
        // fora do callback: o supabase-js pede para não chamar o banco aqui dentro
        setTimeout(() => void carregarUsuario(s), 0)
      }
    })
    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [modo, carregarUsuario])

  const valor = useMemo<Sessao>(
    () => ({
      modo,
      pronto,
      usuario: session ? { id: session.user.id, email: session.user.email ?? '' } : null,
      perfil,
      vinculo,
      entrarDemo() {
        if (supabaseConfigurado) return
        setModo('demo')
        setPronto(true)
      },
      sairDemo() {
        try { sessionStorage.removeItem(CHAVE_MODO) } catch { /* ignore */ }
        setModo(lerModo())
        setPronto(false)
      },
      async sair() {
        if (supabase) await supabase.auth.signOut()
        setSession(null)
        setPerfil(null)
        setVinculo(null)
      },
      async recarregar() {
        if (!supabase) return
        const { data } = await supabase.auth.getSession()
        setSession(data.session)
        await carregarUsuario(data.session)
      },
    }),
    [modo, pronto, session, perfil, vinculo, carregarUsuario],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSessao() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSessao precisa estar dentro de <SessaoProvider>')
  return c
}
