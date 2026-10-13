// Dados de demonstração. Gerados a partir de "hoje", para a agenda sempre
// ter movimento quando você abrir o projeto. Quando ligar o Supabase,
// este arquivo deixa de ser usado (veja src/lib/supabase.ts).

import type {
  Agendamento, AluguelCadeira, AssinaturaClube, Avaliacao, Barbearia, Bloqueio, Cliente, Comanda,
  Cupom, Despesa, Fatura, FidelidadeMovimento, FotoPortfolio, HorarioFuncionamento, Jornada,
  ListaEspera, Membro, MembroConfiguracao, Mensagem, ModeloMensagem, PlanoClube, Produto,
  ProgramaFidelidade, Promocao, Servico, Sugestao,
} from '../lib/types'
import { hoje, isoDia, somaDias, somaMinutos, uid } from '../lib/format'

// PRNG com semente: os mesmos dados toda vez que o seed roda.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Estado {
  versao: number
  barbearia: Barbearia
  membros: Membro[]
  configuracoes: MembroConfiguracao[]
  horarios: HorarioFuncionamento[]
  jornadas: Jornada[]
  bloqueios: Bloqueio[]
  servicos: Servico[]
  clientes: Cliente[]
  agendamentos: Agendamento[]
  comandas: Comanda[]
  produtos: Produto[]
  despesas: Despesa[]
  alugueis: AluguelCadeira[]
  listaEspera: ListaEspera[]
  modelos: ModeloMensagem[]
  mensagens: Mensagem[]
  cupons: Cupom[]
  promocoes: Promocao[]
  fidelidade: ProgramaFidelidade
  movimentosFidelidade: FidelidadeMovimento[]
  planosClube: PlanoClube[]
  assinaturasClube: AssinaturaClube[]
  avaliacoes: Avaliacao[]
  portfolio: FotoPortfolio[]
  faturas: Fatura[]
  sugestoes: Sugestao[]
  assinatura: { plano: string; preco_centavos: number; status: 'teste' | 'ativa' | 'inadimplente'; teste_ate: string | null; proximo_vencimento: string }
  usuarioMembroId: string
}

export const VERSAO_SEED = 5

