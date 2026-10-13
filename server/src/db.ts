// Conexão com o Postgres (Supabase hoje, VPS amanhã: só muda a DATABASE_URL).
//
// Importante: o back-end conecta com um usuário que IGNORA o RLS. Por isso
// toda rota que mexe em dados de uma barbearia confere antes se quem chamou
// faz parte dela (veja auth.ts). Nunca exponha esta conexão no front.

import postgres from 'postgres'
import { config } from './config.js'

export const sql = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  // O pooler do Supabase em modo "transaction" não aceita prepared statements.
  prepare: !config.DATABASE_URL.includes(':6543'),
  // numeric e bigint chegam como texto por padrão; aqui viram número.
  types: {
    numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
  },
  onnotice: () => {},
})

export type Sql = typeof sql
type Tipos = { numeric: number; bigint: number }
export type Tx = postgres.TransactionSql<Tipos>
