// Edge Function: o Mercado Pago avisa aqui quando um pagamento muda.
// Não confiamos no aviso: buscamos o pagamento na API do Mercado Pago com o
// nosso token e só liberamos se estiver "approved" e o valor bater com a fatura.
//
// "Verify JWT" DESLIGADO (o Mercado Pago não manda login do Supabase).
// Segredo: MP_ACCESS_TOKEN. Usa a service_role do próprio projeto (já existe no ambiente).

import { createClient } from 'npm:@supabase/supabase-js@2'

const ok = (txt = 'ok') => new Response(txt, { status: 200 })

Deno.serve(async (req) => {
  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) return ok('sem token')

  const url = new URL(req.url)
  let corpo: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    corpo = await req.json()
  } catch { /* aviso antigo vem só na URL */ }

  const tipo = corpo.type ?? corpo.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const id = corpo.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id')
  if (tipo !== 'payment' || !id) return ok('ignorado')

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) {
    console.error('consulta pagamento', id, r.status)
    return new Response('tente de novo', { status: 500 })   // o Mercado Pago reenvia
  }
  const pg = await r.json()

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  await sb.from('webhook_eventos').upsert(
    { provedor: 'mercado_pago', id_evento: `${pg.id}:${pg.status}`, tipo: `payment.${pg.status}`, payload: pg, processado: false },
    { onConflict: 'provedor,id_evento', ignoreDuplicates: true },
  )

  if (pg.status !== 'approved' || !pg.external_reference) return ok(`status ${pg.status}`)

  const centavos = Math.round(Number(pg.transaction_amount) * 100)
  const { data, error } = await sb.rpc('mp_confirmar_pagamento', {
    p_fatura: pg.external_reference, p_pagamento: String(pg.id), p_valor_centavos: centavos,
  })
  await sb.from('webhook_eventos').update({ processado: !error, erro: error?.message ?? null })
    .eq('provedor', 'mercado_pago').eq('id_evento', `${pg.id}:${pg.status}`)
  if (error) {
    console.error('confirmar', error)
    return ok('erro registrado')
  }
  return ok(data ? 'liberado' : 'ja estava pago')
})
