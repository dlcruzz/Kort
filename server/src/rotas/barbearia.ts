// Rotas do app da barbearia (exigem login).
//
// O CRUD do dia a dia (clientes, serviços, comandas...) o front faz direto
// no Supabase, protegido pelo RLS. Aqui ficam só as coisas que precisam do
// servidor: cálculos, envio de mensagem e a mensalidade.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exigirLogin, membroDa } from '../auth.js'
import { sql } from '../db.js'
import { invalido, naoEncontrado } from '../erros.js'
import { horariosDeVarios } from '../lib/agenda.js'
import { enfileirar, modeloDe, montarTexto, registrarEvento } from '../lib/mensagens.js'
import { config } from '../config.js'

const uuid = z.string().uuid()

// Taxa de falta de referência sem lembrete (mesma do front).
const FALTA_SEM_LEMBRETE = 0.2

export async function rotasBarbearia(app: FastifyInstance) {
  app.addHook('preHandler', exigirLogin)

  // Quem sou eu e de quais barbearias faço parte
  app.get('/eu', async (req) => {
    const barbearias = await sql`
      select b.id, b.slug, b.nome, m.id as membro_id, m.papel, a.status as assinatura
      from membros m join barbearias b on b.id = m.barbearia_id
      left join assinaturas_saas a on a.barbearia_id = b.id
      where m.perfil_id = ${req.usuario!.id} and m.ativo
      order by b.nome
    `
    return { usuario: req.usuario, barbearias }
  })

  // Horários livres para o balcão (mesma regra do link)
  app.get('/barbearias/:id/horarios-livres', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    await membroDa(req, id)
    const q = z
      .object({
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        duracao: z.coerce.number().int().min(5).max(480),
        membro: z.string().default('todos'),
      })
      .parse(req.query)
    const [b] = await sql<{ fuso_horario: string; intervalo_slots_min: number }[]>`select fuso_horario, intervalo_slots_min from barbearias where id = ${id}`
    const membros =
      q.membro === 'todos'
        ? (await sql<{ id: string }[]>`select id from membros where barbearia_id = ${id} and ativo and atende order by ordem`).map((m) => m.id)
        : [q.membro]
    return {
      horarios: await horariosDeVarios(sql, membros, { barbeariaId: id, data: q.data, duracao: q.duracao, grade: b.intervalo_slots_min, fuso: b.fuso_horario, antecedenciaMin: 0 }),
    }
  })

  // Relatório "dinheiro na mesa" (S01)
  app.get('/barbearias/:id/relatorios/dinheiro-na-mesa', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    await membroDa(req, id, ['dono'])
    const q = z.object({ de: z.string().date(), ate: z.string().date() }).parse(req.query)
    const [r] = await sql<{ faturamento: number; atendimentos: number; validos: number; faltas: number; lista: number; voltaram: number; pelo_link: number }[]>`
      with periodo as (select ${q.de}::date as de, (${q.ate}::date + 1) as ate),
      pagas as (
        select c.total_centavos from comandas c, periodo p
        where c.barbearia_id = ${id} and c.status = 'paga' and c.pago_em >= p.de and c.pago_em < p.ate
      ),
      ags as (
        select a.* from agendamentos a, periodo p
        where a.barbearia_id = ${id} and a.inicio >= p.de and a.inicio < p.ate and a.inicio < now() and a.status <> 'cancelado'
      )
      select
        (select coalesce(sum(total_centavos), 0) from pagas)::int as faturamento,
        (select count(*) from pagas)::int as atendimentos,
        (select count(*) from ags)::int as validos,
        (select count(*) from ags where status = 'faltou')::int as faltas,
        (select count(*) from ags where origem = 'lista_espera')::int as lista,
        (select count(*) from ags where mensagem_origem_id is not null or origem = 'mensagem')::int as voltaram,
        (select count(*) from ags where origem = 'link')::int as pelo_link
    `
    const ticket = r.atendimentos ? Math.round(r.faturamento / r.atendimentos) : 0
    const taxa = r.validos ? r.faltas / r.validos : 0
    const evitadas = Math.max(0, Math.round(r.validos * (FALTA_SEM_LEMBRETE - taxa)))
    await registrarEvento(sql, id, 'relatorio.aberto', req.usuario!.id, { relatorio: 'dinheiro_na_mesa' })
    return {
      ...r,
      ticket_medio_centavos: ticket,
      taxa_faltas: taxa,
      faltas_evitadas: evitadas,
      recuperado_centavos: (evitadas + r.lista + r.voltaram) * ticket,
      itens: [
        { nome: 'Faltas evitadas pelos lembretes', quantidade: evitadas, valor_centavos: evitadas * ticket },
        { nome: 'Vagas preenchidas pela lista de espera', quantidade: r.lista, valor_centavos: r.lista * ticket },
        { nome: 'Clientes que voltaram pela mensagem', quantidade: r.voltaram, valor_centavos: r.voltaram * ticket },
      ],
    }
  })

  // Mandar mensagem agora (chamar cliente sumido, avisar vaga...)
  app.post('/barbearias/:id/mensagens', async (req, res) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const m = await membroDa(req, id)
    const c = z
      .object({
        cliente_id: uuid,
        tipo: z.enum(['retorno', 'resgate', 'lista_espera', 'confirmacao']),
        texto: z.string().trim().min(3).max(1000).optional(),
      })
      .parse(req.body)
    const [cli] = await sql<{ nome: string; telefone: string; aceita_mensagens: boolean }[]>`
      select nome, telefone, aceita_mensagens from clientes where id = ${c.cliente_id} and barbearia_id = ${id}
    `
    if (!cli) throw naoEncontrado('Cliente')
    if (!cli.aceita_mensagens) throw invalido('Esse cliente pediu para não receber mensagens.')
    const [b] = await sql<{ nome: string; slug: string }[]>`select nome, slug from barbearias where id = ${id}`
    const modelo = c.texto ?? (await modeloDe(sql, id, c.tipo))
    if (!modelo) throw invalido('Essa mensagem está desligada em Mensagens.')
    const msgId = await enfileirar(sql, {
      barbeariaId: id, tipo: c.tipo, destino: cli.telefone, clienteId: c.cliente_id, membroId: m?.id,
      conteudo: montarTexto(modelo, { cliente: cli.nome.split(' ')[0], barbearia: b.nome, link: `${config.LINK_PUBLICO_BASE}/b/${b.slug}`, desconto: '10%' }),
    })
    await registrarEvento(sql, id, `mensagem.${c.tipo}`, req.usuario!.id, { manual: true })
    res.status(201)
    return { id: msgId, status: 'pendente' }
  })

  // Mensalidade do Kort: assinatura, faturas e o Pix da fatura em aberto
  app.get('/barbearias/:id/mensalidade', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    await membroDa(req, id, ['dono'])
    const [assinatura] = await sql`
      select a.id, a.status, a.teste_ate, a.dia_vencimento, a.proximo_vencimento, p.nome as plano, p.slug as plano_slug, p.preco_centavos
      from assinaturas_saas a join planos p on p.id = a.plano_id where a.barbearia_id = ${id}
    `
    const faturas = await sql`
      select id, competencia, valor_centavos, vencimento, status, pix_copia_cola, pago_em
      from faturas where barbearia_id = ${id} order by competencia desc limit 12
    `
    return { assinatura, faturas, em_aberto: faturas.find((f) => f.status === 'aberta' || f.status === 'vencida') ?? null }
  })
}
