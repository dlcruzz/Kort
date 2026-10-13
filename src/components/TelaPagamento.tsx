// Tela que aparece no lugar do app quando a conta está suspensa
// (fim do teste grátis sem pagamento, ou mensalidade atrasada).

import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, CreditCard, LifeBuoy, LogOut, QrCode } from 'lucide-react'
import { useKort } from '../lib/store'
import { useSessao } from '../lib/sessao'
import { dinheiro } from '../lib/format'
import { PLANOS } from '../pages/Site'
import { escolherPlanoAgora, irParaPagamento, useAguardarLiberacao } from '../lib/pagamento'

export function TelaPagamento() {
  const { estado, recarregar } = useKort()
  const sessao = useSessao()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const a = estado.assinatura
  const pagos = PLANOS.filter((p) => p.preco > 0)
  const [plano, setPlano] = useState(a.preco_centavos > 0 ? a.plano_slug : 'barbearia')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const voltouPago = params.get('pagamento') === 'ok'
  const { esperando, desistiu } = useAguardarLiberacao(estado.barbearia.id, voltouPago, () => void recarregar())
  const escolhido = PLANOS.find((p) => p.slug === plano)!
  const fimDoTeste = !!a.teste_ate && !estado.faturas.some((f) => f.status === 'paga')

  const pagar = async () => {
    setErro('')
    setCarregando(true)
    try {
      if (plano !== a.plano_slug) await escolherPlanoAgora(estado.barbearia.id, plano)
      await irParaPagamento(estado.barbearia.id)
    } catch (e) {
      setErro((e as Error).message)
      setCarregando(false)
    }
  }

  const gratis = async () => {
    setErro('')
    setCarregando(true)
    try {
      await escolherPlanoAgora(estado.barbearia.id, 'gratis')
      await recarregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  if (esperando) {
    return (
      <div className="pagar">
        <div className="pagar-in" style={{ textAlign: 'center' }}>
          <img src="/logo-sm.png" alt="Kort" className="pagar-logo" />
          <h1>Confirmando seu pagamento</h1>
          <p className="muted">Assim que o Mercado Pago avisar, sua agenda abre sozinha. No Pix leva poucos segundos.</p>
          <div className="pagar-girando" aria-hidden="true" />
        </div>
      </div>
    )
  }

  return (
    <div className="pagar">
      <div className="pagar-in">
        <img src="/logo-sm.png" alt="Kort" className="pagar-logo" />
        <h1>{fimDoTeste ? 'Seu teste grátis acabou' : 'Sua conta está pausada'}</h1>
        <p className="muted">
          {fimDoTeste
            ? `Gostou da agenda da ${estado.barbearia.nome}? Escolha o plano e pague para continuar. Seus clientes, horários e configurações estão guardados.`
            : 'A mensalidade está em atraso e a página de agendamento saiu do ar. Pague agora e tudo volta na hora.'}
        </p>
        {desistiu && <p className="pagar-aviso">Ainda não recebemos a confirmação. Se você já pagou, aguarde alguns minutos ou fale com o suporte.</p>}

        <div className="pagar-planos" role="radiogroup" aria-label="Plano">
          {pagos.map((p) => (
            <button key={p.slug} role="radio" aria-checked={plano === p.slug} onClick={() => setPlano(p.slug)}>
              <span className="nome">{p.nome}{p.destaque && <span className="tag tag-kort">mais escolhido</span>}</span>
              <span className="preco">{dinheiro(p.preco)}<small>/mês</small></span>
              <span className="pq">{p.pq}</span>
              {plano === p.slug && <Check className="marca" size={18} />}
            </button>
          ))}
        </div>

        <button className="btn btn-primario btn-grande btn-bloco" onClick={pagar} disabled={carregando}>
          {carregando ? 'Abrindo o pagamento...' : `Pagar ${dinheiro(escolhido.preco)} e liberar agora`}
        </button>
        <div className="pagar-formas"><QrCode size={16} /> Pix <CreditCard size={16} /> Cartão de crédito ou débito</div>
        <p className="muted pequeno" style={{ textAlign: 'center' }}>Pagamento seguro pelo Mercado Pago. A conta libera sozinha assim que o pagamento é aprovado.</p>
        {erro && <p className="pagar-aviso">{erro}</p>}

        <div className="pagar-rodape">
          <button className="btn btn-fantasma btn-pequeno" onClick={gratis} disabled={carregando}>Continuar no plano grátis (1 barbeiro, até 50 horários por mês)</button>
          <Link className="btn btn-fantasma btn-pequeno" to="/app/ajuda"><LifeBuoy size={15} /> Falar com o suporte</Link>
          <button className="btn btn-fantasma btn-pequeno" onClick={async () => { await sessao.sair(); nav('/entrar') }}><LogOut size={15} /> Sair</button>
        </div>
      </div>
    </div>
  )
}
