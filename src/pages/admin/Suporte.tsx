import { CabecalhoPagina } from '../../components/ui'
import { PainelSuporte } from '../../components/Suporte'

export default function AdminSuporte() {
  return (
    <>
      <CabecalhoPagina titulo="Suporte" sub="Chamados abertos pelos barbeiros na aba Ajuda. Responda por aqui; eles veem na hora." />
      <PainelSuporte lado="kort" />
    </>
  )
}
