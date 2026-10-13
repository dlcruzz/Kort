// Estado do painel admin (demonstração). No Supabase isso vem das views
// admin_barbearias, admin_uso_funcionalidades, admin_indicadores e das
// tabelas faturas, sugestoes e admin_logs (só o super admin enxerga).

import { useSyncExternalStore } from 'react'
import { adminBarbearias, adminFaturas, adminSugestoes } from '../data/admin'
import type { AdminBarbearia, StatusAssinSaas, StatusSugestao } from './types'

interface Log { id: number; acao: string; barbearia: string; em: string }

let estado = {
  barbearias: adminBarbearias,
  faturas: adminFaturas,
  sugestoes: adminSugestoes,
  logs: [] as Log[],
}
const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((f) => f())

function mudar(fn: (s: typeof estado) => typeof estado, log?: { acao: string; barbearia: string }) {
  estado = fn(estado)
  if (log) estado = { ...estado, logs: [{ id: Date.now(), ...log, em: new Date().toISOString() }, ...estado.logs] }
  emitir()
}

export const adminAcoes = {
  darBaixa(faturaId: string) {
    const f = estado.faturas.find((x) => x.id === faturaId)
    // Supabase: update faturas set status='paga', pago_em=now(), confirmado_por=auth.uid()
    mudar((s) => ({
      ...s,
      faturas: s.faturas.map((x) => (x.id === faturaId ? { ...x, status: 'paga', pago_em: new Date().toISOString() } : x)),
      barbearias: s.barbearias.map((b) => (b.id === f?.barbearia_id && b.status_assinatura === 'inadimplente' ? { ...b, status_assinatura: 'ativa' } : b)),
    }), { acao: 'Baixa de mensalidade', barbearia: f?.barbearia ?? '' })
  },
  mudarStatus(id: string, status: StatusAssinSaas) {
    const b = estado.barbearias.find((x) => x.id === id)
    mudar((s) => ({ ...s, barbearias: s.barbearias.map((x) => (x.id === id ? { ...x, status_assinatura: status } : x)) }), { acao: `Status alterado para ${status}`, barbearia: b?.nome ?? '' })
  },
  estenderTeste(id: string, dias: number) {
    const b = estado.barbearias.find((x) => x.id === id)
    mudar((s) => ({
      ...s,
      barbearias: s.barbearias.map((x) => {
        if (x.id !== id) return x
        const base = x.teste_ate ? new Date(x.teste_ate) : new Date()
        base.setDate(base.getDate() + dias)
        return { ...x, status_assinatura: 'teste', teste_ate: base.toISOString().slice(0, 10) } as AdminBarbearia
      }),
    }), { acao: `Teste estendido em ${dias} dias`, barbearia: b?.nome ?? '' })
  },
  mudarSugestao(id: string, status: StatusSugestao) {
    mudar((s) => ({ ...s, sugestoes: s.sugestoes.map((x) => (x.id === id ? { ...x, status } : x)) }))
  },
}

export function useAdmin() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f) },
    () => estado,
  )
}
