// Estado da aplicação (modo demonstração).
//
// Tudo fica em memória e é salvo no localStorage do navegador, para você
// navegar e testar os fluxos sem backend. Cada ação aqui corresponde a uma
// operação no Supabase; os comentários "Supabase:" mostram qual.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { criarSeed, VERSAO_SEED, type Estado } from '../data/seed'
import type {
  Agendamento, AssinaturaClube, Barbearia, Cliente, Comanda, ComandaItem, Cupom, Despesa, FormaPagamento,
  HorarioFuncionamento, Jornada, ListaEspera, Membro, MembroConfiguracao, ModeloMensagem, OrigemAgendamento,
  PlanoClube, Produto, ProgramaFidelidade, Promocao, Servico, StatusAgendamento,
} from './types'
import { isoDia, somaDias, somaMinutos, uid } from './format'

const CHAVE = 'kort-demo'

function carregar(): Estado {
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

function criarAcoes(mudar: (fn: Mutacao) => void, ler: () => Estado) {
  const evento = (nome: string, meta: Record<string, unknown> = {}) => {
    // Supabase: insert into eventos (barbearia_id, perfil_id, evento, metadados)
    if (import.meta.env.DEV) console.debug('[evento]', nome, meta)
  }

  return {
    evento,

    resetarDemo() {
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
      // Supabase: rpc('agendar', {...}) - valida horário e cria cliente pelo telefone
      let criado!: Agendamento
      mudar((s) => {
        let clienteId = dados.clienteId
        if (!clienteId && dados.novoCliente) {
          const existente = s.clientes.find((c) => c.telefone === dados.novoCliente!.telefone)
          if (existente) clienteId = existente.id
          else {
            const novo: Cliente = {
              id: uid(), nome: dados.novoCliente.nome, telefone: dados.novoCliente.telefone, email: null,
              data_nascimento: null, observacoes: null, membro_preferido_id: dados.membroId, codigo_indicacao: null,
              indicado_por_id: null, aceita_mensagens: true, primeira_visita_em: null, ultima_visita_em: null,
              total_visitas: 0, total_gasto_centavos: 0, frequencia_media_dias: null, proximo_retorno_previsto: null,
              criado_em: new Date().toISOString(),
            }
            s.clientes.push(novo)
            clienteId = novo.id
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
      return criado
    },

    mudarStatus(id: string, status: StatusAgendamento) {
      // Supabase: update agendamentos set status = ... where id = ...
      mudar((s) => {
        const a = s.agendamentos.find((x) => x.id === id)
        if (!a) return
        a.status = status
        if (status === 'confirmado') a.confirmado_em = new Date().toISOString()
      })
      evento(`agendamento.${status}`)
    },

    remarcar(id: string, membroId: string, inicio: Date) {
      mudar((s) => {
        const a = s.agendamentos.find((x) => x.id === id)
        if (!a) return
        const dur = (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000
        a.membro_id = membroId
        a.inicio = inicio.toISOString()
        a.fim = somaMinutos(inicio, dur).toISOString()
        a.status = 'agendado'
        s.agendamentos.sort((x, y) => x.inicio.localeCompare(y.inicio))
      })
      evento('agendamento.remarcado')
    },

    criarBloqueio(membroId: string | null, inicio: Date, fim: Date, motivo: string) {
      mudar((s) => {
        s.bloqueios.push({ id: uid(), membro_id: membroId, inicio: inicio.toISOString(), fim: fim.toISOString(), motivo })
      })
      evento('agenda.bloqueio')
    },
    removerBloqueio(id: string) {
      mudar((s) => {
        s.bloqueios = s.bloqueios.filter((b) => b.id !== id)
      })
    },

    // ---------- comanda (caixa)
    abrirComanda(dados: { agendamentoId?: string | null; membroId: string; clienteId?: string | null }): string {
      const s0 = ler()
      if (dados.agendamentoId) {
        const ja = s0.comandas.find((c) => c.agendamento_id === dados.agendamentoId && c.status !== 'cancelada')
        if (ja) return ja.id
      }
      const id = uid()
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
        if (ag && (ag.status === 'agendado' || ag.status === 'confirmado')) ag.status = 'em_atendimento'
      })
      evento('comanda.aberta')
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
    },
    alterarQuantidade(comandaId: string, itemId: string, delta: number) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        const it = c?.itens.find((i) => i.id === itemId)
        if (!c || !it) return
        it.quantidade += delta
        if (it.quantidade <= 0) c.itens = c.itens.filter((i) => i.id !== itemId)
      })
    },
    definirDesconto(comandaId: string, centavos: number) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (c) c.desconto_centavos = Math.max(0, centavos)
      })
    },

    /** O cliente pagou o barbeiro por fora; aqui só se confirma. */
    confirmarPagamento(comandaId: string, forma: FormaPagamento) {
      // Supabase: update comandas set status='paga', forma_pagamento, pago_em=now(), confirmado_por=auth.uid()
      // O trigger tg_comanda_paga faz o resto (cliente, estoque, fidelidade, agendamento).
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (!c || c.status !== 'aberta') return
        const agora = new Date()
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
    },

    cancelarComanda(comandaId: string) {
      mudar((s) => {
        const c = s.comandas.find((x) => x.id === comandaId)
        if (c && c.status === 'aberta') c.status = 'cancelada'
      })
    },

    // ---------- cadastros
    salvarCliente(c: Partial<Cliente> & { nome: string; telefone: string }) {
      let id = c.id
      mudar((s) => {
        const ex = c.id ? s.clientes.find((x) => x.id === c.id) : null
        if (ex) Object.assign(ex, c)
        else {
          id = uid()
          s.clientes.push({
            id, email: null, data_nascimento: null, observacoes: null, membro_preferido_id: null, codigo_indicacao: null,
            indicado_por_id: null, aceita_mensagens: true, primeira_visita_em: null, ultima_visita_em: null, total_visitas: 0,
            total_gasto_centavos: 0, frequencia_media_dias: null, proximo_retorno_previsto: null, criado_em: new Date().toISOString(),
            ...c,
          } as Cliente)
        }
      })
      return id!
    },

    salvarServico(sv: Partial<Servico> & { nome: string }) {
      mudar((s) => {
        const ex = sv.id ? s.servicos.find((x) => x.id === sv.id) : null
        if (ex) Object.assign(ex, sv)
        else s.servicos.push({ id: uid(), descricao: null, preco_centavos: 0, duracao_min: 30, intervalo_min: 5, ativo: true,
          ordem: s.servicos.length, membros: s.membros.map((m) => m.id), ...sv } as Servico)
      })
      evento('servico.salvo')
    },

    salvarMembro(m: Partial<Membro> & { nome_exibicao: string }, cfg?: Partial<MembroConfiguracao>) {
      mudar((s) => {
        let ex = m.id ? s.membros.find((x) => x.id === m.id) : null
        if (ex) Object.assign(ex, m)
        else {
          ex = { id: uid(), barbearia_id: s.barbearia.id, perfil_id: null, papel: 'barbeiro', foto_url: null, bio: null,
            cor_agenda: '#7FB8FF', atende: true, ativo: true, ordem: s.membros.length, ...m } as Membro
          s.membros.push(ex)
          s.configuracoes.push({ membro_id: ex.id, comissao_servico_pct: 40, comissao_produto_pct: 10, meta_diaria_centavos: 30000,
            aluguel_cadeira_centavos: null, dia_vencimento_aluguel: null, eh_mei: true })
          // jornada padrão = horário da barbearia
          for (const h of s.horarios) s.jornadas.push({ id: uid(), membro_id: ex.id, dia_semana: h.dia_semana, inicio: h.abre, fim: h.fecha })
        }
        if (cfg) {
          const c = s.configuracoes.find((x) => x.membro_id === ex!.id)
          if (c) Object.assign(c, cfg)
        }
      })
    },

    salvarJornadas(membroId: string, jornadas: Omit<Jornada, 'id' | 'membro_id'>[]) {
      mudar((s) => {
        s.jornadas = s.jornadas.filter((j) => j.membro_id !== membroId)
        for (const j of jornadas) s.jornadas.push({ id: uid(), membro_id: membroId, ...j })
      })
    },

    salvarProduto(p: Partial<Produto> & { nome: string }) {
      mudar((s) => {
        const ex = p.id ? s.produtos.find((x) => x.id === p.id) : null
        if (ex) Object.assign(ex, p)
        else s.produtos.push({ id: uid(), preco_venda_centavos: 0, custo_centavos: null, estoque_atual: 0, estoque_minimo: 0, ativo: true, ...p } as Produto)
      })
    },
    entradaEstoque(produtoId: string, qtd: number) {
      mudar((s) => {
        const p = s.produtos.find((x) => x.id === produtoId)
        if (p) p.estoque_atual += qtd
      })
      evento('estoque.entrada')
    },

    salvarDespesa(d: Partial<Despesa> & { descricao: string; valor_centavos: number }) {
      mudar((s) => {
        const ex = d.id ? s.despesas.find((x) => x.id === d.id) : null
        if (ex) Object.assign(ex, d)
        else s.despesas.push({ id: uid(), membro_id: null, categoria: 'Outros', data: isoDia(new Date()), pago: true, ...d } as Despesa)
      })
      evento('financeiro.despesa')
    },
    removerDespesa(id: string) {
      mudar((s) => {
        s.despesas = s.despesas.filter((d) => d.id !== id)
      })
    },
    gerarAlugueisDoMes() {
      // Supabase: insert into alugueis_cadeira (...) para cada membro com aluguel configurado
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
    },
    marcarAluguelPago(id: string) {
      mudar((s) => {
        const a = s.alugueis.find((x) => x.id === id)
        if (a) {
          a.status = 'pago'
          a.pago_em = new Date().toISOString()
        }
      })
    },

    // ---------- relacionamento
    adicionarListaEspera(l: Omit<ListaEspera, 'id' | 'status' | 'criado_em'>) {
      mudar((s) => {
        s.listaEspera.push({ id: uid(), status: 'aguardando', criado_em: new Date().toISOString(), ...l })
      })
      evento('lista_espera.adicionado')
    },
    mudarListaEspera(id: string, status: ListaEspera['status']) {
      mudar((s) => {
        const l = s.listaEspera.find((x) => x.id === id)
        if (l) l.status = status
      })
    },
    salvarModelo(m: ModeloMensagem) {
      mudar((s) => {
        const ex = s.modelos.find((x) => x.id === m.id)
        if (ex) Object.assign(ex, m)
      })
    },
    registrarMensagem(clienteId: string, tipo: ModeloMensagem['tipo'], conteudo: string) {
      // Supabase: insert into mensagens (...) status 'pendente'; a Edge Function envia.
      mudar((s) => {
        s.mensagens.push({ id: uid(), cliente_id: clienteId, tipo, conteudo, status: 'enviada', enviada_em: new Date().toISOString(), gerou_agendamento: false })
      })
      evento(`mensagem.${tipo}`)
    },
    salvarCupom(c: Partial<Cupom> & { codigo: string }) {
      mudar((s) => {
        const ex = c.id ? s.cupons.find((x) => x.id === c.id) : null
        if (ex) Object.assign(ex, c)
        else s.cupons.push({ id: uid(), tipo: 'percentual', valor: 10, valido_ate: null, usos: 0, usos_max: null, ativo: true, ...c } as Cupom)
      })
    },
    salvarPromocao(p: Partial<Promocao> & { nome: string }) {
      mudar((s) => {
        const ex = p.id ? s.promocoes.find((x) => x.id === p.id) : null
        if (ex) Object.assign(ex, p)
        else s.promocoes.push({ id: uid(), dia_semana: null, hora_inicio: null, hora_fim: null, tipo: 'percentual', valor: 10, ativo: true, ...p } as Promocao)
      })
    },
    salvarFidelidade(f: ProgramaFidelidade) {
      mudar((s) => {
        s.fidelidade = f
      })
    },
    resgatarPremio(clienteId: string) {
      mudar((s) => {
        const custo = s.fidelidade.tipo === 'cartao_visitas' ? s.fidelidade.visitas_para_premio : 100
        s.movimentosFidelidade.push({ id: uid(), cliente_id: clienteId, tipo: 'resgate', pontos: -custo, criado_em: new Date().toISOString() })
      })
      evento('fidelidade.resgate')
    },
    salvarPlanoClube(p: Partial<PlanoClube> & { nome: string }) {
      mudar((s) => {
        const ex = p.id ? s.planosClube.find((x) => x.id === p.id) : null
        if (ex) Object.assign(ex, p)
        else s.planosClube.push({ id: uid(), descricao: null, preco_centavos: 0, usos_por_mes: null, ativo: true, ...p } as PlanoClube)
      })
    },
    assinarClube(clienteId: string, planoId: string, diaVencimento: number) {
      mudar((s) => {
        s.assinaturasClube.push({ id: uid(), cliente_id: clienteId, plano_clube_id: planoId, status: 'ativa', dia_vencimento: diaVencimento, pago_mes_atual: false })
      })
      evento('clube.assinatura_criada')
    },
    atualizarAssinaturaClube(id: string, dados: Partial<AssinaturaClube>) {
      mudar((s) => {
        const a = s.assinaturasClube.find((x) => x.id === id)
        if (a) Object.assign(a, dados)
      })
    },
    alternarAvaliacaoPublica(id: string) {
      mudar((s) => {
        const a = s.avaliacoes.find((x) => x.id === id)
        if (a) a.publica = !a.publica
      })
    },

    // ---------- barbearia
    salvarBarbearia(b: Partial<Barbearia>) {
      mudar((s) => {
        Object.assign(s.barbearia, b)
      })
    },
    salvarHorarios(h: Omit<HorarioFuncionamento, 'id'>[]) {
      mudar((s) => {
        s.horarios = h.map((x) => ({ id: uid(), ...x }))
      })
    },
    criarSugestao(titulo: string, descricao: string) {
      mudar((s) => {
        s.sugestoes.unshift({ id: uid(), barbearia_id: s.barbearia.id, titulo, descricao: descricao || null, status: 'nova', votos: 1, votei: true, criado_em: new Date().toISOString() })
      })
      evento('sugestao.criada')
    },
    votarSugestao(id: string) {
      mudar((s) => {
        const x = s.sugestoes.find((y) => y.id === id)
        if (!x) return
        x.votei = !x.votei
        x.votos += x.votei ? 1 : -1
      })
    },
    pagarFatura(id: string) {
      // Na vida real o barbeiro paga o Pix e você dá baixa no painel admin.
      mudar((s) => {
        const f = s.faturas.find((x) => x.id === id)
        if (f) f.status = 'paga'
        if (f) f.pago_em = new Date().toISOString()
      })
    },
  }
}

export type Acoes = ReturnType<typeof criarAcoes>

interface Contexto {
  estado: Estado
  acoes: Acoes
}

const Ctx = createContext<Contexto | null>(null)

export function KortProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(carregar)
  const ref = useRef(estado)
  ref.current = estado

  const mudar = useCallback((fn: Mutacao) => {
    setEstado((prev) => {
      const prox = structuredClone(prev)
      fn(prox)
      ref.current = prox
      return prox
    })
  }, [])

  const acoes = useMemo(() => criarAcoes(mudar, () => ref.current), [mudar])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(estado))
      } catch {
        /* sem espaço ou modo privado: segue só em memória */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [estado])

  return <Ctx.Provider value={{ estado, acoes }}>{children}</Ctx.Provider>
}

export function useKort() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useKort precisa estar dentro de <KortProvider>')
  return c
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
