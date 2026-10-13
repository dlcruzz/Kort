// Envia as mensagens pendentes cuja hora chegou.
// "for update skip locked": se dois servidores rodarem juntos, cada um pega
// mensagens diferentes e ninguém envia em dobro.

import { sql } from '../db.js'
import { whatsapp } from '../whatsapp/index.js'

export async function enviarPendentes(limite = 30) {
  const lote = await sql.begin(async (tx) => {
    const msgs = await tx<{ id: string; destino: string; conteudo: string }[]>`
      select id, destino, conteudo from mensagens
      where status = 'pendente' and agendada_para <= now() and canal = 'whatsapp'
      order by agendada_para
      limit ${limite}
      for update skip locked
    `
    // marca como "enviada" já dentro da transação para não pegar de novo;
    // se o envio falhar, volta para "falhou" logo abaixo
    if (msgs.length) await tx`update mensagens set status = 'enviada', enviada_em = now() where id = any(${msgs.map((m) => m.id)}::uuid[])`
    return msgs
  })

  let enviadas = 0
  for (const m of lote) {
    try {
      const r = await whatsapp().enviar(m.destino, m.conteudo)
      await sql`update mensagens set id_externo = ${r.idExterno ?? null} where id = ${m.id}`
      enviadas++
    } catch (e) {
      await sql`update mensagens set status = 'falhou', erro = ${(e as Error).message.slice(0, 500)} where id = ${m.id}`
    }
  }
  return { tentadas: lote.length, enviadas }
}
