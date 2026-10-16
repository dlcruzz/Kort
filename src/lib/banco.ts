// Leitura do banco (Supabase) para o formato que as telas usam (Estado).
//
// As telas foram feitas em cima de um objeto "Estado" único. No modo real
// ele é montado aqui, a partir das tabelas, e depois cada ação do store
// grava a mudança no banco (veja persistencia em store.tsx).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Estado } from '../data/seed'
import type {
  Agendamento, AssinaturaClube, Avaliacao, Comanda, Fatura, Mensagem, ProgramaFidelidade, Servico, StatusAssinSaas, Sugestao,
} from './types'
import { isoDia, somaDias } from './format'

type Linha = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null)
const hhmm = (v: string) => v.slice(0, 5)

export class ErroBanco extends Error {}

/** Traduz os erros do Postgres/PostgREST para algo que dá para mostrar na tela. */
export function mensagemDeErro(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string }
  const msg = err?.message ?? String(e)
  if (err?.code === '23P01' || msg.includes('agendamento_sem_sobreposicao')) return 'Esse barbeiro já tem horário nesse período.'
  if (err?.code === '23505') {
    if (msg.includes('telefone')) return 'Já existe um cliente com esse telefone.'
    if (msg.includes('slug')) return 'Esse link já é de outra barbearia.'
    if (msg.includes('codigo')) return 'Já existe um cupom com esse código.'
    return 'Esse cadastro já existe.'
  }
  if (err?.code === '42501' || msg.includes('row-level security')) return 'Você não tem permissão para isso. Fale com o dono da barbearia.'
  if (err?.code === '23503') return 'Esse item está sendo usado em outro lugar e não pode ser removido.'
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'Sem internet. A mudança não foi salva.'
  return msg
}

export function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error
  return r.data
}

/** Busca todas as linhas (o Supabase devolve no máximo 1000 por vez). */
async function tudo(montar: (de: number, ate: number) => PromiseLike<{ data: Linha[] | null; error: unknown }>): Promise<Linha[]> {
  const out: Linha[] = []
  const passo = 1000
  for (let de = 0; ; de += passo) {
    const data = ok(await montar(de, de + passo - 1)) ?? []
    out.push(...data)
    if (data.length < passo) return out
  }
}

// ---------- mapeadores (linha do banco -> tipo da tela)

export function mapAgendamento(a: Linha): Agendamento & { token_publico?: string; mensagem_origem_id?: string | null } {
  return {
    id: a.id,
    cliente_id: a.cliente_id,
    membro_id: a.membro_id,
    inicio: iso(a.inicio)!,
    fim: iso(a.fim)!,
    status: a.status,
    origem: a.origem,
    valor_previsto_centavos: a.valor_previsto_centavos,
    observacao_cliente: a.observacao_cliente,
    confirmado_em: iso(a.confirmado_em),
    criado_em: iso(a.criado_em)!,
    token_publico: a.token_publico,
    mensagem_origem_id: a.mensagem_origem_id,
    servicos: [...(a.agendamento_servicos ?? [])]
      .sort((x: Linha, y: Linha) => x.ordem - y.ordem)
      .map((s: Linha) => ({ servico_id: s.servico_id, nome: s.nome, preco_centavos: s.preco_centavos, duracao_min: s.duracao_min })),
  }
}

export function mapComanda(c: Linha): Comanda {
  return {
    id: c.id,
    agendamento_id: c.agendamento_id,
    cliente_id: c.cliente_id,
    membro_id: c.membro_id,
    status: c.status,
    desconto_centavos: c.desconto_centavos,
    forma_pagamento: c.forma_pagamento,
    pago_em: iso(c.pago_em),
    criado_em: iso(c.criado_em)!,
    itens: (c.comanda_itens ?? []).map((i: Linha) => ({
      id: i.id, tipo: i.tipo, servico_id: i.servico_id, produto_id: i.produto_id, membro_id: i.membro_id,
      descricao: i.descricao, quantidade: i.quantidade, preco_unit_centavos: i.preco_unit_centavos, comissao_pct: Number(i.comissao_pct),
    })),
  }
}

const SEL_AGENDAMENTO = 'id, cliente_id, membro_id, inicio, fim, status, origem, valor_previsto_centavos, observacao_cliente, confirmado_em, criado_em, token_publico, mensagem_origem_id, agendamento_servicos(servico_id, nome, preco_centavos, duracao_min, ordem)'
const SEL_COMANDA = 'id, agendamento_id, cliente_id, membro_id, status, desconto_centavos, forma_pagamento, pago_em, criado_em, comanda_itens(id, tipo, servico_id, produto_id, membro_id, descricao, quantidade, preco_unit_centavos, comissao_pct)'

