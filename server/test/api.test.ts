// Testes de ponta a ponta num Postgres de verdade.
// Rodar: npm test (usa .env.test; o banco de teste é apagado e recriado).

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { SignJWT } from 'jose'
import { DateTime } from 'luxon'
import type { FastifyInstance } from 'fastify'

const aqui = (f: string) => fileURLToPath(new URL(f, import.meta.url))

// ---------- 1. recria o banco de teste antes de importar a API
const url = new URL(process.env.DATABASE_URL!)
const nomeBanco = url.pathname.slice(1)
const admin = postgres({ host: url.hostname, port: Number(url.port), user: url.username, database: 'postgres', onnotice: () => {} })
await admin.unsafe(`drop database if exists ${nomeBanco} with (force)`)
await admin.unsafe(`create database ${nomeBanco}`)
await admin.end()

const { sql } = await import('../src/db.js')
await sql.unsafe(readFileSync(aqui('./supabase-local.sql'), 'utf8'))
await sql.unsafe(readFileSync(aqui('../../supabase/schema.sql'), 'utf8'))

const { criarApp } = await import('../src/app.js')
const { trocarProvedor } = await import('../src/whatsapp/index.js')
const { gerarLembretes } = await import('../src/rotinas/lembretes.js')
const { enviarPendentes } = await import('../src/rotinas/fila.js')
const { rotinaMensalidades } = await import('../src/rotinas/mensalidades.js')
const { convidarDeVolta } = await import('../src/rotinas/retorno.js')

// ---------- 2. dados de exemplo
const DONO = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'
const ESTRANHO = '33333333-3333-4333-8333-333333333333'
let barbeariaId = ''
let donoMembro = ''
let pedro = ''
let corte = ''
let barba = ''

const enviadas: Array<{ telefone: string; texto: string }> = []
trocarProvedor({ nome: 'teste', enviar: async (telefone, texto) => (enviadas.push({ telefone, texto }), { idExterno: 'x' }) })

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))

const amanha = DateTime.now().setZone('America/Sao_Paulo').plus({ days: 1 }).toISODate()!
const hoje = DateTime.now().setZone('America/Sao_Paulo').toISODate()!

let app: FastifyInstance

before(async () => {
  await sql`
    insert into auth.users (id, email, raw_user_meta_data) values
      (${DONO}, 'dono@teste.com', '{"nome":"Zé Carlos","telefone":"+5511900000001"}'),
      (${ADMIN}, 'admin@kort.app', '{"nome":"Danilo"}'),
      (${ESTRANHO}, 'outro@teste.com', '{"nome":"Fulano"}')`
  await sql`update perfis set super_admin = true where id = ${ADMIN}`
  await sql`update planos set preco_centavos = case slug when 'solo' then 3990 when 'barbearia' then 7990 when 'pro' then 14990 else 0 end`
  ;[{ id: barbeariaId }] = await sql`insert into barbearias (slug, nome, criado_por, whatsapp) values ('teste', 'Barbearia Teste', ${DONO}, '+5511900000001') returning id`
  ;[{ id: donoMembro }] = await sql`select id from membros where barbearia_id = ${barbeariaId} and papel = 'dono'`
  ;[{ id: pedro }] = await sql`insert into membros (barbearia_id, nome_exibicao, papel, ordem) values (${barbeariaId}, 'Pedrinho', 'barbeiro', 1) returning id`
  for (let d = 0; d < 7; d++) {
    await sql`insert into horarios_funcionamento (barbearia_id, dia_semana, abre, fecha) values (${barbeariaId}, ${d}, '09:00', '20:00')`
    for (const m of [donoMembro, pedro]) {
      await sql`insert into jornadas (barbearia_id, membro_id, dia_semana, inicio, fim) values (${barbeariaId}, ${m}, ${d}, '09:00', '12:00'), (${barbeariaId}, ${m}, ${d}, '13:00', '20:00')`
    }
  }
  ;[{ id: corte }] = await sql`insert into servicos (barbearia_id, nome, preco_centavos, duracao_min) values (${barbeariaId}, 'Corte', 4500, 30) returning id`
  ;[{ id: barba }] = await sql`insert into servicos (barbearia_id, nome, preco_centavos, duracao_min) values (${barbeariaId}, 'Barba', 3000, 20) returning id`
  for (const s of [corte, barba]) for (const m of [donoMembro, pedro]) await sql`insert into servico_membros (servico_id, membro_id, barbearia_id) values (${s}, ${m}, ${barbeariaId})`
  app = await criarApp()
})

