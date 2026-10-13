// Painel admin do Kort (só o super admin).
// As views admin_* do banco dependem do login do Supabase (auth.uid()), que
// não existe numa conexão de servidor. Por isso as consultas estão aqui.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exigirSuperAdmin } from '../auth.js'
import { sql } from '../db.js'
import { invalido, naoEncontrado } from '../erros.js'
import { darBaixa } from '../lib/faturas.js'

const uuid = z.string().uuid()

// Função (e não constante) para criar um fragmento novo a cada consulta.
const listaBarbearias = () => sql`
  select b.id, b.nome, b.slug, b.cidade, b.uf, b.criado_em,
         dono.nome_exibicao as responsavel, coalesce(dono_perfil.telefone, b.whatsapp) as telefone,
         p.nome as plano, p.preco_centavos, a.status as status_assinatura, a.teste_ate, a.proximo_vencimento,
         (select count(*) from membros m where m.barbearia_id = b.id and m.ativo)::int as barbeiros,
         (select count(*) from clientes c where c.barbearia_id = b.id)::int as clientes,
         (select count(*) from agendamentos ag where ag.barbearia_id = b.id and ag.criado_em > now() - interval '30 days')::int as agendamentos_30d,
         (select max(e.criado_em) from eventos e where e.barbearia_id = b.id) as ultimo_uso
  from barbearias b
  left join assinaturas_saas a on a.barbearia_id = b.id
  left join planos p on p.id = a.plano_id
  left join lateral (select m.nome_exibicao, m.perfil_id from membros m where m.barbearia_id = b.id and m.papel = 'dono' order by m.criado_em limit 1) dono on true
  left join perfis dono_perfil on dono_perfil.id = dono.perfil_id
`

async function log(adminId: string, barbeariaId: string | null, acao: string, detalhes: object = {}) {
  await sql`insert into admin_logs (admin_id, barbearia_id, acao, detalhes) values (${adminId}, ${barbeariaId}, ${acao}, ${sql.json(detalhes as never)})`
}

