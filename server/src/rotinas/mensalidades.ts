// Mensalidade do Kort, uma vez por dia:
//  1. teste acabou -> assinatura vira ativa e ganha a primeira fatura (vence em 3 dias)
//  2. faltam 5 dias para o vencimento -> cria a fatura do mês com o Pix
//  3. fatura passou do vencimento -> "vencida"; 3 dias depois -> assinatura "inadimplente"
//  4. inadimplente há mais de 15 dias -> "suspensa" e a página sai do ar

import { DateTime } from 'luxon'
import { sql } from '../db.js'
import { gerarFatura } from '../lib/faturas.js'
import { FUSO } from '../lib/tempo.js'

export async function rotinaMensalidades(hoje: string) {
  const h = DateTime.fromISO(hoje, { zone: FUSO })
  const r = { testes_encerrados: 0, faturas_criadas: 0, vencidas: 0, inadimplentes: 0, suspensas: 0 }

  // 1. fim do teste
  const testes = await sql<{ id: string; preco: number }[]>`
    select a.id, p.preco_centavos as preco from assinaturas_saas a join planos p on p.id = a.plano_id
    where a.status = 'teste' and a.teste_ate < ${hoje}
  `
  for (const t of testes) {
    await sql`update assinaturas_saas set status = 'ativa', proximo_vencimento = ${h.plus({ days: 3 }).toISODate()} where id = ${t.id}`
    if (t.preco > 0 && (await gerarFatura(sql, t.id, h.startOf('month').toISODate()!, h.plus({ days: 3 }).toISODate()!))) r.faturas_criadas++
    r.testes_encerrados++
  }

  // 2. fatura do mês, 5 dias antes do vencimento
  const ativas = await sql<{ id: string; dia_vencimento: number }[]>`
    select a.id, a.dia_vencimento from assinaturas_saas a join planos p on p.id = a.plano_id
    where a.status in ('ativa', 'inadimplente') and p.preco_centavos > 0
  `
  for (const a of ativas) {
    for (const mes of [h.startOf('month'), h.startOf('month').plus({ months: 1 })]) {
      const venc = mes.set({ day: a.dia_vencimento })
      if (h >= venc.minus({ days: 5 }) && h <= venc) {
        const [ja] = await sql`select 1 from faturas where assinatura_id = ${a.id} and competencia = ${mes.toISODate()}`
        if (!ja && (await gerarFatura(sql, a.id, mes.toISODate()!, venc.toISODate()!))) r.faturas_criadas++
      }
    }
  }

  // 3. vencimentos
  r.vencidas = (await sql`update faturas set status = 'vencida' where status = 'aberta' and vencimento < ${hoje} returning id`).length
  r.inadimplentes = (
    await sql`
      update assinaturas_saas a set status = 'inadimplente'
      where a.status = 'ativa' and exists (
        select 1 from faturas f where f.assinatura_id = a.id and f.status = 'vencida' and f.vencimento < ${hoje}::date - 3
      ) returning a.id`
  ).length

  // 4. suspensão
  const suspensas = await sql<{ barbearia_id: string }[]>`
    update assinaturas_saas a set status = 'suspensa'
    where a.status = 'inadimplente' and exists (
      select 1 from faturas f where f.assinatura_id = a.id and f.status = 'vencida' and f.vencimento < ${hoje}::date - 15
    ) returning a.barbearia_id`
  if (suspensas.length) await sql`update barbearias set publicada = false where id = any(${suspensas.map((s) => s.barbearia_id)}::uuid[])`
  r.suspensas = suspensas.length
  return r
}
