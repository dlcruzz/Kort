import type { FastifyInstance } from 'fastify'
import { sql } from '../db.js'

export async function rotasSaude(app: FastifyInstance) {
  // Para o monitor do VPS saber se está tudo de pé
  app.get('/saude', async () => {
    const [r] = await sql<{ agora: Date }[]>`select now() as agora`
    return { ok: true, banco: 'ok', hora_banco: r.agora }
  })
}
