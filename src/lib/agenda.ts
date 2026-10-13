// Cálculo de horários livres. No banco, a mesma regra vira uma função RPC
// (ver "Próximos passos" na modelagem). Aqui roda no navegador com o mock.

import type { Agendamento, Bloqueio, Jornada } from './types'
import { hhmmParaMin, minutosDoDia, mesmoDia, minParaHhmm } from './format'

export interface Slot {
  minuto: number // minutos desde meia-noite
  hhmm: string
}

const ATIVO = (a: Agendamento) => a.status !== 'cancelado' && a.status !== 'faltou'

/**
 * Horários em que um barbeiro pode começar um atendimento de `duracao` minutos
 * no dia `dia`, respeitando jornada, bloqueios, agendamentos e a grade.
 */
export function horariosLivres(params: {
  dia: Date
  membroId: string
  duracao: number
  jornadas: Jornada[]
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  grade: number
  ignorarAgendamentoId?: string
  agora?: Date
}): Slot[] {
  const { dia, membroId, duracao, jornadas, agendamentos, bloqueios, grade } = params
  const agora = params.agora ?? new Date()
  const turnos = jornadas.filter((j) => j.membro_id === membroId && j.dia_semana === dia.getDay())
  if (!turnos.length) return []

  const ocupados: Array<[number, number]> = []
  for (const a of agendamentos) {
    if (a.membro_id !== membroId || !ATIVO(a) || a.id === params.ignorarAgendamentoId) continue
    const ini = new Date(a.inicio)
    if (!mesmoDia(ini, dia)) continue
    ocupados.push([minutosDoDia(ini), minutosDoDia(a.fim)])
  }
  for (const b of bloqueios) {
    if (b.membro_id && b.membro_id !== membroId) continue
    const ini = new Date(b.inicio)
    const fim = new Date(b.fim)
    if (!mesmoDia(ini, dia) && !mesmoDia(fim, dia)) continue
    ocupados.push([mesmoDia(ini, dia) ? minutosDoDia(ini) : 0, mesmoDia(fim, dia) ? minutosDoDia(fim) : 24 * 60])
  }

  const minimoHoje = mesmoDia(dia, agora) ? minutosDoDia(agora) + 30 : -1
  const slots: Slot[] = []
  for (const t of turnos) {
    const ini = hhmmParaMin(t.inicio)
    const fim = hhmmParaMin(t.fim)
    for (let m = ini; m + duracao <= fim; m += grade) {
      if (m < minimoHoje) continue
      if (ocupados.some(([a, b]) => m < b && m + duracao > a)) continue
      slots.push({ minuto: m, hhmm: minParaHhmm(m) })
    }
  }
  return slots.sort((a, b) => a.minuto - b.minuto)
}

/** Expediente do barbeiro no dia, em minutos: [inicio, fim] ou null se folga */
export function expediente(jornadas: Jornada[], membroId: string, dia: Date): [number, number] | null {
  const turnos = jornadas.filter((j) => j.membro_id === membroId && j.dia_semana === dia.getDay())
  if (!turnos.length) return null
  return [Math.min(...turnos.map((t) => hhmmParaMin(t.inicio))), Math.max(...turnos.map((t) => hhmmParaMin(t.fim)))]
}

/** Intervalos de pausa (ex.: almoço) entre os turnos do dia */
export function pausas(jornadas: Jornada[], membroId: string, dia: Date): Array<[number, number]> {
  const turnos = jornadas
    .filter((j) => j.membro_id === membroId && j.dia_semana === dia.getDay())
    .map((t) => [hhmmParaMin(t.inicio), hhmmParaMin(t.fim)] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (let i = 1; i < turnos.length; i++) if (turnos[i][0] > turnos[i - 1][1]) out.push([turnos[i - 1][1], turnos[i][0]])
  return out
}
