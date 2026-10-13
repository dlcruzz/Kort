// Gera o "Pix copia e cola" (BR Code estático) a partir da sua chave Pix.
// Padrão EMV do Banco Central. Serve para a fatura da mensalidade do Kort:
// o barbeiro paga para a sua conta Nu Empresas e você dá baixa no painel.

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`

function crc16(payload: string) {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
    crc &= 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const limpar = (s: string, max: number) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, max)

export function pixCopiaECola(p: { chave: string; valorCentavos: number; nome: string; cidade: string; txid: string; descricao?: string }) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', p.chave) + (p.descricao ? campo('02', p.descricao.slice(0, 40)) : '')
  const corpo =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (p.valorCentavos / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', limpar(p.nome, 25)) +
    campo('60', limpar(p.cidade, 15)) +
    campo('62', campo('05', p.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) +
    '6304'
  return corpo + crc16(corpo)
}
