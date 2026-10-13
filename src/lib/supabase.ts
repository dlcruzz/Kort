// Cliente do Supabase.
//
// Hoje o app roda em modo demonstração (src/lib/store.tsx). Para ligar no
// banco de verdade:
//   1. Rode o kort_schema.sql no SQL Editor do Supabase.
//   2. Copie .env.example para .env.local e preencha URL e anon key.
//   3. Troque, ação por ação, o corpo das funções em store.tsx pela chamada
//      equivalente (os comentários "Supabase:" indicam qual).
//
// Exemplos:
//   const { data } = await supabase.from('agendamentos')
//     .select('*, agendamento_servicos(*)')
//     .gte('inicio', inicioDoDia).lt('inicio', fimDoDia)
//
//   await supabase.from('comandas')
//     .update({ status: 'paga', forma_pagamento: 'pix', pago_em: new Date().toISOString() })
//     .eq('id', comandaId)

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && anon)

export const supabase = supabaseConfigurado ? createClient(url!, anon!) : null
