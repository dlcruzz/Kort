// Cupom de divulgador: o barbeiro que chega pelo link de um divulgador
// (kort.app.br/?cupom=CODIGO ou /criar-conta?cupom=CODIGO) já vê o cupom
// preenchido no cadastro. O banco liga a barbearia ao cupom quando ela é
// criada (lê o "cupom" do cadastro da conta) e dá o desconto na mensalidade.

import { supabase } from './supabase'

const CHAVE = 'kort_cupom'

export const normalizarCupom = (v: string) => v.replace(/\s/g, '').toUpperCase().slice(0, 24)

/** Guarda o ?cupom= da URL para o cadastro, mesmo se a pessoa navegar pelo site antes. */
export function guardarCupomDaUrl() {
  try {
    const c = new URLSearchParams(window.location.search).get('cupom')
    if (c) localStorage.setItem(CHAVE, normalizarCupom(c))
  } catch { /* navegador sem storage */ }
}

export function cupomGuardado(): string {
  try {
    const daUrl = new URLSearchParams(window.location.search).get('cupom')
    return normalizarCupom(daUrl || localStorage.getItem(CHAVE) || '')
  } catch {
    return ''
  }
}

export function esquecerCupom() {
  try { localStorage.removeItem(CHAVE) } catch { /* sem storage */ }
}

export interface CupomValido { nome: string; desconto_pct: number }

/** null = não existe ou está desativado; undefined = sem banco (demonstração) */
export async function validarCupom(codigo: string): Promise<CupomValido | null | undefined> {
  if (!supabase) return undefined
  const { data, error } = await supabase.rpc('cupom_valido', { p_codigo: codigo })
  if (error) return undefined   // banco ainda sem a atualização: não trava o cadastro
  return (data as CupomValido | null) ?? null
}