after(async () => {
  await app?.close()
  await sql.end()
})

// ---------- 3. testes
describe('saúde', () => {
  test('responde ok com o banco ligado', async () => {
    const r = await app.inject({ url: '/saude' })
    assert.equal(r.statusCode, 200)
    assert.equal(r.json().ok, true)
  })
})

describe('página pública e agendamento', () => {
  let ag: { id: string; token: string }

  test('mostra a barbearia, serviços e barbeiros', async () => {
    const r = await app.inject({ url: '/publico/barbearias/teste' })
    assert.equal(r.statusCode, 200)
    const j = r.json()
    assert.equal(j.barbearia.nome, 'Barbearia Teste')
    assert.equal(j.servicos.length, 2)
    assert.equal(j.membros.length, 2)
  })

  test('slug que não existe dá 404 em português', async () => {
    const r = await app.inject({ url: '/publico/barbearias/nao-existe' })
    assert.equal(r.statusCode, 404)
    assert.match(r.json().erro, /não encontrad/)
  })

  test('lista horários livres respeitando o almoço', async () => {
    const r = await app.inject({ url: `/publico/barbearias/teste/horarios?data=${amanha}&servicos=${corte}&membro=${donoMembro}` })
    assert.equal(r.statusCode, 200)
    const horas = r.json().horarios.map((h: { hora: string }) => h.hora)
    assert.ok(horas.includes('09:00'))
    assert.ok(horas.includes('11:30'))
    assert.ok(!horas.includes('12:00'), '12:00 é almoço')
    assert.ok(horas.includes('13:00'))
  })

  test('marca horário, cria cliente e enfileira a confirmação', async () => {
    const r = await app.inject({
      method: 'POST', url: '/publico/barbearias/teste/agendamentos',
      payload: { servicos: [corte, barba], membro: donoMembro, data: amanha, hora: '09:00', nome: 'Matheus Oliveira', telefone: '(11) 98765-4321' },
    })
    assert.equal(r.statusCode, 201, r.body)
    ag = r.json()
    assert.equal(r.json().valor_previsto_centavos, 7500)
    const [c] = await sql`select telefone from clientes where barbearia_id = ${barbeariaId} and nome = 'Matheus Oliveira'`
    assert.equal(c.telefone, '+5511987654321')
    const [m] = await sql`select tipo, conteudo from mensagens where agendamento_id = ${ag.id}`
    assert.equal(m.tipo, 'confirmacao')
    assert.match(m.conteudo, /Matheus/)
    assert.match(m.conteudo, /09:00/)
  })

  test('mesmo horário com o mesmo barbeiro dá 409', async () => {
    const r = await app.inject({
      method: 'POST', url: '/publico/barbearias/teste/agendamentos',
      payload: { servicos: [corte], membro: donoMembro, data: amanha, hora: '09:15', nome: 'Outro', telefone: '11999990000' },
    })
    assert.equal(r.statusCode, 409)
  })

  test('"quem estiver livre" pega o outro barbeiro', async () => {
    const r = await app.inject({
      method: 'POST', url: '/publico/barbearias/teste/agendamentos',
      payload: { servicos: [corte], membro: 'qualquer', data: amanha, hora: '09:00', nome: 'Gabriel Santos', telefone: '11988887777' },
    })
    assert.equal(r.statusCode, 201, r.body)
    assert.equal(r.json().membro_id, pedro)
  })

  test('dia passado é recusado com mensagem clara', async () => {
    const ontem = DateTime.fromISO(hoje).minus({ days: 1 }).toISODate()
    const r = await app.inject({
      method: 'POST', url: '/publico/barbearias/teste/agendamentos',
      payload: { servicos: [corte], data: ontem, hora: '10:00', nome: 'Teste', telefone: '11977776666' },
    })
    assert.equal(r.statusCode, 400)
    assert.match(r.json().erro, /passou/)
  })

  test('"meu horário" abre com o token e recusa sem ele', async () => {
    const ok = await app.inject({ url: `/publico/agendamentos/${ag.id}?t=${ag.token}` })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.json().servicos.length, 2)
    const ruim = await app.inject({ url: `/publico/agendamentos/${ag.id}?t=errado` })
    assert.equal(ruim.statusCode, 403)
  })

  test('remarca para um horário livre', async () => {
    const r = await app.inject({ method: 'POST', url: `/publico/agendamentos/${ag.id}/remarcar`, payload: { token: ag.token, data: amanha, hora: '10:00' } })
    assert.equal(r.statusCode, 200, r.body)
    const [a] = await sql`select inicio from agendamentos where id = ${ag.id}`
    assert.equal(DateTime.fromJSDate(a.inicio).setZone('America/Sao_Paulo').toFormat('HH:mm'), '10:00')
  })

  test('cancelar avisa o primeiro da lista de espera', async () => {
    const le = await app.inject({
      method: 'POST', url: '/publico/barbearias/teste/lista-espera',
      payload: { nome: 'Lucas Ferreira', telefone: '11966665555', data: amanha, hora_de: '09:00', hora_ate: '12:00' },
    })
    assert.equal(le.statusCode, 201)
    const r = await app.inject({ method: 'POST', url: `/publico/agendamentos/${ag.id}/cancelar`, payload: { token: ag.token } })
    assert.equal(r.statusCode, 200)
    const [a] = await sql`select status from agendamentos where id = ${ag.id}`
    assert.equal(a.status, 'cancelado')
    const [m] = await sql`select conteudo from mensagens where tipo = 'lista_espera'`
    assert.match(m.conteudo, /Lucas/)
    const [l] = await sql`select status from lista_espera`
    assert.equal(l.status, 'avisado')
  })
})

