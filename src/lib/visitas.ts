// Contador de visitas do site e escolha de cookies.
//
// Toda visita conta, sem dado pessoal: só a página, o site de onde a
// pessoa veio e se é celular. O código aleatório do navegador (para contar
// pessoas diferentes, e não só aberturas de página) só é guardado se a
// pessoa aceitar os cookies no aviso.

import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type EscolhaCookies = 'todos' | 'essenciais' | null

const CHAVE_ESCOLHA = 'kort-cookies'
const CHAVE_VISITANTE = 'kort-visitante'

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}
function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    /* navegador sem armazenamento: segue sem lembrar */
  }
}

const ouvintes = new Set<() => void>()
let escolha: EscolhaCookies = (ler(CHAVE_ESCOLHA) as EscolhaCookies) ?? null

export function escolherCookies(valor: Exclude<EscolhaCookies, null>) {
  escolha = valor
  gravar(CHAVE_ESCOLHA, valor)
  if (valor === 'essenciais') gravar(CHAVE_VISITANTE, null)
  ouvintes.forEach((f) => f())
}

export function useEscolhaCookies(): EscolhaCookies {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => escolha,
  )
}

function visitante(): string | null {
  if (escolha !== 'todos') return null
  let v = ler(CHAVE_VISITANTE)
  if (!v) {
    v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 24)
    gravar(CHAVE_VISITANTE, v)
  }
  return v
}

function origem(): string | null {
  const ref = document.referrer
  if (!ref) {
    const utm = new URLSearchParams(location.search).get('utm_source')
    return utm ? utm.toLowerCase() : null
  }
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '').replace(/^l\./, '').replace(/^m\./, '')
    return host === location.hostname.replace(/^www\./, '') ? null : host
  } catch {
    return null
  }
}

const jaContadas = new Set<string>()

/** Conta uma visita na página (uma vez por carregamento). */
export function useRegistrarVisita(pagina: string) {
  useEffect(() => {
    if (!supabase || jaContadas.has(pagina)) return
    if (/^(localhost|127\.|192\.168\.)/.test(location.hostname)) return
    jaContadas.add(pagina)
    void supabase.rpc('registrar_visita', {
      p_pagina: pagina,
      p_origem: origem(),
      p_visitante: visitante(),
      p_celular: window.matchMedia('(pointer: coarse)').matches,
    })
  }, [pagina])
}
