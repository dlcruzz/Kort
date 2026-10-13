import type { ProvedorWhatsApp } from './index.js'

// Não envia nada: escreve no terminal. Bom para desenvolver sem gastar.
export const consoleProvedor = (): ProvedorWhatsApp => ({
  nome: 'console',
  async enviar(telefone, texto) {
    console.log(`\n[whatsapp -> ${telefone}]\n${texto}\n`)
    return { idExterno: `console-${Date.now()}` }
  },
})