describe('rotinas de mensagem', () => {
  test('cria lembrete de 24h e a fila envia', async () => {
    const [cli] = await sql`select id from clientes limit 1`
    const inicio = new Date(Date.now() + 23 * 3600000)
    await sql`
      insert into agendamentos (barbearia_id, cliente_id, membro_id, inicio, fim, status, origem, criado_em)
      values (${barbeariaId}, ${cli.id}, ${pedro}, ${inicio}, ${new Date(inicio.getTime() + 1800000)}, 'confirmado', 'balcao', now() - interval '3 days')`
    const g = await gerarLembretes()
    assert.equal(g.criados, 1)
    assert.equal((await gerarLembretes()).criados, 0, 'não duplica')
    const antes = enviadas.length
    const f = await enviarPendentes()
    assert.ok(f.enviadas >= 2, 'confirmações + lembrete')
    assert.ok(enviadas.slice(antes).some((e) => /Amanhã/.test(e.texto)))
    const [{ n }] = await sql`select count(*)::int as n from mensagens where status = 'pendente'`
    assert.equal(n, 0)
  })

  test('convida de volta quem chegou no dia de retorno', async () => {
    await sql`update clientes set proximo_retorno_previsto = ${hoje} where nome = 'Gabriel Santos'`
    await sql`update agendamentos set status = 'concluido' where cliente_id in (select id from clientes where nome = 'Gabriel Santos')`
    const r = await convidarDeVolta(hoje)
    assert.equal(r.criados, 1)
    assert.equal((await convidarDeVolta(hoje)).criados, 0, 'não chama duas vezes na semana')
  })
})

