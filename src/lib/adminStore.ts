// Estado do painel admin Kort.
//
// Modo real: views admin_barbearias e admin_uso_funcionalidades, tabelas
// faturas, sugestoes e admin_logs (o RLS só deixa o super admin ler) e as
// funções admin_* do banco para as ações (cada uma grava em admin_logs).
// Demonstração: dados de exemplo de src/data/admin.ts.

import { useEffect, useSyncExternalStore } from 'react'
import { adminBarbearias, adminFaturas, adminMrrHistorico, adminSugestoes, adminUso } from '../data/admin'
import type { AdminBarbearia, AdminUsoFuncionalidade, Fatura, StatusAssinSaas, StatusSugestao, Sugestao } from './types'
import { supabase } from './supabase'
import { mensagemDeErro, ok } from './banco'
import { avisarGlobal } from '../components/avisos'
import { useSessao } from './sessao'

interface Log { id: number; acao: string; barbearia: string; barbearia_id?: string | null; em: string }

interface EstadoAdmin {
  modo: 'demo' | 'real'
  carregando: boolean
  barbearias: AdminBarbearia[]
  faturas: (Fatura & { barbearia: string; informado_em?: string | null })[]
  sugestoes: (Sugestao & { barbearia: string })[]
  uso: AdminUsoFuncionalidade[]
  mrrHistorico: { mes: number; valor: number }[]
  logs: Log[]
}

const DEMO: EstadoAdmin = {
  modo: 'demo',
  carregando: false,
  barbearias: adminBarbearias,
  faturas: adminFaturas,
  sugestoes: adminSugestoes,
  uso: adminUso,
  mrrHistorico: adminMrrHistorico,
  logs: [],
}

let estado: EstadoAdmin = DEMO
const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((f) => f())

function mudar(fn: (s: EstadoAdmin) => EstadoAdmin, log?: { acao: string; barbearia: string }) {
  estado = fn(estado)
  if (log && estado.modo === 'demo') estado = { ...estado, logs: [{ id: Date.now(), ...log, em: new Date().toISOString() }, ...estado.logs] }
  emitir()
}

// Nomes dos módulos dos eventos do banco -> nomes do painel
const MODULO: Record<string, string> = {
  agendamento: 'agenda', agenda: 'agenda', comanda: 'caixa', mensagem: 'lembretes', relatorio: 'relatorios',
  lista_espera: 'lista_espera', financeiro: 'financeiro', status_horarios: 'marketing',
}

/** Uma linha por módulo (o banco devolve uma por evento). */
function juntarUso(linhas: AdminUsoFuncionalidade[]): AdminUsoFuncionalidade[] {
  const m = new Map<string, AdminUsoFuncionalidade>()
  for (const u of linhas) {
    const modulo = MODULO[u.modulo] ?? u.modulo
    const x = m.get(modulo)
    if (!x) m.set(modulo, { ...u, modulo })
    else {
      x.total_30d += u.total_30d
      x.barbearias_que_usam = Math.max(x.barbearias_que_usam, u.barbearias_que_usam)
      x.evento = `${x.evento}, ${u.evento}`
    }
  }
  return [...m.values()].sort((a, b) => b.total_30d - a.total_30d)
}

