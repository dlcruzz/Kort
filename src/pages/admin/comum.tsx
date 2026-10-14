import { Handshake } from 'lucide-react'
import type { StatusAssinSaas } from '../../lib/types'

export const NOME_STATUS: Record<StatusAssinSaas, string> = {
  teste: 'Em teste',
  ativa: 'Ativa',
  inadimplente: 'Atrasada',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
}

export function StatusAssinatura({ status, parceiro }: { status: StatusAssinSaas; parceiro?: boolean }) {
  if (parceiro && status !== 'suspensa' && status !== 'cancelada') {
    return <span className="tag tag-kort" title="Acesso vitalício em troca de divulgação"><Handshake size={13} style={{ display: 'inline', verticalAlign: -2 }} /> Parceira</span>
  }
  const cls = status === 'ativa' ? 'tag-ok' : status === 'teste' ? 'tag-info' : status === 'inadimplente' ? 'tag-perigo' : ''
  return <span className={`tag ${cls}`}>{NOME_STATUS[status]}</span>
}

/** sem uso há 7 dias, ou agendamentos muito abaixo do normal */
export function emRisco(b: { status_assinatura: StatusAssinSaas; ultimo_uso: string | null; agendamentos_30d: number; barbeiros: number }) {
  if (b.status_assinatura === 'cancelada' || b.status_assinatura === 'suspensa') return null
  const dias = b.ultimo_uso ? (Date.now() - new Date(b.ultimo_uso).getTime()) / 86400000 : 999
  if (dias >= 7) return `Sem abrir o app há ${Math.floor(dias)} dias`
  if (b.status_assinatura === 'inadimplente') return 'Mensalidade atrasada'
  if (b.agendamentos_30d < 15 * b.barbeiros && b.status_assinatura !== 'teste') return 'Poucos agendamentos para o tamanho da equipe'
  return null
}
