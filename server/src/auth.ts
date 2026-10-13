// Autenticação: o front faz login no Supabase Auth e manda o token no
// cabeçalho "Authorization: Bearer <token>". Aqui a gente confere a
// assinatura do token (sem chamar a internet a cada pedido) e descobre quem é.

import type { FastifyReply, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { config } from './config.js'
import { sql } from './db.js'
import { naoAutenticado, proibido } from './erros.js'

export interface Usuario {
  id: string
  nome: string
  super_admin: boolean
}

export interface Membro {
  id: string
  barbearia_id: string
  papel: 'dono' | 'barbeiro' | 'recepcao'
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: Usuario
  }
}

const segredo = config.SUPABASE_JWT_SECRET ? new TextEncoder().encode(config.SUPABASE_JWT_SECRET) : null
const jwks = !segredo && config.SUPABASE_URL ? createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', config.SUPABASE_URL)) : null

async function verificar(token: string): Promise<JWTPayload> {
  if (segredo) return (await jwtVerify(token, segredo, { audience: 'authenticated' })).payload
  if (jwks) return (await jwtVerify(token, jwks, { audience: 'authenticated' })).payload
  throw naoAutenticado()
}

/** preHandler: exige login válido e carrega o perfil em request.usuario */
export async function exigirLogin(req: FastifyRequest, _res: FastifyReply) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) throw naoAutenticado()
  let payload: JWTPayload
  try {
    payload = await verificar(h.slice(7))
  } catch {
    throw naoAutenticado()
  }
  const [perfil] = await sql<Usuario[]>`
    select id, nome, super_admin from perfis where id = ${payload.sub!}
  `
  if (!perfil) throw naoAutenticado()
  req.usuario = perfil
  sql`update perfis set ultimo_acesso_em = now() where id = ${perfil.id}`.catch(() => {})
}

/** preHandler: só o super admin (você) */
export async function exigirSuperAdmin(req: FastifyRequest, res: FastifyReply) {
  await exigirLogin(req, res)
  if (!req.usuario!.super_admin) throw proibido()
}

/** Confere se o usuário faz parte da barbearia. Super admin passa sempre. */
export async function membroDa(req: FastifyRequest, barbeariaId: string, papeis?: Membro['papel'][]): Promise<Membro | null> {
  const u = req.usuario
  if (!u) throw naoAutenticado()
  const [m] = await sql<Membro[]>`
    select id, barbearia_id, papel from membros
    where barbearia_id = ${barbeariaId} and perfil_id = ${u.id} and ativo
  `
  if (u.super_admin && !m) return null
  if (!m) throw proibido('Você não faz parte desta barbearia.')
  if (papeis && !papeis.includes(m.papel)) throw proibido('Só o dono pode fazer isso.')
  return m
}
