// Tipos espelhando as tabelas do banco (kort_schema.sql).
// Os nomes dos campos são os mesmos das colunas, para a troca do mock
// pelo Supabase ser direta: supabase.from('agendamentos').select() devolve
// objetos com este formato.

export type Uuid = string
export type Centavos = number

export type ModoOperacao = 'solo' | 'equipe' | 'cadeira_alugada'
export type PapelMembro = 'dono' | 'barbeiro' | 'recepcao'
export type StatusAgendamento = 'agendado' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'faltou'
export type OrigemAgendamento = 'link' | 'balcao' | 'encaixe' | 'lista_espera' | 'mensagem'
export type StatusComanda = 'aberta' | 'paga' | 'cancelada'
export type FormaPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'clube' | 'vale_presente' | 'outro'
export type TipoItemComanda = 'servico' | 'produto' | 'vale_presente'
export type StatusListaEspera = 'aguardando' | 'avisado' | 'convertido' | 'expirado' | 'cancelado'
export type TipoMensagem = 'confirmacao' | 'lembrete_24h' | 'lembrete_2h' | 'retorno' | 'resgate' | 'lista_espera' | 'resumo_diario'
export type StatusPgtoInterno = 'pendente' | 'pago' | 'cancelado'
export type TipoDesconto = 'percentual' | 'valor'
export type StatusAssinSaas = 'teste' | 'ativa' | 'inadimplente' | 'suspensa' | 'cancelada'
export type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada'
export type StatusSugestao = 'nova' | 'em_analise' | 'planejada' | 'feita' | 'recusada'

export interface Barbearia {
  id: Uuid
  slug: string
  nome: string
  descricao: string | null
  telefone: string | null
  whatsapp: string | null
  instagram: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  logo_url: string | null
  modo_operacao: ModoOperacao
  antecedencia_cancelamento_min: number
  antecedencia_max_dias: number
  intervalo_slots_min: number
  publicada: boolean
  criado_em: string
}

export interface Membro {
  id: Uuid
  barbearia_id: Uuid
  perfil_id: Uuid | null
  papel: PapelMembro
  nome_exibicao: string
  foto_url: string | null
  bio: string | null
  cor_agenda: string
  atende: boolean
  ativo: boolean
  ordem: number
}

export interface MembroConfiguracao {
  membro_id: Uuid
  comissao_servico_pct: number
  comissao_produto_pct: number
  meta_diaria_centavos: Centavos | null
  aluguel_cadeira_centavos: Centavos | null
  dia_vencimento_aluguel: number | null
  eh_mei: boolean
  convite_token?: string | null
}

export interface HorarioFuncionamento {
  id: Uuid
  dia_semana: number // 0 = domingo
  abre: string // "09:00"
  fecha: string
}

export interface Jornada {
  id: Uuid
  membro_id: Uuid
  dia_semana: number
  inicio: string
  fim: string
}

export interface Bloqueio {
  id: Uuid
  membro_id: Uuid | null
  inicio: string // ISO
  fim: string
  motivo: string | null
}

export interface Servico {
  id: Uuid
  nome: string
  descricao: string | null
  preco_centavos: Centavos
  duracao_min: number
  intervalo_min: number
  ativo: boolean
  ordem: number
  membros: Uuid[] // servico_membros
}

export interface Cliente {
  id: Uuid
  nome: string
  telefone: string
  email: string | null
  data_nascimento: string | null
  observacoes: string | null
  membro_preferido_id: Uuid | null
  codigo_indicacao: string | null
  indicado_por_id: Uuid | null
  aceita_mensagens: boolean
  primeira_visita_em: string | null
  ultima_visita_em: string | null
  total_visitas: number
  total_gasto_centavos: Centavos
  frequencia_media_dias: number | null
  proximo_retorno_previsto: string | null // "2026-10-20"
  criado_em: string
}

export interface AgendamentoServico {
  servico_id: Uuid | null
  nome: string
  preco_centavos: Centavos
  duracao_min: number
}

export interface Agendamento {
  id: Uuid
  cliente_id: Uuid
  membro_id: Uuid
  inicio: string
  fim: string
  status: StatusAgendamento
  origem: OrigemAgendamento
  valor_previsto_centavos: Centavos
  observacao_cliente: string | null
  confirmado_em: string | null
  servicos: AgendamentoServico[]
  criado_em: string
  token_publico?: string
}

export interface ComandaItem {
  id: Uuid
  tipo: TipoItemComanda
  servico_id: Uuid | null
  produto_id: Uuid | null
  membro_id: Uuid | null
  descricao: string
  quantidade: number
  preco_unit_centavos: Centavos
  comissao_pct: number
}

