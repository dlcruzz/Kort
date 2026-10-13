// Monta a API (sem ligar a porta). Separado do index.ts para os testes
// conseguirem chamar as rotas direto, sem subir servidor.

import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { config } from './config.js'
import { ErroHttp } from './erros.js'
import { rotasSaude } from './rotas/saude.js'
import { rotasPublicas } from './rotas/publico.js'
import { rotasBarbearia } from './rotas/barbearia.js'
import { rotasAdmin } from './rotas/admin.js'
import { rotasWebhooks } from './rotas/webhooks.js'

export async function criarApp() {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
    trustProxy: true, // atrás do Nginx/Cloudflare no VPS, pega o IP real do cliente
    bodyLimit: 256 * 1024,
  })

  await app.register(cors, {
    origin: config.CORS_ORIGENS.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })
  if (config.NODE_ENV !== 'test') await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

  // Erros com mensagem em português, no mesmo formato sempre: { erro, codigo }
  app.setErrorHandler((e, req, res) => {
    if (e instanceof ZodError) {
      const primeiro = e.issues[0]
      return res.status(400).send({ erro: primeiro?.message ?? 'Dados inválidos.', codigo: 'invalido', campos: e.issues.map((i) => i.path.join('.')) })
    }
    if (e instanceof ErroHttp) return res.status(e.status).send({ erro: e.message, codigo: e.codigo })
    const err = e as { statusCode?: number; message: string }
    if (err.statusCode === 429) return res.status(429).send({ erro: 'Muitas tentativas. Espere um pouco e tente de novo.', codigo: 'limite' })
    if (err.statusCode && err.statusCode < 500) return res.status(err.statusCode).send({ erro: err.message, codigo: 'requisicao' })
    req.log.error(e)
    return res.status(500).send({ erro: 'Algo deu errado do nosso lado. Tente de novo em instantes.', codigo: 'interno' })
  })

  app.setNotFoundHandler((_req, res) => res.status(404).send({ erro: 'Rota não encontrada.', codigo: 'nao_encontrado' }))

  await app.register(rotasSaude)
  await app.register(rotasPublicas)
  await app.register(rotasWebhooks)
  await app.register(rotasAdmin)
  await app.register(rotasBarbearia)

  return app
}
