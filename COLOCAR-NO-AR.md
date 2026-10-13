# Colocar o Kort no ar (custo zero)

Tudo aqui usa plano grátis:

| Peça | Serviço grátis | O que faz |
| --- | --- | --- |
| Banco, login e tempo real | Supabase (Free) | Guarda os dados, faz o login, roda as regras do agendamento pelo link e a rotina diária da mensalidade |
| Site e app | Cloudflare Pages (Free) | Publica o front em `https://kort.pages.dev` (ou o nome que você escolher) |
| Mensagens | WhatsApp do próprio barbeiro | O app monta o texto e abre a conversa (wa.me); o barbeiro só aperta enviar |
| Mensalidade | Pix da sua conta Nu Empresas | QR code e copia e cola gerados no app; você confere o extrato e dá baixa no painel |

O servidor Node (`server/`) **não é usado agora**. Ele fica pronto para quando você contratar a VPS e quiser WhatsApp automático.

> Por que Cloudflare e não Vercel? O plano grátis da Vercel (Hobby) é só para uso pessoal, sem fins comerciais, e o Kort cobra mensalidade. O `vercel.json` continua no projeto para quando você assinar o plano Pro de lá, se preferir.

---

## 1. Criar o projeto no Supabase (5 min)

1. Entre em https://supabase.com e crie a conta (pode ser com o GitHub).
2. **New project**:
   - Name: `kort`
   - Database password: gere uma e **guarde** (não vai no app)
   - Region: **South America (São Paulo)**
   - Plano: **Free**
3. Espere o projeto terminar de criar (1 a 2 minutos).

## 2. Criar o banco (2 min)

1. No menu da esquerda, **Database > Extensions**, procure **pg_cron** e ative.
2. Vá em **SQL Editor > New query**.
3. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo**, cole e clique **Run**. Tem que aparecer "Success".
4. Nova query de novo: copie **tudo** de `supabase/producao.sql`, cole e **Run**.

Pronto: tabelas, regras de segurança, agendamento pelo link, mensalidade e a rotina diária (todo dia às 06:00) estão no banco.

## 3. Configurar o login (2 min)

Em **Authentication**:

1. **Sign In / Providers > Email**: desligue **Confirm email** e salve.
   O e-mail grátis do Supabase manda poucas mensagens por hora. Com a confirmação ligada, um barbeiro que se cadastra pode ficar esperando um e-mail que não chega. Quando tiver um serviço de e-mail próprio (Resend, Brevo, ambos têm plano grátis), dá para religar.
2. **URL Configuration** (volte aqui depois do passo 5, quando tiver o endereço do site):
   - Site URL: `https://SEU-PROJETO.pages.dev`
   - Redirect URLs: adicione `https://SEU-PROJETO.pages.dev/**`

## 4. Pegar as chaves (1 min)

**Project Settings > API** (ou **API Keys**):

- **Project URL**: algo como `https://abcdxyz.supabase.co`
- **anon public** (chave pública): um texto longo começando com `eyJ...`

Nunca use a chave **service_role** no site. Ela ignora todas as regras de segurança.

## 5. Publicar o site no Cloudflare Pages (5 min)

1. Crie a conta em https://dash.cloudflare.com (grátis).
2. **Workers & Pages > Create > Pages > Connect to Git** e escolha o repositório `dlcruzz/Kort-`.
3. Configuração do build:
   - Framework preset: **React (Vite)**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables**: opcionais. O código já aponta para o projeto `kort` do Supabase e para a chave Pix do Kort. Só cadastre se quiser trocar:

   | Nome | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | a Project URL do passo 4 |
   | `VITE_SUPABASE_ANON_KEY` | a chave anon public do passo 4 |
   | `VITE_KORT_PIX_CHAVE` | sua chave Pix da Nu Empresas (CNPJ, e-mail ou aleatória) |
   | `VITE_KORT_PIX_NOME` | o nome que aparece no Pix (até 25 letras, sem acento) |
   | `VITE_KORT_PIX_CIDADE` | a cidade da conta, sem acento (ex.: `SAO PAULO`) |
   | `NODE_VERSION` | `20` |

