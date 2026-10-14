// Cupons de divulgador: barbeiros com muitos seguidores indicam o Kort.
// Quem se cadastra com o cupom ganha desconto na mensalidade e o divulgador
// ganha uma comissão sobre o valor cheio de cada mensalidade paga no mês.
// Dados: funções admin_cupons, admin_salvar_cupom, admin_vincular_cupom e
// admin_marcar_repasse (supabase/atualizacao-cupons.sql).

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, TicketPercent } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { mensagemDeErro } from '../../lib/banco'
import { avisarGlobal } from '../../components/avisos'
import { useAdmin } from '../../lib/adminStore'
import { dataCompleta, dinheiro, dinheiroCurto, nomeMes } from '../../lib/format'
import { CabecalhoPagina, Campo, Confirmar, Folha, Metricas, Switch, Vazio } from '../../components/ui'
import { StatusAssinatura } from './comum'
import type { StatusAssinSaas } from '../../lib/types'

interface BarbeariaCupom {
  id: string; nome: string; slug: string; status: StatusAssinSaas; parceiro: boolean; desde: string | null
  pagou: boolean; valor_pago_centavos: number | null; comissao_centavos: number | null
}
interface Cupom {
  id: string; codigo: string; nome: string; contato: string | null
  desconto_pct: number; comissao_pct: number; ativo: boolean; criado_em: string
  barbearias: BarbeariaCupom[]; total: number; pagantes: number; a_pagar_centavos: number
  repasse: { valor_centavos: number; barbearias: number; pago_em: string } | null
}
type Form = { id: string | null; codigo: string; nome: string; contato: string; desconto: string; comissao: string; ativo: boolean }

const pct = (n: number) => `${String(Number(n)).replace('.', ',')}%`
const inicioMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const isoMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
const linkCupom = (codigo: string) => `${window.location.origin}/?cupom=${codigo}`

/** exemplo para o modo demonstração */
function cuponsDemo(barbearias: ReturnType<typeof useAdmin>['barbearias']): Cupom[] {
  const lista = barbearias.slice(0, 4).map((b, i): BarbeariaCupom => ({
    id: b.id, nome: b.nome, slug: b.slug, status: b.status_assinatura, parceiro: !!b.parceiro, desde: b.criado_em,
    pagou: i < 3 && b.status_assinatura === 'ativa', valor_pago_centavos: i < 3 && b.status_assinatura === 'ativa' ? 3791 : null,
    comissao_centavos: i < 3 && b.status_assinatura === 'ativa' ? 998 : null,
  }))
  const pagantes = lista.filter((b) => b.pagou).length
  return [{
    id: 'demo-ph', codigo: 'PHBARBER', nome: 'PHBARBER', contato: null, desconto_pct: 5, comissao_pct: 25, ativo: true,
    criado_em: new Date().toISOString(), barbearias: lista, total: lista.length, pagantes, a_pagar_centavos: pagantes * 998, repasse: null,
  }]
}

