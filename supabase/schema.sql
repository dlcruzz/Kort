-- =====================================================================
--  KORT  |  Modelagem do banco de dados (Supabase / PostgreSQL)
--  Versão 1.0 - validação do produto - out/2026
--
--  Como rodar: Supabase > SQL Editor > colar este arquivo inteiro > Run.
--
--  Convenções
--  - Dinheiro sempre em CENTAVOS (integer). R$ 45,00 = 4500. Evita erro
--    de arredondamento de float.
--  - Datas/horas em timestamptz (guarda o fuso). Horário de funcionamento
--    usa time (hora "de parede", sem fuso).
--  - Toda tabela de dados de barbearia tem barbearia_id. É a chave do
--    multi-tenant: as políticas de RLS usam essa coluna para garantir que
--    uma barbearia nunca veja dados de outra.
--  - Pagamento do cliente final NÃO passa pelo app: o cliente paga o
--    barbeiro (Pix, dinheiro, cartão) e o barbeiro só CONFIRMA na comanda.
--    O único pagamento processado é a mensalidade do Kort (assinaturas_saas
--    + faturas).
--  - Funções auxiliares ficam no schema "privado", que não é exposto pela
--    API do Supabase.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;  -- usado na trava de horário duplicado

create schema if not exists privado;

-- ---------------------------------------------------------------------
-- 1. TIPOS (ENUMS)
-- ---------------------------------------------------------------------
create type public.modo_operacao        as enum ('equipe', 'cadeira_alugada', 'solo');
create type public.papel_membro         as enum ('dono', 'barbeiro', 'recepcao');
create type public.status_agendamento   as enum ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'faltou');
create type public.origem_agendamento   as enum ('link', 'balcao', 'encaixe', 'lista_espera', 'mensagem');
create type public.status_comanda       as enum ('aberta', 'paga', 'cancelada');
create type public.forma_pagamento      as enum ('pix', 'dinheiro', 'debito', 'credito', 'clube', 'vale_presente', 'outro');
create type public.tipo_item_comanda    as enum ('servico', 'produto', 'vale_presente');
create type public.status_lista_espera  as enum ('aguardando', 'avisado', 'convertido', 'expirado', 'cancelado');
create type public.tipo_mensagem        as enum ('confirmacao', 'lembrete_24h', 'lembrete_2h', 'retorno', 'resgate', 'lista_espera', 'resumo_diario');
create type public.canal_mensagem       as enum ('whatsapp', 'email');
create type public.status_mensagem      as enum ('pendente', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada');
create type public.tipo_mov_estoque     as enum ('entrada', 'venda', 'ajuste', 'perda');
create type public.tipo_programa_fidel  as enum ('pontos', 'cartao_visitas');
create type public.tipo_mov_fidelidade  as enum ('atendimento', 'indicacao', 'resgate', 'ajuste', 'expiracao');
create type public.status_assin_clube   as enum ('ativa', 'pausada', 'cancelada');
create type public.status_pgto_interno  as enum ('pendente', 'pago', 'cancelado');
create type public.tipo_desconto        as enum ('percentual', 'valor');
create type public.status_vale          as enum ('ativo', 'usado', 'expirado', 'cancelado');
create type public.status_assin_saas    as enum ('teste', 'ativa', 'inadimplente', 'suspensa', 'cancelada');
create type public.status_fatura        as enum ('aberta', 'paga', 'vencida', 'cancelada');
create type public.provedor_cobranca    as enum ('pix_manual', 'asaas', 'woovi', 'mercado_pago');
create type public.status_sugestao      as enum ('nova', 'em_analise', 'planejada', 'feita', 'recusada');

-- ---------------------------------------------------------------------
-- 2. PLATAFORMA KORT: planos, perfis, barbearias, equipe
-- ---------------------------------------------------------------------

-- Planos do SaaS (Grátis, Solo, Barbearia, Pro). Quem edita é só o super admin.
create table public.planos (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,                    -- 'solo', 'barbearia'...
  nome            text not null,
  preco_centavos  integer not null default 0 check (preco_centavos >= 0),
  max_barbeiros   integer,                                 -- null = ilimitado
  max_agendamentos_mes integer,                            -- limite do plano grátis
  recursos        jsonb not null default '{}'::jsonb,      -- {"lembretes":true,"clube":false}
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- Um perfil por usuário do Supabase Auth (dono, barbeiro, recepção, você).
create table public.perfis (
  id               uuid primary key references auth.users(id) on delete cascade,
  nome             text not null default '',
  telefone         text,
  avatar_url       text,
  super_admin      boolean not null default false,         -- só você (Kort)
  ultimo_acesso_em timestamptz,
  criado_em        timestamptz not null default now()
);

-- A barbearia é o "tenant". Barbeiro autônomo = barbearia com 1 membro.
create table public.barbearias (
  id                          uuid primary key default gen_random_uuid(),
  slug                        text not null unique
                                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- kort.app/<slug>
  nome                        text not null,
  descricao                   text,
  telefone                    text,
  whatsapp                    text,
  email                       text,
  instagram                   text,
  cep                         text,
  logradouro                  text,
  numero                      text,
  complemento                 text,
  bairro                      text,
  cidade                      text,
  uf                          char(2),
  latitude                    numeric(9,6),
  longitude                   numeric(9,6),
  logo_url                    text,
  capa_url                    text,
  fuso_horario                text not null default 'America/Sao_Paulo',
  modo_operacao               public.modo_operacao not null default 'equipe',
  antecedencia_cancelamento_min integer not null default 120,  -- cliente só cancela até X min antes
  antecedencia_max_dias       integer not null default 30,     -- agenda aberta até X dias
  intervalo_slots_min         integer not null default 15,     -- grade de horários: 9:00, 9:15...
  publicada                   boolean not null default true,   -- página pública no ar
  criado_por                  uuid references public.perfis(id),
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now()
);

-- Quem trabalha na barbearia. perfil_id pode ser nulo: barbeiro cadastrado
-- pelo dono que ainda não tem login.
create table public.membros (
  id             uuid primary key default gen_random_uuid(),
  barbearia_id   uuid not null references public.barbearias(id) on delete cascade,
  perfil_id      uuid references public.perfis(id) on delete set null,
  papel          public.papel_membro not null default 'barbeiro',
  nome_exibicao  text not null,
  foto_url       text,
  bio            text,
  cor_agenda     text default '#C8F031',
  atende         boolean not null default true,  -- aparece para agendamento (o dono pode atender também)
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  unique (barbearia_id, perfil_id)
);

-- Dados sensíveis do membro, separados para a página pública poder ler
-- "membros" sem expor comissão, meta ou aluguel.
create table public.membro_configuracoes (
  membro_id                 uuid primary key references public.membros(id) on delete cascade,
  barbearia_id              uuid not null references public.barbearias(id) on delete cascade,
  comissao_servico_pct      numeric(5,2) not null default 0 check (comissao_servico_pct between 0 and 100),
  comissao_produto_pct      numeric(5,2) not null default 0 check (comissao_produto_pct between 0 and 100),
  meta_diaria_centavos      integer check (meta_diaria_centavos >= 0),          -- S06 meta do dia
  aluguel_cadeira_centavos  integer check (aluguel_cadeira_centavos >= 0),      -- S07 cadeira alugada
  dia_vencimento_aluguel    smallint check (dia_vencimento_aluguel between 1 and 28),
  eh_mei                    boolean not null default false,                     -- S11 limite do MEI
  custos_mensais            jsonb not null default '{}'::jsonb,                 -- S10 calculadora de preço
  atualizado_em             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. AGENDA: horários, jornadas, bloqueios, serviços
-- ---------------------------------------------------------------------

-- Horário da barbearia. Vários intervalos por dia são permitidos.
create table public.horarios_funcionamento (
  id            uuid primary key default gen_random_uuid(),
  barbearia_id  uuid not null references public.barbearias(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  abre          time not null,
  fecha         time not null,
  check (fecha > abre)
);

-- Jornada de cada barbeiro. Almoço = dois intervalos no mesmo dia
-- (ex.: 09:00-12:00 e 13:00-19:00).
create table public.jornadas (
  id            uuid primary key default gen_random_uuid(),
  barbearia_id  uuid not null references public.barbearias(id) on delete cascade,
  membro_id     uuid not null references public.membros(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  inicio        time not null,
  fim           time not null,
  check (fim > inicio)
);

-- Folgas, feriados, compromissos. membro_id nulo = barbearia inteira fechada.
create table public.bloqueios (
  id            uuid primary key default gen_random_uuid(),
  barbearia_id  uuid not null references public.barbearias(id) on delete cascade,
  membro_id     uuid references public.membros(id) on delete cascade,
  inicio        timestamptz not null,
  fim           timestamptz not null,
  motivo        text,
  criado_em     timestamptz not null default now(),
  check (fim > inicio)
);

create table public.servicos (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  nome            text not null,
  descricao       text,
  preco_centavos  integer not null check (preco_centavos >= 0),
  duracao_min     integer not null check (duracao_min > 0),
  intervalo_min   integer not null default 0 check (intervalo_min >= 0),  -- limpeza depois do serviço
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now()
);

-- Quais barbeiros fazem cada serviço. Preço/duração próprios são opcionais.
create table public.servico_membros (
  servico_id      uuid not null references public.servicos(id) on delete cascade,
  membro_id       uuid not null references public.membros(id) on delete cascade,
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  preco_centavos  integer check (preco_centavos >= 0),
  duracao_min     integer check (duracao_min > 0),
  primary key (servico_id, membro_id)
);

-- ---------------------------------------------------------------------
-- 4. CLIENTES
-- ---------------------------------------------------------------------
-- Cliente pertence à barbearia (o mesmo telefone em duas barbearias =
-- dois registros). Não precisa ter login.
create table public.clientes (
  id                       uuid primary key default gen_random_uuid(),
  barbearia_id             uuid not null references public.barbearias(id) on delete cascade,
  nome                     text not null,
  telefone                 text not null,                -- formato E.164: +5511999998888
  email                    text,
  data_nascimento          date,
  observacoes              text,
  membro_preferido_id      uuid references public.membros(id) on delete set null,
  membro_responsavel_id    uuid references public.membros(id) on delete set null, -- modo cadeira alugada: "dono" do cliente
  codigo_indicacao         text unique,                  -- S09 indique e ganhe
  indicado_por_id          uuid references public.clientes(id) on delete set null,
  aceita_mensagens         boolean not null default true,
  consentimento_lgpd_em    timestamptz,
  -- campos calculados pelo trigger da comanda (S04/S05)
  primeira_visita_em       timestamptz,
  ultima_visita_em         timestamptz,
  total_visitas            integer not null default 0,
  total_gasto_centavos     integer not null default 0,
  frequencia_media_dias    numeric(6,1),
  proximo_retorno_previsto date,
  criado_em                timestamptz not null default now(),
  unique (barbearia_id, telefone)
);

-- ---------------------------------------------------------------------
-- 5. MENSAGENS (WhatsApp / e-mail)
--    Criada antes de agendamentos porque o agendamento guarda qual
--    mensagem o gerou (base do relatório "dinheiro na mesa", S01).
-- ---------------------------------------------------------------------
create table public.modelos_mensagem (
  id            uuid primary key default gen_random_uuid(),
  barbearia_id  uuid not null references public.barbearias(id) on delete cascade,
  tipo          public.tipo_mensagem not null,
  texto         text not null,          -- com variáveis: {cliente}, {horario}, {barbeiro}, {link}
  ativo         boolean not null default true,
  parametros    jsonb not null default '{}'::jsonb,   -- ex.: {"horas_antes":24} ou {"hora_envio":"21:00"}
  unique (barbearia_id, tipo)
);

create table public.mensagens (
  id               uuid primary key default gen_random_uuid(),
  barbearia_id     uuid not null references public.barbearias(id) on delete cascade,
  cliente_id       uuid references public.clientes(id) on delete set null,
  membro_id        uuid references public.membros(id) on delete set null,   -- resumo diário vai para o dono
  agendamento_id   uuid,                                                    -- FK adicionada depois
  tipo             public.tipo_mensagem not null,
  canal            public.canal_mensagem not null default 'whatsapp',
  destino          text not null,
  conteudo         text not null,
  status           public.status_mensagem not null default 'pendente',
  agendada_para    timestamptz not null default now(),
  enviada_em       timestamptz,
  erro             text,
  id_externo       text,                -- id da mensagem no provedor de WhatsApp
  criado_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. AGENDAMENTOS
-- ---------------------------------------------------------------------
create table public.cupons (
  id               uuid primary key default gen_random_uuid(),
  barbearia_id     uuid not null references public.barbearias(id) on delete cascade,
  codigo           text not null,
  tipo             public.tipo_desconto not null,
  valor            integer not null check (valor > 0),   -- % (1-100) ou centavos
  valido_ate       date,
  usos_max         integer,
  usos             integer not null default 0,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  unique (barbearia_id, codigo),
  check (tipo <> 'percentual' or valor <= 100)
);

create table public.agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  barbearia_id         uuid not null references public.barbearias(id) on delete cascade,
  cliente_id           uuid not null references public.clientes(id) on delete restrict,
  membro_id            uuid not null references public.membros(id) on delete restrict,
  inicio               timestamptz not null,
  fim                  timestamptz not null,       -- inicio + soma das durações + intervalo
  status               public.status_agendamento not null default 'agendado',
  origem               public.origem_agendamento not null default 'link',
  mensagem_origem_id   uuid references public.mensagens(id) on delete set null,  -- veio de msg de retorno/resgate?
  cupom_id             uuid references public.cupons(id) on delete set null,
  valor_previsto_centavos integer not null default 0,
  observacao_cliente   text,
  confirmado_em        timestamptz,                -- cliente confirmou pelo lembrete
  checkin_em           timestamptz,                -- S13 check-in por QR
  cancelado_em         timestamptz,
  motivo_cancelamento  text,
  criado_por           uuid references public.perfis(id),   -- nulo = cliente pelo link
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  check (fim > inicio),
  -- Trava no banco: o mesmo barbeiro não pode ter dois agendamentos
  -- ativos que se sobreponham. Mesmo com dois clientes clicando ao
  -- mesmo tempo, só um consegue gravar.
  constraint agendamento_sem_sobreposicao exclude using gist (
    membro_id with =,
    tstzrange(inicio, fim, '[)') with &&
  ) where (status not in ('cancelado', 'faltou'))
);

alter table public.mensagens
  add constraint mensagens_agendamento_fk
  foreign key (agendamento_id) references public.agendamentos(id) on delete set null;

-- Itens do agendamento (vários serviços). Nome e preço são copiados
-- ("snapshot") para o histórico não mudar se o serviço for editado.
create table public.agendamento_servicos (
  id               uuid primary key default gen_random_uuid(),
  agendamento_id   uuid not null references public.agendamentos(id) on delete cascade,
  barbearia_id     uuid not null references public.barbearias(id) on delete cascade,
  servico_id       uuid references public.servicos(id) on delete set null,
  nome             text not null,
  preco_centavos   integer not null check (preco_centavos >= 0),
  duracao_min      integer not null check (duracao_min > 0),
  ordem            smallint not null default 0
);

create table public.lista_espera (
  id               uuid primary key default gen_random_uuid(),
  barbearia_id     uuid not null references public.barbearias(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  membro_id        uuid references public.membros(id) on delete set null,  -- nulo = qualquer barbeiro
  servico_id       uuid references public.servicos(id) on delete set null,
  data             date not null,
  hora_de          time,
  hora_ate         time,
  status           public.status_lista_espera not null default 'aguardando',
  avisado_em       timestamptz,
  agendamento_id   uuid references public.agendamentos(id) on delete set null,  -- virou agendamento
  criado_em        timestamptz not null default now()
);

-- D08 promoção de horários vazios
create table public.promocoes (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  nome            text not null,
  dia_semana      smallint check (dia_semana between 0 and 6),
  hora_inicio     time,
  hora_fim        time,
  servico_id      uuid references public.servicos(id) on delete cascade,  -- nulo = todos
  tipo            public.tipo_desconto not null,
  valor           integer not null check (valor > 0),
  valido_ate      date,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. CAIXA: comandas (pagamento só confirmado, não processado)
-- ---------------------------------------------------------------------
create table public.produtos (
  id                     uuid primary key default gen_random_uuid(),
  barbearia_id           uuid not null references public.barbearias(id) on delete cascade,
  nome                   text not null,
  preco_venda_centavos   integer not null check (preco_venda_centavos >= 0),
  custo_centavos         integer check (custo_centavos >= 0),
  estoque_atual          integer not null default 0,
  estoque_minimo         integer not null default 0,
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now()
);

-- Clube de assinatura (o cliente paga o barbeiro por fora; o barbeiro
-- confirma o pagamento do mês em pagamentos_clube).
create table public.planos_clube (
  id                uuid primary key default gen_random_uuid(),
  barbearia_id      uuid not null references public.barbearias(id) on delete cascade,
  nome              text not null,
  descricao         text,
  preco_centavos    integer not null check (preco_centavos >= 0),
  usos_por_mes      integer,                 -- nulo = ilimitado
  servicos_ids      uuid[] not null default '{}',   -- serviços cobertos
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);

create table public.assinaturas_clube (
  id                  uuid primary key default gen_random_uuid(),
  barbearia_id        uuid not null references public.barbearias(id) on delete cascade,
  cliente_id          uuid not null references public.clientes(id) on delete cascade,
  plano_clube_id      uuid not null references public.planos_clube(id) on delete restrict,
  status              public.status_assin_clube not null default 'ativa',
  inicio              date not null default current_date,
  dia_vencimento      smallint not null check (dia_vencimento between 1 and 28),
  cancelada_em        timestamptz,
  criado_em           timestamptz not null default now()
);

create table public.pagamentos_clube (
  id                  uuid primary key default gen_random_uuid(),
  barbearia_id        uuid not null references public.barbearias(id) on delete cascade,
  assinatura_clube_id uuid not null references public.assinaturas_clube(id) on delete cascade,
  competencia         date not null,          -- sempre dia 1 do mês: 2026-10-01
  valor_centavos      integer not null check (valor_centavos >= 0),
  status              public.status_pgto_interno not null default 'pendente',
  forma_pagamento     public.forma_pagamento,
  pago_em             timestamptz,
  confirmado_por      uuid references public.perfis(id),
  unique (assinatura_clube_id, competencia)
);

-- D09 vale-presente: vendido no balcão, usado depois como forma de pagamento.
create table public.vales_presente (
  id                  uuid primary key default gen_random_uuid(),
  barbearia_id        uuid not null references public.barbearias(id) on delete cascade,
  codigo              text not null,
  valor_centavos      integer not null check (valor_centavos > 0),
  saldo_centavos      integer not null check (saldo_centavos >= 0),
  comprador_id        uuid references public.clientes(id) on delete set null,
  beneficiario_nome   text,
  status              public.status_vale not null default 'ativo',
  valido_ate          date,
  criado_em           timestamptz not null default now(),
  unique (barbearia_id, codigo)
);

create table public.comandas (
  id                  uuid primary key default gen_random_uuid(),
  barbearia_id        uuid not null references public.barbearias(id) on delete cascade,
  agendamento_id      uuid unique references public.agendamentos(id) on delete set null,  -- nulo = venda avulsa
  cliente_id          uuid references public.clientes(id) on delete set null,
  membro_id           uuid not null references public.membros(id) on delete restrict,
  status              public.status_comanda not null default 'aberta',
  subtotal_centavos   integer not null default 0,
  desconto_centavos   integer not null default 0 check (desconto_centavos >= 0),
  total_centavos      integer not null default 0,
  forma_pagamento     public.forma_pagamento,
  cupom_id            uuid references public.cupons(id) on delete set null,
  vale_presente_id    uuid references public.vales_presente(id) on delete set null,
  observacao          text,
  pago_em             timestamptz,          -- quando o barbeiro confirmou que recebeu
  confirmado_por      uuid references public.perfis(id),
  criado_em           timestamptz not null default now(),
  check (status <> 'paga' or (forma_pagamento is not null and pago_em is not null))
);

create table public.comanda_itens (
  id                   uuid primary key default gen_random_uuid(),
  comanda_id           uuid not null references public.comandas(id) on delete cascade,
  barbearia_id         uuid not null references public.barbearias(id) on delete cascade,
  tipo                 public.tipo_item_comanda not null,
  servico_id           uuid references public.servicos(id) on delete set null,
  produto_id           uuid references public.produtos(id) on delete set null,
  vale_presente_id     uuid references public.vales_presente(id) on delete set null,  -- venda de vale
  assinatura_clube_id  uuid references public.assinaturas_clube(id) on delete set null, -- uso do clube
  membro_id            uuid references public.membros(id) on delete set null,          -- quem fez/vendeu
  descricao            text not null,
  quantidade           integer not null default 1 check (quantidade > 0),
  preco_unit_centavos  integer not null check (preco_unit_centavos >= 0),
  total_centavos       integer generated always as (quantidade * preco_unit_centavos) stored,
  comissao_pct         numeric(5,2) not null default 0,     -- snapshot da comissão no dia
  comissao_centavos    integer generated always as (round(quantidade * preco_unit_centavos * comissao_pct / 100)::integer) stored,
  check (
    (tipo = 'servico'       and produto_id is null) or
    (tipo = 'produto'       and produto_id is not null) or
    (tipo = 'vale_presente' and vale_presente_id is not null)
  )
);

create table public.movimentacoes_estoque (
  id               uuid primary key default gen_random_uuid(),
  barbearia_id     uuid not null references public.barbearias(id) on delete cascade,
  produto_id       uuid not null references public.produtos(id) on delete cascade,
  tipo             public.tipo_mov_estoque not null,
  quantidade       integer not null,     -- positivo entra, negativo sai
  comanda_item_id  uuid references public.comanda_itens(id) on delete set null,
  observacao       text,
  criado_por       uuid references public.perfis(id),
  criado_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. FINANCEIRO INTERNO
-- ---------------------------------------------------------------------
create table public.despesas (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  membro_id       uuid references public.membros(id) on delete set null,  -- cadeira alugada: despesa do barbeiro
  descricao       text not null,
  categoria       text not null default 'outros',   -- aluguel, produtos, contas, marketing...
  valor_centavos  integer not null check (valor_centavos > 0),
  data            date not null default current_date,
  pago            boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- S07 modo cadeira alugada: cobrança mensal do dono para o barbeiro.
create table public.alugueis_cadeira (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  membro_id       uuid not null references public.membros(id) on delete cascade,
  competencia     date not null,
  valor_centavos  integer not null check (valor_centavos >= 0),
  vencimento      date not null,
  status          public.status_pgto_interno not null default 'pendente',
  pago_em         timestamptz,
  unique (membro_id, competencia)
);

-- D06 fechamento de pagamento da equipe (comissões do período).
create table public.repasses (
  id                     uuid primary key default gen_random_uuid(),
  barbearia_id           uuid not null references public.barbearias(id) on delete cascade,
  membro_id              uuid not null references public.membros(id) on delete cascade,
  periodo_inicio         date not null,
  periodo_fim            date not null,
  total_comissoes_centavos integer not null default 0,
  descontos_centavos     integer not null default 0,   -- vales, adiantamentos
  valor_final_centavos   integer not null default 0,
  status                 public.status_pgto_interno not null default 'pendente',
  pago_em                timestamptz,
  criado_em              timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio)
);

-- ---------------------------------------------------------------------
-- 9. FIDELIZAÇÃO E RELACIONAMENTO
-- ---------------------------------------------------------------------
create table public.programas_fidelidade (
  barbearia_id          uuid primary key references public.barbearias(id) on delete cascade,
  tipo                  public.tipo_programa_fidel not null default 'cartao_visitas',
  pontos_por_real       numeric(6,2) default 1,      -- tipo pontos
  visitas_para_premio   integer default 10,          -- tipo cartão: 10 cortes = 1 grátis
  pontos_por_indicacao  integer not null default 0,
  premio_descricao      text not null default 'Corte grátis',
  ativo                 boolean not null default false
);

-- Extrato de pontos. Saldo = soma de "pontos" do cliente. Nunca se edita
-- uma linha; corrige-se com outra linha (tipo ajuste).
create table public.fidelidade_movimentos (
  id            uuid primary key default gen_random_uuid(),
  barbearia_id  uuid not null references public.barbearias(id) on delete cascade,
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  tipo          public.tipo_mov_fidelidade not null,
  pontos        integer not null,
  comanda_id    uuid references public.comandas(id) on delete set null,
  observacao    text,
  criado_em     timestamptz not null default now()
);

create table public.avaliacoes (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  agendamento_id  uuid not null unique references public.agendamentos(id) on delete cascade,
  cliente_id      uuid references public.clientes(id) on delete set null,
  membro_id       uuid references public.membros(id) on delete set null,
  nota            smallint not null check (nota between 1 and 5),
  comentario      text,
  publica         boolean not null default false,   -- dono escolhe exibir no perfil
  criado_em       timestamptz not null default now()
);

-- D07 portfólio de cortes (arquivo fica no Supabase Storage, bucket "portfolio").
create table public.fotos_portfolio (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  membro_id       uuid references public.membros(id) on delete cascade,
  caminho_storage text not null,
  legenda         text,
  publica         boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. MENSALIDADE DO KORT (único pagamento que passa pelo sistema)
-- ---------------------------------------------------------------------
create table public.assinaturas_saas (
  id                   uuid primary key default gen_random_uuid(),
  barbearia_id         uuid not null unique references public.barbearias(id) on delete cascade,
  plano_id             uuid not null references public.planos(id),
  status               public.status_assin_saas not null default 'teste',
  teste_ate            date,
  dia_vencimento       smallint not null default 10 check (dia_vencimento between 1 and 28),
  proximo_vencimento   date,
  cancelada_em         timestamptz,
  motivo_cancelamento  text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

create table public.faturas (
  id                  uuid primary key default gen_random_uuid(),
  barbearia_id        uuid not null references public.barbearias(id) on delete cascade,
  assinatura_id       uuid not null references public.assinaturas_saas(id) on delete cascade,
  competencia         date not null,
  valor_centavos      integer not null check (valor_centavos >= 0),
  vencimento          date not null,
  status              public.status_fatura not null default 'aberta',
  provedor            public.provedor_cobranca not null default 'pix_manual',
  txid                text unique,          -- identificador do Pix (até 25 caracteres)
  pix_copia_cola      text,                 -- BR Code gerado com a chave Pix da sua conta Nu
  id_externo          text,                 -- id da cobrança no gateway, se usar um
  pago_em             timestamptz,
  confirmado_por      uuid references public.perfis(id),  -- você, quando a baixa é manual
  comprovante_url     text,
  criado_em           timestamptz not null default now(),
  unique (assinatura_id, competencia)
);

-- Notificações recebidas de um gateway (se um dia usar). Guardar o bruto
-- permite reprocessar e evita baixar a mesma fatura duas vezes.
create table public.webhook_eventos (
  id            bigint generated always as identity primary key,
  provedor      public.provedor_cobranca not null,
  id_evento     text not null,
  tipo          text,
  payload       jsonb not null,
  processado    boolean not null default false,
  erro          text,
  recebido_em   timestamptz not null default now(),
  unique (provedor, id_evento)
);

-- ---------------------------------------------------------------------
-- 11. PAINEL ADMIN KORT: eventos de uso, sugestões, auditoria
-- ---------------------------------------------------------------------
-- A06: uma linha por ação importante. Base do ranking de funcionalidades
-- e do alerta de risco de cancelamento.
-- Nomes sugeridos: 'agendamento.criado', 'comanda.paga', 'lembrete.enviado',
-- 'fidelidade.resgate', 'clube.assinatura_criada', 'relatorio.aberto',
-- 'status_horarios.gerado', 'login'...
create table public.eventos (
  id            bigint generated always as identity primary key,
  barbearia_id  uuid references public.barbearias(id) on delete cascade,
  perfil_id     uuid references public.perfis(id) on delete set null,
  evento        text not null,
  modulo        text generated always as (split_part(evento, '.', 1)) stored,
  metadados     jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now()
);

create table public.sugestoes (
  id            uuid primary key default gen_random_uuid(),
  barbearia_id  uuid references public.barbearias(id) on delete set null,
  perfil_id     uuid references public.perfis(id) on delete set null,
  titulo        text not null,
  descricao     text,
  status        public.status_sugestao not null default 'nova',
  criado_em     timestamptz not null default now()
);

create table public.sugestao_votos (
  sugestao_id   uuid not null references public.sugestoes(id) on delete cascade,
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (sugestao_id, perfil_id)
);

-- A09: tudo que o super admin faz numa conta fica registrado.
create table public.admin_logs (
  id            bigint generated always as identity primary key,
  admin_id      uuid not null references public.perfis(id),
  barbearia_id  uuid references public.barbearias(id) on delete set null,
  acao          text not null,        -- 'suspender', 'estender_teste', 'trocar_plano', 'acessar_como', 'baixa_fatura'
  detalhes      jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 12. ÍNDICES (para as consultas mais frequentes)
-- ---------------------------------------------------------------------
create index on public.membros (barbearia_id);
create index on public.membros (perfil_id);
create index on public.jornadas (membro_id, dia_semana);
create index on public.bloqueios (barbearia_id, inicio);
create index on public.servicos (barbearia_id) where ativo;
create index on public.clientes (barbearia_id, proximo_retorno_previsto);
create index on public.clientes (barbearia_id, nome);
create index on public.agendamentos (barbearia_id, inicio);
create index on public.agendamentos (membro_id, inicio);
create index on public.agendamentos (cliente_id, inicio desc);
create index on public.agendamento_servicos (agendamento_id);
create index on public.lista_espera (barbearia_id, data) where status = 'aguardando';
create index on public.comandas (barbearia_id, pago_em) where status = 'paga';
create index on public.comandas (membro_id, pago_em);
create index on public.comanda_itens (comanda_id);
create index on public.movimentacoes_estoque (produto_id, criado_em);
create index on public.despesas (barbearia_id, data);
create index on public.fidelidade_movimentos (cliente_id);
create index on public.mensagens (status, agendada_para) where status = 'pendente';  -- fila de envio
create index on public.mensagens (barbearia_id, criado_em);
create index on public.faturas (status, vencimento);
create index on public.eventos (barbearia_id, criado_em desc);
create index on public.eventos (evento, criado_em desc);

-- ---------------------------------------------------------------------
-- 13. FUNÇÕES AUXILIARES DE PERMISSÃO (usadas pelo RLS)
--     security definer: rodam com permissão do dono da função e por isso
--     conseguem consultar "membros" sem cair em recursão de RLS.
-- ---------------------------------------------------------------------
create or replace function privado.eh_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select super_admin from public.perfis where id = auth.uid()), false);
$$;

-- É membro ativo da barbearia (qualquer papel)?
create or replace function privado.eh_membro(p_barbearia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros
    where barbearia_id = p_barbearia and perfil_id = auth.uid() and ativo
  );
$$;

create or replace function privado.eh_dono(p_barbearia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros
    where barbearia_id = p_barbearia and perfil_id = auth.uid() and ativo and papel = 'dono'
  );
$$;

-- Pode ver dados ligados a um barbeiro específico?
-- Modo equipe ou solo: qualquer membro vê tudo da barbearia.
-- Modo cadeira alugada: o barbeiro só vê o que é dele; dono e recepção veem tudo.
create or replace function privado.pode_ver_do_membro(p_barbearia uuid, p_membro uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.membros m
    join public.barbearias b on b.id = m.barbearia_id
    where m.barbearia_id = p_barbearia and m.perfil_id = auth.uid() and m.ativo
      and ( b.modo_operacao in ('equipe', 'solo')
            or m.papel in ('dono', 'recepcao')
            or p_membro is null
            or m.id = p_membro )
  );
$$;

-- Barbearia visível na página pública? (publicada e com assinatura válida)
create or replace function privado.barbearia_publica(p_barbearia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.barbearias b
    join public.assinaturas_saas a on a.barbearia_id = b.id
    where b.id = p_barbearia and b.publicada and a.status in ('teste', 'ativa', 'inadimplente')
  );
$$;

-- ---------------------------------------------------------------------
-- 14. TRIGGERS
-- ---------------------------------------------------------------------

-- 14.1 atualizado_em automático
create or replace function privado.tg_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger tg_barbearias_atualizado before update on public.barbearias
  for each row execute function privado.tg_atualizado_em();
create trigger tg_agendamentos_atualizado before update on public.agendamentos
  for each row execute function privado.tg_atualizado_em();
create trigger tg_assinaturas_atualizado before update on public.assinaturas_saas
  for each row execute function privado.tg_atualizado_em();
create trigger tg_membro_config_atualizado before update on public.membro_configuracoes
  for each row execute function privado.tg_atualizado_em();

-- 14.2 Novo usuário no Supabase Auth -> cria o perfil
create or replace function privado.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome, telefone)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'nome', ''),
          new.raw_user_meta_data ->> 'telefone');
  return new;
end $$;

create trigger tg_auth_novo_usuario after insert on auth.users
  for each row execute function privado.tg_novo_usuario();

-- 14.3 Nova barbearia -> quem criou vira dono + assinatura em teste de 14 dias
create or replace function privado.tg_nova_barbearia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plano uuid;
  v_nome  text;
  v_membro uuid;
begin
  if new.criado_por is not null then
    select nome into v_nome from public.perfis where id = new.criado_por;
    insert into public.membros (barbearia_id, perfil_id, papel, nome_exibicao)
    values (new.id, new.criado_por, 'dono', coalesce(nullif(v_nome, ''), 'Dono'))
    returning id into v_membro;   -- configurações criadas pelo trigger tg_membro_criado
  end if;

  select id into v_plano from public.planos where slug = 'barbearia' and ativo;
  if v_plano is null then
    select id into v_plano from public.planos where ativo order by preco_centavos desc limit 1;
  end if;
  if v_plano is not null then
    insert into public.assinaturas_saas (barbearia_id, plano_id, status, teste_ate)
    values (new.id, v_plano, 'teste', current_date + 14);
  end if;
  return new;
end $$;

create trigger tg_barbearia_criada after insert on public.barbearias
  for each row execute function privado.tg_nova_barbearia();

-- 14.4 Novo membro -> cria a linha de configurações dele
create or replace function privado.tg_novo_membro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.membro_configuracoes (membro_id, barbearia_id)
  values (new.id, new.barbearia_id)
  on conflict (membro_id) do nothing;
  return new;
end $$;

create trigger tg_membro_criado after insert on public.membros
  for each row execute function privado.tg_novo_membro();

-- 14.5 Comanda confirmada como paga -> atualiza cliente, estoque,
--      fidelidade, conclui o agendamento e registra o evento.
create or replace function privado.tg_comanda_paga()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prog  public.programas_fidelidade%rowtype;
  v_cli   public.clientes%rowtype;
  v_pontos integer;
begin
  if new.status = 'paga' and old.status is distinct from 'paga' then

    -- cliente: visitas, gasto, frequência média e próximo retorno previsto
    if new.cliente_id is not null then
      select * into v_cli from public.clientes where id = new.cliente_id for update;
      update public.clientes c set
        total_visitas        = c.total_visitas + 1,
        total_gasto_centavos = c.total_gasto_centavos + new.total_centavos,
        primeira_visita_em   = coalesce(c.primeira_visita_em, new.pago_em),
        ultima_visita_em     = new.pago_em,
        frequencia_media_dias = case
          when c.total_visitas >= 1 and c.primeira_visita_em is not null then
            round((extract(epoch from (new.pago_em - c.primeira_visita_em)) / 86400.0 / c.total_visitas)::numeric, 1)
          else c.frequencia_media_dias end
      where c.id = new.cliente_id;

      update public.clientes c set
        proximo_retorno_previsto = (new.pago_em at time zone 'America/Sao_Paulo')::date
                                   + coalesce(round(c.frequencia_media_dias)::integer, 30)
      where c.id = new.cliente_id;

      -- fidelidade
      select * into v_prog from public.programas_fidelidade
      where barbearia_id = new.barbearia_id and ativo;
      if found then
        v_pontos := case v_prog.tipo
          when 'pontos' then floor(new.total_centavos / 100.0 * coalesce(v_prog.pontos_por_real, 0))::integer
          else 1 end;   -- cartão de visitas: 1 carimbo por atendimento
        if v_pontos > 0 then
          insert into public.fidelidade_movimentos (barbearia_id, cliente_id, tipo, pontos, comanda_id)
          values (new.barbearia_id, new.cliente_id, 'atendimento', v_pontos, new.id);
        end if;
      end if;
    end if;

    -- estoque: baixa dos produtos vendidos
    insert into public.movimentacoes_estoque (barbearia_id, produto_id, tipo, quantidade, comanda_item_id, criado_por)
    select i.barbearia_id, i.produto_id, 'venda', -i.quantidade, i.id, new.confirmado_por
    from public.comanda_itens i
    where i.comanda_id = new.id and i.tipo = 'produto' and i.produto_id is not null;

    update public.produtos p set estoque_atual = p.estoque_atual - s.qtd
    from (select produto_id, sum(quantidade) qtd from public.comanda_itens
          where comanda_id = new.id and tipo = 'produto' and produto_id is not null
          group by produto_id) s
    where p.id = s.produto_id;

    -- agendamento ligado vira "concluído"
    if new.agendamento_id is not null then
      update public.agendamentos set status = 'concluido'
      where id = new.agendamento_id and status not in ('cancelado', 'faltou');
    end if;

    insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
    values (new.barbearia_id, new.confirmado_por, 'comanda.paga',
            jsonb_build_object('comanda_id', new.id, 'total', new.total_centavos, 'forma', new.forma_pagamento));
  end if;
  return new;
end $$;

create trigger tg_comanda_status after update of status on public.comandas
  for each row execute function privado.tg_comanda_paga();

-- 14.6 Recalcula subtotal/total da comanda quando os itens mudam
create or replace function privado.tg_totaliza_comanda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(new.comanda_id, old.comanda_id);
begin
  update public.comandas c set
    subtotal_centavos = s.soma,
    total_centavos    = greatest(s.soma - c.desconto_centavos, 0)
  from (select coalesce(sum(total_centavos), 0)::integer soma
        from public.comanda_itens where comanda_id = v_id) s
  where c.id = v_id and c.status = 'aberta';
  return null;
end $$;

create trigger tg_itens_totaliza after insert or update or delete on public.comanda_itens
  for each row execute function privado.tg_totaliza_comanda();

-- 14.7 Registro automático de eventos-chave (não depende do front lembrar)
create or replace function privado.tg_evento_agendamento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
    values (new.barbearia_id, auth.uid(), 'agendamento.criado',
            jsonb_build_object('agendamento_id', new.id, 'origem', new.origem));
  elsif new.status is distinct from old.status and new.status in ('cancelado', 'faltou') then
    insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
    values (new.barbearia_id, auth.uid(), 'agendamento.' || new.status::text,
            jsonb_build_object('agendamento_id', new.id));
  end if;
  return new;
end $$;

create trigger tg_agendamento_evento after insert or update of status on public.agendamentos
  for each row execute function privado.tg_evento_agendamento();

-- ---------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY
--     Regra geral: membro vê os dados da própria barbearia; financeiro
--     sensível só o dono; super admin lê tudo. A página pública
--     (usuário anônimo) só lê barbearia, serviços, barbeiros, horários,
--     avaliações públicas e portfólio.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'planos','perfis','barbearias','membros','membro_configuracoes','horarios_funcionamento',
    'jornadas','bloqueios','servicos','servico_membros','clientes','modelos_mensagem','mensagens',
    'cupons','agendamentos','agendamento_servicos','lista_espera','promocoes','produtos',
    'planos_clube','assinaturas_clube','pagamentos_clube','vales_presente','comandas',
    'comanda_itens','movimentacoes_estoque','despesas','alugueis_cadeira','repasses',
    'programas_fidelidade','fidelidade_movimentos','avaliacoes','fotos_portfolio',
    'assinaturas_saas','faturas','webhook_eventos','eventos','sugestoes','sugestao_votos','admin_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Planos: todos leem (página de preços); só super admin altera.
create policy planos_leitura on public.planos for select using (true);
create policy planos_admin   on public.planos for all
  using (privado.eh_super_admin()) with check (privado.eh_super_admin());

-- Perfis: cada um o seu; colegas da mesma barbearia podem ver o nome.
create policy perfis_proprio on public.perfis for select
  using (id = auth.uid() or privado.eh_super_admin()
         or exists (select 1 from public.membros m
                    where m.perfil_id = perfis.id and privado.eh_membro(m.barbearia_id)));
create policy perfis_editar on public.perfis for update
  using (id = auth.uid())
  with check (id = auth.uid() and (super_admin = false or privado.eh_super_admin()));  -- ninguém se promove a admin

-- Barbearias
create policy barbearias_publica on public.barbearias for select
  using (privado.barbearia_publica(id) or privado.eh_membro(id) or privado.eh_super_admin()
         or criado_por = auth.uid());   -- permite o "insert ... returning" logo após criar
create policy barbearias_criar on public.barbearias for insert to authenticated
  with check (criado_por = auth.uid());
create policy barbearias_editar on public.barbearias for update
  using (privado.eh_dono(id) or privado.eh_super_admin());

-- Membros (dados de vitrine: nome, foto, bio)
create policy membros_leitura on public.membros for select
  using ((ativo and atende and privado.barbearia_publica(barbearia_id))
         or privado.eh_membro(barbearia_id) or privado.eh_super_admin());
create policy membros_gestao on public.membros for all
  using (privado.eh_dono(barbearia_id)) with check (privado.eh_dono(barbearia_id));

-- Configurações do membro: dono vê e edita todas; barbeiro vê só a própria.
create policy membro_cfg_leitura on public.membro_configuracoes for select
  using (privado.eh_dono(barbearia_id) or privado.eh_super_admin()
         or exists (select 1 from public.membros m where m.id = membro_id and m.perfil_id = auth.uid()));
create policy membro_cfg_gestao on public.membro_configuracoes for all
  using (privado.eh_dono(barbearia_id)) with check (privado.eh_dono(barbearia_id));

-- Tabelas de vitrine: leitura pública, escrita pelo dono.
do $$
declare t text;
begin
  foreach t in array array['horarios_funcionamento','servicos','servico_membros','jornadas','promocoes'] loop
    execute format($f$
      create policy %1$s_leitura on public.%1$I for select
        using (privado.barbearia_publica(barbearia_id) or privado.eh_membro(barbearia_id) or privado.eh_super_admin());
      create policy %1$s_gestao on public.%1$I for all
        using (privado.eh_dono(barbearia_id)) with check (privado.eh_dono(barbearia_id));
    $f$, t);
  end loop;
end $$;

-- Bloqueios: equipe gerencia (o barbeiro bloqueia a própria agenda).
create policy bloqueios_equipe on public.bloqueios for all
  using (privado.eh_membro(barbearia_id) or privado.eh_super_admin())
  with check (privado.eh_dono(barbearia_id)
              or exists (select 1 from public.membros m where m.id = membro_id and m.perfil_id = auth.uid()));

-- Operação do dia a dia: qualquer membro da barbearia.
do $$
declare t text;
begin
  foreach t in array array['modelos_mensagem','mensagens','cupons','agendamento_servicos','lista_espera',
                           'produtos','movimentacoes_estoque','planos_clube','assinaturas_clube',
                           'pagamentos_clube','vales_presente','programas_fidelidade',
                           'fidelidade_movimentos'] loop
    execute format($f$
      create policy %1$s_equipe on public.%1$I for all
        using (privado.eh_membro(barbearia_id) or privado.eh_super_admin())
        with check (privado.eh_membro(barbearia_id));
    $f$, t);
  end loop;
end $$;

-- Dados que respeitam o modo cadeira alugada.
create policy clientes_equipe on public.clientes for all
  using (privado.pode_ver_do_membro(barbearia_id, membro_responsavel_id) or privado.eh_super_admin())
  with check (privado.pode_ver_do_membro(barbearia_id, membro_responsavel_id));

create policy agendamentos_equipe on public.agendamentos for all
  using (privado.pode_ver_do_membro(barbearia_id, membro_id) or privado.eh_super_admin())
  with check (privado.pode_ver_do_membro(barbearia_id, membro_id));

create policy comandas_equipe on public.comandas for all
  using (privado.pode_ver_do_membro(barbearia_id, membro_id) or privado.eh_super_admin())
  with check (privado.pode_ver_do_membro(barbearia_id, membro_id));

create policy comanda_itens_equipe on public.comanda_itens for all
  using (exists (select 1 from public.comandas c where c.id = comanda_id
                 and (privado.pode_ver_do_membro(c.barbearia_id, c.membro_id) or privado.eh_super_admin())))
  with check (exists (select 1 from public.comandas c where c.id = comanda_id
                 and privado.pode_ver_do_membro(c.barbearia_id, c.membro_id)));

-- Financeiro sensível: só o dono (barbeiro vê o próprio aluguel/repasse).
create policy despesas_dono on public.despesas for all
  using (privado.eh_dono(barbearia_id) or privado.eh_super_admin())
  with check (privado.eh_dono(barbearia_id));

do $$
declare t text;
begin
  foreach t in array array['alugueis_cadeira','repasses'] loop
    execute format($f$
      create policy %1$s_leitura on public.%1$I for select
        using (privado.eh_dono(barbearia_id) or privado.eh_super_admin()
               or exists (select 1 from public.membros m where m.id = membro_id and m.perfil_id = auth.uid()));
      create policy %1$s_gestao on public.%1$I for all
        using (privado.eh_dono(barbearia_id)) with check (privado.eh_dono(barbearia_id));
    $f$, t);
  end loop;
end $$;

-- Avaliações e portfólio: públicas quando marcadas; equipe gerencia.
create policy avaliacoes_leitura on public.avaliacoes for select
  using ((publica and privado.barbearia_publica(barbearia_id)) or privado.eh_membro(barbearia_id) or privado.eh_super_admin());
create policy avaliacoes_gestao on public.avaliacoes for update
  using (privado.eh_dono(barbearia_id));

create policy portfolio_leitura on public.fotos_portfolio for select
  using ((publica and privado.barbearia_publica(barbearia_id)) or privado.eh_membro(barbearia_id) or privado.eh_super_admin());
create policy portfolio_gestao on public.fotos_portfolio for all
  using (privado.eh_membro(barbearia_id)) with check (privado.eh_membro(barbearia_id));

-- Mensalidade do Kort: dono só lê; quem altera é o super admin
-- (ou o backend com a service_role key, que ignora RLS).
create policy assinatura_leitura on public.assinaturas_saas for select
  using (privado.eh_dono(barbearia_id) or privado.eh_super_admin());
create policy assinatura_admin on public.assinaturas_saas for all
  using (privado.eh_super_admin()) with check (privado.eh_super_admin());

create policy faturas_leitura on public.faturas for select
  using (privado.eh_dono(barbearia_id) or privado.eh_super_admin());
create policy faturas_admin on public.faturas for all
  using (privado.eh_super_admin()) with check (privado.eh_super_admin());

create policy webhook_admin on public.webhook_eventos for all
  using (privado.eh_super_admin()) with check (privado.eh_super_admin());

-- Eventos: membro grava os da sua barbearia; só o super admin lê.
create policy eventos_gravar on public.eventos for insert to authenticated
  with check (perfil_id = auth.uid() and (barbearia_id is null or privado.eh_membro(barbearia_id)));
create policy eventos_admin on public.eventos for select
  using (privado.eh_super_admin());

-- Sugestões: qualquer usuário logado lê, cria e vota; status é do admin.
create policy sugestoes_leitura on public.sugestoes for select to authenticated using (true);
create policy sugestoes_criar on public.sugestoes for insert to authenticated
  with check (perfil_id = auth.uid());
create policy sugestoes_admin on public.sugestoes for update
  using (privado.eh_super_admin());
create policy votos_leitura on public.sugestao_votos for select to authenticated using (true);
create policy votos_proprio on public.sugestao_votos for insert to authenticated
  with check (perfil_id = auth.uid());
create policy votos_remover on public.sugestao_votos for delete
  using (perfil_id = auth.uid());

create policy admin_logs_admin on public.admin_logs for all
  using (privado.eh_super_admin()) with check (privado.eh_super_admin() and admin_id = auth.uid());

-- ---------------------------------------------------------------------
-- 16. VIEWS
--     security_invoker = true: a view respeita o RLS de quem consulta.
--     As views admin_* só retornam dados para o super admin.
-- ---------------------------------------------------------------------

-- Saldo de fidelidade por cliente
create view public.saldo_fidelidade with (security_invoker = true) as
select barbearia_id, cliente_id, sum(pontos)::integer as saldo
from public.fidelidade_movimentos
group by barbearia_id, cliente_id;

-- Faturamento diário por barbeiro (base da meta do dia e dos relatórios)
create view public.faturamento_diario with (security_invoker = true) as
select c.barbearia_id,
       c.membro_id,
       (c.pago_em at time zone 'America/Sao_Paulo')::date as dia,
       count(*)::integer                as atendimentos,
       sum(c.total_centavos)::integer   as faturamento_centavos
from public.comandas c
where c.status = 'paga'
group by 1, 2, 3;

-- Comissões por barbeiro e dia
create view public.comissoes_diarias with (security_invoker = true) as
select i.barbearia_id,
       coalesce(i.membro_id, c.membro_id) as membro_id,
       (c.pago_em at time zone 'America/Sao_Paulo')::date as dia,
       sum(i.comissao_centavos)::integer as comissao_centavos
from public.comanda_itens i
join public.comandas c on c.id = i.comanda_id
where c.status = 'paga'
group by 1, 2, 3;

-- Clientes que passaram do próprio prazo de retorno (S05)
create view public.clientes_sumidos with (security_invoker = true) as
select cl.*, (current_date - cl.proximo_retorno_previsto) as dias_atrasado
from public.clientes cl
where cl.proximo_retorno_previsto < current_date
  and cl.aceita_mensagens;

-- A02: lista de barbearias para o painel admin
create view public.admin_barbearias with (security_invoker = true) as
select b.id,
       b.nome,
       b.slug,
       b.cidade,
       b.uf,
       b.criado_em,
       dono.nome_exibicao                                          as responsavel,
       p.nome                                                      as plano,
       a.status                                                    as status_assinatura,
       a.teste_ate,
       a.proximo_vencimento,
       (select count(*) from public.membros m where m.barbearia_id = b.id and m.ativo)        as barbeiros,
       (select count(*) from public.clientes c where c.barbearia_id = b.id)                   as clientes,
       (select count(*) from public.agendamentos ag
         where ag.barbearia_id = b.id and ag.criado_em > now() - interval '30 days')         as agendamentos_30d,
       (select max(e.criado_em) from public.eventos e where e.barbearia_id = b.id)            as ultimo_uso
from public.barbearias b
left join public.assinaturas_saas a on a.barbearia_id = b.id
left join public.planos p on p.id = a.plano_id
left join lateral (select m.nome_exibicao from public.membros m
                   where m.barbearia_id = b.id and m.papel = 'dono' order by m.criado_em limit 1) dono on true
where privado.eh_super_admin();

-- A04: funcionalidades mais usadas nos últimos 30 dias
create view public.admin_uso_funcionalidades with (security_invoker = true) as
select e.modulo,
       e.evento,
       count(*)::integer                       as total_30d,
       count(distinct e.barbearia_id)::integer as barbearias_que_usam
from public.eventos e
where e.criado_em > now() - interval '30 days'
  and privado.eh_super_admin()
group by e.modulo, e.evento
order by total_30d desc;

-- A05: indicadores do negócio Kort
create view public.admin_indicadores with (security_invoker = true) as
select
  coalesce(sum(p.preco_centavos) filter (where a.status = 'ativa'), 0)::integer         as mrr_centavos,
  count(*) filter (where a.status = 'ativa')::integer                                  as assinantes_ativos,
  count(*) filter (where a.status = 'teste')::integer                                  as em_teste,
  count(*) filter (where a.status = 'inadimplente')::integer                           as inadimplentes,
  count(*) filter (where a.criado_em >= date_trunc('month', now()))::integer           as novos_no_mes,
  count(*) filter (where a.cancelada_em >= date_trunc('month', now()))::integer        as cancelados_no_mes
from public.assinaturas_saas a
join public.planos p on p.id = a.plano_id
where privado.eh_super_admin();

-- A08: risco de cancelamento (sem uso há 7 dias, ou agendamentos da
-- última semana abaixo da metade da média das 4 anteriores)
create view public.admin_risco_cancelamento with (security_invoker = true) as
with uso as (
  select b.id as barbearia_id, b.nome,
         (select max(e.criado_em) from public.eventos e where e.barbearia_id = b.id) as ultimo_uso,
         (select count(*) from public.agendamentos ag where ag.barbearia_id = b.id
            and ag.criado_em > now() - interval '7 days')                            as ag_semana,
         (select count(*) / 4.0 from public.agendamentos ag where ag.barbearia_id = b.id
            and ag.criado_em between now() - interval '35 days' and now() - interval '7 days') as media_4_semanas
  from public.barbearias b
  join public.assinaturas_saas a on a.barbearia_id = b.id
  where a.status in ('teste', 'ativa', 'inadimplente')
)
select *,
       case
         when ultimo_uso is null or ultimo_uso < now() - interval '7 days' then 'sem uso há 7+ dias'
         when media_4_semanas >= 4 and ag_semana < media_4_semanas / 2 then 'queda forte de agendamentos'
       end as motivo
from uso
where privado.eh_super_admin()
  and ( ultimo_uso is null or ultimo_uso < now() - interval '7 days'
        or (media_4_semanas >= 4 and ag_semana < media_4_semanas / 2) );

-- ---------------------------------------------------------------------
-- 17. DADOS INICIAIS (planos - preços a definir na validação)
-- ---------------------------------------------------------------------
insert into public.planos (slug, nome, preco_centavos, max_barbeiros, max_agendamentos_mes, recursos) values
  ('gratis',    'Grátis',    0, 1, 50,    '{"lembretes":false,"caixa":false,"clube":false}'),
  ('solo',      'Solo',      0, 1, null,  '{"lembretes":true,"caixa":true,"clube":false}'),
  ('barbearia', 'Barbearia', 0, null, null, '{"lembretes":true,"caixa":true,"clube":true,"cadeira_alugada":true}'),
  ('pro',       'Pro',       0, null, null, '{"lembretes":true,"caixa":true,"clube":true,"cadeira_alugada":true,"multiunidade":true}');

-- Depois de criar sua conta no app, rode (trocando o e-mail):
-- update public.perfis set super_admin = true
-- where id = (select id from auth.users where email = 'seu-email@exemplo.com');