describe('login e permissões', () => {
  test('sem token dá 401', async () => {
    const r = await app.inject({ url: '/eu' })
    assert.equal(r.statusCode, 401)
  })

  test('dono vê a própria barbearia', async () => {
    const r = await app.inject({ url: '/eu', headers: { authorization: `Bearer ${await token(DONO)}` } })
    assert.equal(r.statusCode, 200)
    assert.equal(r.json().barbearias[0].id, barbeariaId)
  })

  test('quem não é da barbearia leva 403', async () => {
    const r = await app.inject({ url: `/barbearias/${barbeariaId}/mensalidade`, headers: { authorization: `Bearer ${await token(ESTRANHO)}` } })
    assert.equal(r.statusCode, 403)
  })

  test('dinheiro na mesa calcula para o dono', async () => {
    const r = await app.inject({
      url: `/barbearias/${barbeariaId}/relatorios/dinheiro-na-mesa?de=${DateTime.fromISO(hoje).minus({ days: 30 }).toISODate()}&ate=${hoje}`,
      headers: { authorization: `Bearer ${await token(DONO)}` },
    })
    assert.equal(r.statusCode, 200, r.body)
    assert.equal(r.json().itens.length, 3)
  })

  test('painel admin só para o super admin', async () => {
    const dono = await app.inject({ url: '/admin/indicadores', headers: { authorization: `Bearer ${await token(DONO)}` } })
    assert.equal(dono.statusCode, 403)
    const adm = await app.inject({ url: '/admin/indicadores', headers: { authorization: `Bearer ${await token(ADMIN)}` } })
    assert.equal(adm.statusCode, 200)
    assert.equal(adm.json().em_teste, 1)
    const lista = await app.inject({ url: '/admin/barbearias', headers: { authorization: `Bearer ${await token(ADMIN)}` } })
    assert.equal(lista.json()[0].responsavel, 'Zé Carlos')
  })
})

describe('mensalidade do Kort', () => {
  let faturaId = ''

  test('fim do teste gera a primeira fatura com Pix', async () => {
    await sql`update assinaturas_saas set teste_ate = ${hoje}::date - 1 where barbearia_id = ${barbeariaId}`
    const r = await rotinaMensalidades(hoje)
    assert.equal(r.testes_encerrados, 1)
    assert.equal(r.faturas_criadas, 1)
    const [f] = await sql`select id, valor_centavos, pix_copia_cola, status from faturas where barbearia_id = ${barbeariaId}`
    faturaId = f.id
    assert.equal(f.valor_centavos, 7990)
    assert.match(f.pix_copia_cola, /^000201.*br\.gov\.bcb\.pix.*6304[0-9A-F]{4}$/)
    const m = await app.inject({ url: `/barbearias/${barbeariaId}/mensalidade`, headers: { authorization: `Bearer ${await token(DONO)}` } })
    assert.equal(m.json().em_aberto.id, faturaId)
  })

  test('webhook do gateway dá baixa uma vez só', async () => {
    const payload = { event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: faturaId, transactionID: 'tx-1' } }
    const semToken = await app.inject({ method: 'POST', url: '/webhooks/woovi', payload })
    assert.equal(semToken.statusCode, 401)
    const r = await app.inject({ method: 'POST', url: '/webhooks/woovi', payload, headers: { 'x-webhook-token': 'token-do-webhook' } })
    assert.equal(r.statusCode, 200, r.body)
    const [f] = await sql`select status from faturas where id = ${faturaId}`
    assert.equal(f.status, 'paga')
    const de_novo = await app.inject({ method: 'POST', url: '/webhooks/woovi', payload, headers: { 'x-webhook-token': 'token-do-webhook' } })
    assert.equal(de_novo.json().repetido, true)
  })

  test('admin suspende e a página pública sai do ar', async () => {
    const r = await app.inject({
      method: 'POST', url: `/admin/barbearias/${barbeariaId}/status`, payload: { status: 'suspensa' },
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
    })
    assert.equal(r.statusCode, 200)
    const p = await app.inject({ url: '/publico/barbearias/teste' })
    assert.equal(p.statusCode, 404)
    const [log] = await sql`select acao from admin_logs where barbearia_id = ${barbeariaId} order by criado_em desc limit 1`
    assert.equal(log.acao, 'suspender')
  })
})
