// Envio de WhatsApp. Cada provedor implementa a mesma função "enviar".
// Para trocar de provedor (Z-API, Evolution, API oficial da Meta), crie um
// arquivo novo aqui e escolha em WHATSAPP_PROVEDOR.

import { config } from '../config.js'
import { consoleProvedor } from './console.js'
import { zapiProvedor } from './zapi.js'

export interface ResultadoEnvio {
  idExterno?: string
}

export interface ProvedorWhatsApp {
  nome: string
  /** telefone no formato +5511999998888 */
  enviar(telefone: string, texto: string): Promise<ResultadoEnvio>
}

let atual: ProvedorWhatsApp = config.WHATSAPP_PROVEDOR === 'zapi' ? zapiProvedor() : consoleProvedor()

export const whatsapp = () => atual

/** Usado nos testes para capturar as mensagens sem enviar nada. */
export const trocarProvedor = (p: ProvedorWhatsApp) => {
  atual = p
}