export function criarSeed(): Estado {
  const r = rng(77)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
  const h = hoje()
  const barbeariaId = uid()

  const barbearia: Barbearia = {
    id: barbeariaId,
    slug: 'esquina-77',
    nome: 'Barbearia Esquina 77',
    descricao: 'Degradê, navalha e resenha boa desde 2019. Atendimento com hora marcada e encaixe quando dá.',
    telefone: '+5511940028922',
    whatsapp: '+5511940028922',
    instagram: '@esquina77barber',
    logradouro: 'Rua Gregório Ramalho',
    numero: '77',
    bairro: 'Itaquera',
    cidade: 'São Paulo',
    uf: 'SP',
    logo_url: null,
    modo_operacao: 'equipe',
    antecedencia_cancelamento_min: 120,
    antecedencia_max_dias: 21,
    intervalo_slots_min: 15,
    publicada: true,
    criado_em: somaDias(h, -140).toISOString(),
  }

  const m = (nome: string, papel: Membro['papel'], cor: string, bio: string, ordem: number): Membro => ({
    id: uid(), barbearia_id: barbeariaId, perfil_id: null, papel, nome_exibicao: nome, foto_url: null,
    bio, cor_agenda: cor, atende: true, ativo: true, ordem,
  })
  const membros: Membro[] = [
    m('Zé Carlos', 'dono', '#E7F738', 'Dono da casa. Navalha e barba desenhada.', 0),
    m('Pedrinho', 'barbeiro', '#7FB8FF', 'Degradê navalhado e freestyle.', 1),
    m('Lukinha', 'barbeiro', '#FF9E6B', 'Luzes, nevou e platinado.', 2),
    m('Rafa', 'barbeiro', '#B79CFF', 'Corte social e infantil com paciência.', 3),
  ]
  const [ze, pedro, luka, rafa] = membros

  const configuracoes: MembroConfiguracao[] = membros.map((mb, i) => ({
    membro_id: mb.id,
    comissao_servico_pct: i === 0 ? 0 : 45,
    comissao_produto_pct: i === 0 ? 0 : 10,
    meta_diaria_centavos: i === 0 ? 50000 : 35000,
    aluguel_cadeira_centavos: i === 0 ? null : 120000,
    dia_vencimento_aluguel: i === 0 ? null : 5,
    eh_mei: true,
  }))

  const horarios: HorarioFuncionamento[] = [2, 3, 4, 5, 6].map((d) => ({ id: uid(), dia_semana: d, abre: '09:00', fecha: '20:00' }))
  horarios.push({ id: uid(), dia_semana: 1, abre: '13:00', fecha: '20:00' })
  horarios.push({ id: uid(), dia_semana: 0, abre: '09:00', fecha: '13:00' })

  const jornadas: Jornada[] = []
  for (const mb of membros) {
    for (const hf of horarios) {
      if (mb === rafa && hf.dia_semana === 0) continue
      if (mb === luka && hf.dia_semana === 1) continue
      if (hf.fecha === '20:00' && hf.abre === '09:00') {
        jornadas.push({ id: uid(), membro_id: mb.id, dia_semana: hf.dia_semana, inicio: '09:00', fim: '12:30' })
        jornadas.push({ id: uid(), membro_id: mb.id, dia_semana: hf.dia_semana, inicio: '13:30', fim: '20:00' })
      } else {
        jornadas.push({ id: uid(), membro_id: mb.id, dia_semana: hf.dia_semana, inicio: hf.abre, fim: hf.fecha })
      }
    }
  }

  const s = (nome: string, preco: number, dur: number, desc: string | null, quem: Membro[], ordem: number): Servico => ({
    id: uid(), nome, descricao: desc, preco_centavos: preco, duracao_min: dur, intervalo_min: 5, ativo: true, ordem,
    membros: quem.map((q) => q.id),
  })
  const servicos: Servico[] = [
    s('Corte degradê', 4500, 40, 'Máquina, tesoura e acabamento na navalha.', membros, 0),
    s('Corte social', 3500, 30, 'Tesoura e máquina, sem degradê.', membros, 1),
    s('Barba', 3000, 25, 'Toalha quente, navalha e balm.', [ze, pedro, rafa], 2),
    s('Corte + barba', 7000, 60, 'O combo da casa.', [ze, pedro, rafa], 3),
    s('Pezinho', 1500, 10, 'Contorno e nuca.', membros, 4),
    s('Sobrancelha', 1500, 10, null, membros, 5),
    s('Pigmentação', 2500, 15, 'Disfarça falhas na barba ou no corte.', [ze, luka], 6),
    s('Luzes / nevou', 13000, 90, 'Descoloração com produto profissional. Leve 1h30.', [luka], 7),
    s('Corte infantil', 3500, 30, 'Até 12 anos.', [rafa, pedro], 8),
  ]
  const [degrade, social, barba, combo, pezinho, sobrancelha, pigmentacao, luzes, infantil] = servicos

  const primeiros = ['Matheus', 'Gabriel', 'Lucas', 'Guilherme', 'Rafael', 'Felipe', 'Bruno', 'Thiago', 'Vinícius', 'Caio', 'Diego', 'Leonardo',
    'Gustavo', 'Henrique', 'Igor', 'João Pedro', 'Kauã', 'Murilo', 'Nicolas', 'Otávio', 'Paulo', 'Renan', 'Samuel', 'Vitor', 'Wesley', 'Yuri',
    'André', 'Davi', 'Enzo', 'Fábio', 'Hugo', 'Ítalo', 'Jonas', 'Kevin', 'Luan', 'Marcos', 'Pietro', 'Ryan', 'Talles', 'Wallace', 'Arthur', 'Breno']
  const sobrenomes = ['Oliveira', 'Santos', 'Ferreira', 'Souza', 'Lima', 'Rocha', 'Almeida', 'Ribeiro', 'Costa', 'Martins', 'Barbosa', 'Gomes',
    'Pereira', 'Dias', 'Nascimento', 'Silva', 'Moreira', 'Teixeira', 'Araújo', 'Cardoso', 'Melo', 'Pinto', 'Lopes', 'Cavalcante', 'Mendes',
    'Batista', 'Freitas', 'Monteiro', 'Correia', 'Vieira', 'Rezende', 'Farias', 'Duarte', 'Fernandes', 'Campos', 'Azevedo', 'Moura', 'Nunes', 'Bezerra', 'Castro']
  const nomes: string[] = []
  const usados = new Set<string>()
  while (nomes.length < 150) {
    const n = `${pick(primeiros)} ${pick(sobrenomes)}`
    if (!usados.has(n)) { usados.add(n); nomes.push(n) }
  }
  const clientes: Cliente[] = nomes.map((nome, i) => ({
    id: uid(),
    nome,
    telefone: `+55119${String(70000000 + Math.floor(r() * 29999999)).slice(0, 8)}`,
    email: null,
    data_nascimento: i % 5 === 0 ? `199${i % 10}-${String((i % 12) + 1).padStart(2, '0')}-1${i % 9}` : null,
    observacoes: i === 2 ? 'Gosta do degradê bem baixo, sem risco.' : i === 7 ? 'Pele sensível, usar loção sem álcool.' : null,
    membro_preferido_id: pick(membros).id,
    codigo_indicacao: nome.split(' ')[0].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + (10 + i),
    indicado_por_id: null,
    aceita_mensagens: i !== 11,
    primeira_visita_em: null,
    ultima_visita_em: null,
    total_visitas: 0,
    total_gasto_centavos: 0,
    frequencia_media_dias: null,
    proximo_retorno_previsto: null,
    criado_em: somaDias(h, -130 + i).toISOString(),
  }))
  // frequência "natural" de cada cliente (para gerar histórico realista)
  const freq = clientes.map((_, i) => [14, 15, 21, 21, 28, 30, 30, 45][i % 8])

  const agendamentos: Agendamento[] = []
  const comandas: Comanda[] = []
  const cfgDe = (id: string) => configuracoes.find((c) => c.membro_id === id)!

  const ocupado = new Map<string, Array<[number, number]>>() // membro|dia -> intervalos
  const livre = (membroId: string, ini: Date, fim: Date) => {
    const k = membroId + isoDia(ini)
    const lista = ocupado.get(k) ?? []
    const a = ini.getTime(), b = fim.getTime()
    if (lista.some(([x, y]) => a < y && b > x)) return false
    lista.push([a, b])
    ocupado.set(k, lista)
    return true
  }
  const trabalha = (membroId: string, dia: Date, minIni: number, minFim: number) =>
    jornadas.some((j) => {
      if (j.membro_id !== membroId || j.dia_semana !== dia.getDay()) return false
      const [hi, mi] = j.inicio.split(':').map(Number)
      const [hf, mf] = j.fim.split(':').map(Number)
      return minIni >= hi * 60 + mi && minFim <= hf * 60 + mf
    })

  const servicosDoCliente = (i: number): Servico[] => {
    const x = r()
    if (i % 9 === 4) return [infantil]
    if (i % 13 === 6 && x < 0.3) return [luzes]
    if (x < 0.32) return [degrade]
    if (x < 0.5) return [combo]
    if (x < 0.62) return [social]
    if (x < 0.72) return [degrade, sobrancelha]
    if (x < 0.8) return [barba]
    if (x < 0.86) return [degrade, pigmentacao]
    if (x < 0.92) return [pezinho]
    return [social, barba]
  }

  const criar = (cIdx: number, membro: Membro, inicio: Date, serv: Servico[], status: Agendamento['status'], origem: Agendamento['origem']) => {
    const dur = serv.reduce((t, x) => t + x.duracao_min, 0)
    const fim = somaMinutos(inicio, dur)
    const minIni = inicio.getHours() * 60 + inicio.getMinutes()
    if (!trabalha(membro.id, inicio, minIni, minIni + dur)) return null
    if (!livre(membro.id, inicio, fim)) return null
    const ag: Agendamento = {
      id: uid(),
      cliente_id: clientes[cIdx].id,
      membro_id: membro.id,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      status,
      origem,
      valor_previsto_centavos: serv.reduce((t, x) => t + x.preco_centavos, 0),
      observacao_cliente: null,
      confirmado_em: status === 'confirmado' ? somaDias(inicio, -1).toISOString() : null,
      servicos: serv.map((x) => ({ servico_id: x.id, nome: x.nome, preco_centavos: x.preco_centavos, duracao_min: x.duracao_min })),
      criado_em: somaDias(inicio, -2).toISOString(),
    }
    agendamentos.push(ag)
    return ag
  }

  const fechar = (ag: Agendamento, forma: Comanda['forma_pagamento'], comProduto: boolean) => {
    const cfg = cfgDe(ag.membro_id)
    const itens = ag.servicos.map((sv) => ({
      id: uid(), tipo: 'servico' as const, servico_id: sv.servico_id, produto_id: null, membro_id: ag.membro_id,
      descricao: sv.nome, quantidade: 1, preco_unit_centavos: sv.preco_centavos, comissao_pct: cfg.comissao_servico_pct,
    }))
    if (comProduto) {
      itens.push({ id: uid(), tipo: 'produto' as const, servico_id: null, produto_id: 'pomada', membro_id: ag.membro_id,
        descricao: 'Pomada matte 80g', quantidade: 1, preco_unit_centavos: 3500, comissao_pct: cfg.comissao_produto_pct } as never)
    }
    const pago = new Date(ag.fim)
    comandas.push({
      id: uid(), agendamento_id: ag.id, cliente_id: ag.cliente_id, membro_id: ag.membro_id, status: 'paga',
      desconto_centavos: 0, forma_pagamento: forma, pago_em: pago.toISOString(), itens, criado_em: ag.inicio,
    })
  }

  // ---------- histórico: últimos 75 dias
  const formas: Comanda['forma_pagamento'][] = ['pix', 'pix', 'pix', 'pix', 'dinheiro', 'debito', 'credito']
  clientes.forEach((_, i) => {
    let dia = somaDias(h, -75 + Math.floor(r() * freq[i]))
    // alguns clientes "sumidos": param de vir há um tempo
    const sumido = i % 7 === 3
    const limite = sumido ? somaDias(h, -freq[i] - 12) : somaDias(h, -1)
    while (dia <= limite) {
      const membro = r() < 0.7 ? membros.find((mb) => mb.id === clientes[i].membro_preferido_id)! : pick(membros)
      const serv = servicosDoCliente(i)
      for (let tent = 0; tent < 6; tent++) {
        const ini = new Date(dia)
        ini.setHours(9 + Math.floor(r() * 10), pick([0, 15, 30, 45]), 0, 0)
        const x = r()
        const status: Agendamento['status'] = x < 0.06 ? 'faltou' : x < 0.11 ? 'cancelado' : 'concluido'
        const origem: Agendamento['origem'] = r() < 0.62 ? 'link' : r() < 0.6 ? 'balcao' : r() < 0.5 ? 'mensagem' : 'encaixe'
        const ag = criar(i, membro, ini, serv.filter((sv) => sv.membros.includes(membro.id)).length ? serv.filter((sv) => sv.membros.includes(membro.id)) : [degrade], status, origem)
        if (ag) {
          if (status === 'concluido') fechar(ag, pick(formas), r() < 0.12)
          break
        }
      }
      dia = somaDias(dia, freq[i] + Math.floor(r() * 7) - 3)
    }
  })

  // ---------- hoje e próximos 10 dias
  const agora = new Date()
  for (let d = 0; d <= 10; d++) {
    const dia = somaDias(h, d)
    const densidade = d === 0 ? 0.85 : d < 3 ? 0.7 : 0.36
    for (const mb of membros) {
      for (let min = 9 * 60; min < 20 * 60; min += 15) {
        if (r() > densidade / 2.6) continue
        const cIdx = Math.floor(r() * clientes.length)
        const serv = servicosDoCliente(cIdx).filter((sv) => sv.membros.includes(mb.id))
        if (!serv.length) continue
        const ini = new Date(dia)
        ini.setHours(0, min, 0, 0)
        const fimPrev = somaMinutos(ini, serv.reduce((t, x) => t + x.duracao_min, 0))
        let status: Agendamento['status'] = r() < 0.55 ? 'confirmado' : 'agendado'
        if (d === 0 && fimPrev < agora) status = r() < 0.08 ? 'faltou' : 'concluido'
        else if (d === 0 && ini < agora && fimPrev >= agora) status = 'em_atendimento'
        const origem: Agendamento['origem'] = r() < 0.7 ? 'link' : r() < 0.5 ? 'balcao' : 'mensagem'
        const ag = criar(cIdx, mb, ini, serv, status, origem)
        if (ag && status === 'concluido') fechar(ag, pick(formas), r() < 0.1)
      }
    }
  }

  // ---------- recalcula campos do cliente (o banco faz isso por trigger)
  for (const c of clientes) {
    const pagas = comandas.filter((co) => co.cliente_id === c.id && co.status === 'paga').sort((a, b) => a.pago_em!.localeCompare(b.pago_em!))
    if (!pagas.length) continue
    c.total_visitas = pagas.length
    c.total_gasto_centavos = pagas.reduce((t, co) => t + co.itens.reduce((u, it) => u + it.quantidade * it.preco_unit_centavos, 0), 0)
    c.primeira_visita_em = pagas[0].pago_em
    c.ultima_visita_em = pagas[pagas.length - 1].pago_em
    if (pagas.length > 1) {
      const dias = (new Date(c.ultima_visita_em!).getTime() - new Date(c.primeira_visita_em!).getTime()) / 86400000
      c.frequencia_media_dias = Math.round((dias / (pagas.length - 1)) * 10) / 10
    }
    c.proximo_retorno_previsto = isoDia(somaDias(new Date(c.ultima_visita_em!), Math.round(c.frequencia_media_dias ?? 30)))
  }
  // indicações
  clientes[5].indicado_por_id = clientes[0].id
  clientes[14].indicado_por_id = clientes[0].id
  clientes[22].indicado_por_id = clientes[3].id

  const produtos: Produto[] = [
    { id: 'pomada', nome: 'Pomada matte 80g', preco_venda_centavos: 3500, custo_centavos: 1600, estoque_atual: 14, estoque_minimo: 5, ativo: true },
    { id: uid(), nome: 'Óleo para barba 30ml', preco_venda_centavos: 4000, custo_centavos: 1800, estoque_atual: 3, estoque_minimo: 4, ativo: true },
    { id: uid(), nome: 'Balm pós-barba', preco_venda_centavos: 3000, custo_centavos: 1200, estoque_atual: 9, estoque_minimo: 3, ativo: true },
    { id: uid(), nome: 'Shampoo anticaspa', preco_venda_centavos: 4500, custo_centavos: 2100, estoque_atual: 6, estoque_minimo: 3, ativo: true },
    { id: uid(), nome: 'Minoxidil 60ml', preco_venda_centavos: 6500, custo_centavos: 3800, estoque_atual: 0, estoque_minimo: 2, ativo: true },
  ]

  const mesAtual = new Date(h.getFullYear(), h.getMonth(), 1)
  const despesas: Despesa[] = [
    { id: uid(), membro_id: null, descricao: 'Aluguel do salão', categoria: 'Aluguel', valor_centavos: 280000, data: isoDia(somaDias(mesAtual, 4)), pago: true },
    { id: uid(), membro_id: null, descricao: 'Conta de luz', categoria: 'Contas', valor_centavos: 41290, data: isoDia(somaDias(mesAtual, 9)), pago: true },
    { id: uid(), membro_id: null, descricao: 'Internet', categoria: 'Contas', valor_centavos: 12990, data: isoDia(somaDias(mesAtual, 9)), pago: true },
    { id: uid(), membro_id: null, descricao: 'Lâminas e talco', categoria: 'Produtos', valor_centavos: 18750, data: isoDia(somaDias(mesAtual, 2)), pago: true },
    { id: uid(), membro_id: null, descricao: 'Reposição de pomadas', categoria: 'Produtos', valor_centavos: 32000, data: isoDia(somaDias(mesAtual, 6)), pago: false },
    { id: uid(), membro_id: null, descricao: 'Impulsionamento Instagram', categoria: 'Marketing', valor_centavos: 15000, data: isoDia(somaDias(mesAtual, 1)), pago: true },
  ].filter((d) => d.data <= isoDia(h))

  // Só existe cobrança de aluguel no modo cadeira alugada (gerada em Financeiro).
  const alugueis: AluguelCadeira[] = []

  const listaEspera: ListaEspera[] = [
    { id: uid(), cliente_id: clientes[8].id, membro_id: pedro.id, servico_id: degrade.id, data: isoDia(h), hora_de: '17:00', hora_ate: '20:00', status: 'aguardando', criado_em: somaDias(h, -1).toISOString() },
    { id: uid(), cliente_id: clientes[19].id, membro_id: null, servico_id: combo.id, data: isoDia(somaDias(h, 1)), hora_de: null, hora_ate: null, status: 'aguardando', criado_em: new Date().toISOString() },
    { id: uid(), cliente_id: clientes[27].id, membro_id: luka.id, servico_id: luzes.id, data: isoDia(somaDias(h, 2)), hora_de: '09:00', hora_ate: '12:00', status: 'avisado', criado_em: somaDias(h, -2).toISOString() },
  ]

  const modelos: ModeloMensagem[] = [
    { id: uid(), tipo: 'confirmacao', ativo: true, texto: 'Fechou, {cliente}! Seu horário com {barbeiro} está marcado para {data} às {horario}. Precisa mudar? {link}' },
    { id: uid(), tipo: 'lembrete_24h', ativo: true, texto: 'E aí, {cliente}! Amanhã às {horario} tem {servico} com {barbeiro}. Responde 1 para confirmar ou acesse {link} para remarcar.' },
    { id: uid(), tipo: 'lembrete_2h', ativo: true, texto: '{cliente}, daqui a 2 horas é a sua vez aqui na {barbearia}. Te esperamos às {horario}.' },
    { id: uid(), tipo: 'retorno', ativo: true, texto: 'Fala, {cliente}! Já tá na hora de dar aquele tapa no visual. {barbeiro} tem horário essa semana: {link}' },
    { id: uid(), tipo: 'resgate', ativo: true, texto: 'Sumiu, hein {cliente}? Volta pra {barbearia} essa semana e ganha {desconto} no corte. Agende: {link}' },
    { id: uid(), tipo: 'lista_espera', ativo: true, texto: '{cliente}, abriu um horário {data} às {horario} com {barbeiro}. Quer? Garanta aqui: {link}' },
    { id: uid(), tipo: 'resumo_diario', ativo: false, texto: 'Resumo de hoje: {faturamento} em {atendimentos} atendimentos, {faltas} faltas. Amanhã: {agendados} horários marcados.' },
  ]

  const mensagens: Mensagem[] = []
  for (let i = 0; i < 520; i++) {
    const c = pick(clientes)
    const tipo = pick(['lembrete_24h', 'lembrete_24h', 'lembrete_2h', 'confirmacao', 'retorno', 'resgate', 'lista_espera'] as const)
    mensagens.push({
      id: uid(), cliente_id: c.id, tipo, conteudo: '', status: r() < 0.9 ? 'lida' : r() < 0.5 ? 'entregue' : 'falhou',
      enviada_em: somaDias(h, -Math.floor(r() * 30)).toISOString(),
      gerou_agendamento: (tipo === 'retorno' || tipo === 'resgate' || tipo === 'lista_espera') && r() < 0.42,
    })
  }

  const cupons: Cupom[] = [
    { id: uid(), codigo: 'VOLTA10', tipo: 'percentual', valor: 10, valido_ate: isoDia(somaDias(h, 20)), usos: 4, usos_max: 30, ativo: true },
    { id: uid(), codigo: 'PRIMEIRA', tipo: 'valor', valor: 1000, valido_ate: null, usos: 11, usos_max: null, ativo: true },
  ]
  const promocoes: Promocao[] = [
    { id: uid(), nome: 'Terça de manhã', dia_semana: 2, hora_inicio: '09:00', hora_fim: '12:00', tipo: 'percentual', valor: 15, ativo: true },
  ]

  const fidelidade: ProgramaFidelidade = {
    tipo: 'cartao_visitas', pontos_por_real: 1, visitas_para_premio: 10, pontos_por_indicacao: 2,
    premio_descricao: 'Corte degradê grátis', ativo: true,
  }
  const movimentosFidelidade: FidelidadeMovimento[] = []
  for (const co of comandas) {
    if (co.cliente_id) movimentosFidelidade.push({ id: uid(), cliente_id: co.cliente_id, tipo: 'atendimento', pontos: 1, criado_em: co.pago_em! })
  }
  movimentosFidelidade.push({ id: uid(), cliente_id: clientes[0].id, tipo: 'indicacao', pontos: 2, criado_em: somaDias(h, -40).toISOString() })
  movimentosFidelidade.push({ id: uid(), cliente_id: clientes[0].id, tipo: 'indicacao', pontos: 2, criado_em: somaDias(h, -12).toISOString() })

  const planosClube: PlanoClube[] = [
    { id: uid(), nome: 'Corte livre', descricao: 'Cortes ilimitados no mês, de segunda a quinta.', preco_centavos: 11990, usos_por_mes: null, ativo: true },
    { id: uid(), nome: 'Corte + barba 2x', descricao: 'Dois combos por mês, qualquer dia.', preco_centavos: 12990, usos_por_mes: 2, ativo: true },
  ]
  const assinaturasClube: AssinaturaClube[] = [0, 4, 9, 15, 21, 30].map((ci, i) => ({
    id: uid(), cliente_id: clientes[ci].id, plano_clube_id: planosClube[i % 2].id, status: i === 5 ? 'pausada' : 'ativa',
    dia_vencimento: [5, 10, 10, 15, 20, 5][i], pago_mes_atual: i !== 3,
  }))

  const comentarios = ['Melhor degradê da ZL, sem exagero.', 'Pontual e caprichoso.', 'Atendimento top, ambiente massa.', 'Demorou um pouco mas ficou perfeito.', 'O Zé é brabo na navalha.', null, null]
  const avaliacoes: Avaliacao[] = agendamentos
    .filter((a) => a.status === 'concluido')
    .slice(0, 46)
    .map((a, i) => ({
      id: uid(), cliente_id: a.cliente_id, membro_id: a.membro_id, nota: i % 9 === 0 ? 4 : 5,
      comentario: comentarios[i % comentarios.length], publica: i % 3 === 0, criado_em: a.fim,
    }))

  const portfolio: FotoPortfolio[] = []

  const faturas: Fatura[] = [3, 2, 1].map((k) => {
    const comp = new Date(h.getFullYear(), h.getMonth() - k + 1, 1)
    return {
      id: uid(), barbearia_id: barbeariaId, competencia: isoDia(comp), valor_centavos: 7990,
      vencimento: isoDia(new Date(comp.getFullYear(), comp.getMonth(), 10)),
      status: k === 1 && h.getDate() < 10 ? 'aberta' : 'paga',
      pix_copia_cola: null, pago_em: k === 1 && h.getDate() < 10 ? null : new Date(comp.getFullYear(), comp.getMonth(), 8).toISOString(),
    }
  })

  const sugestoes: Sugestao[] = [
    { id: uid(), barbearia_id: null, titulo: 'Agendar pelo Instagram direto', descricao: 'Botão no perfil que já abre o horário.', status: 'planejada', votos: 14, votei: true, criado_em: somaDias(h, -20).toISOString() },
    { id: uid(), barbearia_id: null, titulo: 'Relatório de quanto cada barbeiro vendeu de produto', descricao: null, status: 'em_analise', votos: 9, votei: false, criado_em: somaDias(h, -9).toISOString() },
    { id: uid(), barbearia_id: null, titulo: 'Lembrete de aniversário do cliente', descricao: 'Mandar mensagem com desconto no dia.', status: 'nova', votos: 6, votei: false, criado_em: somaDias(h, -3).toISOString() },
  ]

  const bloqueios: Bloqueio[] = [
    { id: uid(), membro_id: rafa.id, inicio: (() => { const d = somaDias(h, 2); d.setHours(15, 0, 0, 0); return d.toISOString() })(), fim: (() => { const d = somaDias(h, 2); d.setHours(18, 0, 0, 0); return d.toISOString() })(), motivo: 'Médico' },
  ]

  return {
    versao: VERSAO_SEED,
    barbearia, membros, configuracoes, horarios, jornadas, bloqueios, servicos, clientes,
    agendamentos: agendamentos.sort((a, b) => a.inicio.localeCompare(b.inicio)),
    comandas, produtos, despesas, alugueis, listaEspera, modelos, mensagens, cupons, promocoes,
    fidelidade, movimentosFidelidade, planosClube, assinaturasClube, avaliacoes, portfolio, faturas, sugestoes,
    assinatura: {
      plano: 'Barbearia', preco_centavos: 7990, status: 'ativa', teste_ate: null,
      proximo_vencimento: isoDia(new Date(h.getFullYear(), h.getMonth() + (h.getDate() < 10 ? 0 : 1), 10)),
    },
    usuarioMembroId: ze.id,
  }
}
