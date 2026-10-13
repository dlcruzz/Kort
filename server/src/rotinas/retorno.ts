// Convites de volta, uma vez por dia:
//  - "retorno": no dia em que o cliente costuma voltar (proximo_retorno_previsto)
//  - "resgate": 10 dias depois disso, se ainda não voltou
// Não chama quem já tem horário marcado nem quem recebeu convite há pouco.

import { sql } from '../db.js'
import { config } from '../config.js'
import { enfileirar, modeloDe, montarTexto } from '../lib/mensagens.js'

export async function convidarDeVolta(hoje: string) {
  let criados = 0
  for (const [tipo, atraso] of [['retorno', 0], ['resgate', 10]] as const) {
    const lista = await sql<{ id: string; barbearia_id: string; nome: string; telefone: string; barbearia: string; slug: string; barbeiro: string | null }[]>`
      select c.id, c.barbearia_id, c.nome, c.telefone, b.nome as barbearia, b.slug, m.nome_exibicao as barbeiro
      from clientes c
      join barbearias b on b.id = c.barbearia_id
      join assinaturas_saas a on a.barbearia_id = b.id and a.status in ('teste', 'ativa')
      left join membros m on m.id = c.membro_preferido_id
      where c.aceita_mensagens
        and c.proximo_retorno_previsto = ${hoje}::date - ${atraso}::int
        and not exists (select 1 from agendamentos ag where ag.cliente_id = c.id and ag.inicio > now() and ag.status in ('agendado', 'confirmado'))
        and not exists (select 1 from mensagens x where x.cliente_id = c.id and x.tipo in ('retorno', 'resgate') and x.criado_em > now() - interval '7 days')
    `
    for (const c of lista) {
      const modelo = await modeloDe(sql, c.barbearia_id, tipo)
      if (!modelo) continue
      await enfileirar(sql, {
        barbeariaId: c.barbearia_id, tipo, destino: c.telefone, clienteId: c.id,
        conteudo: montarTexto(modelo, {
          cliente: c.nome.split(' ')[0], barbeiro: c.barbeiro ?? 'a gente', barbearia: c.barbearia,
          link: `${config.LINK_PUBLICO_BASE}/b/${c.slug}`, desconto: '10%',
        }),
      })
      criados++
    }
  }
  return { criados }
}
