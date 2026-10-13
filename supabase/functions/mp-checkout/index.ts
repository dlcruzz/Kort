// Edge Function: cria o pagamento da mensalidade no Mercado Pago (Checkout Pro)
// e devolve o link. O barbeiro escolhe lá: Pix (QR code), cartão de crédito ou débito.
//
// Chamada pelo app logado: supabase.functions.invoke('mp-checkout', { body: { barbearia_id, voltar } })
// Segredo necessário (Supabase > Edge Functions > Secrets): MP_ACCESS_TOKEN
// "Verify JWT" ligado (só usuário logado chama).

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405)

  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) return json({ erro: 'Pagamento online ainda não configurado. Fale com o suporte do Kort.' }, 503)

  let corpo: { barbearia_id?: string; voltar?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400)
  }
  if (!corpo.barbearia_id) return json({ erro: 'Barbearia não informada.' }, 400)

  // Cliente com o login de quem chamou: o banco confere se é o dono (RLS + função)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: fatura, error } = await sb.rpc('fatura_para_pagar', { p_barbearia: corpo.barbearia_id })
  if (error || !fatura) return json({ erro: error?.message ?? 'Não foi possível gerar a cobrança.' }, 400)

  const { data: bar } = await sb.from('barbearias').select('nome').eq('id', corpo.barbearia_id).single()

  // Volta para o mesmo site de onde o barbeiro saiu
  let origem = 'https://kort-six.vercel.app'
  try {
    if (corpo.voltar) origem = new URL(corpo.voltar).origin
  } catch { /* fica o padrão */ }

  const mes = MESES[Number(String(fatura.competencia).slice(5, 7)) - 1]
  const preferencia = {
    items: [{
      id: fatura.id,
      title: `Kort - plano ${fatura.plano} (${mes})`,
      description: `Mensalidade do Kort para ${bar?.nome ?? 'sua barbearia'}`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: fatura.valor_centavos / 100,
    }],
    external_reference: fatura.id,
    notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
    back_urls: {
      success: `${origem}/app/configuracoes?aba=plano&pagamento=ok`,
      pending: `${origem}/app/configuracoes?aba=plano&pagamento=pendente`,
      failure: `${origem}/app/configuracoes?aba=plano&pagamento=erro`,
    },
    auto_return: 'approved',
    statement_descriptor: 'KORT',
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }],   // sem boleto (demora dias para compensar)
      installments: 1,
    },
    metadata: { fatura_id: fatura.id, barbearia_id: corpo.barbearia_id },
  }

  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `${fatura.id}-${Date.now()}` },
    body: JSON.stringify(preferencia),
  })
  const mp = await r.json()
  if (!r.ok) {
    console.error('mercado pago', r.status, mp)
    return json({ erro: 'O Mercado Pago não respondeu. Tente de novo em instantes.' }, 502)
  }
  return json({ url: mp.init_point, fatura: fatura.id, valor_centavos: fatura.valor_centavos })
})
