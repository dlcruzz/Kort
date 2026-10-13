// Dados da página pública (cliente sem login).
//
// Modo real: funções do banco (supabase/producao.sql) chamadas com a chave
// anônima: pagina_publica, agendar_publico, meu_horario, remarcar_publico,
// cancelar_publico, confirmar_publico. O cliente só vê horários ocupados,
// nunca o nome de quem marcou.
//
// Demonstração (ou o slug de exemplo): usa os dados de exemplo do navegador.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useSessao } from './sessao'
import { useKort } from './store'
import { criarSeed, type Estado } from '../data/seed'
import { mensagemDeErro } from './banco'
import { somaMinutos, uid } from './format'
import type { Agendamento, Avaliacao, Barbearia, Bloqueio, HorarioFuncionamento, Jornada, Membro, Servico } from './types'

export const SLUG_DEMO = 'esquina-77'

export interface DadosPublicos {
  barbearia: Barbearia
  membros: Membro[]
  servicos: Servico[]
  horarios: HorarioFuncionamento[]
  jornadas: Jornada[]
  /** só horário e barbeiro (para calcular o que está livre) */
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  avaliacoes: Array<Avaliacao & { cliente_nome: string | null }>
}

export type Situacao = 'carregando' | 'pronto' | 'nao_encontrada' | 'erro'

export interface PedidoAgendamento {
  servicoIds: string[]
  membroId: string
  inicio: Date
  nome: string
  telefone: string
  observacao?: string
}

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function mapear(d: J): DadosPublicos {
  return {
    barbearia: d.barbearia,
    membros: d.membros ?? [],
    servicos: d.servicos ?? [],
    horarios: d.horarios ?? [],
    jornadas: d.jornadas ?? [],
    agendamentos: (d.ocupados ?? []).map((a: J) => ({
      id: a.id, membro_id: a.membro_id, inicio: new Date(a.inicio).toISOString(), fim: new Date(a.fim).toISOString(), status: a.status,
      cliente_id: '', origem: 'link', valor_previsto_centavos: 0, observacao_cliente: null, confirmado_em: null, servicos: [], criado_em: '',
    })),
    bloqueios: (d.bloqueios ?? []).map((b: J) => ({ ...b, inicio: new Date(b.inicio).toISOString(), fim: new Date(b.fim).toISOString(), motivo: null })),
    avaliacoes: (d.avaliacoes ?? []).map((a: J) => ({ ...a, cliente_id: '' })),
  }
}

// cópia dos dados de exemplo para quem abre a página de exemplo sem estar na demo
let demoSolto: Estado | null = null

/** Usa os dados de exemplo: do app (modo demo) ou uma cópia só desta página. */
function useDemo(ativo: boolean) {
  const sessao = useSessao()
  const kort = useKort()
  const doApp = sessao.modo === 'demo'
  const [local, setLocalBruto] = useState(() => (ativo && !doApp ? (demoSolto ??= criarSeed()) : null))
  const setLocal = (fn: (s: Estado | null) => Estado | null) => setLocalBruto((s) => (demoSolto = fn(s)))
  const estado = doApp ? kort.estado : local

  const dados = useMemo<DadosPublicos | null>(() => {
    if (!ativo || !estado) return null
    const nomes = new Map(estado.clientes.map((c) => [c.id, c.nome.split(' ')[0]]))
    return {
      barbearia: estado.barbearia, membros: estado.membros, servicos: estado.servicos, horarios: estado.horarios,
      jornadas: estado.jornadas, agendamentos: estado.agendamentos, bloqueios: estado.bloqueios,
      avaliacoes: estado.avaliacoes.map((a) => ({ ...a, cliente_nome: nomes.get(a.cliente_id) ?? null })),
    }
  }, [ativo, estado])

  const agendar = useCallback(
    (p: PedidoAgendamento): Agendamento => {
      if (doApp) {
        return kort.acoes.criarAgendamento({
          novoCliente: { nome: p.nome, telefone: p.telefone }, membroId: p.membroId, inicio: p.inicio,
          servicoIds: p.servicoIds, origem: 'link', observacao: p.observacao,
        })
      }
      const servs = p.servicoIds.map((id) => local!.servicos.find((s) => s.id === id)!).filter(Boolean)
      const ag: Agendamento = {
        id: uid(), cliente_id: '', membro_id: p.membroId, inicio: p.inicio.toISOString(),
        fim: somaMinutos(p.inicio, servs.reduce((t, s) => t + s.duracao_min, 0)).toISOString(), status: 'agendado', origem: 'link',
        valor_previsto_centavos: servs.reduce((t, s) => t + s.preco_centavos, 0), observacao_cliente: p.observacao ?? null,
        confirmado_em: null, criado_em: new Date().toISOString(),
        servicos: servs.map((s) => ({ servico_id: s.id, nome: s.nome, preco_centavos: s.preco_centavos, duracao_min: s.duracao_min })),
      }
      setLocal((s) => (s ? { ...s, agendamentos: [...s.agendamentos, ag] } : s))
      return ag
    },
    [doApp, kort.acoes, local],
  )

  return { dados, agendar, kort: doApp ? kort : null }
}

