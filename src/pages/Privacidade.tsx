import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Cookie, Lock, Mail } from 'lucide-react'
import { escolherCookies, useEscolhaCookies } from '../lib/visitas'

export default function Privacidade() {
  const escolha = useEscolhaCookies()
  return (
    <div className="site">
      <header className="site-topo">
        <div className="site-topo-in">
          <Link to="/" aria-label="Kort, página inicial"><img src="/logo-sm.png" alt="Kort" /></Link>
          <div className="acoes">
            <Link className="btn btn-fantasma" to="/"><ArrowLeft size={16} /> Voltar</Link>
          </div>
        </div>
      </header>

      <main className="privacidade">
        <h1>Privacidade e cookies</h1>
        <p className="lead">Como o Kort trata os dados de quem visita o site e de quem usa o sistema.</p>

        <section>
          <h2><Cookie size={20} /> Cookies</h2>
          <p>
            Os cookies essenciais guardam o seu login e a sua escolha neste aviso. Sem eles o sistema não funciona.
            Se você aceitar todos, guardamos também um código aleatório no seu navegador para contar quantas pessoas
            diferentes visitam o site. Esse código não tem o seu nome, e-mail ou telefone.
          </p>
          <p className="privacidade-escolha">
            Sua escolha atual: <b>{escolha === 'todos' ? 'todos os cookies' : escolha === 'essenciais' ? 'só os essenciais' : 'ainda não escolhida'}</b>.
          </p>
          <div className="linha-flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sec btn-pequeno" onClick={() => escolherCookies('essenciais')}>Usar só os essenciais</button>
            <button className="btn btn-primario btn-pequeno" onClick={() => escolherCookies('todos')}>Aceitar todos</button>
          </div>
        </section>

        <section>
          <h2><BarChart3 size={20} /> Contagem de visitas</h2>
          <p>
            Para saber se o site está funcionando, contamos as visitas: qual página foi aberta, de qual site a pessoa veio
            (por exemplo, Instagram ou Google) e se foi pelo celular. Nada disso identifica você.
          </p>
        </section>

        <section>
          <h2><Lock size={20} /> Dados das barbearias e dos clientes</h2>
          <p>
            Os dados cadastrados no sistema (agenda, clientes, caixa) pertencem à barbearia. Ficam guardados com
            criptografia, cada barbearia só enxerga os próprios dados, e não vendemos nem repassamos nada a terceiros.
          </p>
        </section>

        <section>
          <h2><Mail size={20} /> Dúvidas ou pedido de exclusão</h2>
          <p>Fale com a gente pela área de Ajuda dentro do sistema, ou pelo Instagram do Kort.</p>
        </section>
      </main>

      <footer className="site-rodape">
        <div className="site-rodape-in">
          <img src="/logo-sm.png" alt="Kort" />
          <span>Kort é um produto Zinkra. São Paulo, {new Date().getFullYear()}.</span>
        </div>
      </footer>
    </div>
  )
}
