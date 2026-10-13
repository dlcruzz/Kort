// Aviso grande de horário novo marcado pelo link. Fica na tela até o
// barbeiro ver, toca um som curto e, se ele deixar, manda notificação do
// navegador (aparece mesmo com o Kort em outra aba).

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarCheck, X } from 'lucide-react'
import { useKort, useMapas } from '../lib/store'
import { dataRelativa, dinheiroCurto, hora, primeiroNome } from '../lib/format'

function tocar() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      o.connect(g)
      g.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.18
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.start(t)
      o.stop(t + 0.17)
    })
  } catch {
    /* navegador sem áudio: só o aviso visual */
  }
}

export function AvisoNovos() {
  const { novos, marcarVistos } = useKort()
  const { cliente, membro } = useMapas()
  const nav = useNavigate()
  const antes = useRef(0)
  const [permissao, setPermissao] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'))

  useEffect(() => {
    if (novos.length > antes.current) {
      tocar()
      const a = novos[novos.length - 1]
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        const c = cliente.get(a.cliente_id)
        new Notification('Horário novo no Kort', {
          body: `${c?.nome ?? 'Cliente'}: ${a.servicos.map((s) => s.nome).join(' + ')}, ${dataRelativa(a.inicio)} às ${hora(a.inicio)}`,
          icon: '/favicon.png',
        })
      }
    }
    antes.current = novos.length
  }, [novos, cliente])

  if (!novos.length) return null
  const lista = [...novos].sort((x, y) => y.criado_em.localeCompare(x.criado_em))

  return (
    <div className="aviso-novos" role="alert" aria-live="assertive">
      <div className="aviso-novos-cab">
        <span className="aviso-novos-ico"><CalendarCheck size={20} /></span>
        <strong>{novos.length === 1 ? 'Horário novo marcado pelo link' : `${novos.length} horários novos pelo link`}</strong>
        <button className="btn btn-fantasma btn-icone" aria-label="Fechar aviso" onClick={marcarVistos}><X size={18} /></button>
      </div>
      <ul>
        {lista.slice(0, 4).map((a) => {
          const c = cliente.get(a.cliente_id)
          return (
            <li key={a.id}>
              <div className="quando">{dataRelativa(a.inicio)} <b>{hora(a.inicio)}</b></div>
              <div className="cresce">
                <div className="quem">{c ? primeiroNome(c.nome) : 'Cliente'}{c?.nome.includes(' ') ? ` ${c.nome.split(' ').slice(-1)[0]}` : ''}</div>
                <div className="oque">{a.servicos.map((s) => s.nome).join(' + ')} com {membro.get(a.membro_id)?.nome_exibicao}, {dinheiroCurto(a.valor_previsto_centavos)}</div>
              </div>
            </li>
          )
        })}
        {lista.length > 4 && <li className="muted pequeno">e mais {lista.length - 4}</li>}
      </ul>
      <div className="aviso-novos-acoes">
        <button className="btn btn-primario btn-pequeno" onClick={() => { marcarVistos(); nav('/app/agenda', { state: { dia: lista[0].inicio } }) }}>Ver na agenda</button>
        {permissao === 'default' && (
          <button className="btn btn-sec btn-pequeno" onClick={async () => setPermissao(await Notification.requestPermission())}>
            <Bell size={15} /> Avisar mesmo em outra aba
          </button>
        )}
        <button className="btn btn-fantasma btn-pequeno" onClick={marcarVistos}>Ok, vi</button>
      </div>
    </div>
  )
}
