# Kort

Agenda e gestão para barbearias.

- Front-end: React + TypeScript (Vite), nesta pasta.
- Back-end: Node.js + TypeScript (Fastify), na pasta `server/`. Veja `server/README.md`.
- Banco: `supabase/schema.sql` (tabelas e segurança) e `supabase/producao.sql` (agendamento pelo link, mensalidade, painel).

**Para publicar de graça, siga o [COLOCAR-NO-AR.md](COLOCAR-NO-AR.md).**

## Rodar no seu computador

```bash
npm install
npm run dev
```

Abre em http://localhost:5173.

O app já vem ligado no banco de produção (Supabase, projeto `kort`): cadastro, login, dados reais, página pública e mensalidade, tudo começando zerado. Para mexer nas telas com dados de exemplo sem tocar no banco, rode com `VITE_KORT_DEMO=1 npm run dev` (abre em `/demo` e `/b/esquina-77`).

## Telas

| Endereço | O que é |
| --- | --- |
| `/` | Site de venda do Kort (planos e como funciona) |
| `/entrar`, `/criar-conta`, `/comecar` | Login, cadastro e configuração inicial da barbearia |
| `/convite?m=&t=` | Barbeiro da equipe cria o próprio acesso pelo convite do dono |
| `/demo` | Abre o app com os dados de exemplo |
| `/b/esquina-77` | Página pública de agendamento (o que o cliente da barbearia vê) |
| `/b/:slug/horario/:id?t=` | Cliente confirma, remarca ou cancela o horário dele (o `t` é o token do link) |
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
    store.tsx       estado e ações: mudam a tela na hora e gravam no Supabase numa fila
    banco.ts        lê o banco e monta o estado das telas
    sessao.tsx      login, modo real/demonstração e de qual barbearia a pessoa é
    publico.ts      página pública e "meu horário" (funções do banco, sem login)
    agenda.ts       cálculo de horários livres
    pix.ts          gera o Pix copia e cola da mensalidade
    supabase.ts     cliente do Supabase (só liga com o .env.local preenchido)
    adminStore.ts   estado do painel admin
  data/             dados de demonstração
  components/       peças reaproveitadas (folhas laterais, gráficos, QR do Pix)
  layouts/          casca do app da barbearia e do painel admin
  pages/            uma pasta por área: publico, app, admin, auth
  styles/           CSS puro com as cores da marca em variáveis no base.css
supabase/
  schema.sql        tabelas, triggers, RLS e views
  producao.sql      funções do link público, onboarding, mensalidade, painel, pg_cron
  teste/fluxo.sql   teste de ponta a ponta do banco (Postgres local)
server/             API em Node (agendamento público, rotinas, WhatsApp, mensalidade, admin)
```

## Ligar no Supabase

Passo a passo completo em [COLOCAR-NO-AR.md](COLOCAR-NO-AR.md). Resumo:

1. Rode `supabase/schema.sql` e depois `supabase/producao.sql` no SQL Editor.
2. Copie `.env.example` para `.env.local` e preencha a URL e a chave anon do projeto e a sua chave Pix.
3. `npm run dev`, crie sua conta e rode o `update ... super_admin` do guia para abrir o painel.

Como os dados fluem:

- **App da barbearia**: lê tudo da barbearia ao abrir (`banco.ts`) e cada ação grava direto nas tabelas, protegida pelo RLS. Se o banco recusar (horário já ocupado, sem permissão), aparece o motivo e a tela recarrega do banco. Horário marcado pelo link chega na agenda em tempo real.
- **Página pública**: o cliente não tem login. Ela chama funções do banco (`pagina_publica`, `agendar_publico`, `meu_horario`...) que conferem expediente, bloqueio e conflito, e nunca mostram dados de outros clientes.
- **Mensagens**: por enquanto saem do WhatsApp do barbeiro (wa.me), com texto e link prontos em Mensagens > Para mandar.
- **Mensalidade**: a rotina diária (pg_cron) cria as faturas e marca atraso e suspensão; o barbeiro paga o Pix e avisa; você dá baixa no painel.

## Identidade visual

- Preto `#080808` (fundo da logo), limão `#E7F738` (letras), cinza `#4D4D4A` (sombra deslocada da logo), aço `#C9CAC6` (navalha).
- App da barbearia em fundo concreto claro, para ler bem dentro do salão. Página do cliente em preto, como a logo. Painel admin com o menu em amarelo, para nunca confundir com o app do barbeiro.
- Tipografia: Big Shoulders Display (títulos e números) e Schibsted Grotesk (texto), servidas localmente pelo pacote @fontsource.
- A sombra deslocada sem desfoque, tirada da logo, aparece só no botão principal, no item ativo do menu e em destaques. O botão principal afunda ao clicar, como um adesivo apertado na parede.

## Movimento

As animações ficam em `src/styles/movimento.css` e `src/lib/movimento.tsx`. Elas seguem o que a pessoa faz ou contam algo (o título cola como adesivo, o dinheiro sobe contando, o pagamento ganha carimbo), e somem quando o sistema está com "reduzir movimento" ligado.