5. **Save and Deploy**. Em 1 ou 2 minutos sai o endereço `https://SEU-PROJETO.pages.dev`.
6. Volte no passo 3.2 e cole esse endereço no Supabase.

Toda vez que você der `git push` na branch `main`, o Cloudflare publica a versão nova sozinho.

Se mudar alguma variável, vá em **Deployments** e clique **Retry deployment**: o Vite grava as variáveis na hora do build.

## 6. Virar o dono do painel (1 min)

1. Abra o site e crie sua conta em **Testar grátis**.
2. Se quiser, crie uma barbearia de teste (dá para usar o próprio app como barbeiro).
3. No Supabase, **SQL Editor**, rode trocando pelo seu e-mail:

   ```sql
   update public.perfis set super_admin = true
   where id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
   ```

4. Saia e entre de novo. Aparece o escudo no rodapé do menu: é o painel **/admin**.

## 7. Teste rápido antes de divulgar

- [ ] Criar conta, criar a barbearia e cair na agenda
- [ ] Abrir **Ver minha página** num celular sem login e marcar um horário
- [ ] O horário aparece na agenda sem recarregar (tempo real)
- [ ] Abrir o link "Mudar ou cancelar" e confirmar presença
- [ ] Abrir o horário na agenda, começar atendimento, confirmar pagamento no Pix
- [ ] Em **Mensagens > Para mandar**, o lembrete de amanhã abre o WhatsApp com o texto e o link
- [ ] No painel **/admin**, a barbearia aparece com o uso das funções

---

## Como funciona a mensalidade no dia a dia

1. A barbearia ganha **15 dias de teste** com tudo liberado ao se cadastrar.
2. No 16º dia sem pagamento, a conta é **suspensa na hora**: o app abre direto na tela de pagamento e a página de agendamento sai do ar.
3. O barbeiro escolhe o plano e toca em **Pagar e liberar agora**. Abre o checkout do **Mercado Pago** (Pix com QR, cartão de crédito ou débito).
4. O Mercado Pago avisa a função `mp-webhook`, que confere o pagamento e libera a conta sozinha em segundos. O próximo vencimento anda um mês.
5. Depois, a fatura de cada mês aparece 5 dias antes do vencimento. Vencida: "pagamento atrasado". Vencida há 3 dias: suspensa até pagar.
6. Ainda dá para dar baixa manual no painel (**Mensalidades > Dar baixa**) se alguém pagar por fora.

### Ligar o Mercado Pago (uma vez só)

1. Crie a conta em mercadopago.com.br (pode ser com o CNPJ) e entre em **Suas integrações > Criar aplicação** (tipo "Pagamentos online", produto Checkout Pro).
2. Em **Credenciais de produção**, copie o **Access Token** (começa com `APP_USR-`).
3. No Supabase: **Edge Functions > Secrets > Add new secret**: nome `MP_ACCESS_TOKEN`, valor = o token. Salve.
4. Pronto. As funções `mp-checkout` (com verificação de JWT) e `mp-webhook` (sem verificação de JWT) já estão publicadas. O endereço de aviso vai em cada cobrança: `https://zlrdnwkihldhimlpneni.supabase.co/functions/v1/mp-webhook`.
5. O dinheiro cai no saldo do Mercado Pago. Para mandar para o Nu Empresas: **Transferir > Pix** para a chave do CNPJ (grátis).

O plano **Grátis** não gera fatura e aceita até 50 horários por mês.

## Limites do plano grátis (para não ter surpresa)

- **Supabase**: 500 MB de banco (dá para dezenas de barbearias) e 50 mil usuários de login por mês. Projeto grátis **pausa depois de 1 semana sem nenhum acesso**. Com barbeiro usando todo dia isso não acontece; se pausar, é só entrar no painel do Supabase e clicar em **Restore**.
- **Cloudflare Pages**: 500 builds por mês e tráfego sem limite.
- **WhatsApp automático**: não tem grátis que seja confiável. Quando entrar a primeira mensalidade, ligue o servidor (`server/`) com a Z-API ou outro provedor.

## Quando contratar a VPS

Com 2 a 4 mensalidades pagando, siga o `server/README.md`: o servidor Node usa o mesmo banco do Supabase e adiciona o envio automático de lembretes, confirmações e convites pelo WhatsApp.
