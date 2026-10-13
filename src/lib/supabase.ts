// Cliente do Supabase.
//
// O projeto de produção já vem como padrão (a URL e a chave "anon public"
// são públicas: quem protege os dados são as regras de RLS do banco).
// As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY trocam o projeto.
// VITE_KORT_DEMO=1 desliga o banco e abre só a demonstração.
//
// A service_role NUNCA vai no front.

import { createClient } from '@supabase/supabase-js'

const PADRAO_URL = 'https://zlrdnwkihldhimlpneni.supabase.co'
const PADRAO_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpscmRud2tpaGxkaGltbHBuZW5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDY0NTYsImV4cCI6MjEwNzQ4MjQ1Nn0.GAdm6eGrY-2v5ZU9qQLqWpI0v1YuUaHydLxDFaceNzA'

const demo = import.meta.env.VITE_KORT_DEMO === '1'
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PADRAO_URL
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || PADRAO_ANON

export const supabaseConfigurado = !demo && Boolean(url && anon)

export const supabase = supabaseConfigurado ? createClient(url, anon) : null
