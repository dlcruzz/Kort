// Mensalidade do Kort: gerar fatura com Pix e dar baixa.

import { DateTime } from 'luxon'
import type { Sql, Tx } from '../db.js'
import { config } from '../config.js'
import { pixCopiaECola } from './pix.js'
import { FUSO } from './tempo.js'

type Banco = Sql | Tx

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/**
 * Cria a fatura do mês (se ainda não existir) com o Pix copia e cola da sua
 * conta. Devolve a fatura (nova ou a que já existia).
 */
export async function gerarFatura(db: Banco, assinaturaId: string, competencia: string, vencimento: string) {
  const [a] = await db<{ id: string; barbearia_id: string; preco_centavos: number; nome: string }[]>`
    select a.id, a.barbearia_id, p.preco_centavos, b.nome
    from assinaturas_saas a join planos p on p.id = a.plano_id join barbearias b on b.id = a.barbearia_id
    where a.id = ${assinaturaId}
  `
  if (!a || a.preco_centavos <= 0) return null

  const [existente] = await db`select * from faturas where assinatura_id = ${assinaturaId} and competencia = ${competencia}`
  if (existente) return existente

  const mes = NOMES_MES[DateTime.fromISO(competencia).month - 1]
  const txid = `KORT${assinaturaId.replace(/-/g, '').slice(0, 12)}${competencia.slice(2, 4)}${competencia.slice(5, 7)}`.toUpperCase()
  const copiaCola = config.PIX_CHAVE
    ? pixCopiaECola({ chave: config.PIX_CHAVE, valorCentavos: a.preco_centavos, nome: config.PIX_NOME, cidade: config.PIX_CIDADE, txid, descricao: `Kort ${mes}` })
    : null

  const [f] = await db`
    insert into faturas (barbearia_id, assinatura_id, competencia, valor_centavos, vencimento, status, provedor, txid, pix_copia_cola)
    values (${a.barbearia_id}, ${assinaturaId}, ${competencia}, ${a.preco_centavos}, ${vencimento}, 'aberta', 'pix_manual', ${txid}, ${copiaCola})
    on conflict (assinatura_id, competencia) do nothing
    returning *
  `
  return f ?? (await db`select * from faturas where assinatura_id = ${assinaturaId} and competencia = ${competencia}`)[0]
}

/** Marca a fatura como paga e acerta a assinatura (volta a ativa e anda o vencimento). */
export async function darBaixa(db: Banco, faturaId: string, adminId: string | null, origem: string) {
  const [f] = await db<{ id: string; assinatura_id: string; barbearia_id: string; status: string; competencia: string }[]>`
    update faturas set status = 'paga', pago_em = now(), confirmado_por = ${adminId}
    where id = ${faturaId} and status in ('aberta', 'vencida')
    returning id, assinatura_id, barbearia_id, status, competencia::text
  `
  if (!f) return null
  const [a] = await db<{ dia_vencimento: number }[]>`select dia_vencimento from assinaturas_saas where id = ${f.assinatura_id}`
  const proximo = DateTime.fromISO(f.competencia, { zone: FUSO }).plus({ months: 1 }).set({ day: a.dia_vencimento }).toISODate()
  await db`
    update assinaturas_saas set status = 'ativa', proximo_vencimento = ${proximo}
    where id = ${f.assinatura_id} and status in ('teste', 'ativa', 'inadimplente')
  `
  if (adminId) {
    await db`insert into admin_logs (admin_id, barbearia_id, acao, detalhes) values (${adminId}, ${f.barbearia_id}, 'baixa_fatura', ${db.json({ fatura: f.id, origem })})`
  }
  return f
}
