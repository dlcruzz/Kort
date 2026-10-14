// Formatação e utilitários de data. Tudo em horário local (America/Sao_Paulo).

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 4500 -> "R$ 45,00" */
export const dinheiro = (centavos: number) => brl.format(centavos / 100)

/** 4500 -> "R$ 45" (sem centavos quando redondo) */
export const dinheiroCurto = (centavos: number) =>
  centavos % 100 === 0 ? `R$ ${(centavos / 100).toLocaleString('pt-BR')}` : dinheiro(centavos)

/** "45,50" -> 4550 */
/** preço com desconto em %, arredondado igual ao banco (privado.com_desconto) */
export const comDesconto = (centavos: number, pct = 0) => Math.round((centavos * (100 - Math.min(Math.max(pct, 0), 100))) / 100)

export const paraCentavos = (texto: string) => {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export const pad = (n: number) => String(n).padStart(2, '0')

/** Date -> "2026-10-12" (data local, sem fuso) */
export const isoDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "2026-10-12" -> Date à meia-noite local */
export const deIsoDia = (s: string) => {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export const hoje = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export const somaDias = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const somaMinutos = (d: Date, n: number) => new Date(d.getTime() + n * 60000)

export const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "09:30" -> 570 */
export const hhmmParaMin = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

/** 570 -> "09:30" */
export const minParaHhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** Date -> "09:30" */
export const hora = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`
}

/** Minutos desde meia-noite de uma data/hora */
export const minutosDoDia = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d
  return x.getHours() * 60 + x.getMinutes()
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export const nomeDia = (n: number) => DIAS[n]
export const nomeDiaCurto = (n: number) => DIAS_CURTOS[n]
export const nomeMes = (n: number) => MESES[n]

/** "segunda, 12 de outubro" */
export const dataLonga = (d: Date | string) => {
  const x = typeof d === 'string' ? (d.length === 10 ? deIsoDia(d) : new Date(d)) : d
  return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}`
}

/** "12/10" */
export const dataCurta = (d: Date | string) => {
  const x = typeof d === 'string' ? (d.length === 10 ? deIsoDia(d) : new Date(d)) : d
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}`
}

/** "12/10/2026" */
export const dataCompleta = (d: Date | string) => {
  const x = typeof d === 'string' ? (d.length === 10 ? deIsoDia(d) : new Date(d)) : d
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`
}

/** "hoje", "amanhã", "ontem" ou "seg, 12/10" */
export const dataRelativa = (d: Date | string) => {
  const x = typeof d === 'string' ? (d.length === 10 ? deIsoDia(d) : new Date(d)) : d
  const h = hoje()
  if (mesmoDia(x, h)) return 'hoje'
  if (mesmoDia(x, somaDias(h, 1))) return 'amanhã'
  if (mesmoDia(x, somaDias(h, -1))) return 'ontem'
  return `${DIAS_CURTOS[x.getDay()]}, ${dataCurta(x)}`
}

/** Dias entre duas datas (b - a), ignorando horas */
export const diasEntre = (a: Date | string, b: Date | string) => {
  const da = typeof a === 'string' ? new Date(a) : new Date(a)
  const db = typeof b === 'string' ? new Date(b) : new Date(b)
  da.setHours(0, 0, 0, 0)
  db.setHours(0, 0, 0, 0)
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

/** "há 3 dias", "há 2 h" */
export const tempoAtras = (d: string | null) => {
  if (!d) return 'nunca'
  const ms = Date.now() - new Date(d).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const dias = Math.floor(h / 24)
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`
}

/** "+5511987654321" -> "(11) 98765-4321" */
export const telefone = (t: string) => {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

/** Máscara enquanto digita: "11987654321" -> "(11) 98765-4321" */
export const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** "(11) 98765-4321" -> "+5511987654321" */
export const telefoneE164 = (v: string) => `+55${v.replace(/\D/g, '')}`

export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export const primeiroNome = (nome: string) => nome.split(' ')[0]

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const LABEL_FORMA: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
  clube: 'Clube',
  vale_presente: 'Vale-presente',
  outro: 'Outro',
}

export const LABEL_STATUS_AG: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  em_atendimento: 'Na cadeira',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
}

export const LABEL_ORIGEM: Record<string, string> = {
  link: 'Pelo link',
  balcao: 'No balcão',
  encaixe: 'Encaixe',
  lista_espera: 'Lista de espera',
  mensagem: 'Mensagem de retorno',
}

/** Endereço da página pública, no domínio onde o app está publicado. */
export const dominio = () => (typeof window !== 'undefined' ? window.location.host : 'kort.app')
export const linkPublico = (slug: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://kort.app'}/b/${slug}`
