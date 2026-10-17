// Estado da aplicação.
//
// As telas leem um objeto "Estado" e chamam "acoes". Cada ação muda o
// estado na hora (a tela responde sem esperar a internet) e, no modo real,
// grava no Supabase em seguida, numa fila em ordem. Se o banco recusar,
// aparece o aviso com o motivo e os dados são recarregados do banco.
//
// No modo demonstração os dados são de exemplo e ficam no localStorage.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { criarSeed, VERSAO_SEED, type Estado } from '../data/seed'
import type {
  Agendamento, AssinaturaClube, Barbearia, Cliente, Comanda, ComandaItem, Cupom, Despesa, FormaPagamento, FotoPortfolio,
  HorarioFuncionamento, Jornada, ListaEspera, Membro, MembroConfiguracao, ModeloMensagem, OrigemAgendamento,
  PlanoClube, Produto, ProgramaFidelidade, Promocao, Servico, StatusAgendamento,
} from './types'
import { isoDia, somaDias, somaMinutos, uid } from './format'
import { supabase } from './supabase'
import { useSessao } from './sessao'
import { buscarAgendamento, buscarAgendamentosAlterados, buscarCliente, carregarEstado, mensagemDeErro, ok } from './banco'
import { avisarGlobal } from '../components/avisos'

const CHAVE = 'kort-demo'

function carregarDemo(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (bruto) {
      const e = JSON.parse(bruto) as Estado
      if (e.versao === VERSAO_SEED) return e
    }
  } catch {
    /* localStorage indisponível ou corrompido: começa do seed */
  }
  return criarSeed()
}

export const totalComanda = (c: Comanda) =>
  Math.max(c.itens.reduce((t, i) => t + i.quantidade * i.preco_unit_centavos, 0) - c.desconto_centavos, 0)

export const subtotalComanda = (c: Comanda) => c.itens.reduce((t, i) => t + i.quantidade * i.preco_unit_centavos, 0)

export const comissaoItem = (i: ComandaItem) => Math.round((i.quantidade * i.preco_unit_centavos * i.comissao_pct) / 100)

type Mutacao = (s: Estado) => void

/** Conexão com o banco usada pelas ações no modo real. */
interface Banco {
  sb: SupabaseClient
  barbeariaId: string
  perfilId: string
  /** põe a gravação na fila (em ordem); erro = aviso + recarregar */
  salvar(fn: (sb: SupabaseClient) => Promise<unknown>): void
  recarregarAgendamento(id: string): void
  recarregarCliente(id: string): void
}

// Eventos que o próprio banco já registra por trigger (não duplicar)
const EVENTOS_DO_BANCO = new Set(['agendamento.criado', 'comanda.paga', 'agendamento.cancelado', 'agendamento.faltou'])

// Campos que podem ser gravados em cada tabela (o resto é calculado no banco)
const so = <T extends object>(o: T, campos: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => campos.includes(k) && v !== undefined))

const CAMPOS_CLIENTE = ['nome', 'telefone', 'email', 'data_nascimento', 'observacoes', 'membro_preferido_id', 'codigo_indicacao', 'indicado_por_id', 'aceita_mensagens']
const CAMPOS_BARBEARIA = ['slug', 'nome', 'descricao', 'telefone', 'whatsapp', 'instagram', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'logo_url', 'capa_url', 'nicho', 'cor_destaque', 'modo_operacao', 'antecedencia_cancelamento_min', 'antecedencia_max_dias', 'intervalo_slots_min', 'publicada']
const CAMPOS_MEMBRO = ['papel', 'nome_exibicao', 'foto_url', 'bio', 'cor_agenda', 'atende', 'ativo', 'ordem']
const CAMPOS_CONFIG = ['comissao_servico_pct', 'comissao_produto_pct', 'meta_diaria_centavos', 'aluguel_cadeira_centavos', 'dia_vencimento_aluguel', 'eh_mei']

