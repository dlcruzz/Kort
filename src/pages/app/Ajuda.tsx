import { CabecalhoPagina } from '../../components/ui'
import { PainelSuporte } from '../../components/Suporte'

export default function Ajuda() {
  return (
    <>
      <CabecalhoPagina titulo="Ajuda" sub="Fale com o Kort por aqui: dúvida, problema ou ideia. Pode escrever a qualquer hora; a resposta chega nesta tela." />
      <PainelSuporte lado="barbearia" />
    </>
  )
}
