// Aviso de cookies das páginas abertas (site, cadastro, login).
// Some de vez depois que a pessoa escolhe; a escolha fica neste navegador.

import { Link, useLocation } from 'react-router-dom'
import { Check, Cookie, ShieldCheck } from 'lucide-react'
import { escolherCookies, useEscolhaCookies } from '../lib/visitas'

const PAGINAS = ['/', '/entrar', '/criar-conta', '/privacidade']

export function AvisoCookies() {
  const escolha = useEscolhaCookies()
  const { pathname } = useLocation()
  if (escolha || !PAGINAS.includes(pathname)) return null

  return (
    <div className="aviso-cookies" role="region" aria-label="Aviso de cookies">
      <div className="aviso-cookies-ico" aria-hidden="true"><Cookie size={22} /></div>
      <div className="aviso-cookies-texto">
        <strong>Cookies no Kort</strong>
        <p>
          Usamos cookies para o site funcionar e para contar quantas pessoas visitam, sem identificar ninguém.{' '}
          <Link to="/privacidade">Saiba mais</Link>
        </p>
      </div>
      <div className="aviso-cookies-acoes">
        <button className="btn btn-sec btn-pequeno" onClick={() => escolherCookies('essenciais')}>
          <ShieldCheck size={15} /> Só os essenciais
        </button>
        <button className="btn btn-primario btn-pequeno" onClick={() => escolherCookies('todos')}>
          <Check size={15} /> Aceitar
        </button>
      </div>
    </div>
  )
}
