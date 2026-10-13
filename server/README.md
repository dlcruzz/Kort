# Kort API

Back-end em Node.js + TypeScript (Fastify). Conversa com o mesmo banco do Supabase (`../supabase/schema.sql`).

> **Opcional por enquanto.** Na fase de validação o Kort roda só com o Supabase: o agendamento pelo link, a mensalidade e o painel estão em funções do banco (`../supabase/producao.sql`) e as mensagens saem pelo WhatsApp do barbeiro. Este servidor entra quando houver VPS, para o WhatsApp automático. Ele usa o mesmo banco, mas o link "meu horário" dele usa token assinado (HMAC) em vez do `token_publico` do banco; ao ligar, troque `lib/token.ts` para ler `agendamentos.token_publico`.

## Rodar

```bash
cd server
npm install
cp .env.example .env     # preencha DATABASE_URL, SUPABASE_URL, TOKEN_SECRET e PIX_CHAVE
npm run dev              # http://localhost:3333/saude
```

Em produção (VPS): `npm run build` e depois `npm start` (use pm2 ou systemd para manter de pé, e Nginx na frente com HTTPS).

## O que o back-end faz e o front não pode fazer

O front fala direto com o Supabase para o CRUD do dia a dia, protegido pelo RLS. A API cuida do que precisa de servidor:

| Área | O que faz |
| --- | --- |
| Página pública | Mostra a barbearia, calcula horários livres, marca, remarca e cancela horário. O cliente não tem login: o link "meu horário" leva um token assinado. |
| Mensagens | Confirmação na hora, lembrete 24h e 2h antes, "hora de voltar", cliente sumido, vaga na lista de espera e resumo do dia para o dono. Tudo entra na fila (`mensagens`) e sai pelo WhatsApp a cada minuto. |
| Mensalidade | Fim do teste, fatura do mês com Pix copia e cola da sua chave Nu, vencimento, inadimplência e suspensão automática. |
| Painel admin | Indicadores, barbearias, uso das funções, risco de cancelamento, baixa de fatura, suspender, estender teste, sugestões. Tudo registrado em `admin_logs`. |
| Webhooks | Baixa automática quando você ligar um gateway (Asaas, Woovi). Avisos repetidos são ignorados. |

## Rotas

Público (sem login, limitado por IP):

- `GET  /publico/barbearias/:slug`
- `GET  /publico/barbearias/:slug/horarios?data=AAAA-MM-DD&servicos=id,id&membro=id|qualquer`
- `POST /publico/barbearias/:slug/agendamentos`
- `POST /publico/barbearias/:slug/lista-espera`
- `GET  /publico/agendamentos/:id?t=TOKEN`
- `POST /publico/agendamentos/:id/remarcar` · `/cancelar` · `/avaliacao`

App da barbearia (cabeçalho `Authorization: Bearer <token do Supabase>`):

- `GET  /eu`
- `GET  /barbearias/:id/horarios-livres?data=&duracao=&membro=`
- `GET  /barbearias/:id/relatorios/dinheiro-na-mesa?de=&ate=` (só o dono)
- `POST /barbearias/:id/mensagens`
- `GET  /barbearias/:id/mensalidade` (só o dono)

Admin (só super admin): `GET /admin/indicadores`, `/admin/barbearias`, `/admin/barbearias/:id`, `/admin/uso`, `/admin/risco`, `/admin/faturas`, `/admin/sugestoes`; `POST /admin/faturas/:id/baixa`, `/admin/barbearias/:id/status`, `/admin/barbearias/:id/estender-teste`, `/admin/barbearias/:id/plano`; `PATCH /admin/sugestoes/:id`.

Outros: `GET /saude`, `POST /webhooks/:provedor`.

Erros sempre voltam assim, prontos para mostrar na tela: `{ "erro": "Esse horário acabou de ser ocupado. Escolha outro.", "codigo": "conflito" }`.

## Rotinas (src/rotinas)

Rodam dentro da própria API, a cada minuto (desligue com `ROTINAS_ATIVAS=false`):

- a cada minuto: agenda lembretes e envia a fila de WhatsApp
- 06:00: mensalidades
- 10:00: convites de volta (retorno e cliente sumido)
- 21:00: resumo do dia

Um advisory lock do Postgres garante que, com mais de um servidor, só um execute.

## Segurança

- A conexão do servidor ignora o RLS. Por isso toda rota de barbearia confere se quem chamou é membro dela (`membroDa` em `src/auth.ts`).
- O token do Supabase é conferido pela assinatura: com `SUPABASE_JWT_SECRET` (projetos antigos) ou pelas chaves públicas do projeto (`SUPABASE_URL`).
- Nunca coloque `DATABASE_URL` nem a service role key no front.

## Testes

Precisam de um Postgres vazio (o banco de teste é apagado a cada execução):

```bash
docker run -d -p 5499:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
cp test/env-teste.exemplo .env.test
npm test
```

São 21 testes de ponta a ponta: agendamento, conflito de horário, "quem estiver livre", token do link, remarcar, lista de espera, lembretes, fila de envio, permissões, painel admin, fatura com Pix, webhook e suspensão.

## WhatsApp

`WHATSAPP_PROVEDOR=console` só escreve no terminal. Para enviar de verdade, `zapi` usa a Z-API (conecta um número lendo QR code). Para usar outro provedor, crie um arquivo em `src/whatsapp/` com a função `enviar(telefone, texto)`.
