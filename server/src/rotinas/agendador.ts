// Relógio das rotinas. A cada minuto:
//  - agenda lembretes e envia a fila de mensagens
//  - nas horas certas (horário de Brasília), roda as tarefas diárias
//
// Um "advisory lock" do Postgres garante que só um servidor rode as rotinas
// por vez, mesmo se você subir mais de uma cópia da API no VPS.

import { sql } from '../db.js'
import { agoraNoFuso } from '../lib/tempo.js'
import { enviarPendentes } from './fila.js'
import { gerarLembretes } from './lembretes.js'
import { convidarDeVolta } from './retorno.js'
import { resumoDoDia } from './resumo.js'
import { rotinaMensalidades } from './mensalidades.js'

const TRAVA = 770_077

const DIARIAS: Array<{ nome: string; hora: string; rodar: (hoje: string) => Promise<unknown> }> = [
  { nome: 'mensalidades', hora: '06:00', rodar: rotinaMensalidades },
  { nome: 'convites de volta', hora: '10:00', rodar: convidarDeVolta },
  { nome: 'resumo do dia', hora: '21:00', rodar: resumoDoDia },
]
const ultimaExecucao = new Map<string, string>()

export async function tique(log: (msg: string, extra?: object) => void) {
  const con = await sql.reserve()
  try {
    const [{ ok }] = await con<{ ok: boolean }[]>`select pg_try_advisory_lock(${TRAVA}) as ok`
    if (!ok) return
    try {
      const lembretes = await gerarLembretes()
      const fila = await enviarPendentes()
      if (lembretes.criados || fila.tentadas) log('rotina: mensagens', { lembretes: lembretes.criados, ...fila })

      const agora = agoraNoFuso()
      const hoje = agora.toISODate()!
      const hhmm = agora.toFormat('HH:mm')
      for (const d of DIARIAS) {
        if (hhmm >= d.hora && ultimaExecucao.get(d.nome) !== hoje) {
          ultimaExecucao.set(d.nome, hoje)
          log(`rotina: ${d.nome}`, (await d.rodar(hoje)) as object)
        }
      }
    } finally {
      await con`select pg_advisory_unlock(${TRAVA})`
    }
  } finally {
    con.release()
  }
}

export function iniciarAgendador(log: (msg: string, extra?: object) => void) {
  let rodando = false
  const executar = async () => {
    if (rodando) return
    rodando = true
    try {
      await tique(log)
    } catch (e) {
      log('rotina: erro', { erro: (e as Error).message })
    } finally {
      rodando = false
    }
  }
  setTimeout(executar, 5_000)
  const intervalo = setInterval(executar, 60_000)
  return () => clearInterval(intervalo)
}
