// Pagamento da mensalidade do Kort pelo Mercado Pago (Pix, cartão de crédito ou débito).
// O app pede o link para a Edge Function mp-checkout e manda o barbeiro para lá.
// Quando o Mercado Pago aprova, a Edge Function mp-webhook libera a conta sozinha.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { mensagemDeErro } from './banco'

export async function escolherPlanoAgora(barbeariaId: string, slug: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('escolher_plano', { p_barbearia: barbeariaId, p_plano: slug })
  if (error) throw new Error(mensagemDeErro(error))
}

export async function irParaPagamento(barbeariaId: string) {
  if (!supabase) throw new Error('Pagamento online só com o sistema ligado ao banco.')
  const { data, error } = await supabase.functions.invoke('mp-checkout', {
    body: { barbearia_id: barbeariaId, voltar: window.location.href },
  })
  if (error) {
    // a função devolve { erro } com a mensagem para a tela
    let msg = 'Não foi possível abrir o pagamento. Tente de novo.'
    try {
      const corpo = await (error as { context?: Response }).context?.json()
      if (corpo?.erro) msg = corpo.erro
    } catch { /* fica a mensagem padrão */ }
    throw new Error(msg)
  }
  if (!data?.url) throw new Error('Não foi possível abrir o pagamento. Tente de novo.')
  window.location.href = data.url as string
}

/** Depois de voltar do Mercado Pago: espera o aviso de pagamento liberar a conta. */
export function useAguardarLiberacao(barbeariaId: string | null, ativo: boolean, aoLiberar: () => void) {
  const [esperando, setEsperando] = useState(ativo)
  const [desistiu, setDesistiu] = useState(false)
  useEffect(() => {
    if (!ativo || !supabase || !barbeariaId) return
    setEsperando(true)
    const sb = supabase
    let tentativas = 0
    const t = setInterval(async () => {
      tentativas++
      const { data } = await sb.from('assinaturas_saas').select('status').eq('barbearia_id', barbeariaId).maybeSingle()
      if (data?.status === 'ativa') {
        clearInterval(t)
        setEsperando(false)
        aoLiberar()
      } else if (tentativas > 60) {
        clearInterval(t)
        setEsperando(false)
        setDesistiu(true)
      }
    }, 3000)
    return () => clearInterval(t)
  }, [ativo, barbeariaId]) // eslint-disable-line react-hooks/exhaustive-deps
  return { esperando, desistiu }
}