export async function rotasAdmin(app: FastifyInstance) {
  app.addHook('preHandler', exigirSuperAdmin)

  app.get('/admin/indicadores', async () => {
    const [i] = await sql`
      select
        coalesce(sum(p.preco_centavos) filter (where a.status = 'ativa'), 0)::int as mrr_centavos,
        count(*) filter (where a.status = 'ativa')::int as assinantes_ativos,
        count(*) filter (where a.status = 'teste')::int as em_teste,
        count(*) filter (where a.status = 'inadimplente')::int as inadimplentes,
        count(*) filter (where a.criado_em >= date_trunc('month', now()))::int as novos_no_mes,
        count(*) filter (where a.cancelada_em >= date_trunc('month', now()))::int as cancelados_no_mes
      from assinaturas_saas a join planos p on p.id = a.plano_id
    `
    const [aReceber] = await sql`select coalesce(sum(valor_centavos), 0)::int as total, count(*)::int as qtd from faturas where status in ('aberta', 'vencida')`
    return { ...i, a_receber: aReceber, meta_validacao: { pagantes: i.assinantes_ativos, meta: 4 } }
  })

  app.get('/admin/barbearias', async (req) => {
    const q = z.object({ status: z.string().optional(), busca: z.string().optional() }).parse(req.query)
    const busca = q.busca ? `%${q.busca.toLowerCase()}%` : null
    return sql`
      select * from (${listaBarbearias()}) x
      where (${q.status ?? null}::text is null or status_assinatura::text = ${q.status ?? null})
        and (${busca}::text is null or lower(nome || ' ' || coalesce(responsavel, '') || ' ' || coalesce(cidade, '')) like ${busca})
      order by criado_em desc
    `
  })

  app.get('/admin/barbearias/:id', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const [b] = await sql`select * from (${listaBarbearias()}) x where id = ${id}`
    if (!b) throw naoEncontrado('Barbearia', true)
    const [uso, faturas, logs] = await Promise.all([
      sql`select modulo, count(*)::int as total from eventos where barbearia_id = ${id} and criado_em > now() - interval '30 days' group by modulo order by total desc`,
      sql`select id, competencia, valor_centavos, vencimento, status, pago_em from faturas where barbearia_id = ${id} order by competencia desc`,
      sql`select l.acao, l.detalhes, l.criado_em, p.nome as admin from admin_logs l join perfis p on p.id = l.admin_id where l.barbearia_id = ${id} order by l.criado_em desc limit 30`,
    ])
    return { ...b, uso, faturas, logs }
  })

  // Uso das funções: ranking e quantas barbearias usam cada uma
  app.get('/admin/uso', async () => {
    const [eventos, porBarbearia] = await Promise.all([
      sql`
        select modulo, evento, count(*)::int as total_30d, count(distinct barbearia_id)::int as barbearias_que_usam
        from eventos where criado_em > now() - interval '30 days'
        group by modulo, evento order by total_30d desc`,
      sql`
        select barbearia_id, modulo, count(*)::int as total
        from eventos where criado_em > now() - interval '30 days' and barbearia_id is not null
        group by barbearia_id, modulo`,
    ])
    return { eventos, por_barbearia: porBarbearia }
  })

  // Risco de cancelamento: sem uso há 7 dias ou queda forte de agendamentos
  app.get('/admin/risco', async () => {
    return sql`
      with uso as (
        select b.id, b.nome,
               (select max(e.criado_em) from eventos e where e.barbearia_id = b.id) as ultimo_uso,
               (select count(*) from agendamentos ag where ag.barbearia_id = b.id and ag.criado_em > now() - interval '7 days')::int as semana,
               (select count(*) / 4.0 from agendamentos ag where ag.barbearia_id = b.id
                  and ag.criado_em between now() - interval '35 days' and now() - interval '7 days') as media
        from barbearias b join assinaturas_saas a on a.barbearia_id = b.id
        where a.status in ('teste', 'ativa', 'inadimplente')
      )
      select *, case
        when ultimo_uso is null or ultimo_uso < now() - interval '7 days' then 'Sem uso há 7 dias ou mais'
        else 'Queda forte de agendamentos' end as motivo
      from uso
      where ultimo_uso is null or ultimo_uso < now() - interval '7 days' or (media >= 4 and semana < media / 2)
    `
  })

  app.get('/admin/faturas', async (req) => {
    const { status } = z.object({ status: z.enum(['aberta', 'vencida', 'paga', 'cancelada', 'a_receber']).optional() }).parse(req.query)
    return sql`
      select f.id, f.competencia, f.valor_centavos, f.vencimento, f.status, f.pago_em, f.txid, b.nome as barbearia, b.id as barbearia_id
      from faturas f join barbearias b on b.id = f.barbearia_id
      where ${status ?? null}::text is null
         or (${status ?? null} = 'a_receber' and f.status in ('aberta', 'vencida'))
         or f.status::text = ${status ?? null}
      order by f.vencimento desc
    `
  })

  // Você conferiu o Pix no extrato da Nu e dá baixa
  app.post('/admin/faturas/:id/baixa', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const f = await darBaixa(sql, id, req.usuario!.id, 'manual')
    if (!f) throw invalido('Essa fatura não está em aberto.')
    return { ok: true }
  })

  app.post('/admin/barbearias/:id/status', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { status } = z.object({ status: z.enum(['ativa', 'suspensa', 'cancelada']) }).parse(req.body)
    const [a] = await sql`
      update assinaturas_saas set status = ${status}, cancelada_em = ${status === 'cancelada' ? new Date() : null}
      where barbearia_id = ${id} returning id`
    if (!a) throw naoEncontrado('Assinatura', true)
    // suspensa ou cancelada: página pública sai do ar
    await sql`update barbearias set publicada = ${status === 'ativa'} where id = ${id}`
    await log(req.usuario!.id, id, status === 'ativa' ? 'reativar' : status === 'suspensa' ? 'suspender' : 'cancelar')
    return { ok: true }
  })

  app.post('/admin/barbearias/:id/estender-teste', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { dias } = z.object({ dias: z.number().int().min(1).max(60) }).parse(req.body)
    const [a] = await sql<{ teste_ate: string }[]>`
      update assinaturas_saas
      set status = 'teste', teste_ate = greatest(coalesce(teste_ate, current_date), current_date) + ${dias}::int
      where barbearia_id = ${id} returning teste_ate::text`
    if (!a) throw naoEncontrado('Assinatura', true)
    await log(req.usuario!.id, id, 'estender_teste', { dias })
    return { ok: true, teste_ate: a.teste_ate }
  })

  app.post('/admin/barbearias/:id/plano', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { plano } = z.object({ plano: z.string() }).parse(req.body)
    const [p] = await sql<{ id: string }[]>`select id from planos where slug = ${plano} and ativo`
    if (!p) throw invalido('Plano não existe.')
    await sql`update assinaturas_saas set plano_id = ${p.id} where barbearia_id = ${id}`
    await log(req.usuario!.id, id, 'trocar_plano', { plano })
    return { ok: true }
  })

  app.get('/admin/sugestoes', async () => sql`
    select s.id, s.titulo, s.descricao, s.status, s.criado_em, b.nome as barbearia,
           (select count(*) from sugestao_votos v where v.sugestao_id = s.id)::int as votos
    from sugestoes s left join barbearias b on b.id = s.barbearia_id
    order by votos desc, s.criado_em desc
  `)

  app.patch('/admin/sugestoes/:id', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { status } = z.object({ status: z.enum(['nova', 'em_analise', 'planejada', 'feita', 'recusada']) }).parse(req.body)
    const [s] = await sql`update sugestoes set status = ${status} where id = ${id} returning id`
    if (!s) throw naoEncontrado('Sugestão', true)
    return { ok: true }
  })
}
