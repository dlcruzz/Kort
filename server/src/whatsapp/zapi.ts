// Z-API (https://z-api.io): conecta um número de WhatsApp lendo um QR code
// e expõe uma API HTTP. Confira os nomes dos campos na documentação deles
// antes de ir para produção.

import { config } from '../config.js'
import type { ProvedorWhatsApp } from './index.js'

export const zapiProvedor = (): ProvedorWhatsApp => {
  const { ZAPI_INSTANCIA: inst, ZAPI_TOKEN: token, ZAPI_CLIENT_TOKEN: clientToken } = config
  if (!inst || !token) throw new Error('WHATSAPP_PROVEDOR=zapi exige ZAPI_INSTANCIA e ZAPI_TOKEN no .env')
  return {
    nome: 'zapi',
    async enviar(telefone, texto) {
      const r = await fetch(`https://api.z-api.io/instances/${inst}/token/${token}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
        body: JSON.stringify({ phone: telefone.replace(/\D/g, ''), message: texto }),
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) throw new Error(`Z-API respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
      const j = (await r.json().catch(() => ({}))) as { messageId?: string; id?: string }
      return { idExterno: j.messageId ?? j.id }
    },
  }
}
