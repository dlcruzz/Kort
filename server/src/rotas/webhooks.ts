// Avisos de pagamento de um gateway (Asaas, Woovi...). Hoje a mensalidade
// é Pix manual na Nu e você dá baixa no painel; quando ligar um gateway,
// ele chama esta rota e a baixa fica automática.
//
// Para o gateway achar a fatura, crie a cobrança com a referência externa
// (externalReference no Asaas, correlationID na Woovi) igual ao id da fatura.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import { sql } from '../db.js'
import { ErroHttp } from '../erros.js'
import { darBaixa } from '../lib/faturas.js'

type Lido = { idEvento: string; tipo: string; pago: boolean; faturaId: string | null }

function ler(provedor: string, b: any): Lido {
  if (provedor === 'asaas') {
    return {
      idEvento: String(b?.id ?? `${b?.event}:${b?.payment?.id}`),
      tipo: String(b?.event ?? ''),
      pago: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(b?.event),
      faturaId: b?.payment?.externalReference ?? null,
    }
  }
  if (provedor === 'woovi') {
    return {
      idEvento: String(b?.charge?.transactionID ?? b?.pix?.endToEndId ?? b?.charge?.correlationID ?? ''),
      tipo: String(b?.event ?? ''),
      pago: b?.event === 'OPENPIX:CHARGE_COMPLETED',
      faturaId: b?.charge?.correlationID ?? null,
    }
  }
  // mercado_pago só manda o id; confirmar o status exige consultar a API deles
  return { idEvento: String(b?.id ?? b?.data?.id ?? ''), tipo: String(b?.type ?? b?.action ?? ''), pago: false, faturaId: null }
}

export async function rotasWebhooks(app: FastifyInstance) {
  app.post('/webhooks/:provedor', async (req) => {
    const { provedor } = z.object({ provedor: z.enum(['asaas', 'woovi', 'mercado_pago']) }).parse(req.params)
    const token = req.headers['x-webhook-token'] ?? req.headers['asaas-access-token']
    if (!config.WEBHOOK_TOKEN || token !== config.WEBHOOK_TOKEN) throw new ErroHttp(401, 'Token do webhook inválido.')

    const l = ler(provedor, req.body)
    if (!l.idEvento) throw new ErroHttp(400, 'Evento sem identificador.')

    // grava o aviso bruto; se já chegou antes, não processa de novo
    const [ev] = await sql<{ id: number }[]>`
      insert into webhook_eventos (provedor, id_evento, tipo, payload)
      values (${provedor}, ${l.idEvento}, ${l.tipo}, ${sql.json(req.body as never)})
      on conflict (provedor, id_evento) do nothing
      returning id
    `
    if (!ev) return { ok: true, repetido: true }

    try {
      if (l.pago && l.faturaId && z.string().uuid().safeParse(l.faturaId).success) {
        await darBaixa(sql, l.faturaId, null, `webhook:${provedor}`)
      }
      await sql`update webhook_eventos set processado = true where id = ${ev.id}`
    } catch (e) {
      await sql`update webhook_eventos set erro = ${(e as Error).message} where id = ${ev.id}`
      throw e
    }
    return { ok: true }
  })
}
