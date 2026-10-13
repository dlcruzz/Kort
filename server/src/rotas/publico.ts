// Rotas públicas: o que a página de agendamento (kort.app/b/<slug>) usa.
// Ninguém está logado aqui, então tudo é validado e limitado por IP.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sql } from '../db.js'
import { conflito, invalido, naoEncontrado, proibido } from '../erros.js'
import { horariosDeVarios, horariosLivres } from '../lib/agenda.js'
import { enfileirar, modeloDe, montarTexto, registrarEvento } from '../lib/mensagens.js'
import { dataCurtaBR, horaBR, hhmmParaMin, hojeNoFuso, instante, diasEntre } from '../lib/tempo.js'
import { linkMeuHorario, tokenDoAgendamento, tokenValido } from '../lib/token.js'
import { telefoneE164 } from '../lib/dinheiro.js'
import { config } from '../config.js'

interface BarbeariaPublica {
  id: string
  slug: string
  nome: string
  descricao: string | null
  whatsapp: string | null
  instagram: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  logo_url: string | null
  capa_url: string | null
  fuso_horario: string
  antecedencia_cancelamento_min: number
  antecedencia_max_dias: number
  intervalo_slots_min: number
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')
const horaHHMM = z.string().regex(/^\d{2}:\d{2}$/, 'Hora no formato HH:MM')

/** Barbearia publicada e com assinatura válida, ou 404 */
async function barbeariaPorSlug(slug: string) {
  const [b] = await sql<BarbeariaPublica[]>`
    select b.id, b.slug, b.nome, b.descricao, b.whatsapp, b.instagram, b.logradouro, b.numero, b.bairro, b.cidade, b.uf,
           b.logo_url, b.capa_url, b.fuso_horario, b.antecedencia_cancelamento_min, b.antecedencia_max_dias, b.intervalo_slots_min
    from barbearias b
    join assinaturas_saas a on a.barbearia_id = b.id
    where b.slug = ${slug} and b.publicada and a.status in ('teste', 'ativa', 'inadimplente')
  `
  if (!b) throw naoEncontrado('Barbearia', true)
  return b
}

/** Serviços escolhidos, na ordem, com duração e preço (do barbeiro, se tiver) */
async function servicosEscolhidos(barbeariaId: string, ids: string[]) {
  const linhas = await sql<{ id: string; nome: string; preco_centavos: number; duracao_min: number; intervalo_min: number; membros: string[] }[]>`
    select s.id, s.nome, s.preco_centavos, s.duracao_min, s.intervalo_min,
           coalesce(array_agg(sm.membro_id) filter (where sm.membro_id is not null), '{}') as membros
    from servicos s
    left join servico_membros sm on sm.servico_id = s.id
    where s.barbearia_id = ${barbeariaId} and s.ativo and s.id = any(${ids}::uuid[])
    group by s.id
  `
  if (linhas.length !== new Set(ids).size) throw invalido('Algum serviço escolhido não existe mais. Recarregue a página.')
  return ids.map((id) => linhas.find((l) => l.id === id)!)
}

/** Barbeiros ativos que fazem todos os serviços */
async function barbeirosAptos(barbeariaId: string, servicos: { membros: string[] }[]) {
  const membros = await sql<{ id: string }[]>`
    select id from membros where barbearia_id = ${barbeariaId} and ativo and atende order by ordem
  `
  return membros.map((m) => m.id).filter((id) => servicos.every((s) => s.membros.includes(id)))
}

function validarData(b: BarbeariaPublica, data: string) {
  const hoje = hojeNoFuso(b.fuso_horario)
  if (data < hoje) throw invalido('Esse dia já passou.')
  if (diasEntre(hoje, data) > b.antecedencia_max_dias) throw invalido(`Dá para marcar com até ${b.antecedencia_max_dias} dias de antecedência.`)
}

export async function rotasPublicas(app: FastifyInstance) {
  // ---------------------------------------------------------------
  // Dados da página da barbearia
  app.get('/publico/barbearias/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params)
    const b = await barbeariaPorSlug(slug)
    const [servicos, membros, horarios, avaliacoes, nota, promocoes] = await Promise.all([
      sql`
        select s.id, s.nome, s.descricao, s.preco_centavos, s.duracao_min,
               coalesce(array_agg(sm.membro_id) filter (where sm.membro_id is not null), '{}') as membros
        from servicos s left join servico_membros sm on sm.servico_id = s.id
        where s.barbearia_id = ${b.id} and s.ativo
        group by s.id order by s.ordem, s.nome`,
      sql`
        select id, nome_exibicao, foto_url, bio, cor_agenda
        from membros where barbearia_id = ${b.id} and ativo and atende order by ordem`,
      sql`select dia_semana, abre::text, fecha::text from horarios_funcionamento where barbearia_id = ${b.id} order by dia_semana, abre`,
      sql`
        select a.nota, a.comentario, a.criado_em, split_part(c.nome, ' ', 1) as cliente, m.nome_exibicao as barbeiro
        from avaliacoes a
        left join clientes c on c.id = a.cliente_id
        left join membros m on m.id = a.membro_id
        where a.barbearia_id = ${b.id} and a.publica and a.comentario is not null
        order by a.criado_em desc limit 6`,
      sql`select round(avg(nota)::numeric, 1) as media, count(*)::int as total from avaliacoes where barbearia_id = ${b.id}`,
      sql`select nome, dia_semana, hora_inicio::text, hora_fim::text, servico_id, tipo, valor from promocoes
          where barbearia_id = ${b.id} and ativo and (valido_ate is null or valido_ate >= current_date)`,
    ])
    return { barbearia: b, servicos, membros, horarios, avaliacoes, nota: nota[0], promocoes }
  })

