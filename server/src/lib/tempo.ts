// Datas no fuso da barbearia. O servidor roda em UTC; o barbeiro pensa em
// horário de Brasília. Toda conversão passa por aqui.

import { DateTime } from 'luxon'
import { config } from '../config.js'

export const FUSO = config.FUSO

/** "2026-10-12" + "14:30" no fuso -> Date (instante real) */
export function instante(data: string, hora: string, fuso = FUSO): Date {
  const d = DateTime.fromISO(`${data}T${hora}`, { zone: fuso })
  if (!d.isValid) throw new Error(`Data/hora inválida: ${data} ${hora}`)
  return d.toJSDate()
}

/** Início e fim do dia (no fuso) como instantes */
export function limitesDoDia(data: string, fuso = FUSO): [Date, Date] {
  const ini = DateTime.fromISO(data, { zone: fuso }).startOf('day')
  return [ini.toJSDate(), ini.plus({ days: 1 }).toJSDate()]
}

/** 0 = domingo ... 6 = sábado (igual ao banco) */
export const diaSemana = (data: string, fuso = FUSO) => DateTime.fromISO(data, { zone: fuso }).weekday % 7

/** minutos desde a meia-noite, no fuso */
export const minutosNoDia = (d: Date, fuso = FUSO) => {
  const x = DateTime.fromJSDate(d, { zone: fuso })
  return x.hour * 60 + x.minute
}

export const hojeNoFuso = (fuso = FUSO) => DateTime.now().setZone(fuso).toISODate()!

export const agoraNoFuso = (fuso = FUSO) => DateTime.now().setZone(fuso)

/** "09:30:00" ou "09:30" -> 570 */
export const hhmmParaMin = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
export const minParaHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const diasEntre = (a: string, b: string) =>
  Math.round(DateTime.fromISO(b).diff(DateTime.fromISO(a), 'days').days)

/** "quinta, 15/10" */
export function dataCurtaBR(d: Date, fuso = FUSO) {
  return DateTime.fromJSDate(d, { zone: fuso }).setLocale('pt-BR').toFormat("cccc, dd/LL")
}
export const horaBR = (d: Date, fuso = FUSO) => DateTime.fromJSDate(d, { zone: fuso }).toFormat('HH:mm')
