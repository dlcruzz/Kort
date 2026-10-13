// Agenda os lembretes de 24h e de 2h dos horários marcados.
// Roda a cada minuto e é idempotente: nunca cria o mesmo lembrete duas vezes.

import { sql } from '../db.js'
import { config } from '../config.js'
import { enfileirar, modeloDe, montarTexto } from '../lib/mensagens.js'
import { dataCurtaBR, horaBR } from '../lib/tempo.js'
import { linkMeuHorario } from '../lib/token.js'

interface Candidato {
  id: string
  barbearia_id: string
  inicio: Date
  cliente_id: string
  cliente: string
  telefone: string
  barbeiro: string
  barbearia: string
  slug: string
  fuso_horario: string
  servicos: string
}

const base = (tipo: 'lembrete_24h' | 'lembrete_2h', de: string, ate: string, folga: string) => sql<Candidato[]>`
  select a.id, a.barbearia_id, a.inicio, a.cliente_id, c.nome as cliente, c.telefone, m.nome_exibicao as barbeiro,
         b.nome as barbearia, b.slug, b.fuso_horario,
         (select string_agg(nome, ' + ' order by ordem) from agendamento_servicos s where s.agendamento_id = a.id) as servicos
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join membros m on m.id = a.membro_id
  join barbearias b on b.id = a.barbearia_id
  join assinaturas_saas ass on ass.barbearia_id = b.id and ass.status in ('teste', 'ativa', 'inadimplente')
  where a.status in ('agendado', 'confirmado')
    and a.inicio > now() + ${de}::interval and a.inicio <= now() + ${ate}::interval
    and a.criado_em < a.inicio - ${folga}::interval
    and c.aceita_mensagens
    and not exists (select 1 from mensagens x where x.agendamento_id = a.id and x.tipo = ${tipo} and x.status <> 'cancelada')
`

export async function gerarLembretes() {
  let criados = 0
  const tipos = [
    // lembrete do dia anterior: só para quem marcou com mais de 24h
    { tipo: 'lembrete_24h' as const, horas: 24, lista: await base('lembrete_24h', '2 hours', '25 hours', '24 hours') },
    // lembrete de 2h: só para quem marcou com mais de 2h30 de antecedência
    { tipo: 'lembrete_2h' as const, horas: 2, lista: await base('lembrete_2h', '0 minutes', '2 hours 10 minutes', '2 hours 30 minutes') },
  ]
  for (const { tipo, horas, lista } of tipos) {
    for (const a of lista) {
      const modelo = await modeloDe(sql, a.barbearia_id, tipo)
      if (!modelo) continue
      const quando = new Date(Math.max(Date.now(), a.inicio.getTime() - horas * 3600000))
      await enfileirar(sql, {
        barbeariaId: a.barbearia_id, tipo, destino: a.telefone, clienteId: a.cliente_id, agendamentoId: a.id, quando,
        conteudo: montarTexto(modelo, {
          cliente: a.cliente.split(' ')[0], barbeiro: a.barbeiro, barbearia: a.barbearia, servico: a.servicos ?? '',
          data: dataCurtaBR(a.inicio, a.fuso_horario), horario: horaBR(a.inicio, a.fuso_horario), link: linkMeuHorario(a.slug, a.id),
        }),
      })
      criados++
    }
  }
  return { criados, base_link: config.LINK_PUBLICO_BASE }
}