export function usePaginaPublica(slug: string | undefined) {
  const sessao = useSessao()
  const demo = sessao.modo === 'demo' || slug === SLUG_DEMO || !supabase
  const d = useDemo(demo)
  const [dados, setDados] = useState<DadosPublicos | null>(null)
  const [situacao, setSituacao] = useState<Situacao>('carregando')

  const carregar = useCallback(async () => {
    if (demo || !supabase || !slug) return
    const { data, error } = await supabase.rpc('pagina_publica', { p_slug: slug })
    if (error) return setSituacao('erro')
    if (!data) return setSituacao('nao_encontrada')
    setDados(mapear(data))
    setSituacao('pronto')
  }, [demo, slug])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // de tempos em tempos, para os horários livres não ficarem velhos
  useEffect(() => {
    if (demo) return
    const t = setInterval(() => void carregar(), 60_000)
    return () => clearInterval(t)
  }, [demo, carregar])

  const agendar = useCallback(
    async (p: PedidoAgendamento): Promise<{ agendamento: Agendamento; link: string }> => {
      if (demo) {
        const ag = d.agendar(p)
        return { agendamento: ag, link: `/b/${slug}/horario/${ag.id}` }
      }
      const { data, error } = await supabase!.rpc('agendar_publico', {
        p_slug: slug, p_servicos: p.servicoIds, p_membro: p.membroId, p_inicio: p.inicio.toISOString(),
        p_nome: p.nome, p_telefone: p.telefone, p_observacao: p.observacao ?? null,
      })
      if (error) {
        void carregar()
        throw new Error(mensagemDeErro(error))
      }
      const servs = p.servicoIds.map((id) => dados!.servicos.find((s) => s.id === id)!).filter(Boolean)
      const dur = servs.reduce((t, s) => t + s.duracao_min, 0)
      const ag: Agendamento = {
        id: data.id, cliente_id: data.cliente_id, membro_id: p.membroId, inicio: p.inicio.toISOString(),
        fim: somaMinutos(p.inicio, dur).toISOString(), status: 'agendado', origem: 'link',
        valor_previsto_centavos: servs.reduce((t, s) => t + s.preco_centavos, 0), observacao_cliente: p.observacao ?? null,
        confirmado_em: null, criado_em: new Date().toISOString(), token_publico: data.token,
        servicos: servs.map((s) => ({ servico_id: s.id, nome: s.nome, preco_centavos: s.preco_centavos, duracao_min: s.duracao_min })),
      }
      void carregar()
      return { agendamento: ag, link: `/b/${slug}/horario/${data.id}?t=${data.token}` }
    },
    [demo, d, slug, dados, carregar],
  )

  if (demo) {
    const ok = !!d.dados && d.dados.barbearia.slug === slug && d.dados.barbearia.publicada
    return { demo, situacao: (ok ? 'pronto' : 'nao_encontrada') as Situacao, dados: ok ? d.dados : null, agendar }
  }
  return { demo, situacao, dados, agendar }
}

/** "Meu horário": o cliente vê, confirma, muda ou cancela pelo link. */
export function useMeuHorario(slug: string | undefined, id: string | undefined, token: string | null) {
  const sessao = useSessao()
  const demo = sessao.modo === 'demo' || slug === SLUG_DEMO || !supabase
  const d = useDemo(demo)
  const [dados, setDados] = useState<DadosPublicos | null>(null)
  const [ag, setAg] = useState<Agendamento | null>(null)
  const [situacao, setSituacao] = useState<Situacao>('carregando')

  const carregar = useCallback(async () => {
    if (demo || !supabase || !id) return
    if (!token) return setSituacao('nao_encontrada')
    const { data, error } = await supabase.rpc('meu_horario', { p_id: id, p_token: token })
    if (error) return setSituacao('erro')
    if (!data || data.barbearia?.slug !== slug) return setSituacao('nao_encontrada')
    setDados(mapear(data))
    const a = data.agendamento as J
    setAg({ ...a, inicio: new Date(a.inicio).toISOString(), fim: new Date(a.fim).toISOString() } as Agendamento)
    setSituacao('pronto')
  }, [demo, id, token, slug])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const chamar = useCallback(
    async (fn: string, extra: Record<string, unknown> = {}) => {
      const { error } = await supabase!.rpc(fn, { p_id: id, p_token: token, ...extra })
      if (error) throw new Error(mensagemDeErro(error))
      await carregar()
    },
    [id, token, carregar],
  )

  if (demo) {
    const k = d.kort
    const a = d.dados?.agendamentos.find((x) => x.id === id) ?? null
    const okSlug = d.dados?.barbearia.slug === slug
    return {
      demo,
      situacao: (a && okSlug ? 'pronto' : 'nao_encontrada') as Situacao,
      dados: d.dados,
      agendamento: a,
      async remarcar(inicio: Date) { if (k && a) k.acoes.remarcar(a.id, a.membro_id, inicio) },
      async cancelar() { if (k && a) k.acoes.mudarStatus(a.id, 'cancelado') },
      async confirmar() { if (k && a) k.acoes.mudarStatus(a.id, 'confirmado') },
    }
  }
  return {
    demo,
    situacao,
    dados,
    agendamento: ag,
    remarcar: (inicio: Date) => chamar('remarcar_publico', { p_inicio: inicio.toISOString() }),
    cancelar: () => chamar('cancelar_publico'),
    confirmar: () => chamar('confirmar_publico'),
  }
}