export default function AdminCupons() {
  const admin = useAdmin()
  const demo = admin.modo === 'demo'
  const [mes, setMes] = useState(() => inicioMes(new Date()))
  const [cupons, setCupons] = useState<Cupom[] | null>(null)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [repasse, setRepasse] = useState<Cupom | null>(null)
  const [vincular, setVincular] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    if (demo || !supabase) { setCupons(cuponsDemo(admin.barbearias)); return }
    const { data, error } = await supabase.rpc('admin_cupons', { p_competencia: isoMes(mes) })
    if (error) { setErro(mensagemDeErro(error)); setCupons([]); return }
    setErro('')
    setCupons((data as Cupom[]) ?? [])
  }, [demo, mes, admin.barbearias])

  useEffect(() => { void carregar() }, [carregar])

  const rpc = async (nome: string, args: Record<string, unknown>, ok: string) => {
    if (demo || !supabase) { avisarGlobal('Na demonstração nada é gravado.'); return false }
    const { error } = await supabase.rpc(nome, args)
    if (error) { avisarGlobal(mensagemDeErro(error), 'erro'); return false }
    avisarGlobal(ok)
    await carregar()
    return true
  }

  const salvar = async () => {
    if (!form) return
    setSalvando(true)
    const ok = await rpc('admin_salvar_cupom', {
      p_id: form.id, p_codigo: form.codigo, p_nome: form.nome, p_contato: form.contato,
      p_desconto_pct: Number(form.desconto.replace(',', '.')) || 0, p_comissao_pct: Number(form.comissao.replace(',', '.')) || 0, p_ativo: form.ativo,
    }, form.id ? 'Cupom atualizado' : 'Cupom criado')
    setSalvando(false)
    if (ok) setForm(null)
  }

  const copiar = async (codigo: string) => {
    try { await navigator.clipboard.writeText(linkCupom(codigo)); avisarGlobal('Link do cupom copiado') } catch { avisarGlobal(linkCupom(codigo)) }
  }

  const lista = cupons ?? []
  const ativos = lista.filter((c) => c.ativo).length
  const totalBarbearias = lista.reduce((t, c) => t + c.total, 0)
  const pagantes = lista.reduce((t, c) => t + c.pagantes, 0)
  const aPagar = lista.filter((c) => !c.repasse).reduce((t, c) => t + c.a_pagar_centavos, 0)
  const pago = lista.reduce((t, c) => t + (c.repasse?.valor_centavos ?? 0), 0)
  const nomeDoMes = `${nomeMes(mes.getMonth())} de ${mes.getFullYear()}`
  const tituloMes = nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1)
  const mesFuturo = mes >= inicioMes(new Date())
  const semCupom = admin.barbearias.filter((b) => !lista.some((c) => c.barbearias.some((x) => x.id === b.id)))

  return (
    <>
      <CabecalhoPagina
        titulo="Cupons"
        sub="Barbeiros que divulgam o Kort. Quem se cadastra com o cupom ganha desconto na mensalidade, e o divulgador ganha comissão sobre o valor cheio de cada mensalidade paga."
        acoes={<button className="btn btn-primario" onClick={() => setForm({ id: null, codigo: '', nome: '', contato: '', desconto: '5', comissao: '25', ativo: true })}><Plus size={17} /> Novo cupom</button>}
      />

      <div className="linha-flex" style={{ gap: 8, margin: '4px 0 16px' }}>
        <button className="btn btn-sec btn-icone" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
        <button className="btn btn-sec btn-icone" aria-label="Próximo mês" disabled={mesFuturo} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        <strong style={{ fontSize: 17 }}>{tituloMes}</strong>
      </div>

      <Metricas itens={[
        { rot: 'A repassar no mês', val: dinheiroCurto(aPagar), det: pago ? `${dinheiroCurto(pago)} já pago` : 'mensalidades pagas no mês' },
        { rot: 'Pagaram no mês', val: pagantes, det: `de ${totalBarbearias} com cupom` },
        { rot: 'Cupons ativos', val: ativos },
      ]} />

      {erro && <p className="pagar-aviso" style={{ marginTop: 16 }}>{erro.includes('admin_cupons') ? 'O banco ainda não tem os cupons. Rode o arquivo supabase/atualizacao-cupons.sql no SQL Editor do Supabase.' : erro}</p>}

      {cupons && !lista.length && !erro && (
        <Vazio titulo="Nenhum cupom ainda" texto="Crie um cupom para cada barbeiro que vai divulgar o Kort." />
      )}

      {lista.map((c) => (
        <section key={c.id} className="painel" style={{ marginTop: 20, opacity: c.ativo ? 1 : 0.7 }}>
          <div className="painel-cab" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="cresce">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="tag tag-kort" style={{ fontSize: 15, letterSpacing: 1 }}><TicketPercent size={14} style={{ display: 'inline', verticalAlign: -2 }} /> {c.codigo}</span>
                {c.nome !== c.codigo && <span>{c.nome}</span>}
                {!c.ativo && <span className="tag">Desativado</span>}
              </h2>
              <p className="muted pequeno" style={{ marginTop: 4 }}>
                {pct(c.desconto_pct)} de desconto para o barbeiro, {pct(c.comissao_pct)} de comissão para o divulgador{c.contato ? ` · ${c.contato}` : ''}
              </p>
            </div>
            <div className="linha-flex" style={{ gap: 8 }}>
              <button className="btn btn-sec btn-pequeno" onClick={() => void copiar(c.codigo)}><Copy size={15} /> Copiar link</button>
              <button className="btn btn-sec btn-pequeno" onClick={() => setForm({ id: c.id, codigo: c.codigo, nome: c.nome, contato: c.contato ?? '', desconto: String(c.desconto_pct).replace('.', ','), comissao: String(c.comissao_pct).replace('.', ','), ativo: c.ativo })}><Pencil size={15} /> Editar</button>
            </div>
          </div>

          <div className="linha-flex entre" style={{ flexWrap: 'wrap', gap: 12, padding: '6px 18px 4px' }}>
            <div>
              <div className="muted pequeno">Pagar a {c.nome} por {nomeMes(mes.getMonth())}</div>
              <div className="display" style={{ fontSize: 38 }}>{dinheiro(c.repasse?.valor_centavos ?? c.a_pagar_centavos)}</div>
              <div className="pequeno">{c.pagantes} de {c.total} {c.total === 1 ? 'barbearia pagou' : 'barbearias pagaram'} a mensalidade no mês</div>
            </div>
            {c.repasse ? (
              <div className="linha-flex" style={{ gap: 8 }}>
                <span className="tag tag-ok">Repasse pago em {dataCompleta(c.repasse.pago_em)}</span>
                <button className="btn btn-fantasma btn-pequeno" onClick={() => void rpc('admin_marcar_repasse', { p_cupom: c.id, p_competencia: isoMes(mes), p_pago: false }, 'Repasse desmarcado')}>Desfazer</button>
              </div>
            ) : c.a_pagar_centavos > 0 ? (
              <button className="btn btn-primario" onClick={() => setRepasse(c)}>Marcar como pago</button>
            ) : null}
          </div>

          <div className="tabela-wrap" style={{ marginTop: 10 }}>
            <table className="tabela">
              <thead><tr><th>Barbearia</th><th>Situação</th><th>Com cupom desde</th><th className="dir">Pagou no mês</th><th className="dir">Comissão</th></tr></thead>
              <tbody>
                {c.barbearias.map((b) => (
                  <tr key={b.id}>
                    <td className="forte"><Link to={`/admin/barbearias/${b.id}`}>{b.nome}</Link></td>
                    <td><StatusAssinatura status={b.status} parceiro={b.parceiro} /></td>
                    <td className="num">{b.desde ? dataCompleta(b.desde) : '-'}</td>
                    <td className="dir num">{b.pagou ? dinheiro(b.valor_pago_centavos ?? 0) : <span className="muted">não pagou</span>}</td>
                    <td className="dir num">{b.pagou ? dinheiro(b.comissao_centavos ?? 0) : '-'}</td>
                  </tr>
                ))}
                {!c.barbearias.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>Ninguém se cadastrou com esse cupom ainda.</td></tr>}
              </tbody>
            </table>
          </div>

          {semCupom.length > 0 && (
            <div className="linha-flex" style={{ gap: 8, padding: '12px 18px 16px', flexWrap: 'wrap' }}>
              <span className="muted pequeno">Esqueceu de usar o cupom?</span>
              <select className="input" style={{ maxWidth: 260 }} value={vincular[c.id] ?? ''} onChange={(e) => setVincular({ ...vincular, [c.id]: e.target.value })} aria-label={`Barbearia para ligar ao cupom ${c.codigo}`}>
                <option value="">Escolha a barbearia</option>
                {semCupom.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
              <button className="btn btn-sec btn-pequeno" disabled={!vincular[c.id]}
                onClick={async () => { if (await rpc('admin_vincular_cupom', { p_barbearia: vincular[c.id], p_codigo: c.codigo }, `Barbearia ligada ao ${c.codigo}`)) setVincular({ ...vincular, [c.id]: '' }) }}>
                Ligar ao cupom
              </button>
            </div>
          )}
        </section>
      ))}

      <p className="muted pequeno" style={{ marginTop: 14 }}>
        A comissão conta só mensalidade paga (Pix confirmado ou baixa manual) daquele mês. Barbearia em teste, parceira ou atrasada não entra.
        O link do cupom já abre o cadastro com o código preenchido.
      </p>

      <Folha aberta={!!form} aoFechar={() => setForm(null)} titulo={form?.id ? 'Editar cupom' : 'Novo cupom'}
        subtitulo="O código é o que o barbeiro digita no cadastro."
        rodape={<button className="btn btn-primario btn-bloco" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando...' : 'Salvar cupom'}</button>}>
        {form && (
          <div className="coluna gap-8">
            <Campo rotulo="Código" id="c-cod" ajuda="Letras e números, sem espaço. Ex.: o @ do barbeiro, como JOAOBARBER">
              <input id="c-cod" className="input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.replace(/\s/g, '').toUpperCase() })} />
            </Campo>
            <Campo rotulo="Nome do divulgador" id="c-nome">
              <input id="c-nome" className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Contato (Instagram, WhatsApp, chave Pix)" id="c-cont">
              <input id="c-cont" className="input" value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
            </Campo>
            <div className="linha-flex" style={{ gap: 12 }}>
              <Campo rotulo="Desconto para o barbeiro (%)" id="c-desc" className="cresce">
                <input id="c-desc" className="input" inputMode="decimal" value={form.desconto} onChange={(e) => setForm({ ...form, desconto: e.target.value })} />
              </Campo>
              <Campo rotulo="Comissão do divulgador (%)" id="c-com" className="cresce">
                <input id="c-com" className="input" inputMode="decimal" value={form.comissao} onChange={(e) => setForm({ ...form, comissao: e.target.value })} />
              </Campo>
            </div>
            <p className="muted pequeno">A comissão é sobre o valor cheio do plano. Ex.: Solo de R$ 39,90 com 25% dá {dinheiro(Math.round(3990 * (Number(form.comissao.replace(',', '.')) || 0) / 100))} por mês para o divulgador.</p>
            <Switch checked={form.ativo} onChange={(v) => setForm({ ...form, ativo: v })}>Cupom ativo (aceito no cadastro)</Switch>
          </div>
        )}
      </Folha>

      <Confirmar aberto={!!repasse} titulo="Marcar repasse como pago?"
        texto={repasse ? `${dinheiro(repasse.a_pagar_centavos)} para ${repasse.nome}, referente a ${nomeDoMes}.` : ''} acao="Marcar como pago"
        aoCancelar={() => setRepasse(null)}
        aoConfirmar={() => { const c = repasse!; setRepasse(null); void rpc('admin_marcar_repasse', { p_cupom: c.id, p_competencia: isoMes(mes), p_pago: true }, 'Repasse marcado como pago') }} />
    </>
  )
}
