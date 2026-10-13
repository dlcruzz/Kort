// Lê e valida as variáveis de ambiente uma vez só, na subida.
// Se faltar algo obrigatório, o servidor nem liga e diz o que falta.

import { z } from 'zod'

const simNao = z.enum(['true', 'false']).default('true').transform((v) => v === 'true')

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),
  FUSO: z.string().default('America/Sao_Paulo'),

  DATABASE_URL: z.string().min(1, 'Informe DATABASE_URL (conexão do Postgres/Supabase)'),

  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_JWT_SECRET: z.string().optional(),

  CORS_ORIGENS: z.string().default('http://localhost:5173'),
  LINK_PUBLICO_BASE: z.string().default('http://localhost:5173'),
  TOKEN_SECRET: z.string().min(16, 'TOKEN_SECRET precisa ter pelo menos 16 caracteres'),

  PIX_CHAVE: z.string().default(''),
  PIX_NOME: z.string().default('KORT'),
  PIX_CIDADE: z.string().default('SAO PAULO'),

  WHATSAPP_PROVEDOR: z.enum(['console', 'zapi']).default('console'),
  ZAPI_INSTANCIA: z.string().optional(),
  ZAPI_TOKEN: z.string().optional(),
  ZAPI_CLIENT_TOKEN: z.string().optional(),

  WEBHOOK_TOKEN: z.string().optional(),
  ROTINAS_ATIVAS: simNao,
})

const resultado = Env.safeParse(process.env)
if (!resultado.success) {
  console.error('Configuração inválida no .env:')
  for (const e of resultado.error.issues) console.error(`  ${e.path.join('.')}: ${e.message}`)
  process.exit(1)
}

export const config = resultado.data

if (!config.SUPABASE_JWT_SECRET && !config.SUPABASE_URL) {
  console.warn('Aviso: sem SUPABASE_JWT_SECRET nem SUPABASE_URL, as rotas que exigem login vão recusar tudo.')
}
