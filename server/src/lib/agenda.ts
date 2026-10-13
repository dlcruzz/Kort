// Horários livres, calculados no servidor com os dados do banco.
// É a mesma regra do front (src/lib/agenda.ts), só que aqui é a que vale:
// o front mostra, o servidor confere antes de gravar.

import type { Sql, Tx } from '../db.js'
import { hhmmParaMin, limitesDoDia, diaSemana, minutosNoDia, minParaHhmm, agoraNoFuso, hojeNoFuso } from './tempo.js'

type Banco = Sql | Tx

export interface ParamsLivres {
  barbeariaId: string
  membroId: string
  data: string // YYYY-MM-DD no fuso da barbearia
  duracao: number // minutos
  grade: number // de quantos em quantos minutos
  fuso: string
  ignorarAgendamentoId?: string
  antecedenciaMin?: number // não oferece horário que começa em menos de X minutos
}

export async function horariosLivres(db: Banco, p: ParamsLivres): Promise<number[]> {
  const dw = diaSemana(p.data, p.fuso)
  const [ini, fim] = limitesDoDia(p.data, p.fuso)

  const turnos = await db<{ inicio: string; fim: string }[]>`
    select inicio::text, fim::text from jornadas
    where membro_id = ${p.membroId} and dia_semana = ${dw}
    order by inicio
  `
  if (!turnos.length) return []

  const ocupados = await db<{ inicio: Date; fim: Date }[]>`
    select inicio, fim from agendamentos
    where membro_id = ${p.membroId}
      and status not in ('cancelado', 'faltou')
      and inicio < ${fim} and fim > ${ini}
      and id is distinct from ${p.ignorarAgendamentoId ?? null}::uuid
    union all
    select inicio, fim from bloqueios
    where barbearia_id = ${p.barbeariaId}
      and (membro_id = ${p.membroId} or membro_id is null)
      and inicio < ${fim} and fim > ${ini}
  `
  const faixas = ocupados.map((o) => [
    o.inicio < ini ? 0 : minutosNoDia(o.inicio, p.fuso),
    o.fim >= fim ? 24 * 60 : minutosNoDia(o.fim, p.fuso),
  ])

  const hoje = hojeNoFuso(p.fuso)
  if (p.data < hoje) return []
  const agora = agoraNoFuso(p.fuso)
  const minimo = p.data === hoje ? agora.hour * 60 + agora.minute + (p.antecedenciaMin ?? 30) : -1

  const livres: number[] = []
  for (const t of turnos) {
    const a = hhmmParaMin(t.inicio)
    const b = hhmmParaMin(t.fim)
    for (let m = a; m + p.duracao <= b; m += p.grade) {
      if (m < minimo) continue
      if (faixas.some(([x, y]) => m < y && m + p.duracao > x)) continue
      livres.push(m)
    }
  }
  return livres
}

/** Horários livres de vários barbeiros juntos: { "09:00": [membroId, ...] } */
export async function horariosDeVarios(db: Banco, membros: string[], base: Omit<ParamsLivres, 'membroId'>) {
  const mapa = new Map<number, string[]>()
  for (const id of membros) {
    for (const m of await horariosLivres(db, { ...base, membroId: id })) {
      mapa.set(m, [...(mapa.get(m) ?? []), id])
    }
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([m, quem]) => ({ hora: minParaHhmm(m), membros: quem }))
}
