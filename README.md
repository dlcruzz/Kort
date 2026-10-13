# Kort

Agenda e gestão para barbearias.

- Front-end: React + TypeScript (Vite), nesta pasta.
- Back-end: Node.js + TypeScript (Fastify), na pasta `server/`. Veja `server/README.md`.
- Banco: `supabase/schema.sql`.

## Rodar no seu computador

```bash
npm install
npm run dev
```

Abre em http://localhost:5173.

Hoje o app roda em **modo demonstração**: os dados de exemplo ficam no navegador (localStorage). Dá para criar horários, fechar comandas e ver os relatórios mudarem sem backend. O botão "Recomeçar dados" volta tudo ao início.

## Telas

| Endereço | O que é |
| --- | --- |
| `/` | Site de venda do Kort (planos e como funciona) |
| `/entrar`, `/criar-conta`, `/comecar` | Login, cadastro e configuração inicial da barbearia |
| `/b/esquina-77` | Página pública de agendamento (o que o cliente da barbearia vê) |
| `/b/esquina-77/horario/:id` | Cliente vê, remarca ou cancela o horário dele |
| `/app/agenda` | Agenda por barbeiro (dia e semana), novo horário, bloqueios |
| `/app/caixa` | Comandas, confirmação de pagamento, meta do dia |
| `/app/clientes` | Clientes, retorno previsto, histórico, fidelidade |
| `/app/relatorios` | Dinheiro na mesa, faturamento, equipe, mapa de movimento |
| `/app/mensagens` | Mensagens automáticas, clientes sumidos, lista de espera |
| `/app/divulgacao` | Imagem de horários livres para o status, link, promoções, avaliações |
| `/app/fidelidade` | Cartão fidelidade, clube de assinatura, indique e ganhe |
| `/app/servicos`, `/app/equipe`, `/app/estoque`, `/app/financeiro` | Gestão |
| `/app/configuracoes` | Dados da barbearia, horários, WhatsApp, plano e mensalidade (Pix), sugestões |
| `/admin` | Seu painel: barbearias, uso das funções, mensalidades, sugestões |

## Estrutura

```
src/
  lib/
    types.ts        tipos com os mesmos nomes das colunas do banco
    store.tsx       estado e ações (cada ação tem o comentário "Supabase:" com a chamada equivalente)
    agenda.ts       cálculo de horários livres
    pix.ts          gera o Pix copia e cola da mensalidade
    supabase.ts     cliente do Supabase (desligado até preencher o .env.local)
    adminStore.ts   estado do painel admin
  data/             dados de demonstração
  components/       peças reaproveitadas (folhas laterais, gráficos, QR do Pix)
  layouts/          casca do app da barbearia e do painel admin
  pages/            uma pasta por área: publico, app, admin, auth
  styles/           CSS puro com as cores da marca em variáveis no base.css
supabase/schema.sql modelagem do banco
server/             API em Node (agendamento público, rotinas, WhatsApp, mensalidade, admin)
```

## Ligar no Supabase

1. Rode `supabase/schema.sql` no SQL Editor do Supabase.
2. Copie `.env.example` para `.env.local` e preencha URL, anon key e a chave Pix da conta Nu Empresas.
3. Troque o corpo das ações em `src/lib/store.tsx` pelas chamadas ao banco, uma por vez. O comentário "Supabase:" em cada uma diz qual tabela e operação usar.
4. Depois de criar sua conta, rode o `update` comentado no fim do schema para virar super admin.

## Identidade visual

- Preto `#080808` (fundo da logo), limão `#E7F738` (letras), cinza `#4D4D4A` (sombra deslocada da logo), aço `#C9CAC6` (navalha).
- App da barbearia em fundo concreto claro, para ler bem dentro do salão. Página do cliente em preto, como a logo. Painel admin com o menu em amarelo, para nunca confundir com o app do barbeiro.
- Tipografia: Big Shoulders Display (títulos e números) e Schibsted Grotesk (texto), servidas localmente pelo pacote @fontsource.
- A sombra deslocada sem desfoque, tirada da logo, aparece só no botão principal, no item ativo do menu e em destaques. O botão principal afunda ao clicar, como um adesivo apertado na parede.

## Movimento

As animações ficam em `src/styles/movimento.css` e `src/lib/movimento.tsx`. Elas seguem o que a pessoa faz ou contam algo (o título cola como adesivo, o dinheiro sobe contando, o pagamento ganha carimbo), e somem quando o sistema está com "reduzir movimento" ligado.
