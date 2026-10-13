// Token do link "meu horário". O cliente não tem login: quem tem o link
// pode ver, remarcar ou cancelar aquele horário e só aquele.
// É uma assinatura HMAC do id, então não precisa guardar nada no banco.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

export const tokenDoAgendamento = (id: string) =>
  createHmac('sha256', config.TOKEN_SECRET).update(`agendamento:${id}`).digest('base64url').slice(0, 24)

export function tokenValido(id: string, token: string | undefined) {
  if (!token) return false
  const certo = Buffer.from(tokenDoAgendamento(id))
  const recebido = Buffer.from(token)
  return certo.length === recebido.length && timingSafeEqual(certo, recebido)
}

export const linkMeuHorario = (slug: string, id: string) =>
  `${config.LINK_PUBLICO_BASE}/b/${slug}/horario/${id}?t=${tokenDoAgendamento(id)}`
