import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { TextoContado, useRevelar } from '../lib/movimento'
import { dinheiroCurto, dominio } from '../lib/format'

// Mesmos preços da tabela planos (supabase/producao.sql).
export const PLANOS = [
  {
    slug: 'gratis', nome: 'Grátis', preco: 0, pq: 'Para testar com seus clientes.',
    itens: ['Página de agendamento', 'Agenda de 1 barbeiro', 'Até 50 horários por mês'],
  },
  {
    slug: 'solo', nome: 'Solo', preco: 3990, pq: 'Barbeiro que atende sozinho.',
    itens: ['Horários ilimitados', 'Lembrete no WhatsApp', 'Caixa e relatórios', 'Horários livres para o status'],
  },
  {
    slug: 'barbearia', nome: 'Barbearia', preco: 7990, pq: 'Dono com equipe ou cadeira alugada.', destaque: true,
    itens: ['Tudo do Solo', 'Vários barbeiros e comissões', 'Fidelidade e clube de assinatura', 'Modo cadeira alugada', 'Estoque e despesas'],
  },
  {
    slug: 'pro', nome: 'Pro', preco: 14990, pq: 'Casas grandes e mais de uma unidade.',
    itens: ['Tudo do Barbearia', 'Mais de uma unidade', 'Fechamento da equipe', 'Atendimento prioritário'],
  },
]

const DIA = [
  {
    hr: '07:40',
    tit: 'O cliente marca antes de você abrir a porta.',
    txt: 'Ele escolhe o serviço, o barbeiro e o horário pelo link na sua bio. Ninguém precisa te chamar no WhatsApp.',
    ex: <div className="exemplo">{dominio()}/b/<b>sua-barbearia</b></div>,
  },
  {
    hr: '10:00',
    tit: 'Lembrete pronto em um toque. A falta cai.',
    txt: 'O Kort lista quem vem amanhã com a mensagem escrita e o link para o cliente confirmar ou remarcar. Você só aperta enviar no WhatsApp.',
    ex: (
      <div className="exemplo whats">
        E aí, Matheus! Amanhã às 15:30 tem Corte degradê com o Pedrinho. Responde 1 para confirmar.
        <small>10:00</small>
      </div>
    ),
  },
  {
    hr: '14:15',
    tit: 'Buraco na agenda vira story.',
    txt: 'Um toque gera a imagem com os horários livres do dia, com a cara da sua barbearia, pronta para o status.',
    ex: <div className="exemplo">Hoje tem: 14:30, 16:00, 18:45</div>,
  },
  {
    hr: '20:10',
    tit: 'Fechou a porta, fechou o caixa.',
    txt: 'O cliente paga você direto, no Pix ou no dinheiro. No app você só marca como pago e vê quanto entrou e a comissão de cada um.',
    ex: <div className="exemplo"><b>R$ 1.385</b> em 23 atendimentos hoje</div>,
  },
]

