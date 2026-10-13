// Cliente da API do Kort (pasta server/). O front ainda roda em modo
// demonstração; quando ligar o back-end, as telas usam estas funções.
//
// Regra de bolso:
//  - página pública e "meu horário": sempre pela API (o cliente não tem login)
//  - CRUD do app da barbearia: direto no Supabase (o RLS protege)
//  - cálculos, mensagens, mensalidade e painel admin: pela API

import { supabase } from './supabase'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3333'

export class ErroApi extends Error {
  constructor(public status: number, message: string, public codigo?: string) {
    super(message)
  }
}

async function chamar<T>(caminho: string, opcoes: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opcoes.headers as Record<string, string>) }
  if (opcoes.auth && supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes, headers })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroApi(r.status, corpo.erro ?? 'Não foi possível falar com o servidor.', corpo.codigo)
  return corpo as T
}

const json = (b: unknown) => JSON.stringify(b)

export const api = {
  // ---------- público
  barbearia: (slug: string) => chamar<any>(`/publico/barbearias/${slug}`),
  horarios: (slug: string, data: string, servicos: string[], membro = 'qualquer') =>
    chamar<{ duracao: number; horarios: Array<{ hora: string; membros: string[] }> }>(
      `/publico/barbearias/${slug}/horarios?data=${data}&servicos=${servicos.join(',')}&membro=${membro}`,
    ),
  agendar: (slug: string, dados: { servicos: string[]; membro: string; data: string; hora: string; nome: string; telefone: string; observacao?: string }) =>
    chamar<{ id: string; token: string; link: string; inicio: string; fim: string }>(`/publico/barbearias/${slug}/agendamentos`, { method: 'POST', body: json(dados) }),
  meuHorario: (id: string, token: string) => chamar<any>(`/publico/agendamentos/${id}?t=${token}`),
  cancelar: (id: string, token: string) => chamar(`/publico/agendamentos/${id}/cancelar`, { method: 'POST', body: json({ token }) }),
  remarcar: (id: string, token: string, data: string, hora: string) =>
    chamar(`/publico/agendamentos/${id}/remarcar`, { method: 'POST', body: json({ token, data, hora }) }),
  entrarListaEspera: (slug: string, dados: { nome: string; telefone: string; data: string; servico_id?: string; membro_id?: string }) =>
    chamar(`/publico/barbearias/${slug}/lista-espera`, { method: 'POST', body: json(dados) }),

  // ---------- app da barbearia (logado)
  eu: () => chamar<any>('/eu', { auth: true }),
  dinheiroNaMesa: (barbeariaId: string, de: string, ate: string) =>
    chamar<any>(`/barbearias/${barbeariaId}/relatorios/dinheiro-na-mesa?de=${de}&ate=${ate}`, { auth: true }),
  enviarMensagem: (barbeariaId: string, dados: { cliente_id: string; tipo: 'retorno' | 'resgate' | 'lista_espera'; texto?: string }) =>
    chamar(`/barbearias/${barbeariaId}/mensagens`, { method: 'POST', body: json(dados), auth: true }),
  mensalidade: (barbeariaId: string) => chamar<any>(`/barbearias/${barbeariaId}/mensalidade`, { auth: true }),

  // ---------- painel admin
  admin: {
    indicadores: () => chamar<any>('/admin/indicadores', { auth: true }),
    barbearias: (q = '') => chamar<any[]>(`/admin/barbearias${q}`, { auth: true }),
    barbearia: (id: string) => chamar<any>(`/admin/barbearias/${id}`, { auth: true }),
    uso: () => chamar<any>('/admin/uso', { auth: true }),
    risco: () => chamar<any[]>('/admin/risco', { auth: true }),
    faturas: (status?: string) => chamar<any[]>(`/admin/faturas${status ? `?status=${status}` : ''}`, { auth: true }),
    darBaixa: (faturaId: string) => chamar(`/admin/faturas/${faturaId}/baixa`, { method: 'POST', auth: true }),
    mudarStatus: (id: string, status: 'ativa' | 'suspensa' | 'cancelada') => chamar(`/admin/barbearias/${id}/status`, { method: 'POST', body: json({ status }), auth: true }),
    estenderTeste: (id: string, dias: number) => chamar(`/admin/barbearias/${id}/estender-teste`, { method: 'POST', body: json({ dias }), auth: true }),
    sugestoes: () => chamar<any[]>('/admin/sugestoes', { auth: true }),
    mudarSugestao: (id: string, status: string) => chamar(`/admin/sugestoes/${id}`, { method: 'PATCH', body: json({ status }), auth: true }),
  },
}