type L = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export async function carregarAdmin() {
  if (!supabase) return
  const sb = supabase
  mudar((s) => ({ ...s, modo: 'real', carregando: true }))
  try {
    const desde = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10)
    const [bars, fats, sugs, votos, uso, logs] = await Promise.all([
      sb.from('admin_barbearias').select('*').order('criado_em', { ascending: false }).then(ok),
      sb.from('faturas').select('*, barbearias(nome)').gte('competencia', desde).order('vencimento', { ascending: false }).then(ok),
      sb.from('sugestoes').select('*, barbearias(nome)').order('criado_em', { ascending: false }).then(ok),
      sb.from('sugestao_votos').select('sugestao_id').then(ok),
      sb.from('admin_uso_funcionalidades').select('*').then(ok),
      sb.from('admin_logs').select('id, acao, detalhes, criado_em, barbearia_id, barbearias(nome)').order('criado_em', { ascending: false }).limit(200).then(ok),
    ])
    const contagem = new Map<string, number>()
    for (const v of votos ?? []) contagem.set(v.sugestao_id, (contagem.get(v.sugestao_id) ?? 0) + 1)

    const faturas = (fats ?? []).map((f: L) => ({
      id: f.id, barbearia_id: f.barbearia_id, barbearia: f.barbearias?.nome ?? '', competencia: f.competencia,
      valor_centavos: f.valor_centavos, vencimento: f.vencimento, status: f.status, pix_copia_cola: f.pix_copia_cola,
      pago_em: f.pago_em, txid: f.txid, informado_em: f.informado_em,
    }))
    const hoje = new Date()
    const mrrHistorico = [-5, -4, -3, -2, -1, 0].map((mes) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + mes, 1)
      const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      return { mes, valor: faturas.filter((f) => f.status === 'paga' && f.competencia === comp).reduce((t, f) => t + f.valor_centavos, 0) }
    })
    const NOMES_ACAO: Record<string, string> = {
      baixa_fatura: 'Baixa de mensalidade', mudar_status: 'Status alterado', estender_teste: 'Teste estendido', trocar_plano: 'Plano trocado',
    }

    estado = {
      modo: 'real',
      carregando: false,
      barbearias: (bars ?? []).map((b: L) => ({
        ...b, uso_modulos: b.uso_modulos ?? {}, ultimo_uso: b.ultimo_uso, telefone: b.telefone ?? '',
      }) as AdminBarbearia),
      faturas,
      sugestoes: (sugs ?? []).map((s: L) => ({
        id: s.id, barbearia_id: s.barbearia_id, barbearia: s.barbearias?.nome ?? '', titulo: s.titulo, descricao: s.descricao,
        status: s.status, votos: contagem.get(s.id) ?? 0, votei: false, criado_em: s.criado_em,
      })),
      uso: juntarUso((uso ?? []) as AdminUsoFuncionalidade[]),
      mrrHistorico,
      logs: (logs ?? []).map((l: L) => ({
        id: l.id,
        acao: `${NOMES_ACAO[l.acao] ?? l.acao}${l.detalhes?.status ? ` para ${l.detalhes.status}` : ''}${l.detalhes?.dias ? ` em ${l.detalhes.dias} dias` : ''}`,
        barbearia: l.barbearias?.nome ?? '', barbearia_id: l.barbearia_id, em: l.criado_em,
      })),
    }
    emitir()
  } catch (e) {
    mudar((s) => ({ ...s, carregando: false }))
    avisarGlobal(mensagemDeErro(e), 'erro')
  }
}

async function rpc(nome: string, args: Record<string, unknown>) {
  if (!supabase) return
  const { error } = await supabase.rpc(nome, args)
  if (error) avisarGlobal(mensagemDeErro(error), 'erro')
  await carregarAdmin()
}

export const adminAcoes = {
  darBaixa(faturaId: string) {
    const f = estado.faturas.find((x) => x.id === faturaId)
    mudar((s) => ({
      ...s,
      faturas: s.faturas.map((x) => (x.id === faturaId ? { ...x, status: 'paga', pago_em: new Date().toISOString() } : x)),
      barbearias: s.barbearias.map((b) => (b.id === f?.barbearia_id && (b.status_assinatura === 'inadimplente' || b.status_assinatura === 'suspensa') ? { ...b, status_assinatura: 'ativa' } : b)),
    }), { acao: 'Baixa de mensalidade', barbearia: f?.barbearia ?? '' })
    if (estado.modo === 'real') void rpc('admin_baixa_fatura', { p_fatura: faturaId })
  },
  mudarStatus(id: string, status: StatusAssinSaas) {
    const b = estado.barbearias.find((x) => x.id === id)
    mudar((s) => ({ ...s, barbearias: s.barbearias.map((x) => (x.id === id ? { ...x, status_assinatura: status } : x)) }), { acao: `Status alterado para ${status}`, barbearia: b?.nome ?? '' })
    if (estado.modo === 'real') void rpc('admin_mudar_status', { p_barbearia: id, p_status: status })
  },
  estenderTeste(id: string, dias: number) {
    const b = estado.barbearias.find((x) => x.id === id)
    mudar((s) => ({
      ...s,
      barbearias: s.barbearias.map((x) => {
        if (x.id !== id) return x
        const base = x.teste_ate && new Date(x.teste_ate) > new Date() ? new Date(x.teste_ate) : new Date()
        base.setDate(base.getDate() + dias)
        return { ...x, status_assinatura: 'teste', teste_ate: base.toISOString().slice(0, 10) } as AdminBarbearia
      }),
    }), { acao: `Teste estendido em ${dias} dias`, barbearia: b?.nome ?? '' })
    if (estado.modo === 'real') void rpc('admin_estender_teste', { p_barbearia: id, p_dias: dias })
  },
  mudarSugestao(id: string, status: StatusSugestao) {
    mudar((s) => ({ ...s, sugestoes: s.sugestoes.map((x) => (x.id === id ? { ...x, status } : x)) }))
    if (estado.modo === 'real' && supabase) {
      void supabase.from('sugestoes').update({ status }).eq('id', id).then(({ error }) => {
        if (error) avisarGlobal(mensagemDeErro(error), 'erro')
      })
    }
  },
}

export function useAdmin() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f) },
    () => estado,
  )
}

/** Liga o painel no banco quando é o super admin de verdade. */
export function useCarregarAdmin() {
  const sessao = useSessao()
  const real = sessao.modo === 'real' && !!sessao.perfil?.super_admin
  useEffect(() => {
    if (real) void carregarAdmin()
    else {
      estado = DEMO
      emitir()
    }
  }, [real])
}