export interface Comanda {
  id: Uuid
  agendamento_id: Uuid | null
  cliente_id: Uuid | null
  membro_id: Uuid
  status: StatusComanda
  desconto_centavos: Centavos
  forma_pagamento: FormaPagamento | null
  pago_em: string | null
  itens: ComandaItem[]
  criado_em: string
}

export interface Produto {
  id: Uuid
  nome: string
  preco_venda_centavos: Centavos
  custo_centavos: Centavos | null
  estoque_atual: number
  estoque_minimo: number
  ativo: boolean
}

export interface Despesa {
  id: Uuid
  membro_id: Uuid | null
  descricao: string
  categoria: string
  valor_centavos: Centavos
  data: string
  pago: boolean
}

export interface AluguelCadeira {
  id: Uuid
  membro_id: Uuid
  competencia: string
  valor_centavos: Centavos
  vencimento: string
  status: StatusPgtoInterno
  pago_em: string | null
}

export interface ListaEspera {
  id: Uuid
  cliente_id: Uuid
  membro_id: Uuid | null
  servico_id: Uuid | null
  data: string
  hora_de: string | null
  hora_ate: string | null
  status: StatusListaEspera
  criado_em: string
}

export interface ModeloMensagem {
  id: Uuid
  tipo: TipoMensagem
  texto: string
  ativo: boolean
}

export interface Mensagem {
  id: Uuid
  cliente_id: Uuid | null
  tipo: TipoMensagem
  conteudo: string
  status: 'pendente' | 'enviada' | 'entregue' | 'lida' | 'falhou' | 'cancelada'
  enviada_em: string | null
  gerou_agendamento: boolean
  agendamento_id?: string | null
}

export interface Cupom {
  id: Uuid
  codigo: string
  tipo: TipoDesconto
  valor: number
  valido_ate: string | null
  usos: number
  usos_max: number | null
  ativo: boolean
}

export interface Promocao {
  id: Uuid
  nome: string
  dia_semana: number | null
  hora_inicio: string | null
  hora_fim: string | null
  tipo: TipoDesconto
  valor: number
  ativo: boolean
}

export interface ProgramaFidelidade {
  tipo: 'pontos' | 'cartao_visitas'
  pontos_por_real: number
  visitas_para_premio: number
  pontos_por_indicacao: number
  premio_descricao: string
  ativo: boolean
}

export interface FidelidadeMovimento {
  id: Uuid
  cliente_id: Uuid
  tipo: 'atendimento' | 'indicacao' | 'resgate' | 'ajuste' | 'expiracao'
  pontos: number
  criado_em: string
}

export interface PlanoClube {
  id: Uuid
  nome: string
  descricao: string | null
  preco_centavos: Centavos
  usos_por_mes: number | null
  ativo: boolean
}

export interface AssinaturaClube {
  id: Uuid
  cliente_id: Uuid
  plano_clube_id: Uuid
  status: 'ativa' | 'pausada' | 'cancelada'
  dia_vencimento: number
  pago_mes_atual: boolean
}

export interface Avaliacao {
  id: Uuid
  cliente_id: Uuid
  membro_id: Uuid
  nota: number
  comentario: string | null
  publica: boolean
  criado_em: string
}

export interface FotoPortfolio {
  id: Uuid
  membro_id: Uuid
  url: string
  legenda: string | null
}

export interface Fatura {
  id: Uuid
  barbearia_id: Uuid
  competencia: string
  valor_centavos: Centavos
  vencimento: string
  status: StatusFatura
  pix_copia_cola: string | null
  pago_em: string | null
  txid?: string | null
  informado_em?: string | null
}

export interface Sugestao {
  id: Uuid
  barbearia_id: Uuid | null
  titulo: string
  descricao: string | null
  status: StatusSugestao
  votos: number
  votei: boolean
  criado_em: string
}

// ---------- painel admin (views admin_*)
export interface AdminBarbearia {
  id: Uuid
  nome: string
  slug: string
  cidade: string
  uf: string
  responsavel: string
  telefone: string
  plano: string
  preco_centavos: Centavos
  status_assinatura: StatusAssinSaas
  teste_ate: string | null
  proximo_vencimento: string | null
  /** acesso vitalício em troca de divulgação: não paga e não entra na receita */
  parceiro?: boolean
  parceiro_desde?: string | null
  parceiro_obs?: string | null
  barbeiros: number
  clientes: number
  agendamentos_30d: number
  ultimo_uso: string | null
  criado_em: string
  uso_modulos: Record<string, number>
}

export interface AdminUsoFuncionalidade {
  modulo: string
  evento: string
  total_30d: number
  barbearias_que_usam: number
}
