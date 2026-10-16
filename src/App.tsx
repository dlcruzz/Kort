import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import AdminLayout from './layouts/AdminLayout'
import { EntrarDemo, ExigeAdmin, ExigeBarbearia } from './components/guardas'

import Site from './pages/Site'
import Privacidade from './pages/Privacidade'
import { AvisoCookies } from './components/AvisoCookies'
import Entrar from './pages/auth/Entrar'
import CriarConta from './pages/auth/CriarConta'
import Onboarding from './pages/auth/Onboarding'
import NovaSenha from './pages/auth/NovaSenha'
import Convite from './pages/auth/Convite'
import AdminEntrar, { ROTA_LOGIN_ADMIN } from './pages/auth/AdminEntrar'

import Agendar from './pages/publico/Agendar'
import MeuHorario from './pages/publico/MeuHorario'

import MinhaBarbearia from './pages/app/MinhaBarbearia'
import Agenda from './pages/app/Agenda'
import Caixa from './pages/app/Caixa'
import Clientes from './pages/app/Clientes'
import ClienteDetalhe from './pages/app/ClienteDetalhe'
import Relatorios from './pages/app/Relatorios'
import Mensagens from './pages/app/Mensagens'
import Divulgacao from './pages/app/Divulgacao'
import Fidelidade from './pages/app/Fidelidade'
import Servicos from './pages/app/Servicos'
import Equipe from './pages/app/Equipe'
import Estoque from './pages/app/Estoque'
import Financeiro from './pages/app/Financeiro'
import Configuracoes from './pages/app/Configuracoes'
import Ajuda from './pages/app/Ajuda'

import AdminVisao from './pages/admin/Visao'
import AdminBarbearias from './pages/admin/Barbearias'
import AdminBarbeariaDetalhe from './pages/admin/BarbeariaDetalhe'
import AdminUso from './pages/admin/Uso'
import AdminFaturas from './pages/admin/Faturas'
import AdminCupons from './pages/admin/Cupons'
import AdminSugestoes from './pages/admin/Sugestoes'
import AdminSuporte from './pages/admin/Suporte'

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/" element={<Site />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/criar-conta" element={<CriarConta />} />
      <Route path="/comecar" element={<Onboarding />} />
      <Route path="/demo" element={<EntrarDemo />} />
      <Route path="/nova-senha" element={<NovaSenha />} />
      <Route path="/convite" element={<Convite />} />
      <Route path={ROTA_LOGIN_ADMIN} element={<AdminEntrar />} />

      {/* página pública da barbearia: kort.app/b/<slug> */}
      <Route path="/b/:slug" element={<Agendar />} />
      <Route path="/b/:slug/horario/:id" element={<MeuHorario />} />

      <Route path="/app" element={<ExigeBarbearia><AppLayout /></ExigeBarbearia>}>
        <Route index element={<Navigate to="agenda" replace />} />
        <Route path="minha-barbearia" element={<MinhaBarbearia />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="caixa" element={<Caixa />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<ClienteDetalhe />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="mensagens" element={<Mensagens />} />
        <Route path="divulgacao" element={<Divulgacao />} />
        <Route path="fidelidade" element={<Fidelidade />} />
        <Route path="servicos" element={<Servicos />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="ajuda" element={<Ajuda />} />
      </Route>

      <Route path="/admin" element={<ExigeAdmin><AdminLayout /></ExigeAdmin>}>
        <Route index element={<AdminVisao />} />
        <Route path="barbearias" element={<AdminBarbearias />} />
        <Route path="barbearias/:id" element={<AdminBarbeariaDetalhe />} />
        <Route path="uso" element={<AdminUso />} />
        <Route path="faturas" element={<AdminFaturas />} />
        <Route path="cupons" element={<AdminCupons />} />
        <Route path="sugestoes" element={<AdminSugestoes />} />
        <Route path="suporte" element={<AdminSuporte />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <AvisoCookies />
    </>
  )
}
