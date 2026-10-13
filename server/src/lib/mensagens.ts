// Mensagens: monta o texto a partir do modelo da barbearia e coloca na
// fila (tabela "mensagens", status 'pendente'). Quem envia de verdade é a
// rotina de envio (rotinas/fila.ts), a cada minuto.

import type { Sql, Tx } from '../db.js'

type Banco = Sql | Tx

export type TipoMensagem = 'confirmacao' | 'lembrete_24h' | 'lembrete_2h' | 'retorno' | 'resgate' | 'lista_espera' | 'resumo_diario'

/** Textos padrão, usados quando a barbearia ainda não personalizou. */
export const MODELOS_PADRAO: Record<TipoMensagem, string> = {
  confirmacao: 'Fechou, {cliente}! Seu horário com {barbeiro} está marcado para {data} às {horario}. Precisa mudar? {link}',
  lembrete_24h: 'E aí, {cliente}! Amanhã às {horario} tem {servico} com {barbeiro}. Precisa mudar? {link}',
  lembrete_2h: '{cliente}, daqui a 2 horas é a sua vez aqui na {barbearia}. Te esperamos às {horario}.',
  retorno: 'Fala, {cliente}! Já tá na hora de dar aquele tapa no visual. {barbeiro} tem horário essa semana: {link}',
  resgate: 'Sumiu, hein {cliente}? Volta pra {barbearia} essa semana. Agende: {link}',
  lista_espera: '{cliente}, abriu um horário {data} às {horario} com {barbeiro}. Quer? Garanta aqui: {link}',
  resumo_diario: 'Resumo de hoje: {faturamento} em {atendimentos} atendimentos, {faltas} faltas. Amanhã: {agendados} horários marcados.',
}

/** Troca {variavel} pelos valores; variável sem valor some. */
export function montarTexto(modelo: string, vars: Record<string, string | number | undefined>) {
  return modelo
    .replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : ''))
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Busca o modelo da barbearia. Retorna null se ela desligou esse tipo. */
export async function modeloDe(db: Banco, barbeariaId: string, tipo: TipoMensagem): Promise<string | null> {
  const [m] = await db<{ texto: string; ativo: boolean }[]>`
    select texto, ativo from modelos_mensagem where barbearia_id = ${barbeariaId} and tipo = ${tipo}
  `
  if (!m) return tipo === 'resumo_diario' ? null : MODELOS_PADRAO[tipo]
  return m.ativo ? m.texto : null
}

export async function enfileirar(
  db: Banco,
  m: {
    barbeariaId: string
    tipo: TipoMensagem
    destino: string
    conteudo: string
    clienteId?: string | null
    membroId?: string | null
    agendamentoId?: string | null
    quando?: Date
  },
) {
  const [r] = await db<{ id: string }[]>`
    insert into mensagens (barbearia_id, cliente_id, membro_id, agendamento_id, tipo, canal, destino, conteudo, status, agendada_para)
    values (${m.barbeariaId}, ${m.clienteId ?? null}, ${m.membroId ?? null}, ${m.agendamentoId ?? null}, ${m.tipo},
            'whatsapp', ${m.destino}, ${m.conteudo}, 'pendente', ${m.quando ?? new Date()})
    returning id
  `
  return r.id
}

/** Registra uma ação no histórico de uso (base do painel admin). */
export async function registrarEvento(db: Banco, barbeariaId: string | null, evento: string, perfilId?: string | null, metadados: object = {}) {
  await db`
    insert into eventos (barbearia_id, perfil_id, evento, metadados)
    values (${barbeariaId}, ${perfilId ?? null}, ${evento}, ${db.json(metadados as never)})
  `
}
