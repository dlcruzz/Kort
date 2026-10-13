import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Plus, Share2, Star } from 'lucide-react'
import { useKort, useMapas } from '../../lib/store'
import { horariosLivres } from '../../lib/agenda'
import { dataCurta, dataLonga, dataRelativa, hoje, isoDia, nomeDia, nomeDiaCurto, primeiroNome, somaDias, linkPublico, dominio } from '../../lib/format'
import type { Cupom, Promocao } from '../../lib/types'
import { CabecalhoPagina, Campo, Folha, Segmentos, Switch, Vazio } from '../../components/ui'
import { useAvisar } from '../../components/avisos'

type Aba = 'status' | 'link' | 'promocoes' | 'avaliacoes'

export default function Divulgacao() {
  const [aba, setAba] = useState<Aba>('status')
  return (
    <>
      <CabecalhoPagina titulo="Divulgação" sub="Encha os buracos da agenda: horários livres no status, promoções nos horários parados e as avaliações dos clientes." />
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'status'} onClick={() => setAba('status')}>Horários no status</button>
        <button role="tab" aria-selected={aba === 'link'} onClick={() => setAba('link')}>Seu link</button>
        <button role="tab" aria-selected={aba === 'promocoes'} onClick={() => setAba('promocoes')}>Promoções e cupons</button>
        <button role="tab" aria-selected={aba === 'avaliacoes'} onClick={() => setAba('avaliacoes')}>Avaliações</button>
      </div>
      {aba === 'status' && <HorariosStatus />}
      {aba === 'link' && <SeuLink />}
      {aba === 'promocoes' && <Promocoes />}
      {aba === 'avaliacoes' && <Avaliacoes />}
    </>
  )
}

