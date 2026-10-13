const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const dinheiro = (centavos: number) => brl.format(centavos / 100)

/** telefone digitado -> +55DDDNUMERO */
export function telefoneE164(t: string) {
  const d = t.replace(/\D/g, '').replace(/^0+/, '')
  const sem55 = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (sem55.length < 10 || sem55.length > 11) return null
  return `+55${sem55}`
}
