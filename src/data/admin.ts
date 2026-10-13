// Dados de demonstração do painel admin Kort (views admin_* no banco).

import type { AdminBarbearia, AdminUsoFuncionalidade, Fatura, Sugestao } from '../lib/types'
import { hoje, isoDia, somaDias } from '../lib/format'

const h = hoje()
const d = (n: number) => (n === 0 ? new Date(Date.now() - 2 * 3600000) : somaDias(h, n)).toISOString()

const base: Array<Omit<AdminBarbearia, 'id' | 'uso_modulos' | 'preco_centavos'> & { uso: number[]; preco: number }> = [
  { nome: 'Barbearia Esquina 77', slug: 'esquina-77', cidade: 'São Paulo', uf: 'SP', responsavel: 'Zé Carlos', telefone: '+5511940028922', plano: 'Barbearia', preco: 7990, status_assinatura: 'ativa', teste_ate: null, proximo_vencimento: isoDia(somaDias(h, 6)), barbeiros: 4, clientes: 312, agendamentos_30d: 486, ultimo_uso: d(0), criado_em: d(-140), uso: [486, 402, 655, 38, 21, 12, 30] },
  { nome: 'Navalha de Quebrada', slug: 'navalha-de-quebrada', cidade: 'Guarulhos', uf: 'SP', responsavel: 'Wesley Santos', telefone: '+5511955512233', plano: 'Solo', preco: 3990, status_assinatura: 'ativa', teste_ate: null, proximo_vencimento: isoDia(somaDias(h, 12)), barbeiros: 1, clientes: 141, agendamentos_30d: 133, ultimo_uso: d(-1), criado_em: d(-96), uso: [133, 120, 201, 0, 0, 4, 9] },
  { nome: 'Studio Fade', slug: 'studio-fade', cidade: 'Santo André', uf: 'SP', responsavel: 'Bruno Lacerda', telefone: '+5511966644771', plano: 'Barbearia', preco: 7990, status_assinatura: 'ativa', teste_ate: null, proximo_vencimento: isoDia(somaDias(h, 3)), barbeiros: 3, clientes: 208, agendamentos_30d: 291, ultimo_uso: d(0), criado_em: d(-71), uso: [291, 260, 410, 14, 9, 0, 11] },
  { nome: 'Barber do Jow', slug: 'barber-do-jow', cidade: 'São Paulo', uf: 'SP', responsavel: 'Jonathan Ribeiro', telefone: '+5511977781190', plano: 'Solo', preco: 3990, status_assinatura: 'inadimplente', teste_ate: null, proximo_vencimento: isoDia(somaDias(h, -4)), barbeiros: 1, clientes: 66, agendamentos_30d: 41, ultimo_uso: d(-9), criado_em: d(-64), uso: [41, 12, 70, 0, 0, 0, 0] },
  { nome: 'Corte Certo Barbearia', slug: 'corte-certo', cidade: 'Mauá', uf: 'SP', responsavel: 'Ricardo Prado', telefone: '+5511988823456', plano: 'Barbearia', preco: 7990, status_assinatura: 'teste', teste_ate: isoDia(somaDias(h, 5)), proximo_vencimento: null, barbeiros: 2, clientes: 37, agendamentos_30d: 58, ultimo_uso: d(-2), criado_em: d(-9), uso: [58, 31, 80, 2, 0, 1, 3] },
  { nome: 'Dom Bigode', slug: 'dom-bigode', cidade: 'Osasco', uf: 'SP', responsavel: 'Anderson Melo', telefone: '+5511991122334', plano: 'Grátis', preco: 0, status_assinatura: 'teste', teste_ate: isoDia(somaDias(h, 11)), proximo_vencimento: null, barbeiros: 1, clientes: 12, agendamentos_30d: 9, ultimo_uso: d(-8), criado_em: d(-3), uso: [9, 0, 11, 0, 0, 0, 0] },
  { nome: 'Kings Barber Club', slug: 'kings-barber-club', cidade: 'São Caetano do Sul', uf: 'SP', responsavel: 'Felipe Andrade', telefone: '+5511933345566', plano: 'Pro', preco: 14990, status_assinatura: 'ativa', teste_ate: null, proximo_vencimento: isoDia(somaDias(h, 19)), barbeiros: 6, clientes: 534, agendamentos_30d: 812, ultimo_uso: d(0), criado_em: d(-120), uso: [812, 790, 1120, 96, 64, 38, 52] },
  { nome: 'Rei do Degradê', slug: 'rei-do-degrade', cidade: 'Diadema', uf: 'SP', responsavel: 'Luan Teixeira', telefone: '+5511922213344', plano: 'Solo', preco: 3990, status_assinatura: 'cancelada', teste_ate: null, proximo_vencimento: null, barbeiros: 1, clientes: 48, agendamentos_30d: 0, ultimo_uso: d(-33), criado_em: d(-88), uso: [0, 0, 0, 0, 0, 0, 0] },
]