/* ---------- S03: imagem com os horários livres para o status/story */
function HorariosStatus() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const canvas = useRef<HTMLCanvasElement>(null)
  const b = estado.barbearia
  // começa no primeiro dia (a partir de hoje) que ainda tem horário livre
  const [dia, setDia] = useState(() => {
    for (let i = 0; i < 7; i++) {
      const d = somaDias(hoje(), i)
      const tem = estado.membros.some((m) => m.atende && horariosLivres({ dia: d, membroId: m.id, duracao: 30, jornadas: estado.jornadas, agendamentos: estado.agendamentos, bloqueios: estado.bloqueios, grade: 30 }).length)
      if (tem) return d
    }
    return hoje()
  })
  const [membroId, setMembroId] = useState('todos')

  const barbeiros = estado.membros.filter((m) => m.ativo && m.atende)
  const slots = useMemo(() => {
    const quem = membroId === 'todos' ? barbeiros.map((m) => m.id) : [membroId]
    const set = new Set<string>()
    for (const id of quem)
      for (const s of horariosLivres({ dia, membroId: id, duracao: 30, jornadas: estado.jornadas, agendamentos: estado.agendamentos, bloqueios: estado.bloqueios, grade: 30 }))
        set.add(s.hhmm)
    return [...set].sort()
  }, [dia, membroId, barbeiros, estado.jornadas, estado.agendamentos, estado.bloqueios])

  useEffect(() => {
    let cancelado = false
    document.fonts.ready.then(() => {
      if (cancelado || !canvas.current) return
      desenhar(canvas.current, {
        nome: b.nome,
        titulo: dataRelativa(dia) === 'hoje' ? 'Hoje tem horário' : dataRelativa(dia) === 'amanhã' ? 'Amanhã tem horário' : `${nomeDia(dia.getDay())} tem horário`,
        data: dataLonga(dia),
        quem: membroId === 'todos' ? null : estado.membros.find((m) => m.id === membroId)?.nome_exibicao ?? null,
        slots: slots.slice(0, 18),
        link: linkPublico(b.slug),
      })
    })
    return () => { cancelado = true }
  }, [slots, dia, membroId, b.nome, b.slug, estado.membros])

  const baixar = () => {
    const url = canvas.current!.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `horarios-${isoDia(dia)}.png`
    a.click()
    acoes.evento('status_horarios.gerado')
    avisar('Imagem salva. É só postar no status.')
  }
  const compartilhar = async () => {
    const blob = await new Promise<Blob | null>((r) => canvas.current!.toBlob(r, 'image/png'))
    if (!blob) return
    const arquivo = new File([blob], `horarios-${isoDia(dia)}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: `Horários livres: ${linkPublico(b.slug)}` }).catch(() => {})
      acoes.evento('status_horarios.gerado')
    } else baixar()
  }

  return (
    <div className="duas-colunas" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0, 360px)' }}>
      <div className="pilha">
        <section className="painel">
          <div className="painel-corpo coluna gap-16">
            <div className="campo">
              <span className="rotulo">Dia</span>
              <div className="dias-tira">
                {Array.from({ length: 7 }, (_, i) => somaDias(hoje(), i)).map((d) => (
                  <button key={isoDia(d)} aria-pressed={isoDia(d) === isoDia(dia)} onClick={() => setDia(d)}>
                    {nomeDiaCurto(d.getDay())}<b>{d.getDate()}</b>
                  </button>
                ))}
              </div>
            </div>
            <div className="campo">
              <span className="rotulo">De quem</span>
              <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 6 }}>
                <button className="chip" aria-pressed={membroId === 'todos'} onClick={() => setMembroId('todos')}>Barbearia toda</button>
                {barbeiros.map((m) => (
                  <button key={m.id} className="chip" aria-pressed={membroId === m.id} onClick={() => setMembroId(m.id)}>
                    <span className="ponto" style={{ background: m.cor_agenda }} />{m.nome_exibicao}
                  </button>
                ))}
              </div>
            </div>
            <p className="pequeno muted">
              {slots.length ? `${slots.length} horários livres de 30 minutos ${dataRelativa(dia)}.` : `Agenda cheia ${dataRelativa(dia)}. Escolha outro dia.`}
              {slots.length > 18 && ' A imagem mostra os 18 primeiros.'}
            </p>
            <div className="linha-flex" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primario" onClick={compartilhar} disabled={!slots.length}><Share2 /> Compartilhar</button>
              <button className="btn btn-sec" onClick={baixar} disabled={!slots.length}><Download /> Baixar imagem</button>
            </div>
          </div>
        </section>
        <p className="muted pequeno">Dica: poste de manhã e de novo depois do almoço. Quem vê o status já cai direto no seu link para marcar.</p>
      </div>
      <canvas ref={canvas} width={1080} height={1920} style={{ width: '100%', maxWidth: 360, aspectRatio: '9 / 16', borderRadius: 14, border: '1px solid var(--linha)', justifySelf: 'center' }} aria-label="Prévia da imagem para o status" />
    </div>
  )
}

function desenhar(cv: HTMLCanvasElement, d: { nome: string; titulo: string; data: string; quem: string | null; slots: string[]; link: string }) {
  const g = cv.getContext('2d')!
  const W = 1080, H = 1920
  g.fillStyle = '#080808'
  g.fillRect(0, 0, W, H)

  // nome da barbearia
  g.fillStyle = '#A3A39C'
  g.font = '600 44px "Schibsted Grotesk Variable", sans-serif'
  g.fillText(d.nome, 90, 190)

  // título com a sombra deslocada da logo
  g.save()
  g.translate(90, 0)
  g.transform(1, -0.07, 0, 1, 0, 0)
  g.font = '900 170px "Big Shoulders Display Variable", sans-serif'
  const linhas = quebrar(g, d.titulo, W - 180)
  linhas.forEach((l, i) => {
    g.fillStyle = '#4D4D4A'
    g.fillText(l, 9, 380 + i * 158 + 9)
    g.fillStyle = '#E7F738'
    g.fillText(l, 0, 380 + i * 158)
  })
  g.restore()
  const baseY = 380 + linhas.length * 158 + 10

  g.fillStyle = '#F2F2EE'
  g.font = '600 46px "Schibsted Grotesk Variable", sans-serif'
  g.fillText(d.data + (d.quem ? ` com ${d.quem}` : ''), 90, baseY)

  // grade de horários
  const cols = 3, gw = (W - 180 - 2 * 28) / cols, gh = 118
  d.slots.forEach((s, i) => {
    const x = 90 + (i % cols) * (gw + 28)
    const y = baseY + 70 + Math.floor(i / cols) * (gh + 26)
    g.fillStyle = '#1E1E1C'
    arredondado(g, x, y, gw, gh, 18)
    g.fill()
    g.strokeStyle = '#2C2C2A'
    g.lineWidth = 3
    g.stroke()
    g.fillStyle = '#F2F2EE'
    g.font = '800 74px "Big Shoulders Display Variable", sans-serif'
    const tw = g.measureText(s).width
    g.fillText(s, x + (gw - tw) / 2, y + 84)
  })

  // chamada final
  const yb = H - 300
  g.fillStyle = '#4D4D4A'
  arredondado(g, 99, yb + 9, W - 180, 150, 22)
  g.fill()
  g.fillStyle = '#E7F738'
  arredondado(g, 90, yb, W - 180, 150, 22)
  g.fill()
  g.fillStyle = '#080808'
  g.font = '800 52px "Schibsted Grotesk Variable", sans-serif'
  const txt = 'Marque pelo link'
  g.fillText(txt, 90 + (W - 180 - g.measureText(txt).width) / 2, yb + 70)
  g.font = '600 40px "Schibsted Grotesk Variable", sans-serif'
  g.fillText(d.link, 90 + (W - 180 - g.measureText(d.link).width) / 2, yb + 120)
}

function quebrar(g: CanvasRenderingContext2D, texto: string, max: number) {
  const palavras = texto.split(' ')
  const out: string[] = []
  let atual = ''
  for (const p of palavras) {
    const t = atual ? `${atual} ${p}` : p
    if (g.measureText(t).width > max && atual) {
      out.push(atual)
      atual = p
    } else atual = t
  }
  if (atual) out.push(atual)
  return out
}

function arredondado(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/* ---------- link público */
function SeuLink() {
  const { estado } = useKort()
  const avisar = useAvisar()
  const url = `${window.location.origin}/b/${estado.barbearia.slug}`
  const copiar = async (t: string, msg: string) => {
    await navigator.clipboard?.writeText(t).catch(() => {})
    avisar(msg)
  }
  const bio = `Agende seu horário: ${url.replace(/^https?:\/\//, '')}`
  return (
    <div className="duas-colunas">
      <section className="painel">
        <div className="painel-corpo coluna gap-16">
          <div>
            <div className="rotulo">Seu link de agendamento</div>
            <div className="display" style={{ fontSize: 30, marginTop: 8, wordBreak: 'break-all' }}>{dominio()}/b/{estado.barbearia.slug}</div>
          </div>
          <div className="linha-flex" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primario" onClick={() => copiar(url, 'Link copiado')}><Copy /> Copiar link</button>
            <a className="btn btn-sec" href={url} target="_blank" rel="noreferrer">Abrir página</a>
          </div>
          <div className="separador" style={{ margin: '4px 0' }} />
          <Campo rotulo="Texto pronto para a bio do Instagram" id="bio">
            <textarea id="bio" className="textarea" readOnly value={bio} style={{ minHeight: 64 }} />
          </Campo>
          <button className="btn btn-sec btn-pequeno" style={{ alignSelf: 'flex-start' }} onClick={() => copiar(bio, 'Texto da bio copiado')}><Copy /> Copiar texto</button>
        </div>
      </section>
      <section className="painel">
        <div className="painel-cab"><h2>Onde colocar</h2></div>
        <div className="painel-corpo">
          <ol className="pequeno" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li>No Instagram: Editar perfil, Links, Adicionar link externo.</li>
            <li>No WhatsApp Business: Ferramentas comerciais, Perfil, Site.</li>
            <li>No Google: perfil da empresa, botão Agendar ou Site.</li>
            <li>Na resposta automática do WhatsApp, para quem chama pedindo horário.</li>
          </ol>
        </div>
      </section>
    </div>
  )
}

/* ---------- D08 promoções e cupons */
function Promocoes() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const [promo, setPromo] = useState<Partial<Promocao> | null>(null)
  const [cupom, setCupom] = useState<Partial<Cupom> | null>(null)

  return (
    <div className="duas-colunas">
      <section className="painel">
        <div className="painel-cab">
          <h2>Promoções de horário parado</h2>
          <button className="btn btn-sec btn-pequeno" onClick={() => setPromo({ nome: '', dia_semana: 2, hora_inicio: '09:00', hora_fim: '12:00', tipo: 'percentual', valor: 15, ativo: true })}><Plus /> Nova</button>
        </div>
        <div className="painel-corpo" style={{ paddingTop: 6 }}>
          {estado.promocoes.length ? (
            <ul className="lista">
              {estado.promocoes.map((p) => (
                <li key={p.id}>
                  <Switch checked={p.ativo} label={`Ativar ${p.nome}`} onChange={(v) => acoes.salvarPromocao({ ...p, ativo: v })} />
                  <div className="cresce">
                    <div style={{ fontWeight: 600 }}>{p.nome}</div>
                    <div className="muted pequeno">{p.dia_semana !== null ? nomeDia(p.dia_semana) : 'Todo dia'}{p.hora_inicio ? `, das ${p.hora_inicio} às ${p.hora_fim}` : ''}</div>
                  </div>
                  <span className="tag tag-kort">{p.tipo === 'percentual' ? `${p.valor}% off` : `R$ ${p.valor / 100} off`}</span>
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => setPromo(p)}>Editar</button>
                </li>
              ))}
            </ul>
          ) : <Vazio titulo="Nenhuma promoção" texto="Veja em Relatórios qual é o horário mais parado e crie um desconto só para ele." />}
          <p className="muted pequeno" style={{ marginTop: 10 }}>O desconto aparece no link só nos horários da promoção.</p>
        </div>
      </section>

      <section className="painel">
        <div className="painel-cab">
          <h2>Cupons</h2>
          <button className="btn btn-sec btn-pequeno" onClick={() => setCupom({ codigo: '', tipo: 'percentual', valor: 10, ativo: true })}><Plus /> Novo</button>
        </div>
        <div className="painel-corpo" style={{ paddingTop: 6 }}>
          <ul className="lista">
            {estado.cupons.map((c) => (
              <li key={c.id}>
                <code style={{ fontWeight: 700, fontSize: 14, background: 'var(--kort-suave)', padding: '3px 8px', borderRadius: 4 }}>{c.codigo}</code>
                <div className="cresce muted pequeno">
                  {c.tipo === 'percentual' ? `${c.valor}% de desconto` : `R$ ${(c.valor / 100).toFixed(2).replace('.', ',')} de desconto`}
                  {c.valido_ate ? `, até ${dataCurta(c.valido_ate)}` : ''}
                </div>
                <span className="muted pequeno num">{c.usos}{c.usos_max ? `/${c.usos_max}` : ''} usos</span>
                <Switch checked={c.ativo} label={`Ativar cupom ${c.codigo}`} onChange={(v) => acoes.salvarCupom({ ...c, ativo: v })} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Folha aberta={!!promo} aoFechar={() => setPromo(null)} titulo={promo?.id ? 'Editar promoção' : 'Nova promoção'}
        rodape={<><button className="btn btn-sec" onClick={() => setPromo(null)}>Cancelar</button><button className="btn btn-primario" disabled={!promo?.nome} onClick={() => { acoes.salvarPromocao(promo as Promocao); setPromo(null); avisar('Promoção salva') }}>Salvar</button></>}>
        {promo && (
          <div className="grade-campos">
            <Campo rotulo="Nome" id="pr-nome" className="largo"><input id="pr-nome" className="input" value={promo.nome} onChange={(e) => setPromo({ ...promo, nome: e.target.value })} placeholder="Ex.: Terça de manhã" /></Campo>
            <Campo rotulo="Dia" id="pr-dia" className="largo">
              <select id="pr-dia" className="select" value={promo.dia_semana ?? ''} onChange={(e) => setPromo({ ...promo, dia_semana: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">Todo dia</option>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{nomeDia(d)}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Das" id="pr-de"><input id="pr-de" type="time" className="input" value={promo.hora_inicio ?? ''} onChange={(e) => setPromo({ ...promo, hora_inicio: e.target.value })} /></Campo>
            <Campo rotulo="Até" id="pr-ate"><input id="pr-ate" type="time" className="input" value={promo.hora_fim ?? ''} onChange={(e) => setPromo({ ...promo, hora_fim: e.target.value })} /></Campo>
            <div className="campo">
              <span className="rotulo">Tipo</span>
              <Segmentos rotulo="Tipo de desconto" valor={promo.tipo ?? 'percentual'} onChange={(v) => setPromo({ ...promo, tipo: v })} opcoes={[['percentual', '%'], ['valor', 'R$']]} />
            </div>
            <Campo rotulo={promo.tipo === 'valor' ? 'Valor (em centavos)' : 'Percentual'} id="pr-val"><input id="pr-val" type="number" min={1} className="input" value={promo.valor} onChange={(e) => setPromo({ ...promo, valor: Number(e.target.value) })} /></Campo>
          </div>
        )}
      </Folha>

      <Folha aberta={!!cupom} aoFechar={() => setCupom(null)} titulo="Novo cupom"
        rodape={<><button className="btn btn-sec" onClick={() => setCupom(null)}>Cancelar</button><button className="btn btn-primario" disabled={!cupom?.codigo} onClick={() => { acoes.salvarCupom(cupom as Cupom); setCupom(null); avisar('Cupom criado') }}>Criar cupom</button></>}>
        {cupom && (
          <div className="grade-campos">
            <Campo rotulo="Código" id="cp-cod" className="largo" ajuda="O cliente digita este código no link."><input id="cp-cod" className="input" value={cupom.codigo} onChange={(e) => setCupom({ ...cupom, codigo: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="Ex.: VOLTA10" /></Campo>
            <div className="campo">
              <span className="rotulo">Tipo</span>
              <Segmentos rotulo="Tipo" valor={cupom.tipo ?? 'percentual'} onChange={(v) => setCupom({ ...cupom, tipo: v })} opcoes={[['percentual', '%'], ['valor', 'R$']]} />
            </div>
            <Campo rotulo={cupom.tipo === 'valor' ? 'Valor (em centavos)' : 'Percentual'} id="cp-val"><input id="cp-val" type="number" className="input" value={cupom.valor} onChange={(e) => setCupom({ ...cupom, valor: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Válido até (opcional)" id="cp-ate"><input id="cp-ate" type="date" className="input" value={cupom.valido_ate ?? ''} onChange={(e) => setCupom({ ...cupom, valido_ate: e.target.value || null })} /></Campo>
            <Campo rotulo="Limite de usos (opcional)" id="cp-lim"><input id="cp-lim" type="number" className="input" value={cupom.usos_max ?? ''} onChange={(e) => setCupom({ ...cupom, usos_max: e.target.value ? Number(e.target.value) : null })} /></Campo>
          </div>
        )}
      </Folha>
    </div>
  )
}

/* ---------- avaliações */
function Avaliacoes() {
  const { estado, acoes } = useKort()
  const { cliente, membro } = useMapas()
  const media = estado.avaliacoes.length ? estado.avaliacoes.reduce((t, a) => t + a.nota, 0) / estado.avaliacoes.length : 0
  const lista = [...estado.avaliacoes].sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  return (
    <section className="painel">
      <div className="painel-cab">
        <h2>{estado.avaliacoes.length} avaliações, média {media.toFixed(1).replace('.', ',')}</h2>
        <span className="muted pequeno">Ligue as que você quer mostrar na sua página.</span>
      </div>
      <ul className="lista" style={{ padding: '6px 18px' }}>
        {lista.map((a) => (
          <li key={a.id} style={{ alignItems: 'flex-start' }}>
            <span className="linha-flex" style={{ gap: 1, width: 84 }} aria-label={`${a.nota} de 5`}>
              {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < a.nota ? 'var(--preto)' : 'none'} />)}
            </span>
            <div className="cresce">
              <div className="pequeno">{a.comentario ?? <span className="muted">Sem comentário</span>}</div>
              <div className="muted pequeno">{primeiroNome(cliente.get(a.cliente_id)?.nome ?? 'Cliente')} com {membro.get(a.membro_id)?.nome_exibicao}, {dataRelativa(a.criado_em)}</div>
            </div>
            {a.comentario && <Switch checked={a.publica} label="Mostrar na página" onChange={() => acoes.alternarAvaliacaoPublica(a.id)}><span className="pequeno muted">Na página</span></Switch>}
          </li>
        ))}
      </ul>
    </section>
  )
}