  // ---------------------------------------------------------------
  // Horários livres de um dia
  app.get('/publico/barbearias/:slug/horarios', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params)
    const q = z
      .object({
        data: dataISO,
        servicos: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.string().uuid()).min(1, 'Escolha um serviço')),
        membro: z.string().default('qualquer'),
      })
      .parse(req.query)
    const b = await barbeariaPorSlug(slug)
    validarData(b, q.data)
    const servs = await servicosEscolhidos(b.id, q.servicos)
    const aptos = await barbeirosAptos(b.id, servs)
    const quem = q.membro === 'qualquer' ? aptos : aptos.filter((id) => id === q.membro)
    if (!quem.length) throw invalido('Esse barbeiro não faz todos os serviços escolhidos.')
    const duracao = servs.reduce((t, s) => t + s.duracao_min, 0)
    const horarios = await horariosDeVarios(sql, quem, {
      barbeariaId: b.id, data: q.data, duracao, grade: b.intervalo_slots_min, fuso: b.fuso_horario,
    })
    return { data: q.data, duracao, horarios }
  })

  // ---------------------------------------------------------------
  // Marcar horário
  const CorpoAgendar = z.object({
    servicos: z.array(z.string().uuid()).min(1, 'Escolha pelo menos um serviço').max(6),
    membro: z.string().default('qualquer'),
    data: dataISO,
    hora: horaHHMM,
    nome: z.string().trim().min(2, 'Escreva seu nome').max(80),
    telefone: z.string().min(10, 'Informe o WhatsApp com DDD'),
    observacao: z.string().trim().max(300).optional(),
    codigo_indicacao: z.string().trim().max(30).optional(),
  })

  app.post('/publico/barbearias/:slug/agendamentos', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (req, res) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params)
    const c = CorpoAgendar.parse(req.body)
    const tel = telefoneE164(c.telefone)
    if (!tel) throw invalido('Confira o número com DDD.')

    const b = await barbeariaPorSlug(slug)
    validarData(b, c.data)
    const servs = await servicosEscolhidos(b.id, c.servicos)
    const aptos = await barbeirosAptos(b.id, servs)
    const candidatos = c.membro === 'qualquer' ? aptos : aptos.filter((id) => id === c.membro)
    if (!candidatos.length) throw invalido('Esse barbeiro não faz todos os serviços escolhidos.')
    const duracao = servs.reduce((t, s) => t + s.duracao_min, 0)
    const minuto = hhmmParaMin(c.hora)

    // escolhe o primeiro barbeiro (na ordem da casa) livre nesse horário
    let membroId: string | null = null
    for (const id of candidatos) {
      const livres = await horariosLivres(sql, { barbeariaId: b.id, membroId: id, data: c.data, duracao, grade: b.intervalo_slots_min, fuso: b.fuso_horario })
      if (livres.includes(minuto)) {
        membroId = id
        break
      }
    }
    if (!membroId) throw conflito('Esse horário acabou de ser ocupado. Escolha outro.')

    const inicio = instante(c.data, c.hora, b.fuso_horario)
    const fim = new Date(inicio.getTime() + duracao * 60000)
    const total = servs.reduce((t, s) => t + s.preco_centavos, 0)

    const ag = await sql.begin(async (tx) => {
      // cliente: acha pelo telefone ou cria
      const [indicador] = c.codigo_indicacao
        ? await tx<{ id: string }[]>`select id from clientes where barbearia_id = ${b.id} and upper(codigo_indicacao) = upper(${c.codigo_indicacao})`
        : [undefined]
      const [cliente] = await tx<{ id: string; nome: string; aceita_mensagens: boolean }[]>`
        insert into clientes (barbearia_id, nome, telefone, membro_preferido_id, indicado_por_id, consentimento_lgpd_em)
        values (${b.id}, ${c.nome}, ${tel}, ${membroId}, ${indicador?.id ?? null}, now())
        on conflict (barbearia_id, telefone) do update set consentimento_lgpd_em = coalesce(clientes.consentimento_lgpd_em, now())
        returning id, nome, aceita_mensagens
      `
      let novo
      try {
        ;[novo] = await tx<{ id: string }[]>`
          insert into agendamentos (barbearia_id, cliente_id, membro_id, inicio, fim, status, origem, valor_previsto_centavos, observacao_cliente)
          values (${b.id}, ${cliente.id}, ${membroId}, ${inicio}, ${fim}, 'agendado', 'link', ${total}, ${c.observacao ?? null})
          returning id
        `
      } catch (e) {
        // a trava do banco (agendamento_sem_sobreposicao) pegou dois pedidos ao mesmo tempo
        if ((e as { code?: string }).code === '23P01') throw conflito('Esse horário acabou de ser ocupado. Escolha outro.')
        throw e
      }
      for (const [i, s] of servs.entries()) {
        await tx`
          insert into agendamento_servicos (agendamento_id, barbearia_id, servico_id, nome, preco_centavos, duracao_min, ordem)
          values (${novo.id}, ${b.id}, ${s.id}, ${s.nome}, ${s.preco_centavos}, ${s.duracao_min}, ${i})
        `
      }
      // confirmação no WhatsApp
      const modelo = cliente.aceita_mensagens ? await modeloDe(tx, b.id, 'confirmacao') : null
      if (modelo) {
        const [m] = await tx<{ nome_exibicao: string }[]>`select nome_exibicao from membros where id = ${membroId}`
        await enfileirar(tx, {
          barbeariaId: b.id, tipo: 'confirmacao', destino: tel, clienteId: cliente.id, agendamentoId: novo.id,
          conteudo: montarTexto(modelo, {
            cliente: c.nome.split(' ')[0], barbeiro: m.nome_exibicao, data: dataCurtaBR(inicio, b.fuso_horario),
            horario: c.hora, servico: servs.map((s) => s.nome).join(' + '), barbearia: b.nome, link: linkMeuHorario(b.slug, novo.id),
          }),
        })
      }
      return novo
    })

    res.status(201)
    return {
      id: ag.id,
      token: tokenDoAgendamento(ag.id),
      membro_id: membroId,
      inicio,
      fim,
      valor_previsto_centavos: total,
      servicos: servs.map((s) => ({ id: s.id, nome: s.nome, preco_centavos: s.preco_centavos, duracao_min: s.duracao_min })),
      link: linkMeuHorario(b.slug, ag.id),
    }
  })

  // ---------------------------------------------------------------
  // "Meu horário": ver, remarcar, cancelar e avaliar com o token do link
  async function agendamentoComToken(id: string, token: string | undefined) {
    if (!tokenValido(id, token)) throw proibido('Link inválido. Use o link que chegou no seu WhatsApp.')
    const [a] = await sql<
      {
        id: string; status: string; inicio: Date; fim: Date; membro_id: string; barbeiro: string; valor_previsto_centavos: number
        barbearia_id: string; slug: string; barbearia: string; fuso_horario: string; antecedencia_cancelamento_min: number
        intervalo_slots_min: number; antecedencia_max_dias: number; cliente_id: string; whatsapp: string | null
      }[]
    >`
      select a.id, a.status, a.inicio, a.fim, a.membro_id, m.nome_exibicao as barbeiro, a.valor_previsto_centavos,
             b.id as barbearia_id, b.slug, b.nome as barbearia, b.fuso_horario, b.antecedencia_cancelamento_min,
             b.intervalo_slots_min, b.antecedencia_max_dias, a.cliente_id, b.whatsapp
      from agendamentos a join barbearias b on b.id = a.barbearia_id join membros m on m.id = a.membro_id
      where a.id = ${id}
    `
    if (!a) throw naoEncontrado('Horário')
    return a
  }
  const podeMudar = (a: { status: string; inicio: Date; antecedencia_cancelamento_min: number }) =>
    (a.status === 'agendado' || a.status === 'confirmado') && a.inicio.getTime() - Date.now() >= a.antecedencia_cancelamento_min * 60000

  app.get('/publico/agendamentos/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { t } = z.object({ t: z.string().optional() }).parse(req.query)
    const a = await agendamentoComToken(id, t)
    const servicos = await sql`select nome, preco_centavos, duracao_min from agendamento_servicos where agendamento_id = ${id} order by ordem`
    return {
      id: a.id, status: a.status, inicio: a.inicio, fim: a.fim, barbeiro: a.barbeiro, valor_previsto_centavos: a.valor_previsto_centavos,
      barbearia: { slug: a.slug, nome: a.barbearia, whatsapp: a.whatsapp }, servicos, pode_mudar: podeMudar(a),
      antecedencia_cancelamento_min: a.antecedencia_cancelamento_min,
    }
  })

  app.post('/publico/agendamentos/:id/cancelar', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { token } = z.object({ token: z.string() }).parse(req.body)
    const a = await agendamentoComToken(id, token)
    if (!podeMudar(a)) throw invalido(`Faltam menos de ${a.antecedencia_cancelamento_min / 60} horas. Chame a barbearia no WhatsApp.`)
    await sql`update agendamentos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = 'Cancelado pelo cliente' where id = ${id}`
    await avisarListaDeEspera(a.barbearia_id, a.slug, a.barbearia, a.inicio, a.membro_id, a.barbeiro, a.fuso_horario)
    return { ok: true }
  })

  app.post('/publico/agendamentos/:id/remarcar', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const c = z.object({ token: z.string(), data: dataISO, hora: horaHHMM }).parse(req.body)
    const a = await agendamentoComToken(id, c.token)
    if (!podeMudar(a)) throw invalido('Não dá mais para mudar este horário pelo link. Chame a barbearia no WhatsApp.')
    const duracao = (a.fim.getTime() - a.inicio.getTime()) / 60000
    const livres = await horariosLivres(sql, {
      barbeariaId: a.barbearia_id, membroId: a.membro_id, data: c.data, duracao, grade: a.intervalo_slots_min, fuso: a.fuso_horario, ignorarAgendamentoId: id,
    })
    if (!livres.includes(hhmmParaMin(c.hora))) throw conflito('Esse horário não está mais livre.')
    const inicio = instante(c.data, c.hora, a.fuso_horario)
    try {
      await sql`
        update agendamentos set inicio = ${inicio}, fim = ${new Date(inicio.getTime() + duracao * 60000)}, status = 'agendado', confirmado_em = null
        where id = ${id}
      `
    } catch (e) {
      if ((e as { code?: string }).code === '23P01') throw conflito('Esse horário acabou de ser ocupado.')
      throw e
    }
    // lembretes antigos que ainda não saíram ficam inválidos
    await sql`update mensagens set status = 'cancelada' where agendamento_id = ${id} and status = 'pendente' and tipo in ('lembrete_24h', 'lembrete_2h')`
    await avisarListaDeEspera(a.barbearia_id, a.slug, a.barbearia, a.inicio, a.membro_id, a.barbeiro, a.fuso_horario)
    await registrarEvento(sql, a.barbearia_id, 'agendamento.remarcado', null, { origem: 'link' })
    return { ok: true, inicio }
  })

  app.post('/publico/agendamentos/:id/avaliacao', async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const c = z.object({ token: z.string(), nota: z.number().int().min(1).max(5), comentario: z.string().trim().max(500).optional() }).parse(req.body)
    const a = await agendamentoComToken(id, c.token)
    if (a.status !== 'concluido') throw invalido('Dá para avaliar depois do atendimento.')
    await sql`
      insert into avaliacoes (barbearia_id, agendamento_id, cliente_id, membro_id, nota, comentario)
      values (${a.barbearia_id}, ${id}, ${a.cliente_id}, ${a.membro_id}, ${c.nota}, ${c.comentario || null})
      on conflict (agendamento_id) do update set nota = excluded.nota, comentario = excluded.comentario
    `
    res.status(201)
    return { ok: true }
  })

  // ---------------------------------------------------------------
  // Lista de espera pelo link
  app.post('/publico/barbearias/:slug/lista-espera', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, res) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params)
    const c = z
      .object({
        nome: z.string().trim().min(2).max(80), telefone: z.string(), data: dataISO,
        servico_id: z.string().uuid().optional(), membro_id: z.string().uuid().optional(),
        hora_de: horaHHMM.optional(), hora_ate: horaHHMM.optional(),
      })
      .parse(req.body)
    const tel = telefoneE164(c.telefone)
    if (!tel) throw invalido('Confira o número com DDD.')
    const b = await barbeariaPorSlug(slug)
    validarData(b, c.data)
    const [cliente] = await sql<{ id: string }[]>`
      insert into clientes (barbearia_id, nome, telefone) values (${b.id}, ${c.nome}, ${tel})
      on conflict (barbearia_id, telefone) do update set nome = clientes.nome returning id
    `
    await sql`
      insert into lista_espera (barbearia_id, cliente_id, membro_id, servico_id, data, hora_de, hora_ate)
      values (${b.id}, ${cliente.id}, ${c.membro_id ?? null}, ${c.servico_id ?? null}, ${c.data}, ${c.hora_de ?? null}, ${c.hora_ate ?? null})
    `
    await registrarEvento(sql, b.id, 'lista_espera.adicionado', null, { origem: 'link' })
    res.status(201)
    return { ok: true }
  })
}

