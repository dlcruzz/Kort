// Barra fixa no topo do app com o link de agendamento da barbearia:
// copiar, mandar no WhatsApp ou abrir. É o que o barbeiro mais compartilha.

import { useState } from 'react'
import { Check, Copy, ExternalLink, Link2, MessageCircle } from 'lucide-react'
import { useKort } from '../lib/store'
import { dominio, linkPublico } from '../lib/format'
import { useAvisar } from './avisos'

export function LinkAgendamento() {
  const { estado } = useKort()
  const avisar = useAvisar()
  const [copiado, setCopiado] = useState(false)
  const b = estado.barbearia
  const link = linkPublico(b.slug)
  const texto = `Agende seu horário na ${b.nome} pelo link: ${link}`

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // navegador sem permissão: seleciona para copiar na mão
      window.prompt('Copie o link:', link)
      return
    }
    setCopiado(true)
    avisar('Link copiado. É só colar para o cliente.')
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="link-barra" role="region" aria-label="Seu link de agendamento">
      <span className="link-barra-rot"><Link2 size={16} /> Seu link de agendamento</span>
      <a className="link-barra-url" href={link} target="_blank" rel="noreferrer" title="Abrir minha página">
        {dominio()}/b/<b>{b.slug}</b>
      </a>
      <div className="link-barra-acoes">
        <button className="btn btn-primario btn-pequeno" onClick={copiar}>
          {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <a className="btn btn-sec btn-pequeno" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={15} /> <span className="longo">Mandar no </span>WhatsApp
        </a>
        <a className="btn btn-fantasma btn-pequeno btn-icone-txt" href={link} target="_blank" rel="noreferrer" aria-label="Abrir minha página">
          <ExternalLink size={15} />
        </a>
      </div>
      {!b.publicada && <span className="link-barra-off">Página fora do ar. Ligue em Configurações.</span>}
    </div>
  )
}