export async function buscarAgendamento(sb: SupabaseClient, id: string) {
  const r = ok(await sb.from('agendamentos').select(SEL_AGENDAMENTO).eq('id', id).maybeSingle())
  return r ? mapAgendamento(r) : null
}

/** Horários criados ou mudados depois de `desde` (a checagem de 30 em 30 s). */
export async function buscarAgendamentosAlterados(sb: SupabaseClient, barbeariaId: string, desde: string) {
  const r = ok(await sb.from('agendamentos').select(SEL_AGENDAMENTO).eq('barbearia_id', barbeariaId).gte('atualizado_em', desde).limit(200))
  return (r ?? []).map(mapAgendamento)
}

export async function buscarCliente(sb: SupabaseClient, id: string) {
  return ok(await sb.from('clientes').select('*').eq('id', id).maybeSingle())
}

/** Monta o Estado inteiro da barbearia. Histórico: últimos 13 meses. */
export async function carregarEstado(sb: SupabaseClient, barbeariaId: string, perfilId: string): Promise<Estado> {
  const desde = somaDias(new Date(), -400).toISOString()
  const desdeDia = isoDia(somaDias(new Date(), -400))
  const competencia = isoDia(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  const [
    barbearia, membros, configs, horarios, jornadas, bloqueios, servicos, servMembros, clientes, agendamentos, comandas,
    produtos, despesas, alugueis, lista, modelos, mensagens, cupons, promocoes, fidel, movFidel, planosClube, assinClube,
    pagClube, avaliacoes, portfolio, faturas, sugestoes, votos, assinatura,
  ] = await Promise.all([
    sb.from('barbearias').select('*').eq('id', barbeariaId).single().then(ok),
    sb.from('membros').select('*').eq('barbearia_id', barbeariaId).order('ordem').then(ok),
    sb.from('membro_configuracoes').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('horarios_funcionamento').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('jornadas').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('bloqueios').select('*').eq('barbearia_id', barbeariaId).gte('fim', somaDias(new Date(), -60).toISOString()).then(ok),
    sb.from('servicos').select('*').eq('barbearia_id', barbeariaId).order('ordem').then(ok),
    sb.from('servico_membros').select('servico_id, membro_id').eq('barbearia_id', barbeariaId).then(ok),
    tudo((de, ate) => sb.from('clientes').select('*').eq('barbearia_id', barbeariaId).order('criado_em').range(de, ate)),
    tudo((de, ate) => sb.from('agendamentos').select(SEL_AGENDAMENTO).eq('barbearia_id', barbeariaId).gte('inicio', desde).order('inicio').range(de, ate)),
    tudo((de, ate) => sb.from('comandas').select(SEL_COMANDA).eq('barbearia_id', barbeariaId).gte('criado_em', desde).order('criado_em').range(de, ate)),
    sb.from('produtos').select('*').eq('barbearia_id', barbeariaId).order('nome').then(ok),
    tudo((de, ate) => sb.from('despesas').select('*').eq('barbearia_id', barbeariaId).gte('data', desdeDia).order('data').range(de, ate)),
    sb.from('alugueis_cadeira').select('*').eq('barbearia_id', barbeariaId).gte('competencia', desdeDia).then(ok),
    sb.from('lista_espera').select('*').eq('barbearia_id', barbeariaId).gte('data', isoDia(somaDias(new Date(), -30))).then(ok),
    sb.from('modelos_mensagem').select('*').eq('barbearia_id', barbeariaId).then(ok),
    tudo((de, ate) => sb.from('mensagens').select('id, cliente_id, agendamento_id, tipo, conteudo, status, enviada_em, criado_em').eq('barbearia_id', barbeariaId).gte('criado_em', desde).order('criado_em').range(de, ate)),
    sb.from('cupons').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('promocoes').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('programas_fidelidade').select('*').eq('barbearia_id', barbeariaId).maybeSingle().then(ok),
    tudo((de, ate) => sb.from('fidelidade_movimentos').select('id, cliente_id, tipo, pontos, criado_em').eq('barbearia_id', barbeariaId).order('criado_em').range(de, ate)),
    sb.from('planos_clube').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('assinaturas_clube').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('pagamentos_clube').select('assinatura_clube_id, status').eq('barbearia_id', barbeariaId).eq('competencia', competencia).then(ok),
    sb.from('avaliacoes').select('*').eq('barbearia_id', barbeariaId).order('criado_em', { ascending: false }).then(ok),
    sb.from('fotos_portfolio').select('*').eq('barbearia_id', barbeariaId).then(ok),
    sb.from('faturas').select('*').eq('barbearia_id', barbeariaId).order('competencia').then(ok),
    sb.from('sugestoes').select('*').order('criado_em', { ascending: false }).limit(200).then(ok),
    sb.from('sugestao_votos').select('sugestao_id, perfil_id').then(ok),
    sb.from('assinaturas_saas').select('*, planos(slug, nome, preco_centavos)').eq('barbearia_id', barbeariaId).maybeSingle().then(ok),
  ])

  const membrosDoServico = new Map<string, string[]>()
  for (const sm of servMembros ?? []) membrosDoServico.set(sm.servico_id, [...(membrosDoServico.get(sm.servico_id) ?? []), sm.membro_id])

  const ags = agendamentos.map(mapAgendamento)
  const vieramDeMensagem = new Set(ags.map((a) => a.mensagem_origem_id).filter(Boolean))
  const pagos = new Set((pagClube ?? []).filter((p: Linha) => p.status === 'pago').map((p: Linha) => p.assinatura_clube_id))
  const contagemVotos = new Map<string, number>()
  const meusVotos = new Set<string>()
  for (const v of votos ?? []) {
    contagemVotos.set(v.sugestao_id, (contagemVotos.get(v.sugestao_id) ?? 0) + 1)
    if (v.perfil_id === perfilId) meusVotos.add(v.sugestao_id)
  }

  const eu = (membros ?? []).find((m: Linha) => m.perfil_id === perfilId)
  const plano = (assinatura?.planos ?? {}) as Linha

  const fidelidade: ProgramaFidelidade = fidel
    ? {
        tipo: fidel.tipo, pontos_por_real: Number(fidel.pontos_por_real ?? 1), visitas_para_premio: fidel.visitas_para_premio ?? 10,
        pontos_por_indicacao: fidel.pontos_por_indicacao, premio_descricao: fidel.premio_descricao, ativo: fidel.ativo,
      }
    : { tipo: 'cartao_visitas', pontos_por_real: 1, visitas_para_premio: 10, pontos_por_indicacao: 0, premio_descricao: 'Corte grátis', ativo: false }

  return {
    versao: -1,
    barbearia,
    membros: membros ?? [],
    configuracoes: (configs ?? []).map((c: Linha) => ({
      membro_id: c.membro_id, comissao_servico_pct: Number(c.comissao_servico_pct), comissao_produto_pct: Number(c.comissao_produto_pct),
      meta_diaria_centavos: c.meta_diaria_centavos, aluguel_cadeira_centavos: c.aluguel_cadeira_centavos,
      dia_vencimento_aluguel: c.dia_vencimento_aluguel, eh_mei: c.eh_mei, convite_token: c.convite_token,
    })),
    horarios: (horarios ?? []).map((h: Linha) => ({ id: h.id, dia_semana: h.dia_semana, abre: hhmm(h.abre), fecha: hhmm(h.fecha) })),
    jornadas: (jornadas ?? []).map((j: Linha) => ({ id: j.id, membro_id: j.membro_id, dia_semana: j.dia_semana, inicio: hhmm(j.inicio), fim: hhmm(j.fim) })),
    bloqueios: (bloqueios ?? []).map((b: Linha) => ({ id: b.id, membro_id: b.membro_id, inicio: iso(b.inicio)!, fim: iso(b.fim)!, motivo: b.motivo })),
    servicos: (servicos ?? []).map((s: Linha): Servico => ({
      id: s.id, nome: s.nome, descricao: s.descricao, preco_centavos: s.preco_centavos, duracao_min: s.duracao_min,
      intervalo_min: s.intervalo_min, ativo: s.ativo, ordem: s.ordem, membros: membrosDoServico.get(s.id) ?? [],
    })),
    clientes: clientes.map((c) => ({
      id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, data_nascimento: c.data_nascimento, observacoes: c.observacoes,
      membro_preferido_id: c.membro_preferido_id, codigo_indicacao: c.codigo_indicacao, indicado_por_id: c.indicado_por_id,
      aceita_mensagens: c.aceita_mensagens, primeira_visita_em: iso(c.primeira_visita_em), ultima_visita_em: iso(c.ultima_visita_em),
      total_visitas: c.total_visitas, total_gasto_centavos: c.total_gasto_centavos,
      frequencia_media_dias: c.frequencia_media_dias == null ? null : Number(c.frequencia_media_dias),
      proximo_retorno_previsto: c.proximo_retorno_previsto, criado_em: iso(c.criado_em)!,
    })),
    agendamentos: ags,
    comandas: comandas.map(mapComanda),
    produtos: (produtos ?? []).map((p: Linha) => ({
      id: p.id, nome: p.nome, preco_venda_centavos: p.preco_venda_centavos, custo_centavos: p.custo_centavos,
      estoque_atual: p.estoque_atual, estoque_minimo: p.estoque_minimo, ativo: p.ativo,
      foto_url: p.foto_url ?? null, descricao: p.descricao ?? null, mostrar_na_pagina: p.mostrar_na_pagina ?? true,
    })),
    despesas: despesas.map((d) => ({ id: d.id, membro_id: d.membro_id, descricao: d.descricao, categoria: d.categoria, valor_centavos: d.valor_centavos, data: d.data, pago: d.pago })),
    alugueis: (alugueis ?? []).map((a: Linha) => ({ id: a.id, membro_id: a.membro_id, competencia: a.competencia, valor_centavos: a.valor_centavos, vencimento: a.vencimento, status: a.status, pago_em: iso(a.pago_em) })),
    listaEspera: (lista ?? []).map((l: Linha) => ({
      id: l.id, cliente_id: l.cliente_id, membro_id: l.membro_id, servico_id: l.servico_id, data: l.data,
      hora_de: l.hora_de ? hhmm(l.hora_de) : null, hora_ate: l.hora_ate ? hhmm(l.hora_ate) : null, status: l.status, criado_em: iso(l.criado_em)!,
    })),
    modelos: (modelos ?? []).map((m: Linha) => ({ id: m.id, tipo: m.tipo, texto: m.texto, ativo: m.ativo })),
    mensagens: mensagens.map((m): Mensagem => ({
      id: m.id, cliente_id: m.cliente_id, tipo: m.tipo, conteudo: m.conteudo, status: m.status,
      enviada_em: iso(m.enviada_em ?? m.criado_em), gerou_agendamento: vieramDeMensagem.has(m.id), agendamento_id: m.agendamento_id,
    })),
    cupons: (cupons ?? []).map((c: Linha) => ({ id: c.id, codigo: c.codigo, tipo: c.tipo, valor: c.valor, valido_ate: c.valido_ate, usos: c.usos, usos_max: c.usos_max, ativo: c.ativo })),
    promocoes: (promocoes ?? []).map((p: Linha) => ({
      id: p.id, nome: p.nome, dia_semana: p.dia_semana, hora_inicio: p.hora_inicio ? hhmm(p.hora_inicio) : null,
      hora_fim: p.hora_fim ? hhmm(p.hora_fim) : null, tipo: p.tipo, valor: p.valor, ativo: p.ativo,
    })),
    fidelidade,
    movimentosFidelidade: movFidel.map((m) => ({ id: m.id, cliente_id: m.cliente_id, tipo: m.tipo, pontos: m.pontos, criado_em: iso(m.criado_em)! })),
    planosClube: (planosClube ?? []).map((p: Linha) => ({ id: p.id, nome: p.nome, descricao: p.descricao, preco_centavos: p.preco_centavos, usos_por_mes: p.usos_por_mes, ativo: p.ativo })),
    assinaturasClube: (assinClube ?? []).map((a: Linha): AssinaturaClube => ({
      id: a.id, cliente_id: a.cliente_id, plano_clube_id: a.plano_clube_id, status: a.status, dia_vencimento: a.dia_vencimento, pago_mes_atual: pagos.has(a.id),
    })),
    avaliacoes: (avaliacoes ?? []).map((a: Linha): Avaliacao => ({
      id: a.id, cliente_id: a.cliente_id, membro_id: a.membro_id, nota: a.nota, comentario: a.comentario, publica: a.publica, criado_em: iso(a.criado_em)!,
    })),
    portfolio: (portfolio ?? []).map((f: Linha) => ({ id: f.id, membro_id: f.membro_id, url: f.caminho_storage, legenda: f.legenda })),
    faturas: (faturas ?? []).map((f: Linha): Fatura => ({
      id: f.id, barbearia_id: f.barbearia_id, competencia: f.competencia, valor_centavos: f.valor_centavos, vencimento: f.vencimento,
      status: f.status, pix_copia_cola: f.pix_copia_cola, pago_em: iso(f.pago_em), txid: f.txid, informado_em: iso(f.informado_em),
    })),
    sugestoes: (sugestoes ?? []).map((s: Linha): Sugestao => ({
      id: s.id, barbearia_id: s.barbearia_id, titulo: s.titulo, descricao: s.descricao, status: s.status,
      votos: contagemVotos.get(s.id) ?? 0, votei: meusVotos.has(s.id), criado_em: iso(s.criado_em)!,
    })),
    assinatura: {
      plano: plano.nome ?? 'Barbearia',
      plano_slug: plano.slug ?? 'barbearia',
      preco_centavos: plano.preco_centavos ?? 0,
      status: (assinatura?.status ?? 'teste') as StatusAssinSaas,
      teste_ate: assinatura?.teste_ate ?? null,
      proximo_vencimento: assinatura?.proximo_vencimento ?? null,
      parceiro: !!assinatura?.parceiro,
      desconto_pct: Number(assinatura?.desconto_pct ?? 0),
    },
    usuarioMembroId: eu?.id ?? membros?.[0]?.id ?? '',
    usuarioPapel: eu?.papel ?? 'barbeiro',
  }
}