/**
 * Abriu uma vaga (cancelamento ou remarcação): avisa o primeiro da lista de
 * espera daquele dia que combina com o barbeiro e o horário.
 */
export async function avisarListaDeEspera(
  barbeariaId: string, slug: string, barbearia: string, inicio: Date, membroId: string, barbeiro: string, fuso: string,
) {
  const data = inicio.toLocaleDateString('sv-SE', { timeZone: fuso })
  const hora = horaBR(inicio, fuso)
  const [l] = await sql<{ id: string; cliente_id: string; nome: string; telefone: string }[]>`
    select l.id, l.cliente_id, c.nome, c.telefone
    from lista_espera l join clientes c on c.id = l.cliente_id
    where l.barbearia_id = ${barbeariaId} and l.status = 'aguardando' and l.data = ${data}
      and (l.membro_id is null or l.membro_id = ${membroId})
      and (l.hora_de is null or l.hora_de <= ${hora}::time)
      and (l.hora_ate is null or l.hora_ate >= ${hora}::time)
      and c.aceita_mensagens
    order by l.criado_em
    limit 1
  `
  if (!l) return
  const modelo = await modeloDe(sql, barbeariaId, 'lista_espera')
  if (!modelo) return
  await enfileirar(sql, {
    barbeariaId, tipo: 'lista_espera', destino: l.telefone, clienteId: l.cliente_id,
    conteudo: montarTexto(modelo, {
      cliente: l.nome.split(' ')[0], data: dataCurtaBR(inicio, fuso), horario: hora, barbeiro, barbearia,
      link: `${config.LINK_PUBLICO_BASE}/b/${slug}`,
    }),
  })
  await sql`update lista_espera set status = 'avisado', avisado_em = now() where id = ${l.id}`
}

