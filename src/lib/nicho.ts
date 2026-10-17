// Nicho e cor da marca: o Kort serve pra barbearia e pra nail designer.
// Cada nicho tem palavras diferentes (barbearia/estúdio, barbeiro/nail
// designer) e uma cor padrão. O barbeiro escolhe no cadastro e pode
// trocar a cor em Minha Barbearia.

export type Nicho = 'barbearia' | 'nail'

export const AMARELO_KORT = '#E7F738'
export const ROSA_NAIL = '#FF4FA3'

/** Cores que o dono pode escolher. A primeira é o padrão de barbearia. */
export const CORES_DESTAQUE: Array<{ hex: string; nome: string }> = [
  { hex: AMARELO_KORT, nome: 'Amarelo Kort' },
  { hex: ROSA_NAIL, nome: 'Rosa' },
  { hex: '#A855F7', nome: 'Roxo' },
  { hex: '#60A5FA', nome: 'Azul' },
  { hex: '#34D399', nome: 'Verde' },
  { hex: '#FB923C', nome: 'Laranja' },
]

export const corPadrao = (nicho: Nicho) => (nicho === 'nail' ? ROSA_NAIL : AMARELO_KORT)

/** Pega a cor da barbearia. Se vier vazia ou inválida, cai no padrão do nicho. */
export const corDe = (b: { nicho?: Nicho | null; cor_destaque?: string | null } | null | undefined) => {
  const nicho: Nicho = b?.nicho === 'nail' ? 'nail' : 'barbearia'
  const c = b?.cor_destaque
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : corPadrao(nicho)
}

/** Texto preto ou branco em cima da cor escolhida (acessibilidade). */
export const contraste = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // luminância relativa simplificada: cor clara pede texto preto
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? '#080808' : '#F2F2EE'
}

/** Palavras que aparecem no painel e na página pública. */
export interface Rotulos {
  nicho: Nicho
  /** o lugar (ex.: barbearia / estúdio) */
  lugar: string
  /** com artigo: "da barbearia" / "do estúdio" */
  lugarArtigo: string
  /** "minha barbearia" / "meu estúdio" */
  meuLugar: string
  /** quem atende (ex.: barbeiro / nail designer) */
  profissional: string
  profissionalPlural: string
  /** "barbeiros com comissão" / "nail designers com comissão" */
  profissionaisArtigo: string
  /** o que a pessoa faz (ex.: corte / unha) */
  servico: string
  servicoPlural: string
  /** título da aba Portfolio (ex.: "Cortes feitos aqui" / "Trabalhos feitos aqui") */
  cortes: string
  tituloCortes: string
}

const RB: Rotulos = {
  nicho: 'barbearia',
  lugar: 'barbearia',
  lugarArtigo: 'da barbearia',
  meuLugar: 'Minha Barbearia',
  profissional: 'barbeiro',
  profissionalPlural: 'barbeiros',
  profissionaisArtigo: 'dos barbeiros',
  servico: 'corte',
  servicoPlural: 'cortes',
  cortes: 'cortes',
  tituloCortes: 'Cortes feitos aqui',
}

const RN: Rotulos = {
  nicho: 'nail',
  lugar: 'estúdio',
  lugarArtigo: 'do estúdio',
  meuLugar: 'Meu Estúdio',
  profissional: 'nail designer',
  profissionalPlural: 'nail designers',
  profissionaisArtigo: 'das nail designers',
  servico: 'serviço',
  servicoPlural: 'serviços',
  cortes: 'trabalhos',
  tituloCortes: 'Trabalhos feitos aqui',
}

export const rotulos = (nicho: Nicho | null | undefined): Rotulos => (nicho === 'nail' ? RN : RB)