function criarAcoes(mudar: (fn: Mutacao) => void, ler: () => Estado, db: Banco | null) {
  const bid = () => db!.barbeariaId

  const evento = (nome: string, meta: Record<string, unknown> = {}) => {
    if (!db) {
      if (import.meta.env.DEV) console.debug('[evento]', nome, meta)
      return
    }
    if (EVENTOS_DO_BANCO.has(nome)) return
    db.salvar(async (sb) => ok(await sb.from('eventos').insert({ barbearia_id: bid(), perfil_id: db.perfilId, evento: nome, metadados: meta })))
  }

  /** Grava os itens da comanda como estão no estado (upsert + remove os que saíram). */
  const gravarItens = (comandaId: string) => {
    if (!db) return
    const c = ler().comandas.find((x) => x.id === comandaId)
    if (!c) return
    const itens = c.itens.map((i) => ({
      id: i.id, comanda_id: c.id, barbearia_id: bid(), tipo: i.tipo, servico_id: i.servico_id, produto_id: i.produto_id,
      membro_id: i.membro_id, descricao: i.descricao, quantidade: i.quantidade, preco_unit_centavos: i.preco_unit_centavos, comissao_pct: i.comissao_pct,
    }))
    db.salvar(async (sb) => {
      const ids = itens.map((i) => i.id)
      let del = sb.from('comanda_itens').delete().eq('comanda_id', c.id)
      if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`)
      ok(await del)
      if (itens.length) ok(await sb.from('comanda_itens').upsert(itens))
    })
  }

  return {
    evento,

    resetarDemo() {
      if (db) return
      mudar((s) => Object.assign(s, criarSeed()))
    },

    // ---------- agenda
    criarAgendamento(dados: {
      clienteId?: string
      novoCliente?: { nome: string; telefone: string }
      membroId: string
      inicio: Date
      servicoIds: string[]
      origem: OrigemAgendamento
      observacao?: string
      status?: StatusAgendamento
    }): Agendamento {
      let criado!: Agendamento
      let clienteNovo: Cliente | null = null
      mudar((s) => {
        let clienteId = dados.clienteId
        if (!clienteId && dados.novoCliente) {
          const existente = s.clientes.find((c) => c.telefone === dados.novoCliente!.telefone)
          if (existente) clienteId = existente.id
          else {
            clienteNovo = {
              id: uid(), nome: dados.novoCliente.nome, telefone: dados.novoCliente.telefone, email: null,
              data_nascimento: null, observacoes: null, membro_preferido_id: dados.membroId, codigo_indicacao: null,
              indicado_por_id: null, aceita_mensagens: true, primeira_visita_em: null, ultima_visita_em: null,
              total_visitas: 0, total_gasto_centavos: 0, frequencia_media_dias: null, proximo_retorno_previsto: null,
              criado_em: new Date().toISOString(),
            }
            s.clientes.push(clienteNovo)
            clienteId = clienteNovo.id
          }
        }
        const servs = dados.servicoIds.map((id) => s.servicos.find((x) => x.id === id)!).filter(Boolean)
        const dur = servs.reduce((t, x) => t + x.duracao_min, 0)
        criado = {
          id: uid(),
          cliente_id: clienteId!,
          membro_id: dados.membroId,
          inicio: dados.inicio.toISOString(),
          fim: somaMinutos(dados.inicio, dur).toISOString(),
          status: dados.status ?? 'agendado',
          origem: dados.origem,
          valor_previsto_centavos: servs.reduce((t, x) => t + x.preco_centavos, 0),
          observacao_cliente: dados.observacao ?? null,
          confirmado_em: null,
          servicos: servs.map((x) => ({ servico_id: x.id, nome: x.nome, preco_centavos: x.preco_centavos, duracao_min: x.duracao_min })),
          criado_em: new Date().toISOString(),
        }
        s.agendamentos.push(criado)
        s.agendamentos.sort((a, b) => a.inicio.localeCompare(b.inicio))
      })
      evento('agendamento.criado', { origem: dados.origem })
      if (db) {
        const a = criado
        const c = clienteNovo as Cliente | null
        db.salvar(async (sb) => {
          if (c) ok(await sb.from('clientes').insert({ id: c.id, barbearia_id: bid(), ...so(c, CAMPOS_CLIENTE) }))
          const r = ok(await sb.from('agendamentos').insert({
            id: a.id, barbearia_id: bid(), cliente_id: a.cliente_id, membro_id: a.membro_id, inicio: a.inicio, fim: a.fim,
            status: a.status, origem: a.origem, valor_previsto_centavos: a.valor_previsto_centavos,
            observacao_cliente: a.observacao_cliente, criado_por: db.perfilId,
          }).select('token_publico').single())
          if (a.servicos.length) {
            ok(await sb.from('agendamento_servicos').insert(a.servicos.map((x, i) => ({ agendamento_id: a.id, barbearia_id: bid(), ...x, ordem: i }))))
          }
          mudar((s) => {
            const x = s.agendamentos.find((y) => y.id === a.id)
            if (x && r) x.token_publico = r.token_publico
          })
        })
      }
      return criado
    },

    mudarStatus(id: string, status: StatusAgendamento) {
      const agora = new Date().toISOString()
      mudar((s) => {
        const a = s.agendamentos.find((x) => x.id === id)
        if (!a) return
        a.status = status
        if (status === 'confirmado') a.confirmado_em = agora
      })
      evento(`agendamento.${status}`)
      db?.salvar(async (sb) =>
        ok(await sb.from('agendamentos').update({
          status,
          ...(status === 'confirmado' ? { confirmado_em: agora } : {}),
          ...(status === 'cancelado' ? { cancelado_em: agora, motivo_cancelamento: 'Cancelado pela barbearia' } : {}),
          ...(status === 'em_atendimento' ? { checkin_em: agora } : {}),
        }).eq('id', id)),
      )
    },

    remarcar(id: string, membroId: string, inicio: Date) {
      let fim = ''
      mudar((s) => {
        const a = s.agendamentos.find((x) => x.id === id)
        if (!a) return
        const dur = (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000
        a.membro_id = membroId
        a.inicio = inicio.toISOString()
        a.fim = fim = somaMinutos(inicio, dur).toISOString()
        a.status = 'agendado'
        s.agendamentos.sort((x, y) => x.inicio.localeCompare(y.inicio))
      })
      evento('agendamento.remarcado')
      db?.salvar(async (sb) =>
        ok(await sb.from('agendamentos').update({ membro_id: membroId, inicio: inicio.toISOString(), fim, status: 'agendado', confirmado_em: null }).eq('id', id)),
      )
    },

    criarBloqueio(membroId: string | null, inicio: Date, fim: Date, motivo: string) {
      const b = { id: uid(), membro_id: membroId, inicio: inicio.toISOString(), fim: fim.toISOString(), motivo }
      mudar((s) => {
        s.bloqueios.push(b)
      })
      evento('agenda.bloqueio')
      db?.salvar(async (sb) => ok(await sb.from('bloqueios').insert({ ...b, barbearia_id: bid() })))
    },
    removerBloqueio(id: string) {
      mudar((s) => {
        s.bloqueios = s.bloqueios.filter((b) => b.id !== id)
      })
      db?.salvar(async (sb) => ok(await sb.from('bloqueios').delete().eq('id', id)))
    },

    // ---------- comanda (caixa)
    abrirComanda(dados: { agendamentoId?: string | null; membroId: string; clienteId?: string | null }): string {
      const s0 = ler()
      if (dados.agendamentoId) {
        const ja = s0.comandas.find((c) => c.agendamento_id === dados.agendamentoId && c.status !== 'cancelada')
        if (ja) return ja.id
      }
      const id = uid()
      let mudouAgendamento = false
      mudar((s) => {
        const ag = dados.agendamentoId ? s.agendamentos.find((a) => a.id === dados.agendamentoId) : null
        const cfg = s.configuracoes.find((c) => c.membro_id === dados.membroId)
        const itens: ComandaItem[] = (ag?.servicos ?? []).map((sv) => ({
          id: uid(), tipo: 'servico', servico_id: sv.servico_id, produto_id: null, membro_id: dados.membroId,
          descricao: sv.nome, quantidade: 1, preco_unit_centavos: sv.preco_centavos, comissao_pct: cfg?.comissao_servico_pct ?? 0,
        }))
        s.comandas.push({
          id, agendamento_id: ag?.id ?? null, cliente_id: dados.clienteId ?? ag?.cliente_id ?? null, membro_id: dados.membroId,
          status: 'aberta', desconto_centavos: 0, forma_pagamento: null, pago_em: null, itens, criado_em: new Date().toISOString(),
        })
        if (ag && (ag.status === 'agendado' || ag.status === 'confirmado')) {
          ag.status = 'em_atendimento'
          mudouAgendamento = true
        }
      })
      evento('comanda.aberta')
      if (db) {
        const c = ler().comandas.find((x) => x.id === id)!
        db.salvar(async (sb) => {
          // agendamento_id é único: uma comanda cancelada antes solta o horário
          if (c.agendamento_id) {
            ok(await sb.from('comandas').update({ agendamento_id: null }).eq('agendamento_id', c.agendamento_id).eq('status', 'cancelada'))
          }
          ok(await sb.from('comandas').insert({
            id, barbearia_id: bid(), agendamento_id: c.agendamento_id, cliente_id: c.cliente_id, membro_id: c.membro_id,
          }))
          if (mudouAgendamento && c.agendamento_id) {
            ok(await sb.from('agendamentos').update({ status: 'em_atendimento', checkin_em: new Date().toISOString() }).eq('id', c.agendamento_id))
          }
        })
        gravarItens(id)
      }
      return id
    },

    adicionarItem(comandaId: string, item: { tipo: 'servico' | 'produto'; refId: string }) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (!c || c.status !== 'aberta') return
        const cfg = s.configuracoes.find((x) => x.membro_id === c.membro_id)
        if (item.tipo === 'servico') {
          const sv = s.servicos.find((x) => x.id === item.refId)!
          c.itens.push({ id: uid(), tipo: 'servico', servico_id: sv.id, produto_id: null, membro_id: c.membro_id, descricao: sv.nome,
            quantidade: 1, preco_unit_centavos: sv.preco_centavos, comissao_pct: cfg?.comissao_servico_pct ?? 0 })
        } else {
          const p = s.produtos.find((x) => x.id === item.refId)!
          const ja = c.itens.find((i) => i.produto_id === p.id)
          if (ja) ja.quantidade += 1
          else c.itens.push({ id: uid(), tipo: 'produto', servico_id: null, produto_id: p.id, membro_id: c.membro_id, descricao: p.nome,
            quantidade: 1, preco_unit_centavos: p.preco_venda_centavos, comissao_pct: cfg?.comissao_produto_pct ?? 0 })
        }
      })
      gravarItens(comandaId)
    },
    alterarQuantidade(comandaId: string, itemId: string, delta: number) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        const it = c?.itens.find((i) => i.id === itemId)
        if (!c || !it) return
        it.quantidade += delta
        if (it.quantidade <= 0) c.itens = c.itens.filter((i) => i.id !== itemId)
      })
      gravarItens(comandaId)
    },
    definirDesconto(comandaId: string, centavos: number) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (c) c.desconto_centavos = Math.max(0, centavos)
      })
      if (db) {
        const c = ler().comandas.find((x) => x.id === comandaId)
        if (c) db.salvar(async (sb) => ok(await sb.from('comandas').update({ desconto_centavos: c.desconto_centavos, total_centavos: totalComanda(c) }).eq('id', comandaId)))
      }
    },

    /** O cliente pagou o barbeiro por fora; aqui só se confirma. */
    confirmarPagamento(comandaId: string, forma: FormaPagamento) {
      // No banco, o trigger tg_comanda_paga atualiza cliente, estoque,
      // fidelidade e conclui o agendamento. Aqui fazemos o mesmo na tela.
      const agora = new Date()
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (!c || c.status !== 'aberta') return
        c.status = 'paga'
        c.forma_pagamento = forma
        c.pago_em = agora.toISOString()
        const total = totalComanda(c)

        for (const it of c.itens) {
          if (it.tipo === 'produto' && it.produto_id) {
            const p = s.produtos.find((x) => x.id === it.produto_id)
            if (p) p.estoque_atual -= it.quantidade
          }
        }
        if (c.agendamento_id) {
          const ag = s.agendamentos.find((a) => a.id === c.agendamento_id)
          if (ag && ag.status !== 'cancelado' && ag.status !== 'faltou') ag.status = 'concluido'
        }
        if (c.cliente_id) {
          const cl = s.clientes.find((x) => x.id === c.cliente_id)
          if (cl) {
            if (cl.total_visitas >= 1 && cl.primeira_visita_em) {
              const dias = (agora.getTime() - new Date(cl.primeira_visita_em).getTime()) / 86400000
              cl.frequencia_media_dias = Math.round((dias / cl.total_visitas) * 10) / 10
            }
            cl.total_visitas += 1
            cl.total_gasto_centavos += total
            cl.primeira_visita_em ??= agora.toISOString()
            cl.ultima_visita_em = agora.toISOString()
            cl.proximo_retorno_previsto = isoDia(somaDias(agora, Math.round(cl.frequencia_media_dias ?? 30)))
            if (s.fidelidade.ativo) {
              const pts = s.fidelidade.tipo === 'pontos' ? Math.floor((total / 100) * s.fidelidade.pontos_por_real) : 1
              s.movimentosFidelidade.push({ id: uid(), cliente_id: cl.id, tipo: 'atendimento', pontos: pts, criado_em: agora.toISOString() })
            }
          }
        }
      })
      evento('comanda.paga', { forma })
      if (db) {
        const c = ler().comandas.find((x) => x.id === comandaId)
        db.salvar(async (sb) =>
          ok(await sb.from('comandas').update({
            status: 'paga', forma_pagamento: forma, pago_em: agora.toISOString(), confirmado_por: db.perfilId,
          }).eq('id', comandaId).eq('status', 'aberta')),
        )
        // os números do cliente vêm do banco (mesma conta do trigger)
        if (c?.cliente_id) db.recarregarCliente(c.cliente_id)
      }
    },

    cancelarComanda(comandaId: string) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (c && c.status === 'aberta') c.status = 'cancelada'
      })
      db?.salvar(async (sb) => ok(await sb.from('comandas').update({ status: 'cancelada' }).eq('id', comandaId).eq('status', 'aberta')))
    },

    // ---------- cadastros
    salvarCliente(c: Partial<Cliente> & { nome: string; telefone: string }) {
      let id = c.id
      const novo = !c.id || !ler().clientes.some((x) => x.id === c.id)
      mudar((s) => {
        const ex = c.id ? s.clientes.find((x) => x.id === c.id) : null
        if (ex) Object.assign(ex, c)
        else {
          id = c.id ?? uid()
          s.clientes.push({
            email: null, data_nascimento: null, observacoes: null, membro_preferido_id: null, codigo_indicacao: null,
            indicado_por_id: null, aceita_mensagens: true, primeira_visita_em: null, ultima_visita_em: null, total_visitas: 0,
            total_gasto_centavos: 0, frequencia_media_dias: null, proximo_retorno_previsto: null, criado_em: new Date().toISOString(),
            ...c, id: id!,
          } as Cliente)
        }
      })
      if (db) {
        const dados = so(ler().clientes.find((x) => x.id === id)!, CAMPOS_CLIENTE)
        db.salvar(async (sb) =>
          ok(novo
            ? await sb.from('clientes').insert({ id, barbearia_id: bid(), ...dados })
            : await sb.from('clientes').update(dados).eq('id', id!)),
        )
      }
      return id!
    },

    salvarServico(sv: Partial<Servico> & { nome: string }) {
      let id = sv.id
      mudar((s) => {
        const ex = sv.id ? s.servicos.find((x) => x.id === sv.id) : null
        if (ex) Object.assign(ex, sv)
        else {
          id = uid()
          s.servicos.push({ descricao: null, preco_centavos: 0, duracao_min: 30, intervalo_min: 5, ativo: true,
            ordem: s.servicos.length, membros: s.membros.filter((m) => m.ativo).map((m) => m.id), ...sv, id: id! } as Servico)
        }
      })
      evento('servico.salvo')
      if (db) {
        const x = ler().servicos.find((y) => y.id === id)!
        db.salvar(async (sb) => {
          ok(await sb.from('servicos').upsert({
            id: x.id, barbearia_id: bid(), nome: x.nome, descricao: x.descricao, preco_centavos: x.preco_centavos,
            duracao_min: x.duracao_min, intervalo_min: x.intervalo_min, ativo: x.ativo, ordem: x.ordem,
          }))
          ok(await sb.from('servico_membros').delete().eq('servico_id', x.id))
          if (x.membros.length) ok(await sb.from('servico_membros').insert(x.membros.map((m) => ({ servico_id: x.id, membro_id: m, barbearia_id: bid() }))))
        })
      }
    },

    salvarMembro(m: Partial<Membro> & { nome_exibicao: string }, cfg?: Partial<MembroConfiguracao>) {
      let id = m.id
      const novo = !m.id || !ler().membros.some((x) => x.id === m.id)
      mudar((s) => {
        let ex = m.id ? s.membros.find((x) => x.id === m.id) : null
        if (ex) Object.assign(ex, m)
        else {
          ex = { barbearia_id: s.barbearia.id, perfil_id: null, papel: 'barbeiro', foto_url: null, bio: null,
            cor_agenda: '#7FB8FF', atende: true, ativo: true, ordem: s.membros.length, ...m, id: uid() } as Membro
          s.membros.push(ex)
          s.configuracoes.push({ membro_id: ex.id, comissao_servico_pct: 40, comissao_produto_pct: 10, meta_diaria_centavos: 30000,
            aluguel_cadeira_centavos: null, dia_vencimento_aluguel: null, eh_mei: true })
          // jornada padrão = horário da barbearia; faz todos os serviços
          for (const h of s.horarios) s.jornadas.push({ id: uid(), membro_id: ex.id, dia_semana: h.dia_semana, inicio: h.abre, fim: h.fecha })
          for (const sv of s.servicos) if (!sv.membros.includes(ex.id)) sv.membros.push(ex.id)
        }
        id = ex.id
        if (cfg) {
          const c = s.configuracoes.find((x) => x.membro_id === ex!.id)
          if (c) Object.assign(c, cfg)
        }
      })
      if (db) {
        const s = ler()
        const x = s.membros.find((y) => y.id === id)!
        const c = s.configuracoes.find((y) => y.membro_id === id)!
        const jornadas = s.jornadas.filter((j) => j.membro_id === id)
        db.salvar(async (sb) => {
          ok(await sb.from('membros').upsert({ id: x.id, barbearia_id: bid(), ...so(x, CAMPOS_MEMBRO) }))
          const cfgSalva = ok(await sb.from('membro_configuracoes').upsert({ membro_id: x.id, barbearia_id: bid(), ...so(c, CAMPOS_CONFIG) }).select('convite_token').single())
          mudar((st) => {
            const y = st.configuracoes.find((k) => k.membro_id === x.id)
            if (y && cfgSalva) y.convite_token = cfgSalva.convite_token
          })
          if (novo) {
            if (jornadas.length) ok(await sb.from('jornadas').insert(jornadas.map((j) => ({ ...j, barbearia_id: bid() }))))
            const servs = s.servicos.map((sv) => ({ servico_id: sv.id, membro_id: x.id, barbearia_id: bid() }))
            if (servs.length) ok(await sb.from('servico_membros').upsert(servs, { ignoreDuplicates: true }))
          }
        })
      }
      return id!
    },

    salvarJornadas(membroId: string, jornadas: Omit<Jornada, 'id' | 'membro_id'>[]) {
      const novas = jornadas.map((j) => ({ id: uid(), membro_id: membroId, ...j }))
      mudar((s) => {
        s.jornadas = s.jornadas.filter((j) => j.membro_id !== membroId)
        s.jornadas.push(...novas)
      })
      db?.salvar(async (sb) => {
        ok(await sb.from('jornadas').delete().eq('membro_id', membroId))
        if (novas.length) ok(await sb.from('jornadas').insert(novas.map((j) => ({ ...j, barbearia_id: bid() }))))
      })
    },

    salvarProduto(p: Partial<Produto> & { nome: string }) {
      let id = p.id
      mudar((s) => {
        const ex = p.id ? s.produtos.find((x) => x.id === p.id) : null
        if (ex) Object.assign(ex, p)
        else {
          id = uid()
          s.produtos.push({ preco_venda_centavos: 0, custo_centavos: null, estoque_atual: 0, estoque_minimo: 0, ativo: true, ...p, id: id! } as Produto)
        }
      })
      if (db) {
        const x = ler().produtos.find((y) => y.id === id)!
        db.salvar(async (sb) => ok(await sb.from('produtos').upsert({ ...x, barbearia_id: bid() })))
      }
    },
    entradaEstoque(produtoId: string, qtd: number) {
      mudar((s) => {
        const p = s.produtos.find((x) => x.id === produtoId)
        if (p) p.estoque_atual += qtd
      })
      evento('estoque.entrada')
      if (db) {
        const p = ler().produtos.find((x) => x.id === produtoId)
        db.salvar(async (sb) => {
          ok(await sb.from('movimentacoes_estoque').insert({ barbearia_id: bid(), produto_id: produtoId, tipo: 'entrada', quantidade: qtd, criado_por: db.perfilId }))
          if (p) ok(await sb.from('produtos').update({ estoque_atual: p.estoque_atual }).eq('id', produtoId))
        })
      }
    },

    salvarDespesa(d: Partial<Despesa> & { descricao: string; valor_centavos: number }) {
      let id = d.id
      mudar((s) => {
        const ex = d.id ? s.despesas.find((x) => x.id === d.id) : null
        if (ex) Object.assign(ex, d)
        else {
          id = uid()
          s.despesas.push({ membro_id: null, categoria: 'Outros', data: isoDia(new Date()), pago: true, ...d, id: id! } as Despesa)
        }
      })
      evento('financeiro.despesa')
      if (db) {
        const x = ler().despesas.find((y) => y.id === id)!
        db.salvar(async (sb) => ok(await sb.from('despesas').upsert({ ...x, barbearia_id: bid() })))
      }
    },
    removerDespesa(id: string) {
      mudar((s) => {
        s.despesas = s.despesas.filter((d) => d.id !== id)
      })
      db?.salvar(async (sb) => ok(await sb.from('despesas').delete().eq('id', id)))
    },
    gerarAlugueisDoMes() {
      const antes = new Set(ler().alugueis.map((a) => a.id))
      mudar((s) => {
        const h = new Date()
        const comp = isoDia(new Date(h.getFullYear(), h.getMonth(), 1))
        for (const c of s.configuracoes) {
          if (!c.aluguel_cadeira_centavos) continue
          if (s.alugueis.some((a) => a.membro_id === c.membro_id && a.competencia === comp)) continue
          s.alugueis.push({
            id: uid(), membro_id: c.membro_id, competencia: comp, valor_centavos: c.aluguel_cadeira_centavos,
            vencimento: isoDia(new Date(h.getFullYear(), h.getMonth(), c.dia_vencimento_aluguel ?? 5)), status: 'pendente', pago_em: null,
          })
        }
      })
      if (db) {
        const novos = ler().alugueis.filter((a) => !antes.has(a.id))
        if (novos.length) db.salvar(async (sb) => ok(await sb.from('alugueis_cadeira').insert(novos.map((a) => ({ ...a, barbearia_id: bid() })))))
      }
    },
    marcarAluguelPago(id: string) {
      const agora = new Date().toISOString()
      mudar((s) => {
        const a = s.alugueis.find((x) => x.id === id)
        if (a) {
          a.status = 'pago'
          a.pago_em = agora
        }
      })
      db?.salvar(async (sb) => ok(await sb.from('alugueis_cadeira').update({ status: 'pago', pago_em: agora }).eq('id', id)))
    },

    // ---------- relacionamento
    adicionarListaEspera(l: Omit<ListaEspera, 'id' | 'status' | 'criado_em'>) {
      const x: ListaEspera = { id: uid(), status: 'aguardando', criado_em: new Date().toISOString(), ...l }
      mudar((s) => {
        s.listaEspera.push(x)
      })
      evento('lista_espera.adicionado')
      db?.salvar(async (sb) => ok(await sb.from('lista_espera').insert({ ...x, barbearia_id: bid() })))
    },
    mudarListaEspera(id: string, status: ListaEspera['status']) {
      mudar((s) => {
        const l = s.listaEspera.find((x) => x.id === id)
        if (l) l.status = status
      })
      db?.salvar(async (sb) =>
        ok(await sb.from('lista_espera').update({ status, ...(status === 'avisado' ? { avisado_em: new Date().toISOString() } : {}) }).eq('id', id)),
      )
    },
    salvarModelo(m: ModeloMensagem) {
      mudar((s) => {
        const ex = s.modelos.find((x) => x.id === m.id)
        if (ex) Object.assign(ex, m)
      })
      db?.salvar(async (sb) => ok(await sb.from('modelos_mensagem').update({ texto: m.texto, ativo: m.ativo }).eq('id', m.id)))
    },
    /** Mensagem mandada pelo WhatsApp do próprio barbeiro (link wa.me); aqui só fica o registro. */
    registrarMensagem(clienteId: string, tipo: ModeloMensagem['tipo'], conteudo: string, agendamentoId?: string) {
      const x = { id: uid(), cliente_id: clienteId, tipo, conteudo, status: 'enviada' as const, enviada_em: new Date().toISOString(), gerou_agendamento: false, agendamento_id: agendamentoId ?? null }
      mudar((s) => {
        s.mensagens.push(x)
      })
      evento(`mensagem.${tipo}`, { manual: true })
      if (db) {
        const destino = ler().clientes.find((c) => c.id === clienteId)?.telefone ?? ''
        db.salvar(async (sb) =>
          ok(await sb.from('mensagens').insert({
            id: x.id, barbearia_id: bid(), cliente_id: clienteId, agendamento_id: agendamentoId ?? null, tipo, destino, conteudo,
            status: 'enviada', enviada_em: x.enviada_em, agendada_para: x.enviada_em,
          })),
        )
      }
    },
    salvarCupom(c: Partial<Cupom> & { codigo: string }) {
      let id = c.id
      mudar((s) => {
        const ex = c.id ? s.cupons.find((x) => x.id === c.id) : null
        if (ex) Object.assign(ex, c)
        else {
          id = uid()
          s.cupons.push({ tipo: 'percentual', valor: 10, valido_ate: null, usos: 0, usos_max: null, ativo: true, ...c, id: id! } as Cupom)
        }
      })
      if (db) {
        const x = ler().cupons.find((y) => y.id === id)!
        db.salvar(async (sb) => ok(await sb.from('cupons').upsert({ ...x, codigo: x.codigo.toUpperCase(), barbearia_id: bid() })))
      }
    },
    salvarPromocao(p: Partial<Promocao> & { nome: string }) {
      let id = p.id
      mudar((s) => {
        const ex = p.id ? s.promocoes.find((x) => x.id === p.id) : null
        if (ex) Object.assign(ex, p)
        else {
          id = uid()
          s.promocoes.push({ dia_semana: null, hora_inicio: null, hora_fim: null, tipo: 'percentual', valor: 10, ativo: true, ...p, id: id! } as Promocao)
        }
      })
      if (db) {
        const x = ler().promocoes.find((y) => y.id === id)!
        db.salvar(async (sb) => ok(await sb.from('promocoes').upsert({ ...x, barbearia_id: bid() })))
      }
    },
    salvarFidelidade(f: ProgramaFidelidade) {
      mudar((s) => {
        s.fidelidade = f
      })
      db?.salvar(async (sb) => ok(await sb.from('programas_fidelidade').upsert({ ...f, barbearia_id: bid() })))
    },
    resgatarPremio(clienteId: string) {
      const s0 = ler()
      const custo = s0.fidelidade.tipo === 'cartao_visitas' ? s0.fidelidade.visitas_para_premio : 100
      const x = { id: uid(), cliente_id: clienteId, tipo: 'resgate' as const, pontos: -custo, criado_em: new Date().toISOString() }
      mudar((s) => {
        s.movimentosFidelidade.push(x)
      })
      evento('fidelidade.resgate')
      db?.salvar(async (sb) => ok(await sb.from('fidelidade_movimentos').insert({ ...x, barbearia_id: bid() })))
    },
    salvarPlanoClube(p: Partial<PlanoClube> & { nome: string }) {
      let id = p.id
      mudar((s) => {
        const ex = p.id ? s.planosClube.find((x) => x.id === p.id) : null
        if (ex) Object.assign(ex, p)
        else {
          id = uid()
          s.planosClube.push({ descricao: null, preco_centavos: 0, usos_por_mes: null, ativo: true, ...p, id: id! } as PlanoClube)
        }
      })
      if (db) {
        const x = ler().planosClube.find((y) => y.id === id)!
        db.salvar(async (sb) => ok(await sb.from('planos_clube').upsert({ ...x, barbearia_id: bid() })))
      }
    },
    assinarClube(clienteId: string, planoId: string, diaVencimento: number) {
      const x: AssinaturaClube = { id: uid(), cliente_id: clienteId, plano_clube_id: planoId, status: 'ativa', dia_vencimento: diaVencimento, pago_mes_atual: false }
      mudar((s) => {
        s.assinaturasClube.push(x)
      })
      evento('clube.assinatura_criada')
      db?.salvar(async (sb) =>
        ok(await sb.from('assinaturas_clube').insert({ id: x.id, barbearia_id: bid(), cliente_id: clienteId, plano_clube_id: planoId, dia_vencimento: diaVencimento })),
      )
    },
    atualizarAssinaturaClube(id: string, dados: Partial<AssinaturaClube>) {
      mudar((s) => {
        const a = s.assinaturasClube.find((x) => x.id === id)
        if (a) Object.assign(a, dados)
      })
      if (!db) return
      const s = ler()
      const a = s.assinaturasClube.find((x) => x.id === id)
      if (!a) return
      const { pago_mes_atual, ...resto } = dados
      if (Object.keys(resto).length) {
        db.salvar(async (sb) =>
          ok(await sb.from('assinaturas_clube').update({ ...resto, ...(resto.status === 'cancelada' ? { cancelada_em: new Date().toISOString() } : {}) }).eq('id', id)),
        )
      }
      if (pago_mes_atual) {
        const h = new Date()
        const plano = s.planosClube.find((p) => p.id === a.plano_clube_id)
        evento('clube.pagamento')
        db.salvar(async (sb) =>
          ok(await sb.from('pagamentos_clube').upsert({
            barbearia_id: bid(), assinatura_clube_id: id, competencia: isoDia(new Date(h.getFullYear(), h.getMonth(), 1)),
            valor_centavos: plano?.preco_centavos ?? 0, status: 'pago', pago_em: h.toISOString(), confirmado_por: db.perfilId,
          }, { onConflict: 'assinatura_clube_id,competencia' })),
        )
      }
    },
    alternarAvaliacaoPublica(id: string) {
      mudar((s) => {
        const a = s.avaliacoes.find((x) => x.id === id)
        if (a) a.publica = !a.publica
      })
      const a = ler().avaliacoes.find((x) => x.id === id)
      if (a) db?.salvar(async (sb) => ok(await sb.from('avaliacoes').update({ publica: a.publica }).eq('id', id)))
    },

    // ---------- barbearia
    salvarBarbearia(b: Partial<Barbearia>) {
      mudar((s) => {
        Object.assign(s.barbearia, b)
      })
      if (db) {
        const dados = so(ler().barbearia, CAMPOS_BARBEARIA)
        db.salvar(async (sb) => ok(await sb.from('barbearias').update(dados).eq('id', bid())))
      }
    },
    // ---------- portfólio (a foto já foi enviada ao Storage; aqui só a linha)
    adicionarFotoPortfolio(f: Omit<FotoPortfolio, 'id'>) {
      const id = uid()
      mudar((s) => {
        s.portfolio.unshift({ ...f, id })
      })
      db?.salvar(async (sb) => ok(await sb.from('fotos_portfolio').insert({
        id, barbearia_id: bid(), membro_id: f.membro_id, caminho_storage: f.url, legenda: f.legenda, publica: true,
      })))
      return id
    },
    editarFotoPortfolio(id: string, dados: Partial<Pick<FotoPortfolio, 'legenda' | 'membro_id'>>) {
      mudar((s) => {
        const f = s.portfolio.find((x) => x.id === id)
        if (f) Object.assign(f, dados)
      })
      db?.salvar(async (sb) => ok(await sb.from('fotos_portfolio').update(dados).eq('id', id)))
    },
    removerFotoPortfolio(id: string) {
      mudar((s) => {
        s.portfolio = s.portfolio.filter((x) => x.id !== id)
      })
      db?.salvar(async (sb) => ok(await sb.from('fotos_portfolio').delete().eq('id', id)))
    },

    salvarHorarios(h: Omit<HorarioFuncionamento, 'id'>[]) {
      const novos = h.map((x) => ({ id: uid(), ...x }))
      mudar((s) => {
        s.horarios = novos
      })
      db?.salvar(async (sb) => {
        ok(await sb.from('horarios_funcionamento').delete().eq('barbearia_id', bid()))
        if (novos.length) ok(await sb.from('horarios_funcionamento').insert(novos.map((x) => ({ ...x, barbearia_id: bid() }))))
      })
    },
    criarSugestao(titulo: string, descricao: string) {
      const x = { id: uid(), barbearia_id: ler().barbearia.id, titulo, descricao: descricao || null, status: 'nova' as const, votos: 1, votei: true, criado_em: new Date().toISOString() }
      mudar((s) => {
        s.sugestoes.unshift(x)
      })
      evento('sugestao.criada')
      db?.salvar(async (sb) => {
        ok(await sb.from('sugestoes').insert({ id: x.id, barbearia_id: bid(), perfil_id: db.perfilId, titulo, descricao: x.descricao }))
        ok(await sb.from('sugestao_votos').insert({ sugestao_id: x.id, perfil_id: db.perfilId }))
      })
    },
    votarSugestao(id: string) {
      mudar((s) => {
        const x = s.sugestoes.find((y) => y.id === id)
        if (!x) return
        x.votei = !x.votei
        x.votos += x.votei ? 1 : -1
      })
      const x = ler().sugestoes.find((y) => y.id === id)
      if (x && db) {
        db.salvar(async (sb) =>
          ok(x.votei
            ? await sb.from('sugestao_votos').insert({ sugestao_id: id, perfil_id: db.perfilId })
            : await sb.from('sugestao_votos').delete().eq('sugestao_id', id).eq('perfil_id', db.perfilId)),
        )
      }
    },
    /** Demonstração: marca como paga. Real: avisa que pagou o Pix (você dá baixa no painel). */
    pagarFatura(id: string) {
      const agora = new Date().toISOString()
      mudar((s) => {
        const f = s.faturas.find((x) => x.id === id)
        if (!f) return
        if (db) f.informado_em = agora
        else {
          f.status = 'paga'
          f.pago_em = agora
        }
      })
      db?.salvar(async (sb) => ok(await sb.rpc('informar_pagamento', { p_fatura: id })))
    },
    /** Troca o plano do Kort (só modo real; o banco ajusta a fatura) */
    escolherPlano(slug: string, nome: string, preco: number) {
      mudar((s) => {
        s.assinatura.plano = nome
        s.assinatura.plano_slug = slug
        s.assinatura.preco_centavos = preco
        for (const f of s.faturas) if (f.status === 'aberta' || f.status === 'vencida') f.valor_centavos = preco
      })
      db?.salvar(async (sb) => ok(await sb.rpc('escolher_plano', { p_barbearia: bid(), p_plano: slug })))
    },
  }
}

export type Acoes = ReturnType<typeof criarAcoes>

interface Contexto {
  estado: Estado
  acoes: Acoes
  modo: 'demo' | 'real'
  /** gravações ainda na fila */
  salvando: boolean
  recarregar(): Promise<void>
  /** horários marcados pelo link que o barbeiro ainda não viu */
  novos: Agendamento[]
  marcarVistos(): void
}

type Situacao = { tipo: 'vazio' } | { tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'pronto' }

const Ctx = createContext<(Contexto & { situacao: Situacao; estadoOuNulo: Estado | null }) | null>(null)

export function KortProvider({ children }: { children: ReactNode }) {
  const sessao = useSessao()
  const real = sessao.modo === 'real'
  const barbeariaId = real ? sessao.vinculo?.barbearia_id ?? null : null
  const perfilId = sessao.usuario?.id ?? null

  const [estado, setEstado] = useState<Estado | null>(() => (real ? null : carregarDemo()))
  const [situacao, setSituacao] = useState<Situacao>(real ? { tipo: 'vazio' } : { tipo: 'pronto' })
  const [pendentes, setPendentes] = useState(0)
  const ref = useRef(estado)
  ref.current = estado

  const mudar = useCallback((fn: Mutacao) => {
    if (!ref.current) return
    const prox = structuredClone(ref.current)
    fn(prox)
    ref.current = prox
    setEstado(prox)
  }, [])

  const recarregar = useCallback(async () => {
    if (!supabase || !barbeariaId || !perfilId) return
    setSituacao((s) => (ref.current ? s : { tipo: 'carregando' }))
    try {
      const e = await carregarEstado(supabase, barbeariaId, perfilId)
      ref.current = e
      setEstado(e)
      setSituacao({ tipo: 'pronto' })
    } catch (err) {
      setSituacao({ tipo: 'erro', msg: mensagemDeErro(err) })
    }
  }, [barbeariaId, perfilId])

  // troca de modo / de usuário
  useEffect(() => {
    if (!real) {
      const e = carregarDemo()
      ref.current = e
      setEstado(e)
      setSituacao({ tipo: 'pronto' })
      return
    }
    ref.current = null
    setEstado(null)
    setSituacao({ tipo: 'vazio' })
    if (barbeariaId) void recarregar()
  }, [real, barbeariaId, recarregar])

  // fila de gravação
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const banco = useMemo<Banco | null>(() => {
    if (!real || !supabase || !barbeariaId || !perfilId) return null
    const sb = supabase
    let recarregando = false
    const falhou = (err: unknown) => {
      avisarGlobal(mensagemDeErro(err), 'erro')
      if (!recarregando) {
        recarregando = true
        void recarregar().finally(() => { recarregando = false })
      }
    }
    return {
      sb,
      barbeariaId,
      perfilId,
      salvar(fn) {
        setPendentes((n) => n + 1)
        fila.current = fila.current
          .then(() => fn(sb))
          .catch(falhou)
          .finally(() => setPendentes((n) => n - 1))
      },
      recarregarAgendamento(id) {
        fila.current = fila.current.then(async () => {
          const a = await buscarAgendamento(sb, id).catch(() => null)
          if (!a) return
          mudar((s) => {
            const i = s.agendamentos.findIndex((x) => x.id === id)
            if (i >= 0) s.agendamentos[i] = a
            else s.agendamentos.push(a)
            s.agendamentos.sort((x, y) => x.inicio.localeCompare(y.inicio))
          })
        })
      },
      recarregarCliente(id) {
        fila.current = fila.current.then(async () => {
          const c = await buscarCliente(sb, id).catch(() => null)
          if (!c) return
          mudar((s) => {
            const x = s.clientes.find((y) => y.id === id)
            if (x) Object.assign(x, {
              total_visitas: c.total_visitas, total_gasto_centavos: c.total_gasto_centavos,
              primeira_visita_em: c.primeira_visita_em ? new Date(c.primeira_visita_em).toISOString() : null,
              ultima_visita_em: c.ultima_visita_em ? new Date(c.ultima_visita_em).toISOString() : null,
              frequencia_media_dias: c.frequencia_media_dias == null ? null : Number(c.frequencia_media_dias),
              proximo_retorno_previsto: c.proximo_retorno_previsto,
            })
          })
        })
      },
    }
  }, [real, barbeariaId, perfilId, mudar, recarregar])

  const acoes = useMemo(() => criarAcoes(mudar, () => ref.current!, banco), [mudar, banco])

  // Quando o barbeiro viu os horários novos pela última vez (por barbearia)
  const chaveVisto = `kort-visto-${barbeariaId ?? 'demo'}`
  const [visto, setVisto] = useState(() => new Date().toISOString())
  useEffect(() => {
    let v: string | null = null
    try { v = localStorage.getItem(chaveVisto) } catch { /* sem storage */ }
    const agora = new Date().toISOString()
    setVisto(v ?? agora)
    if (!v) try { localStorage.setItem(chaveVisto, agora) } catch { /* sem storage */ }
  }, [chaveVisto])
  const marcarVistos = useCallback(() => {
    const agora = new Date().toISOString()
    setVisto(agora)
    try { localStorage.setItem(chaveVisto, agora) } catch { /* sem storage */ }
  }, [chaveVisto])
  const novos = useMemo(
    () => (estado?.agendamentos ?? []).filter((a) => a.origem === 'link' && a.criado_em > visto && a.status !== 'cancelado'),
    [estado?.agendamentos, visto],
  )

  // Plano B do tempo real: a cada 30 s busca o que mudou na agenda
  useEffect(() => {
    if (!banco || situacao.tipo !== 'pronto') return
    let desde = new Date(Date.now() - 60_000).toISOString()
    const t = setInterval(async () => {
      const agora = new Date(Date.now() - 5_000).toISOString()
      const lista = await buscarAgendamentosAlterados(banco.sb, banco.barbeariaId, desde).catch(() => null)
      if (!lista) return
      desde = agora
      if (!lista.length) return
      mudar((s) => {
        for (const a of lista) {
          const i = s.agendamentos.findIndex((x) => x.id === a.id)
          if (i >= 0) s.agendamentos[i] = a
          else s.agendamentos.push(a)
        }
        s.agendamentos.sort((x, y) => x.inicio.localeCompare(y.inicio))
      })
    }, 30_000)
    return () => clearInterval(t)
  }, [banco, situacao.tipo, mudar])

  // horário novo pelo link aparece na agenda sem recarregar a página
  useEffect(() => {
    if (!banco || situacao.tipo !== 'pronto') return
    const canal = banco.sb
      .channel(`agenda-${banco.barbeariaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `barbearia_id=eq.${banco.barbeariaId}` }, (p) => {
        const id = (p.new as { id?: string })?.id
        if (!id) return
        // espera os serviços do agendamento serem gravados
        setTimeout(() => banco.recarregarAgendamento(id), 800)
      })
      .subscribe()
    return () => {
      void banco.sb.removeChannel(canal)
    }
  }, [banco, situacao.tipo])

  // demonstração: salva no navegador
  useEffect(() => {
    if (real || !estado) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(estado))
      } catch {
        /* sem espaço ou modo privado: segue só em memória */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [estado, real])

  // não deixa fechar a aba com gravação pendente
  useEffect(() => {
    if (!pendentes) return
    const f = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [pendentes])

  const valor = useMemo(
    () => ({
      estado: estado as Estado,
      estadoOuNulo: estado,
      acoes,
      modo: sessao.modo,
      salvando: pendentes > 0,
      recarregar,
      situacao,
      novos,
      marcarVistos,
    }),
    [estado, acoes, sessao.modo, pendentes, recarregar, situacao, novos, marcarVistos],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Para as telas do app: só é usado depois que o estado carregou. */
export function useKort(): Contexto {
  const c = useContext(Ctx)
  if (!c) throw new Error('useKort precisa estar dentro de <KortProvider>')
  return c
}

/** Para as guardas de rota: mostra carregando/erro antes do estado existir. */
export function useSituacao() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSituacao precisa estar dentro de <KortProvider>')
  return { situacao: c.situacao, temEstado: !!c.estadoOuNulo, recarregar: c.recarregar }
}

/** Atalhos de leitura usados em várias telas */
export function useMapas() {
  const { estado } = useKort()
  return useMemo(() => {
    const membro = new Map(estado.membros.map((m) => [m.id, m]))
    const cliente = new Map(estado.clientes.map((c) => [c.id, c]))
    const servico = new Map(estado.servicos.map((s) => [s.id, s]))
    const config = new Map(estado.configuracoes.map((c) => [c.membro_id, c]))
    return { membro, cliente, servico, config }
  }, [estado.membros, estado.clientes, estado.servicos, estado.configuracoes])
}
