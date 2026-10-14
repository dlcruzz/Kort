import type { ModoOperacao } from './types'

// Como o barbeiro trabalha. A escolha decide o que o app mostra:
// solo esconde equipe e comissão, equipe calcula comissão e
// cadeira_alugada cobra o aluguel de cada cadeira.

// No cadastro são 4 respostas, porque "alugo uma cadeira na barbearia de
// alguém" é a dúvida mais comum. No banco ela vira 'solo': a agenda, os
// clientes e o caixa são só dele.
export type ComoTrabalha = 'sozinho' | 'aluga_uma' | 'equipe' | 'cadeira_alugada'

export const COMO_TRABALHA: Array<{ id: ComoTrabalha; modo: ModoOperacao; titulo: string; texto: string; muda: string[] }> = [
  {
    id: 'sozinho',
    modo: 'solo',
    titulo: 'Trabalho sozinho',
    texto: 'Só eu atendo, no meu espaço ou em domicílio.',
    muda: ['Agenda, clientes e caixa só seus', 'Sem tela de equipe nem comissão'],
  },
  {
    id: 'aluga_uma',
    modo: 'solo',
    titulo: 'Alugo uma cadeira',
    texto: 'Atendo na barbearia de outra pessoa e pago o aluguel da cadeira.',
    muda: ['Agenda, clientes e caixa só seus', 'O aluguel da cadeira entra no Financeiro e você vê quanto sobra'],
  },
  {
    id: 'equipe',
    modo: 'equipe',
    titulo: 'Tenho barbeiros com comissão',
    texto: 'Sou o dono e cada barbeiro ganha uma porcentagem do que faz.',
    muda: ['Cada barbeiro com sua agenda e seu acesso', 'O app calcula a comissão de cada um', 'Logo depois do cadastro a gente te mostra como colocar cada um'],
  },
  {
    id: 'cadeira_alugada',
    modo: 'cadeira_alugada',
    titulo: 'Alugo cadeiras para outros barbeiros',
    texto: 'Sou o dono e cobro um aluguel fixo de quem trabalha aqui.',
    muda: ['Cada barbeiro vê só os clientes e o caixa dele', 'Você cadastra quem aluga e gera o aluguel de cada um pelo app', 'Logo depois do cadastro a gente te mostra como colocar cada um'],
  },
]

// O cadastro pergunta em 2 passos curtos, com só 2 respostas cada, para
// ninguém travar escolhendo entre 4 cartões parecidos:
// 1) Quem atende aí? -> 2) depende da primeira resposta.
export type QuemAtende = 'so_eu' | 'com_outros'

export const PERGUNTA_QUEM: Array<{ id: QuemAtende; titulo: string; texto: string }> = [
  { id: 'so_eu', titulo: 'Só eu', texto: 'Sou barbeiro e atendo sozinho.' },
  { id: 'com_outros', titulo: 'Eu e outros barbeiros', texto: 'Sou o dono e tem mais gente cortando comigo.' },
]

export const PERGUNTA_DETALHE: Record<QuemAtende, { titulo: string; opcoes: Array<{ id: ComoTrabalha; titulo: string; texto: string }> }> = {
  so_eu: {
    titulo: 'Onde você atende?',
    opcoes: [
      { id: 'sozinho', titulo: 'No meu espaço ou em domicílio', texto: 'O ponto é meu, ou eu vou até o cliente.' },
      { id: 'aluga_uma', titulo: 'Numa cadeira que eu alugo', texto: 'Atendo na barbearia de outra pessoa e pago o aluguel da cadeira.' },
    ],
  },
  com_outros: {
    titulo: 'Como os barbeiros ganham?',
    opcoes: [
      { id: 'cadeira_alugada', titulo: 'Eles me pagam aluguel da cadeira', texto: 'Cada um paga um valor fixo por mês e fica com o que cortar.' },
      { id: 'equipe', titulo: 'Eu pago comissão pra eles', texto: 'O dinheiro entra na casa e cada um ganha uma porcentagem.' },
    ],
  },
}

export const quemAtendeDe = (c: ComoTrabalha): QuemAtende => (c === 'sozinho' || c === 'aluga_uma' ? 'so_eu' : 'com_outros')

// Aluguel que quem aluga cadeira informa no cadastro. Fica guardado até o
// app abrir e então vira uma despesa "Aluguel da cadeira" no Financeiro.
export const CHAVE_ALUGUEL_PENDENTE = 'kort:aluguel-cadeira-pendente'

export const NOME_MODO: Record<ModoOperacao, string> = {
  solo: 'Trabalho sozinho',
  equipe: 'Equipe com comissão',
  cadeira_alugada: 'Aluguel de cadeiras',
}

export const AJUDA_MODO: Record<ModoOperacao, string> = {
  solo: 'Só você atende. O app esconde equipe e comissão.',
  equipe: 'Você vê tudo e o app calcula a comissão de cada barbeiro.',
  cadeira_alugada: 'Cada barbeiro tem seus clientes e seu caixa. Você cobra o aluguel da cadeira pelo app.',
}
