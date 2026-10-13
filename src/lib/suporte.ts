// Chat de suporte entre a barbearia e o Kort.
// Leitura pela view suporte_resumo e tabela suporte_mensagens (RLS);
// escrita só pelas funções suporte_abrir / suporte_enviar / suporte_marcar_lidas / suporte_status.
// Chegada de mensagem nova: tempo real do Supabase + checagem a cada 20 s.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { mensagemDeErro } from './banco'

export type TipoSuporte = 'duvida' | 'problema' | 'sugestao' | 'outro'
export type StatusSuporte = 'aberta' | 'respondida' | 'resolvida'

export const NOME_TIPO: Record<TipoSuporte, string> = {
  duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', outro: 'Outro assunto',
}
export const NOME_STATUS: Record<StatusSuporte, string> = {
  aberta: 'Aguardando o Kort', respondida: 'Respondida', resolvida: 'Resolvida',
}

export interface Conversa {
  id: string
  barbearia_id: string
  barbearia_nome: string
  aberta_por: string | null
  tipo: TipoSuporte
  assunto: string
  status: StatusSuporte
  pagina: string | null
  ultima_msg: string | null
  ultima_msg_em: string
  criado_em: string
  nao_lidas_barbearia: number
  nao_lidas_kort: number
}

export interface MensagemSuporte {
  id: string
  conversa_id: string
  do_kort: boolean
  automatica: boolean
  texto: string
  criado_em: string
  lida_em: string | null
}

/** Lista de conversas (a barbearia vê as dela; o admin vê todas). */
export function useConversas() {
  const [lista, setLista] = useState<Conversa[] | null>(null)

  const carregar = useCallback(async () => {
    if (!supabase) return setLista([])
    const { data } = await supabase.from('suporte_resumo').select('*').order('ultima_msg_em', { ascending: false }).limit(300)
    setLista((data ?? []) as Conversa[])
  }, [])

  useEffect(() => {
    void carregar()
    if (!supabase) return
    const sb = supabase
    const canal = sb
      .channel(`suporte-lista-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suporte_mensagens' }, () => void carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suporte_conversas' }, () => void carregar())
      .subscribe()
    const t = setInterval(() => void carregar(), 20_000)
    return () => {
      clearInterval(t)
      void sb.removeChannel(canal)
    }
  }, [carregar])

  return { lista, carregar }
}

/** Uma conversa aberta: mensagens, enviar, marcar lidas. */
export function useConversa(id: string | null, lado: 'barbearia' | 'kort', aoMudar?: () => void) {
  const [msgs, setMsgs] = useState<MensagemSuporte[]>([])
  const [enviando, setEnviando] = useState(false)
  const ultimo = useRef<string>('')
  const mudou = useRef(aoMudar)
  mudou.current = aoMudar

  const carregar = useCallback(async () => {
    if (!supabase || !id) return
    const { data } = await supabase.from('suporte_mensagens').select('id, conversa_id, do_kort, automatica, texto, criado_em, lida_em')
      .eq('conversa_id', id).order('criado_em')
    const lista = (data ?? []) as MensagemSuporte[]
    setMsgs(lista)
    const fim = lista[lista.length - 1]?.id ?? ''
    // marca como lidas as do outro lado que ainda estão sem leitura
    const pendente = lista.some((m) => !m.lida_em && m.do_kort === (lado === 'barbearia'))
    if (fim !== ultimo.current || pendente) {
      ultimo.current = fim
      if (pendente) await supabase.rpc('suporte_marcar_lidas', { p_conversa: id })
      mudou.current?.()
    }
  }, [id, lado])

  useEffect(() => {
    setMsgs([])
    ultimo.current = ''
    if (!supabase || !id) return
    void carregar()
    const sb = supabase
    const canal = sb
      .channel(`suporte-conversa-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suporte_mensagens', filter: `conversa_id=eq.${id}` }, () => void carregar())
      .subscribe()
    const t = setInterval(() => void carregar(), 15_000)
    return () => {
      clearInterval(t)
      void sb.removeChannel(canal)
    }
  }, [id, carregar])

  const enviar = useCallback(async (texto: string) => {
    if (!supabase || !id || !texto.trim()) return
    setEnviando(true)
    const { error } = await supabase.rpc('suporte_enviar', { p_conversa: id, p_texto: texto })
    setEnviando(false)
    if (error) throw new Error(mensagemDeErro(error))
    await carregar()
  }, [id, carregar])

  const mudarStatus = useCallback(async (status: StatusSuporte) => {
    if (!supabase || !id) return
    const { error } = await supabase.rpc('suporte_status', { p_conversa: id, p_status: status })
    if (error) throw new Error(mensagemDeErro(error))
    mudou.current?.()
  }, [id])

  return { msgs, enviar, enviando, mudarStatus }
}

export async function abrirConversa(tipo: TipoSuporte, assunto: string, texto: string, pagina: string) {
  if (!supabase) throw new Error('O suporte funciona com o sistema ligado ao banco.')
  const { data, error } = await supabase.rpc('suporte_abrir', { p_tipo: tipo, p_assunto: assunto, p_texto: texto, p_pagina: pagina })
  if (error) throw new Error(mensagemDeErro(error))
  return data as string
}

/** Quantas mensagens do outro lado faltam ler (para o número no menu). Avisa quando chega. */
export function useNaoLidas(lado: 'barbearia' | 'kort', aoChegar?: (n: number) => void) {
  const [n, setN] = useState(0)
  const antes = useRef<number | null>(null)
  const cb = useRef(aoChegar)
  cb.current = aoChegar

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    const coluna = lado === 'kort' ? 'nao_lidas_kort' : 'nao_lidas_barbearia'
    const contar = async () => {
      const { data } = await sb.from('suporte_resumo').select(coluna).gt(coluna, 0)
      const total = (data ?? []).reduce((t: number, r: Record<string, number>) => t + (r[coluna] ?? 0), 0)
      if (antes.current !== null && total > antes.current) cb.current?.(total)
      antes.current = total
      setN(total)
    }
    void contar()
    const canal = sb
      .channel(`suporte-contagem-${lado}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suporte_mensagens' }, () => void contar())
      .subscribe()
    const t = setInterval(() => void contar(), 30_000)
    return () => {
      clearInterval(t)
      void sb.removeChannel(canal)
    }
  }, [lado])

  return n
}
