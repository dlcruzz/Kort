import { config } from './config.js'
import { criarApp } from './app.js'
import { sql } from './db.js'
import { iniciarAgendador } from './rotinas/agendador.js'

const app = await criarApp()

let pararRotinas: (() => void) | null = null
if (config.ROTINAS_ATIVAS) {
  pararRotinas = iniciarAgendador((msg, extra) => app.log.info(extra ?? {}, msg))
}

await app.listen({ port: config.PORT, host: config.HOST })

// Desligamento limpo (Ctrl+C, deploy no VPS): termina o que está fazendo e fecha o banco.
for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, async () => {
    app.log.info(`Recebi ${sinal}, desligando...`)
    pararRotinas?.()
    await app.close()
    await sql.end({ timeout: 5 })
    process.exit(0)
  })
}