export default function Site() {
  return (
    <div className="site">
      <header className="site-topo">
        <div className="site-topo-in">
          <Link to="/" aria-label="Kort, página inicial"><img src="/logo-sm.png" alt="Kort" /></Link>
          <nav aria-label="Seções">
            <a href="#dia">Como funciona</a>
            <a href="#planos">Planos</a>
          </nav>
          <div className="acoes">
            <Link className="btn btn-fantasma" to="/entrar">Entrar</Link>
            <Link className="btn btn-primario" to="/criar-conta">Testar grátis</Link>
          </div>
        </div>
      </header>

      <section className="heroi">
        <div className="heroi-in">
          <div>
            <h1 aria-label="Agenda cheia, cadeira girando.">
              {'Agenda cheia, cadeira girando.'.split(' ').map((p, i) => (
                <span key={i}><span className="palavra" aria-hidden="true" style={{ ['--i' as string]: i }}>{p}</span>{' '}</span>
              ))}
            </h1>
            <p className="lead">
              O Kort marca horário, lembra o cliente no WhatsApp e fecha o seu caixa. Feito para barbearia de bairro, do jeito que ela funciona.
            </p>
            <div className="acoes">
              <Link className="btn btn-primario btn-grande" to="/criar-conta">Criar minha barbearia</Link>
              <Link className="btn btn-sec btn-grande" to="/entrar">Já tenho conta</Link>
            </div>
            <p className="nota">14 dias grátis. Sem cartão de crédito e sem fidelidade.</p>
          </div>

          <div className="celular" aria-label="Exemplo da página de agendamento no celular" role="img">
            <div className="celular-tela">
              <div className="nm">Sua Barbearia</div>
              <div className="sb">Seu bairro, sua cidade</div>
              <div className="serv"><span>Corte degradê</span><b>R$ 45</b></div>
              <div className="lbl">Quinta, 15 de outubro</div>
              <div className="slots">
                {[['oc', '14:00'], ['', '14:30'], ['oc', '15:00'], ['sel', '15:30'], ['', '16:15'], ['', '17:00']].map(([c, h], i) => (
                  <span key={h} className={c} style={{ ['--i' as string]: i }}>{h}</span>
                ))}
              </div>
              <div className="cta">Confirmar horário</div>
            </div>
            <div className="celular-aviso" aria-hidden="true"><i>✓</i> Horário marcado, quinta às 15:30</div>
          </div>
        </div>
      </section>

      <section className="secao" id="dia">
        <h2 className="secao-tit">Um dia na barbearia com o Kort</h2>
        <p className="secao-sub">Nada de planilha nem caderno. O que muda é o seu tempo: menos celular na mão, mais gente na cadeira.</p>
        <div className="dia">
          {DIA.map((d) => <LinhaDia key={d.hr} {...d} />)}
        </div>
      </section>

      <section className="mesa">
        <div className="secao">
          <div>
            <h2 className="secao-tit">Todo mês, a conta do que o Kort te devolveu.</h2>
            <p className="secao-sub">
              Faltas que os lembretes evitaram, horários que a lista de espera recuperou, clientes que voltaram pela mensagem de retorno. Em reais, para você saber se a mensalidade está valendo.
            </p>
          </div>
          <Recibo />
        </div>
      </section>

      <section className="secao" id="planos">
        <h2 className="secao-tit">Planos</h2>
        <p className="secao-sub">O pagamento dos seus clientes vai direto para você. O Kort só cobra a mensalidade, no Pix.</p>
        <div className="planos">
          {PLANOS.map((p) => (
            <div key={p.nome} className={`plano ${p.destaque ? 'destaque' : ''}`}>
              <h3>{p.nome}</h3>
              <div className="pr">{p.preco ? dinheiroCurto(p.preco).replace(',90', '') : 'R$ 0'}<small>{p.preco ? ',90 por mês' : ' para sempre'}</small></div>
              <p className="pq">{p.pq}</p>
              <ul>
                {p.itens.map((i) => <li key={i}><Check />{i}</li>)}
              </ul>
              <Link className={`btn ${p.destaque ? 'btn-primario' : 'btn-sec'} btn-bloco`} to="/criar-conta">
                Começar no {p.nome}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="site-rodape">
        <div className="site-rodape-in">
          <img src="/logo-sm.png" alt="Kort" />
          <span>Kort é um produto Zinkra. São Paulo, {new Date().getFullYear()}.</span>
          <Link to="/admin" style={{ color: 'inherit' }}>Painel interno</Link>
        </div>
      </footer>
    </div>
  )
}

function LinhaDia(d: { hr: string; tit: string; txt: string; ex: ReactNode }) {
  const [ref, visivel] = useRevelar<HTMLDivElement>('-15% 0px')
  return (
    <div ref={ref} className={`dia-linha ${visivel ? 'visivel' : ''}`}>
      <div className="hr">{d.hr}</div>
      <div className="ev">
        <div>
          <h3>{d.tit}</h3>
          <p style={{ marginTop: 6 }}>{d.txt}</p>
        </div>
        {d.ex}
      </div>
    </div>
  )
}

function Recibo() {
  const [ref, visivel] = useRevelar<HTMLDivElement>('-20% 0px')
  const linhas = [
    ['31 faltas evitadas pelos lembretes', 'R$ 1.395'],
    ['9 horários preenchidos pela lista de espera', 'R$ 405'],
    ['22 clientes que voltaram pela mensagem', 'R$ 1.120'],
  ]
  return (
    <div ref={ref} className={`recibo ${visivel ? 'visivel' : ''}`} aria-label="Exemplo do relatório do mês">
      <h3>Dinheiro na mesa</h3>
      <div className="mes">Exemplo de um mês numa barbearia com 4 cadeiras</div>
      {linhas.map(([t, v], i) => (
        <div key={t} className="ln" style={{ ['--i' as string]: i }}><span>{t}</span><b>{v}</b></div>
      ))}
      <div className="tt" style={{ ['--i' as string]: 3 }}>
        <span>Total recuperado</span>
        <b>{visivel ? <TextoContado texto="R$ 2.920" ms={1400} /> : 'R$ 0'}</b>
      </div>
    </div>
  )
}
