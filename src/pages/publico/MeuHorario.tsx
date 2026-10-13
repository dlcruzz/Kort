import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { useMeuHorario } from '../../lib/publico'
import { TelaCarregando } from '../../components/guardas'
import { IconeWhats } from '../../components/IconeWhats'
import { horariosLivres, type Slot } from '../../lib/agenda'
import { dataLonga, dinheiroCurto, hora, hoje, isoDia, nomeDiaCurto, somaDias } from '../../lib/format'
import { Confirmar } from '../../components/ui'

export default function MeuHorario() {
  const { slug, id } = useParams()
  const [params] = useSearchParams()
  const h = useMeuHorario(slug, id, params.get('t'))
  if (h.situacao === 'carregando') return <div className="pub"><TelaCarregando /></div>
  return <Tela h={h} slug={slug} />
}

function Tela({ h, slug }: { h: ReturnType<typeof useMeuHorario>; slug?: string }) {
  const vazio = { barbearia: { slug: slug ?? '', nome: '', antecedencia_max_dias: 0, antecedencia_cancelamento_min: 0, intervalo_slots_min: 15, whatsapp: null }, membros: [], jornadas: [], agendamentos: [], bloqueios: [], horarios: [] }
  const estado = (h.dados ?? vazio) as NonNullable<typeof h.dados>
  const b = estado.barbearia
  const ag = h.agendamento
  const membro = useMemo(() => new Map(estado.membros.map((m) => [m.id, m])), [estado.membros])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const executar = async (fn: () => Promise<void>, ok: string) => {
    setEnviando(true)
    setErro('')
    try {
      await fn()
      setFeito(ok)
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      setEnviando(false)
    }
  }

  const [modo, setModo] = useState<'ver' | 'remarcar'>('ver')
  const [cancelar, setCancelar] = useState(false)
  const [dia, setDia] = useState(hoje())
  const [slot, setSlot] = useState<Slot | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  const duracao = ag ? (new Date(ag.fim).getTime() - new Date(ag.inicio).getTime()) / 60000 : 0
  const livres = useMemo(
    () =>
      ag
        ? horariosLivres({ dia, membroId: ag.membro_id, duracao, jornadas: estado.jornadas, agendamentos: estado.agendamentos, bloqueios: estado.bloqueios, grade: b.intervalo_slots_min, ignorarAgendamentoId: ag.id })
        : [],
    [ag, dia, duracao, estado.jornadas, estado.agendamentos, estado.bloqueios, b.intervalo_slots_min],
  )

  if (!ag || h.situacao !== 'pronto') {
    return (
      <div className="pub">
        <div className="pub-wrap" style={{ paddingTop: 80 }}>
          <h1 className="display" style={{ fontSize: 46 }}>Horário não encontrado</h1>
          <p style={{ color: 'var(--txt-2)', marginTop: 12 }}>
            {h.situacao === 'erro' ? 'Confira sua internet e tente de novo.' : 'Confira se o link está completo, do jeito que chegou no WhatsApp.'}
          </p>
          <Link className="btn btn-primario" style={{ marginTop: 24 }} to={`/b/${slug}`}>Ir para a página da barbearia</Link>
        </div>
      </div>
    )
  }

  const minutosAte = (new Date(ag.inicio).getTime() - Date.now()) / 60000
  const podeMudar = minutosAte >= b.antecedencia_cancelamento_min && (ag.status === 'agendado' || ag.status === 'confirmado')
  const encerrado = ag.status === 'cancelado' || ag.status === 'concluido' || ag.status === 'faltou' || minutosAte < 0

  return (
    <div className="pub">
      <div className="pub-wrap">
        <header className="pub-capa">
          <Link to={`/b/${b.slug}`} className="pub-voltar" style={{ textDecoration: 'none' }}>
            <ArrowLeft /> {b.nome}
          </Link>
          <h1 style={{ marginTop: 14 }}>Seu horário</h1>
        </header>

        {erro && <p className="pub-erro" role="alert" style={{ marginTop: 20 }}>{erro}</p>}
        {feito && (
          <p style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <Check size={18} color="var(--kort)" /> {feito}
          </p>
        )}

        <div className="bilhete" style={ag.status === 'cancelado' ? { background: 'var(--sup-2)', color: 'var(--txt)', boxShadow: 'none' } : undefined}>
          <span className="ok">{ag.status === 'cancelado' ? 'Cancelado' : ag.status === 'confirmado' ? 'Confirmado' : 'Marcado'}</span>
          <h2>{hora(ag.inicio)}</h2>
          <div className="quando">{dataLonga(ag.inicio)}</div>
          <dl style={ag.status === 'cancelado' ? { borderTopColor: 'var(--borda)' } : undefined}>
            <dt>Serviço</dt>
            <dd>{ag.servicos.map((s) => s.nome).join(' + ')}</dd>
            <dt>Barbeiro</dt>
            <dd>{membro.get(ag.membro_id)?.nome_exibicao}</dd>
            <dt>Valor</dt>
            <dd>{dinheiroCurto(ag.valor_previsto_centavos)}</dd>
          </dl>
        </div>

        {!encerrado && modo === 'ver' && (
          podeMudar ? (
            <div className="pub-acoes-final">
              {ag.status === 'agendado' && (
                <button className="btn btn-primario" disabled={enviando} onClick={() => void executar(h.confirmar, 'Presença confirmada. Te esperamos!')}>Confirmar presença</button>
              )}
              <button className="btn btn-sec" onClick={() => setModo('remarcar')}>Mudar horário</button>
              <button className="btn btn-sec" onClick={() => setCancelar(true)}>Cancelar</button>
            </div>
          ) : (
            <p style={{ color: 'var(--txt-2)', fontSize: 14, marginTop: 18 }}>
              Faltam menos de {b.antecedencia_cancelamento_min / 60} horas. Para mudar agora, chame a barbearia no{' '}
              <a href={`https://wa.me/${b.whatsapp?.replace(/\D/g, '')}`} style={{ color: 'var(--kort)' }}>WhatsApp</a>.
            </p>
          )
        )}

        {modo === 'remarcar' && (
          <section style={{ marginTop: 26 }}>
            <h2 className="display" style={{ fontSize: 30, marginBottom: 14 }}>Escolha o novo horário</h2>
            <div className="dias-tira">
              {Array.from({ length: b.antecedencia_max_dias }, (_, i) => somaDias(hoje(), i)).map((d) => (
                <button key={isoDia(d)} aria-pressed={isoDia(d) === isoDia(dia)} onClick={() => { setDia(d); setSlot(null) }}
                  disabled={!estado.horarios.some((h) => h.dia_semana === d.getDay())}>
                  {nomeDiaCurto(d.getDay())}
                  <b>{d.getDate()}</b>
                </button>
              ))}
            </div>
            <p style={{ margin: '16px 0 12px', fontWeight: 600 }}>{dataLonga(dia)}</p>
            {livres.length ? (
              <div className="slots">
                {livres.map((s) => (
                  <button key={s.minuto} aria-pressed={slot?.minuto === s.minuto} onClick={() => setSlot(s)}>{s.hhmm}</button>
                ))}
              </div>
            ) : (
              <div className="pub-sem-horario">Sem horário livre com {membro.get(ag.membro_id)?.nome_exibicao} nesse dia.</div>
            )}
            <div className="pub-acoes-final">
              <button className="btn btn-sec" onClick={() => setModo('ver')}>Voltar</button>
              <button
                className="btn btn-primario"
                disabled={!slot || enviando}
                onClick={async () => {
                  const ini = new Date(dia)
                  ini.setHours(0, slot!.minuto, 0, 0)
                  if (await executar(() => h.remarcar(ini), 'Horário mudado. A barbearia já vê o novo horário na agenda.')) {
                    setModo('ver')
                    setSlot(null)
                  }
                }}
              >
                Mudar para {slot?.hhmm ?? '...'}
              </button>
            </div>
          </section>
        )}

        {modo === 'ver' && (
          <div className="pub-acoes-final" style={{ marginTop: 18 }}>
            <Link className="btn btn-sec" to={`/b/${slug}`}>Marcar outro horário</Link>
            {(b.whatsapp || b.telefone) && (
              <a className="btn btn-sec" target="_blank" rel="noreferrer"
                href={`https://wa.me/${(b.whatsapp ?? b.telefone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Olá! Sobre meu horário de ${dataLonga(ag.inicio)} às ${hora(ag.inicio)} (${ag.servicos.map((x) => x.nome).join(' + ')}): ${window.location.href}`,
                )}`}>
                <IconeWhats /> Falar com a barbearia
              </a>
            )}
          </div>
        )}

        <footer className="pub-rodape">
          <span>{b.nome}</span>
          <Link to="/">feito com <img src="/logo-sm.png" alt="Kort" /></Link>
        </footer>
      </div>

      <Confirmar
        aberto={cancelar}
        titulo="Cancelar horário?"
        texto={<span style={{ color: 'var(--grafite)' }}>O horário fica livre para outra pessoa. Se quiser voltar depois, é só marcar de novo.</span>}
        acao="Cancelar horário"
        perigo
        aoCancelar={() => setCancelar(false)}
        aoConfirmar={() => {
          setCancelar(false)
          void executar(h.cancelar, 'Horário cancelado.')
        }}
      />
    </div>
  )
}
