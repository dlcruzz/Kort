// Cliente do Supabase. Só liga quando o .env.local (ou as variáveis do
// Cloudflare/Vercel) tem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
// Sem elas, o app roda em modo demonstração.
//
// Use sempre a chave "anon public". A service_role nunca vai no front.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && anon)

export const supabase = supabaseConfigurado ? createClient(url!, anon!) : null
