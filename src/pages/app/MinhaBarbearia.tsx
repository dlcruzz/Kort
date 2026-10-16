// Minha Barbearia: o barbeiro monta a página que o cliente vê.
// Logo, capa, dados, fotos da equipe, portfólio de cortes, produtos à
// venda e as reservas que os clientes fazem pela página.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Camera, ExternalLink, ImagePlus, Trash2, Check, X, Package, Store, Loader2 } from 'lucide-react'
import { useKort } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { apagarFoto, enviarFoto, fotosLigadas } from '../../lib/fotos'
import { dataCurta, dinheiro, hora, mascaraTelefone, plural, primeiroNome } from '../../lib/format'
import { CabecalhoPagina, Campo, Confirmar, Switch, Vazio } from '../../components/ui'
import { useAvisar } from '../../components/avisos'
import type { Membro, Produto, ReservaProduto, StatusReserva } from '../../lib/types'
import '../../styles/minha-barbearia.css'

type Aba = 'pagina' | 'equipe' | 'portfolio' | 'produtos' | 'reservas'

export default function MinhaBarbearia() {
  const { estado } = useKort()
  const [params, setParams] = useSearchParams()
  const aba = ((params.get('aba') as Aba) || 'pagina') as Aba
  const setAba = (a: Aba) => setParams(a === 'pagina' ? {} : { aba: a }, { replace: true })
  const reservas = useReservas()
  const abertas = reservas.lista.filter((r) => r.status === 'reservado').length

  return (
    <>
      <CabecalhoPagina
        titulo="Minha Barbearia"
        sub="Monte a página que o cliente abre pelo seu link: fotos, cortes e produtos."
        acoes={
          <a className="btn btn-sec" href={`/b/${estado.barbearia.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink /> Ver como o cliente vê
          </a>
        }
      />
      {!fotosLigadas() && (
        <p className="mb-aviso">Na demonstração dá para ver tudo, mas enviar fotos só funciona com a conta real.</p>
      )}
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'pagina'} onClick={() => setAba('pagina')}>Página</button>
        <button role="tab" aria-selected={aba === 'equipe'} onClick={() => setAba('equipe')}>Equipe</button>
        <button role="tab" aria-selected={aba === 'portfolio'} onClick={() => setAba('portfolio')}>Portfólio</button>
        <button role="tab" aria-selected={aba === 'produtos'} onClick={() => setAba('produtos')}>Produtos</button>
        <button role="tab" aria-selected={aba === 'reservas'} onClick={() => setAba('reservas')}>
          Reservas{abertas > 0 && <span className="mb-cont">{abertas}</span>}
        </button>
      </div>
      {aba === 'pagina' && <AbaPagina />}
      {aba === 'equipe' && <AbaEquipe />}
      {aba === 'portfolio' && <AbaPortfolio />}
      {aba === 'produtos' && <AbaProdutos reservas={reservas.lista} />}
      {aba === 'reservas' && <AbaReservas {...reservas} />}
    </>
  )
}

/* ---------------------------------------------------------------------
   Caixa de foto: mostra a foto atual, troca e remove
--------------------------------------------------------------------- */
function CaixaFoto(props: {
  url: string | null | undefined
  formato: 'quadrado' | 'capa' | 'redondo'
  rotulo: string
  aoEnviar: (arquivo: File) => Promise<void>
  aoRemover?: () => void
  podeEditar?: boolean
  vazio?: ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const avisar = useAvisar()
  const pode = (props.podeEditar ?? true) && fotosLigadas()

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setEnviando(true)
    try {
      await props.aoEnviar(arquivo)
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não deu para enviar a foto.', 'erro')
    } finally {
      setEnviando(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className={`mb-foto mb-foto-${props.formato}`}>
      <button type="button" className="mb-foto-area" disabled={!pode || enviando} onClick={() => ref.current?.click()} aria-label={props.rotulo}>
        {props.url ? <img src={props.url} alt="" loading="lazy" /> : <span className="mb-foto-vazio">{props.vazio ?? <Camera />}</span>}
        {enviando && <span className="mb-foto-carregando"><Loader2 className="girando" /></span>}
        {pode && !enviando && <span className="mb-foto-trocar"><Camera size={15} /> {props.url ? 'Trocar' : 'Enviar'}</span>}
      </button>
      {props.url && props.aoRemover && pode && (
        <button type="button" className="btn btn-fantasma btn-pequeno mb-foto-remover" onClick={props.aoRemover}>
          <Trash2 size={14} /> Remover
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => void escolher(e.target.files?.[0])} />
    </div>
  )
}

/* ---------------------------------------------------------------------
   1. Página: logo, capa e dados da barbearia
--------------------------------------------------------------------- */
function AbaPagina() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const b = estado.barbearia
  const ehDono = estado.usuarioPapel === 'dono'
  const [f, setF] = useState(() => ({
    nome: b.nome, descricao: b.descricao ?? '', whatsapp: b.whatsapp ?? '', instagram: b.instagram ?? '',
    logradouro: b.logradouro ?? '', numero: b.numero ?? '', bairro: b.bairro ?? '', cidade: b.cidade ?? '', uf: b.uf ?? '',
  }))
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })

  const trocar = async (campo: 'logo_url' | 'capa_url', arquivo: File) => {
    const antiga = b[campo]
    const url = await enviarFoto('barbearias', b.id, campo === 'logo_url' ? 'logo' : 'capa', arquivo, campo === 'logo_url' ? 600 : 1800)
    acoes.salvarBarbearia({ [campo]: url })
    void apagarFoto(antiga)
    avisar(campo === 'logo_url' ? 'Logo atualizado' : 'Capa atualizada')
  }
  const remover = (campo: 'logo_url' | 'capa_url') => {
    const antiga = b[campo]
    acoes.salvarBarbearia({ [campo]: null })
    void apagarFoto(antiga)
  }

  const salvar = () => {
    if (f.nome.trim().length < 2) return avisar('Escreva o nome da barbearia.', 'erro')
    const limpo = (v: string) => v.trim() || null
    acoes.salvarBarbearia({
      nome: f.nome.trim(), descricao: limpo(f.descricao), whatsapp: limpo(f.whatsapp), instagram: limpo(f.instagram),
      logradouro: limpo(f.logradouro), numero: limpo(f.numero), bairro: limpo(f.bairro), cidade: limpo(f.cidade),
      uf: limpo(f.uf.toUpperCase().slice(0, 2)),
    })
    avisar('Página atualizada')
  }

  return (
    <div className="mb-pagina">
      <section className="painel">
        <div className="painel-cab"><h2>Capa e logo</h2></div>
        <div className="painel-corpo">
          <div className="mb-vitrine">
            <CaixaFoto url={b.capa_url} formato="capa" rotulo="Foto de capa" podeEditar={ehDono}
              aoEnviar={(a) => trocar('capa_url', a)} aoRemover={() => remover('capa_url')}
              vazio={<><ImagePlus /> Foto de capa<small>A fachada ou o salão por dentro. Fica deitada.</small></>} />
            <div className="mb-vitrine-logo">
              <CaixaFoto url={b.logo_url} formato="redondo" rotulo="Logo" podeEditar={ehDono}
                aoEnviar={(a) => trocar('logo_url', a)} aoRemover={() => remover('logo_url')}
                vazio={<span className="mb-logo-letra">{b.nome.slice(0, 1)}</span>} />
            </div>
          </div>
          {!ehDono && <p className="mb-nota">Só o dono troca logo, capa e dados da barbearia.</p>}
        </div>
      </section>

      <section className="painel">
        <div className="painel-cab"><h2>O que o cliente lê</h2></div>
        <fieldset className="painel-corpo grade-campos mb-campos" disabled={!ehDono}>
          <Campo rotulo="Nome da barbearia" id="mb-nome" className="largo"><input id="mb-nome" className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
          <Campo rotulo="Sobre a barbearia" id="mb-desc" className="largo" ajuda="Duas ou três linhas. Estilo, tempo de casa, o que vocês fazem de melhor.">
            <textarea id="mb-desc" className="textarea" maxLength={400} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} />
          </Campo>
          <Campo rotulo="Rua" id="mb-rua"><input id="mb-rua" className="input" value={f.logradouro} onChange={(e) => set('logradouro', e.target.value)} /></Campo>
          <Campo rotulo="Número" id="mb-num"><input id="mb-num" className="input" value={f.numero} onChange={(e) => set('numero', e.target.value)} /></Campo>
          <Campo rotulo="Bairro" id="mb-bai"><input id="mb-bai" className="input" value={f.bairro} onChange={(e) => set('bairro', e.target.value)} /></Campo>
          <Campo rotulo="Cidade" id="mb-cid"><input id="mb-cid" className="input" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></Campo>
          <Campo rotulo="Estado" id="mb-uf"><input id="mb-uf" className="input" maxLength={2} style={{ maxWidth: 90 }} value={f.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} placeholder="SP" /></Campo>
          <Campo rotulo="WhatsApp" id="mb-wa" ajuda="Para o cliente falar com você e combinar a retirada de produtos.">
            <input id="mb-wa" className="input" inputMode="tel" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value.replace(/[^0-9+]/g, ''))} placeholder="+5511900000000" />
          </Campo>
          <Campo rotulo="Instagram" id="mb-ig"><input id="mb-ig" className="input" value={f.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@suabarbearia" /></Campo>
          {ehDono && <button className="btn btn-primario largo" style={{ justifySelf: 'start' }} onClick={salvar}>Salvar</button>}
        </fieldset>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------------
   2. Equipe: foto de cada barbeiro
--------------------------------------------------------------------- */
function AbaEquipe() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const ehDono = estado.usuarioPapel === 'dono'
  const equipe = estado.membros.filter((m) => m.ativo)

  const trocar = async (m: Membro, arquivo: File) => {
    const antiga = m.foto_url
    const url = await enviarFoto('membros', estado.barbearia.id, m.id, arquivo, 800)
    acoes.salvarMembro({ ...m, foto_url: url })
    void apagarFoto(antiga)
    avisar(`Foto de ${primeiroNome(m.nome_exibicao)} atualizada`)
  }

  return (
    <section className="painel">
      <div className="painel-cab"><h2>Quem atende</h2></div>
      <div className="painel-corpo">
        <p className="mb-nota" style={{ marginTop: 0 }}>Foto de rosto, de frente, com luz boa. O cliente escolhe o barbeiro por ela.</p>
        <div className="mb-equipe">
          {equipe.map((m) => {
            const pode = ehDono || m.id === estado.usuarioMembroId
            return (
              <div className="mb-membro" key={m.id}>
                <CaixaFoto url={m.foto_url} formato="redondo" rotulo={`Foto de ${m.nome_exibicao}`} podeEditar={pode}
                  aoEnviar={(a) => trocar(m, a)}
                  aoRemover={() => { const antiga = m.foto_url; acoes.salvarMembro({ ...m, foto_url: null }); void apagarFoto(antiga) }}
                  vazio={<span className="mb-logo-letra">{m.nome_exibicao.slice(0, 1)}</span>} />
                <div className="mb-membro-nome">{m.nome_exibicao}</div>
                {!m.atende && <span className="tag">Não aparece no link</span>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------
   3. Portfólio: fotos dos cortes
--------------------------------------------------------------------- */
function AbaPortfolio() {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const ref = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null)
  const [apagar, setApagar] = useState<string | null>(null)
  const barbeiros = estado.membros.filter((m) => m.ativo && m.atende)
  const nomeDe = (id: string | null) => estado.membros.find((m) => m.id === id)?.nome_exibicao

  const enviar = async (lista: FileList | null) => {
    const arquivos = Array.from(lista ?? []).slice(0, 12)
    if (!arquivos.length) return
    setEnviando({ feitas: 0, total: arquivos.length })
    let erros = 0
    for (const [i, arq] of arquivos.entries()) {
      try {
        const url = await enviarFoto('portfolio', estado.barbearia.id, 'corte', arq)
        acoes.adicionarFotoPortfolio({ url, legenda: null, membro_id: estado.usuarioMembroId ?? null })
      } catch {
        erros++
      }
      setEnviando({ feitas: i + 1, total: arquivos.length })
    }
    setEnviando(null)
    if (ref.current) ref.current.value = ''
    const certas = arquivos.length - erros
    if (certas) avisar(`${plural(certas, 'foto adicionada', 'fotos adicionadas')}`)
    if (erros) avisar(`${plural(erros, 'foto não foi', 'fotos não foram')} enviada${erros > 1 ? 's' : ''}. Use JPG ou PNG.`, 'erro')
  }

  const confirmarApagar = () => {
    const f = estado.portfolio.find((x) => x.id === apagar)
    setApagar(null)
    if (!f) return
    acoes.removerFotoPortfolio(f.id)
    void apagarFoto(f.url)
    avisar('Foto apagada')
  }

  return (
    <>
      <div className="mb-barra">
        <p className="mb-nota" style={{ margin: 0 }}>
          {estado.portfolio.length ? `${plural(estado.portfolio.length, 'foto', 'fotos')} na sua página.` : 'Mostre os cortes que vocês fazem. Cliente confia no que vê.'}
        </p>
        <button className="btn btn-primario" disabled={!!enviando || !fotosLigadas()} onClick={() => ref.current?.click()}>
          {enviando ? <><Loader2 className="girando" /> Enviando {enviando.feitas + 1} de {enviando.total}</> : <><ImagePlus /> Adicionar fotos</>}
        </button>
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => void enviar(e.target.files)} />
      </div>

      {estado.portfolio.length === 0 ? (
        <Vazio titulo="Nenhum corte ainda" texto="Pode escolher várias fotos de uma vez (até 12). Elas aparecem na aba Portfólio da sua página." />
      ) : (
        <div className="mb-grade">
          {estado.portfolio.map((f) => (
            <figure className="mb-corte" key={f.id}>
              <img src={f.url} alt={f.legenda ?? 'Corte'} loading="lazy" />
              <figcaption>
                <input className="input" placeholder="Nome do corte (opcional)" defaultValue={f.legenda ?? ''} maxLength={60}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== f.legenda) acoes.editarFotoPortfolio(f.id, { legenda: v }) }} />
                <div className="linha-flex gap-8">
                  {barbeiros.length > 1 ? (
                    <select className="select cresce" aria-label="Quem fez" value={f.membro_id ?? ''} onChange={(e) => acoes.editarFotoPortfolio(f.id, { membro_id: e.target.value || null })}>
                      <option value="">Equipe</option>
                      {barbeiros.map((m) => <option key={m.id} value={m.id}>{m.nome_exibicao}</option>)}
                    </select>
                  ) : (
                    <span className="cresce mb-nota" style={{ margin: 0 }}>{nomeDe(f.membro_id) ?? ''}</span>
                  )}
                  <button className="btn btn-fantasma btn-icone" aria-label="Apagar foto" title="Apagar foto" onClick={() => setApagar(f.id)}><Trash2 size={16} /></button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <Confirmar aberto={!!apagar} titulo="Apagar essa foto?" texto="Ela sai da sua página na hora." acao="Apagar" perigo
        aoConfirmar={confirmarApagar} aoCancelar={() => setApagar(null)} />
    </>
  )
}

/* ---------------------------------------------------------------------
   4. Produtos: foto, descrição e se aparece na página
--------------------------------------------------------------------- */
function AbaProdutos({ reservas }: { reservas: ReservaProduto[] }) {
  const { estado, acoes } = useKort()
  const avisar = useAvisar()
  const ativos = estado.produtos.filter((p) => p.ativo)
  const reservado = (id: string) => reservas.filter((r) => r.produto_id === id && r.status === 'reservado').reduce((t, r) => t + r.quantidade, 0)

  const trocar = async (p: Produto, arquivo: File) => {
    const antiga = p.foto_url
    const url = await enviarFoto('produtos', estado.barbearia.id, p.id, arquivo, 1000)
    acoes.salvarProduto({ ...p, foto_url: url })
    void apagarFoto(antiga)
    avisar('Foto do produto atualizada')
  }

  if (!ativos.length) {
    return (
      <Vazio titulo="Nenhum produto cadastrado" texto="Cadastre pomada, óleo, shampoo e o que mais você vende no Estoque. Depois volte aqui para colocar foto."
        acao={<Link className="btn btn-primario" to="/app/estoque"><Package /> Ir para o Estoque</Link>} />
    )
  }

  return (
    <>
      <div className="mb-barra">
        <p className="mb-nota" style={{ margin: 0 }}>Preço e quantidade vêm do Estoque. O cliente vê quantos tem e pode reservar.</p>
        <Link className="btn btn-sec" to="/app/estoque"><Package /> Preço e estoque</Link>
      </div>
      <div className="mb-produtos">
        {ativos.map((p) => {
          const res = reservado(p.id)
          const livre = Math.max(0, p.estoque_atual - res)
          const naPagina = p.mostrar_na_pagina ?? true
          return (
            <article className={`painel mb-produto ${naPagina ? '' : 'escondido'}`} key={p.id}>
              <CaixaFoto url={p.foto_url} formato="quadrado" rotulo={`Foto de ${p.nome}`}
                aoEnviar={(a) => trocar(p, a)}
                aoRemover={() => { const antiga = p.foto_url; acoes.salvarProduto({ ...p, foto_url: null }); void apagarFoto(antiga) }}
                vazio={<><Package /><small>Sem foto</small></>} />
              <div className="mb-produto-info">
                <div className="entre">
                  <h3>{p.nome}</h3>
                  <span className="mb-preco">{dinheiro(p.preco_venda_centavos)}</span>
                </div>
                <div className="linha-flex gap-8" style={{ flexWrap: 'wrap' }}>
                  <span className={`tag ${livre <= 0 ? 'tag-perigo' : livre <= p.estoque_minimo ? 'tag-alerta' : 'tag-ok'}`}>
                    {livre <= 0 ? 'Acabou' : `${livre} disponíve${livre === 1 ? 'l' : 'is'}`}
                  </span>
                  {res > 0 && <span className="tag tag-info">{res} reservado{res > 1 ? 's' : ''}</span>}
                </div>
                <textarea className="textarea mb-produto-desc" placeholder="Para que serve, fixação, cheiro... (opcional)" maxLength={200}
                  defaultValue={p.descricao ?? ''}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (p.descricao ?? null)) { acoes.salvarProduto({ ...p, descricao: v }); avisar('Descrição salva') } }} />
                <Switch checked={naPagina} onChange={(v) => acoes.salvarProduto({ ...p, mostrar_na_pagina: v })}>Mostrar na minha página</Switch>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------
   5. Reservas que os clientes fizeram pela página
--------------------------------------------------------------------- */
function useReservas() {
  const { estado, modo } = useKort()
  const bid = estado.barbearia.id
  const [lista, setLista] = useState<ReservaProduto[]>([])
  const [carregando, setCarregando] = useState(modo === 'real')

  const carregar = useCallback(async () => {
    if (modo !== 'real' || !supabase) return
    const { data } = await supabase
      .from('reservas_produto')
      .select('id, produto_id, cliente_nome, telefone, quantidade, status, criado_em')
      .eq('barbearia_id', bid)
      .order('criado_em', { ascending: false })
      .limit(100)
    setLista((data as ReservaProduto[] | null) ?? [])
    setCarregando(false)
  }, [modo, bid])

  useEffect(() => {
    void carregar()
    if (modo !== 'real' || !supabase) return
    const canal = supabase
      .channel(`reservas-${bid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_produto', filter: `barbearia_id=eq.${bid}` }, () => void carregar())
      .subscribe()
    return () => { void supabase!.removeChannel(canal) }
  }, [carregar, modo, bid])

  const mudarStatus = async (id: string, status: StatusReserva) => {
    setLista((l) => l.map((r) => (r.id === id ? { ...r, status } : r)))
    if (!supabase || modo !== 'real') return
    const { error } = await supabase.from('reservas_produto').update({ status, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) void carregar()
  }

  return { lista, carregando, mudarStatus }
}

function AbaReservas({ lista, carregando, mudarStatus }: ReturnType<typeof useReservas>) {
  const { estado, modo } = useKort()
  const avisar = useAvisar()
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas')
  const produto = (id: string) => estado.produtos.find((p) => p.id === id)
  const mostrar = filtro === 'abertas' ? lista.filter((r) => r.status === 'reservado') : lista

  if (modo !== 'real') return <Vazio titulo="Reservas aparecem aqui" texto="Quando um cliente reservar um produto pela sua página, ele chega nesta lista na hora." />
  if (carregando) return <div className="mb-nota"><Loader2 className="girando" /> Carregando...</div>

  const whats = (r: ReservaProduto) => {
    const p = produto(r.produto_id)
    const txt = `Fala, ${primeiroNome(r.cliente_nome)}! Aqui é da ${estado.barbearia.nome}. Sua reserva de ${r.quantidade}x ${p?.nome ?? 'produto'} está separada. Pode passar para retirar.`
    return `https://wa.me/${r.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`
  }

  return (
    <>
      <div className="mb-barra">
        <div className="segmentos" role="group" aria-label="Filtro">
          <button type="button" aria-pressed={filtro === 'abertas'} onClick={() => setFiltro('abertas')}>Para retirar</button>
          <button type="button" aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</button>
        </div>
        <p className="mb-nota" style={{ margin: 0 }}>Quando o cliente retirar, lance a venda no Caixa para baixar do estoque.</p>
      </div>
      {mostrar.length === 0 ? (
        <Vazio titulo={filtro === 'abertas' ? 'Nenhuma reserva para retirar' : 'Nenhuma reserva ainda'}
          texto="O cliente reserva pela aba Produtos da sua página. Coloque foto nos produtos para chamar atenção." />
      ) : (
        <div className="painel">
          <ul className="lista mb-reservas">
            {mostrar.map((r) => {
              const p = produto(r.produto_id)
              return (
                <li key={r.id} className={`mb-reserva st-${r.status}`}>
                  <div className="mb-reserva-foto">{p?.foto_url ? <img src={p.foto_url} alt="" /> : <Store size={18} />}</div>
                  <div className="cresce">
                    <div className="forte">{r.quantidade}x {p?.nome ?? 'Produto removido'}</div>
                    <div className="mb-nota" style={{ margin: 0 }}>
                      {r.cliente_nome} · {mascaraTelefone(r.telefone.replace(/^\+55/, ''))} · {dataCurta(r.criado_em)} às {hora(r.criado_em)}
                    </div>
                  </div>
                  {r.status === 'reservado' ? (
                    <div className="linha-flex gap-8 mb-reserva-acoes">
                      <a className="btn btn-sec btn-pequeno" href={whats(r)} target="_blank" rel="noreferrer">Avisar no WhatsApp</a>
                      <button className="btn btn-primario btn-pequeno" onClick={() => { void mudarStatus(r.id, 'retirado'); avisar('Marcado como retirado') }}><Check size={15} /> Retirou</button>
                      <button className="btn btn-fantasma btn-pequeno" onClick={() => { void mudarStatus(r.id, 'cancelado'); avisar('Reserva cancelada') }}><X size={15} /> Cancelar</button>
                    </div>
                  ) : (
                    <span className={`tag ${r.status === 'retirado' ? 'tag-ok' : ''}`}>{r.status === 'retirado' ? 'Retirado' : 'Cancelado'}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
