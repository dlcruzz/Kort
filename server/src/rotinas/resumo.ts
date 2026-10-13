// Resumo do dia no WhatsApp do dono (só para quem ligou essa mensagem).

import { sql } from '../db.js'
import { dinheiro } from '../lib/dinheiro.js'
import { enfileirar, modeloDe, montarTexto } from '../lib/mensagens.js'
import { limitesDoDia } from '../lib/tempo.js'

export async function resumoDoDia(hoje: string) {
  const [ini, fim] = limitesDoDia(hoje)
  const amanha = [fim, new Date(fim.getTime() + 86400000)]
  const barbearias = await sql<{ id: string; telefone: string | null }[]>`
    select b.id, coalesce(p.telefone, b.whatsapp) as telefone
    from barbearias b
    join modelos_mensagem mm on mm.barbearia_id = b.id and mm.tipo = 'resumo_diario' and mm.ativo
    join assinaturas_saas a on a.barbearia_id = b.id and a.status in ('teste', 'ativa')
    left join lateral (select perfil_id from membros where barbearia_id = b.id and papel = 'dono' order by criado_em limit 1) d on true
    left join perfis p on p.id = d.perfil_id
    where not exists (select 1 from mensagens x where x.barbearia_id = b.id and x.tipo = 'resumo_diario' and x.criado_em >= ${ini})
  `
  let criados = 0
  for (const b of barbearias) {
    if (!b.telefone) continue
    const [n] = await sql<{ fat: number; atend: number; faltas: number; amanha: number }[]>`
      select
        (select coalesce(sum(total_centavos), 0) from comandas where barbearia_id = ${b.id} and status = 'paga' and pago_em >= ${ini} and pago_em < ${fim})::int as fat,
        (select count(*) from comandas where barbearia_id = ${b.id} and status = 'paga' and pago_em >= ${ini} and pago_em < ${fim})::int as atend,
        (select count(*) from agendamentos where barbearia_id = ${b.id} and status = 'faltou' and inicio >= ${ini} and inicio < ${fim})::int as faltas,
        (select count(*) from agendamentos where barbearia_id = ${b.id} and status in ('agendado', 'confirmado') and inicio >= ${amanha[0]} and inicio < ${amanha[1]})::int as amanha
    `
    const modelo = await modeloDe(sql, b.id, 'resumo_diario')
    if (!modelo) continue
    await enfileirar(sql, {
      barbeariaId: b.id, tipo: 'resumo_diario', destino: b.telefone,
      conteudo: montarTexto(modelo, { faturamento: dinheiro(n.fat), atendimentos: n.atend, faltas: n.faltas, agendados: n.amanha }),
    })
    criados++
  }
  return { criados }
}
