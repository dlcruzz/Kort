import { useMemo, useState } from 'react'
import { useKort, totalComanda, comissaoItem } from '../../lib/store'
import { dataCurta, dinheiro, dinheiroCurto, hoje, LABEL_ORIGEM, mesmoDia, nomeDiaCurto, nomeMes, somaDias } from '../../lib/format'
import { CabecalhoPagina, Metricas, Segmentos } from '../../components/ui'
import { TextoContado } from '../../lib/movimento'
import { BarrasHorizontais, BarrasVerticais, MapaCalor } from '../../components/graficos'

type Periodo = '7' | '30' | 'mes' | 'passado'

// Taxa de falta de referência para barbearias sem lembrete automático.
// Usada para estimar quantas faltas os lembretes evitaram.
const FALTA_SEM_LEMBRETE = 0.2

export default function Relatorios() {
  const { estado } = useKort()
    const [periodo, setPeriodo] = useState<Periodo>('30')

  const [ini, fim] = useMemo((): [Date, Date] => {
    const h = hoje()
    if (periodo === '7') return [somaDias(h, -6), somaDias(h, 1)]
    if (periodo === '30') return [somaDias(h, -29), somaDias(h, 1)]
    if (periodo === 'mes') return [new Date(h.getFullYear(), h.getMonth(), 1), somaDias(h, 1)]
    return [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 1)]
  }, [periodo])

  const dentro = (iso: string) => {
    const d = new Date(iso)
    return d >= ini && d < fim
  }

  const pagas = estado.comandas.filter((c) => c.status === 'paga' && c.pago_em && dentro(c.pago_em))
  const ags = estado.agendamentos.filter((a) => dentro(a.inicio) && new Date(a.inicio) <= new Date())
  const fat = pagas.reduce((t, c) => t + totalComanda(c), 0)
  const ticket = pagas.length ? Math.round(fat / pagas.length) : 0
  const faltas = ags.filter((a) => a.status === 'faltou').length
  const validos = ags.filter((a) => a.status !== 'cancelado')
  const taxaFalta = validos.length ? faltas / validos.length : 0
  const novos = estado.clientes.filter((c) => c.primeira_visita_em && dentro(c.primeira_visita_em)).length

  // ---------- dinheiro na mesa (S01)
  const msgs = estado.mensagens.filter((m) => m.enviada_em && dentro(m.enviada_em))
  const faltasEvitadas = Math.max(0, Math.round(validos.length * (FALTA_SEM_LEMBRETE - taxaFalta)))
  const listaRec = msgs.filter((m) => m.tipo === 'lista_espera' && m.gerou_agendamento).length
  const voltaram = msgs.filter((m) => (m.tipo === 'retorno' || m.tipo === 'resgate') && m.gerou_agendamento).length
  const pelolink = ags.filter((a) => a.origem === 'link').length
  const recuperado = (faltasEvitadas + listaRec + voltaram) * ticket

  // ---------- faturamento por dia
  const dias: Date[] = []
  for (let d = new Date(ini); d < fim; d = somaDias(d, 1)) dias.push(d)
  const porDia = dias.map((d) => {
    const v = pagas.filter((c) => mesmoDia(new Date(c.pago_em!), d)).reduce((t, c) => t + totalComanda(c), 0)
    return { rot: periodo === '7' ? nomeDiaCurto(d.getDay()) : String(d.getDate()), valor: v, dica: `${dataCurta(d)}: ${dinheiro(v)}`, destaque: mesmoDia(d, hoje()) }
  })
  const melhorDia = porDia.reduce((m, d, i) => (d.valor > porDia[m].valor ? i : m), 0)

  // ---------- por barbeiro
  const barbeiros = estado.membros.filter((m) => m.atende).map((m) => {
    const dele = pagas.filter((c) => c.membro_id === m.id)
    const v = dele.reduce((t, c) => t + totalComanda(c), 0)
    const com = dele.reduce((t, c) => t + c.itens.reduce((u, i) => u + comissaoItem(i), 0), 0)
    const agsDele = validos.filter((a) => a.membro_id === m.id)
    const f = agsDele.filter((a) => a.status === 'faltou').length
    return { m, v, com, qtd: dele.length, ticket: dele.length ? Math.round(v / dele.length) : 0, faltas: f, taxa: agsDele.length ? f / agsDele.length : 0 }
  }).sort((a, b) => b.v - a.v)

  // ---------- serviços
  const servs = new Map<string, { qtd: number; v: number }>()
  for (const c of pagas) for (const i of c.itens.filter((x) => x.tipo === 'servico')) {
    const s = servs.get(i.descricao) ?? { qtd: 0, v: 0 }
    s.qtd += i.quantidade
    s.v += i.quantidade * i.preco_unit_centavos
    servs.set(i.descricao, s)
  }
  const topServ = [...servs.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 6)

  // ---------- mapa de movimento (S12): dias x horas
  const horas = Array.from({ length: 12 }, (_, i) => 9 + i)
  const ordemDias = [1, 2, 3, 4, 5, 6, 0]
  const calor = ordemDias.map((dw) => horas.map((hh) => validos.filter((a) => { const d = new Date(a.inicio); return d.getDay() === dw && d.getHours() === hh && a.status !== 'faltou' }).length))
  const semanas = Math.max(1, dias.length / 7)
  let piorCelula = { v: Infinity, d: 0, h: 0 }
  calor.forEach((linha, di) => linha.forEach((v, hi) => {
    const abre = estado.horarios.some((x) => x.dia_semana === ordemDias[di] && Number(x.abre.slice(0, 2)) <= horas[hi] && Number(x.fecha.slice(0, 2)) > horas[hi])
    if (abre && v < piorCelula.v) piorCelula = { v, d: di, h: hi }
  }))

  // ---------- origem
  const origens = Object.entries(validos.reduce<Record<string, number>>((acc, a) => { acc[a.origem] = (acc[a.origem] ?? 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1])

  const nomePeriodo = periodo === 'mes' ? `em ${nomeMes(hoje().getMonth())}` : periodo === 'passado' ? `em ${nomeMes((hoje().getMonth() + 11) % 12)}` : `nos últimos ${periodo} dias`
  const melhorCliente = [...estado.clientes].sort((a, b) => b.total_gasto_centavos - a.total_gasto_centavos)[0]

  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        sub={`Números ${nomePeriodo}, a partir dos pagamentos confirmados no caixa.`}
        acoes={<Segmentos rotulo="Período" valor={periodo} onChange={setPeriodo} opcoes={[['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['passado', 'Mês passado']]} />}
      />

      <section className="painel" style={{ background: 'var(--kort)', borderColor: 'var(--preto)', borderWidth: 1.5, boxShadow: '4px 4px 0 var(--preto)', marginBottom: 20 }}>
        <div className="painel-corpo rel-mesa">
          <div>
            <h2 className="display" style={{ fontSize: 34 }}>Dinheiro na mesa</h2>
            <p style={{ fontSize: 14, marginTop: 6, maxWidth: '40ch' }}>O que o Kort trouxe de volta {nomePeriodo}, calculado pelo seu ticket médio de {dinheiroCurto(ticket)}.</p>
            <div className="display num rel-mesa-valor"><TextoContado texto={dinheiroCurto(recuperado)} ms={1100} /></div>
          </div>
          <ul className="lista" style={{ background: 'var(--branco)', border: '1.5px solid var(--preto)', borderRadius: 8, padding: '2px 14px' }}>
            <li><span className="cresce"><b>{faltasEvitadas}</b> faltas evitadas pelos lembretes</span><b className="num">{dinheiroCurto(faltasEvitadas * ticket)}</b></li>
            <li><span className="cresce"><b>{listaRec}</b> vagas preenchidas pela lista de espera</span><b className="num">{dinheiroCurto(listaRec * ticket)}</b></li>
            <li><span className="cresce"><b>{voltaram}</b> clientes que voltaram pela mensagem</span><b className="num">{dinheiroCurto(voltaram * ticket)}</b></li>
            <li className="pequeno muted"><span className="cresce">{pelolink} horários marcados pelo link sem ninguém precisar responder</span></li>
          </ul>
        </div>
        <p className="pequeno" style={{ padding: '0 18px 14px', color: 'rgba(8,8,8,0.7)' }}>
          Faltas evitadas: diferença entre a sua taxa de faltas ({Math.round(taxaFalta * 100)}%) e a média de barbearias sem lembrete (cerca de {FALTA_SEM_LEMBRETE * 100}%).
        </p>
      </section>

      <Metricas
        itens={[
          { rot: 'Faturamento', val: dinheiroCurto(fat), det: `${pagas.length} atendimentos` },
          { rot: 'Ticket médio', val: dinheiroCurto(ticket) },
          { rot: 'Taxa de faltas', val: `${Math.round(taxaFalta * 100)}%`, det: `${faltas} ${faltas === 1 ? 'falta' : 'faltas'}` },
          { rot: 'Clientes novos', val: novos, det: melhorCliente ? `Quem mais gastou: ${melhorCliente.nome.split(' ')[0]}` : undefined },
        ]}
      />

      <section className="painel" style={{ marginTop: 20 }}>
        <div className="painel-cab">
          <h2>Faturamento por dia</h2>
          {porDia[melhorDia]?.valor > 0 && <span className="muted pequeno">Melhor dia: {porDia[melhorDia].dica}</span>}
        </div>
        <div className="painel-corpo" style={{ paddingTop: 28 }}>
          <BarrasVerticais rotulo="Faturamento por dia" dados={porDia} formatarEixo={(v) => (v >= 100000 ? `${Math.round(v / 100000)} mil` : `${Math.round(v / 100)}`)} />
        </div>
      </section>

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <section className="painel">
          <div className="painel-cab"><h2>Equipe</h2></div>
          <div className="tabela-wrap" style={{ marginTop: 8 }}>
            <table className="tabela">
              <thead><tr><th>Barbeiro</th><th className="dir">Atend.</th><th className="dir">Faturou</th><th className="dir">Ticket</th><th className="dir">Comissão</th><th className="dir">Faltas</th></tr></thead>
              <tbody>
                {barbeiros.map((b) => (
                  <tr key={b.m.id}>
                    <td><span className="linha-flex" style={{ gap: 8 }}><span className="ponto" style={{ background: b.m.cor_agenda }} /><b style={{ fontWeight: 600 }}>{b.m.nome_exibicao}</b></span></td>
                    <td className="dir num">{b.qtd}</td>
                    <td className="dir num forte">{dinheiroCurto(b.v)}</td>
                    <td className="dir num">{dinheiroCurto(b.ticket)}</td>
                    <td className="dir num">{b.com ? dinheiroCurto(b.com) : '-'}</td>
                    <td className="dir num">{Math.round(b.taxa * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="painel">
          <div className="painel-cab"><h2>Serviços que mais faturam</h2></div>
          <div className="painel-corpo" style={{ paddingTop: 4 }}>
            <BarrasHorizontais rotulo="Serviços que mais faturam" dados={topServ.map(([n, s]) => ({ rot: n, valor: s.v, texto: dinheiroCurto(s.v), extra: `${s.qtd}x` }))} />
          </div>
        </section>
      </div>

      <div className="duas-colunas" style={{ marginTop: 20 }}>
        <section className="painel">
          <div className="painel-cab"><h2>Mapa de movimento</h2></div>
          <div className="painel-corpo">
            <MapaCalor
              rotulo="Atendimentos por dia da semana e hora"
              linhas={ordemDias.map(nomeDiaCurto)}
              colunas={horas.map((h) => `${h}h`)}
              valores={calor}
              formatar={(v, l, c) => `${nomeDiaCurto(ordemDias[l])} às ${horas[c]}h: ${(v / semanas).toFixed(1).replace('.', ',')} por semana`}
            />
            {piorCelula.v !== Infinity && (
              <p className="pequeno" style={{ marginTop: 14 }}>
                O horário mais parado é <b>{nomeDiaCurto(ordemDias[piorCelula.d])} às {horas[piorCelula.h]}h</b>. Uma promoção nesse horário pode encher a agenda. Crie em Divulgação.
              </p>
            )}
          </div>
        </section>

        <section className="painel">
          <div className="painel-cab"><h2>Como os horários foram marcados</h2></div>
          <div className="painel-corpo" style={{ paddingTop: 4 }}>
            <BarrasHorizontais rotulo="Origem dos agendamentos" dados={origens.map(([o, n]) => ({ rot: LABEL_ORIGEM[o], valor: n, texto: String(n), extra: `${Math.round((n / validos.length) * 100)}%` }))} />
            <p className="muted pequeno" style={{ marginTop: 10 }}>
              {new Set(pagas.map((c) => c.cliente_id)).size} clientes diferentes atendidos no período.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}