export const MODULOS = ['agenda', 'lembretes', 'link_publico', 'fidelidade', 'clube', 'estoque', 'relatorios'] as const
export const NOME_MODULO: Record<string, string> = {
  agenda: 'Agenda', lembretes: 'Lembretes no WhatsApp', link_publico: 'Agendamento pelo link', fidelidade: 'Fidelidade',
  clube: 'Clube de assinatura', estoque: 'Estoque', relatorios: 'Relatórios', caixa: 'Caixa', marketing: 'Horários no status',
  lista_espera: 'Lista de espera', financeiro: 'Despesas',
}

export const adminBarbearias: AdminBarbearia[] = base.map((b, i) => ({
  ...b,
  id: `bb-${i}`,
  preco_centavos: b.preco,
  uso_modulos: Object.fromEntries(MODULOS.map((m, k) => [m, b.uso[k]])),
}))

export const adminUso: AdminUsoFuncionalidade[] = [
  { modulo: 'agenda', evento: 'agendamento.criado', total_30d: 1830, barbearias_que_usam: 7 },
  { modulo: 'caixa', evento: 'comanda.paga', total_30d: 1615, barbearias_que_usam: 7 },
  { modulo: 'lembretes', evento: 'mensagem.lembrete_24h', total_30d: 1488, barbearias_que_usam: 5 },
  { modulo: 'link_publico', evento: 'agendamento.criado (link)', total_30d: 1204, barbearias_que_usam: 7 },
  { modulo: 'relatorios', evento: 'relatorio.aberto', total_30d: 312, barbearias_que_usam: 6 },
  { modulo: 'fidelidade', evento: 'fidelidade.resgate', total_30d: 150, barbearias_que_usam: 4 },
  { modulo: 'marketing', evento: 'status_horarios.gerado', total_30d: 131, barbearias_que_usam: 5 },
  { modulo: 'lista_espera', evento: 'lista_espera.adicionado', total_30d: 88, barbearias_que_usam: 3 },
  { modulo: 'clube', evento: 'clube.assinatura_criada', total_30d: 94, barbearias_que_usam: 3 },
  { modulo: 'estoque', evento: 'estoque.entrada', total_30d: 55, barbearias_que_usam: 3 },
  { modulo: 'financeiro', evento: 'financeiro.despesa', total_30d: 41, barbearias_que_usam: 2 },
]

export const adminFaturas: (Fatura & { barbearia: string })[] = adminBarbearias
  .filter((b) => b.preco_centavos > 0 && b.status_assinatura !== 'teste')
  .flatMap((b, i) => {
    const mesAtual = new Date(h.getFullYear(), h.getMonth(), 1)
    const atual: Fatura & { barbearia: string } = {
      id: `fat-${b.id}-0`, barbearia_id: b.id, barbearia: b.nome, competencia: isoDia(mesAtual), valor_centavos: b.preco_centavos,
      vencimento: isoDia(new Date(h.getFullYear(), h.getMonth(), 10)),
      status: b.status_assinatura === 'inadimplente' ? 'vencida' : b.status_assinatura === 'cancelada' ? 'cancelada' : i % 2 ? 'aberta' : 'paga',
      pix_copia_cola: null, pago_em: i % 2 || b.status_assinatura !== 'ativa' ? null : d(-2),
    }
    const anterior: Fatura & { barbearia: string } = {
      ...atual, id: `fat-${b.id}-1`, competencia: isoDia(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
      vencimento: isoDia(new Date(h.getFullYear(), h.getMonth() - 1, 10)), status: 'paga', pago_em: d(-31),
    }
    return [atual, anterior]
  })

export const adminSugestoes: (Sugestao & { barbearia: string })[] = [
  { id: 's1', barbearia_id: 'bb-0', barbearia: 'Barbearia Esquina 77', titulo: 'Agendar pelo Instagram direto', descricao: 'Botão no perfil que já abre o horário.', status: 'planejada', votos: 14, votei: false, criado_em: d(-20) },
  { id: 's2', barbearia_id: 'bb-6', barbearia: 'Kings Barber Club', titulo: 'Relatório de quanto cada barbeiro vendeu de produto', descricao: null, status: 'em_analise', votos: 9, votei: false, criado_em: d(-9) },
  { id: 's3', barbearia_id: 'bb-2', barbearia: 'Studio Fade', titulo: 'Lembrete de aniversário do cliente', descricao: 'Mandar mensagem com desconto no dia.', status: 'nova', votos: 6, votei: false, criado_em: d(-3) },
  { id: 's4', barbearia_id: 'bb-1', barbearia: 'Navalha de Quebrada', titulo: 'Modo escuro no app', descricao: null, status: 'nova', votos: 4, votei: false, criado_em: d(-1) },
]

// Evolução do MRR (últimos 6 meses) para o gráfico do painel
export const adminMrrHistorico = [
  { mes: -5, valor: 7990 },
  { mes: -4, valor: 11980 },
  { mes: -3, valor: 19970 },
  { mes: -2, valor: 23960 },
  { mes: -1, valor: 27950 },
  { mes: 0, valor: 0 }, // calculado na tela a partir das assinaturas ativas
]
