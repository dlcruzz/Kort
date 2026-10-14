-- =====================================================================
--  KORT  |  Parte 2: tudo que faz o sistema funcionar só com o Supabase
--
--  Rode DEPOIS do schema.sql, no SQL Editor (colar inteiro > Run).
--  Pode rodar de novo sem problema: tudo aqui é "create or replace".
--
--  O que tem aqui:
--   1. Preços dos planos e ajustes de colunas
--   2. Página pública: dados da barbearia e agendamento pelo link
--      (o cliente não tem login; quem protege é a função)
--   3. "Meu horário": ver, remarcar e cancelar com o token do link
--   4. Cadastro da barbearia em uma chamada só (onboarding)
--   5. Limite do plano grátis
--   6. Mensalidade: escolher plano, "já paguei", rotina diária
--   7. Painel admin: baixa de fatura, suspender, estender teste
--   8. Tempo real da agenda e agendamento da rotina (pg_cron)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PLANOS E AJUSTES
-- ---------------------------------------------------------------------
update public.planos set preco_centavos = 0     where slug = 'gratis';
update public.planos set preco_centavos = 3990  where slug = 'solo';
update public.planos set preco_centavos = 7990  where slug = 'barbearia';
update public.planos set preco_centavos = 14990 where slug = 'pro';

-- Token do link "meu horário" (vai na URL que o cliente recebe)
alter table public.agendamentos
  add column if not exists token_publico text not null default replace(gen_random_uuid()::text, '-', '');

-- Barbeiro avisou que pagou a mensalidade (você confere e dá baixa)
alter table public.faturas add column if not exists informado_em timestamptz;

-- Convite para o barbeiro da equipe criar o próprio acesso. Fica nas
-- configurações do membro (só o dono lê), não em "membros" (que é público).
alter table public.membro_configuracoes
  add column if not exists convite_token text default replace(gen_random_uuid()::text, '-', '');

-- Barbearia parceira: acesso vitalício em troca de divulgação. Não gera
-- mensalidade, não entra na receita e a rotina diária nunca suspende.
alter table public.assinaturas_saas
  add column if not exists parceiro       boolean not null default false,
  add column if not exists parceiro_desde timestamptz,
  add column if not exists parceiro_obs   text;

-- ---------------------------------------------------------------------
-- 2. PÁGINA PÚBLICA
-- ---------------------------------------------------------------------

-- Dados que o cliente pode ver. Horários ocupados vão sem nome de ninguém.
create or replace function privado.dados_publicos(p_barbearia uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'barbearia', (
      select jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'nome', b.nome, 'descricao', b.descricao, 'telefone', b.telefone,
        'whatsapp', b.whatsapp, 'instagram', b.instagram, 'logradouro', b.logradouro, 'numero', b.numero,
        'bairro', b.bairro, 'cidade', b.cidade, 'uf', b.uf, 'logo_url', b.logo_url,
        'modo_operacao', b.modo_operacao, 'antecedencia_cancelamento_min', b.antecedencia_cancelamento_min,
        'antecedencia_max_dias', b.antecedencia_max_dias, 'intervalo_slots_min', b.intervalo_slots_min,
        'publicada', b.publicada, 'criado_em', b.criado_em)
      from public.barbearias b where b.id = p_barbearia),
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'barbearia_id', m.barbearia_id, 'perfil_id', null, 'papel', m.papel,
        'nome_exibicao', m.nome_exibicao, 'foto_url', m.foto_url, 'bio', m.bio, 'cor_agenda', m.cor_agenda,
        'atende', m.atende, 'ativo', m.ativo, 'ordem', m.ordem) order by m.ordem)
      from public.membros m where m.barbearia_id = p_barbearia and m.ativo and m.atende), '[]'),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'descricao', s.descricao, 'preco_centavos', s.preco_centavos,
        'duracao_min', s.duracao_min, 'intervalo_min', s.intervalo_min, 'ativo', s.ativo, 'ordem', s.ordem,
        'membros', coalesce((select jsonb_agg(sm.membro_id) from public.servico_membros sm where sm.servico_id = s.id), '[]'))
        order by s.ordem)
      from public.servicos s where s.barbearia_id = p_barbearia and s.ativo), '[]'),
    'horarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'dia_semana', h.dia_semana,
        'abre', to_char(h.abre, 'HH24:MI'), 'fecha', to_char(h.fecha, 'HH24:MI')))
      from public.horarios_funcionamento h where h.barbearia_id = p_barbearia), '[]'),
    'jornadas', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'membro_id', j.membro_id, 'dia_semana', j.dia_semana,
        'inicio', to_char(j.inicio, 'HH24:MI'), 'fim', to_char(j.fim, 'HH24:MI')))
      from public.jornadas j where j.barbearia_id = p_barbearia), '[]'),
    'ocupados', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'membro_id', a.membro_id, 'inicio', a.inicio, 'fim', a.fim, 'status', a.status))
      from public.agendamentos a
      where a.barbearia_id = p_barbearia and a.status not in ('cancelado', 'faltou')
        and a.fim > now() - interval '1 day' and a.inicio < now() + interval '62 days'), '[]'),
    'bloqueios', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'membro_id', x.membro_id, 'inicio', x.inicio, 'fim', x.fim))
      from public.bloqueios x
      where x.barbearia_id = p_barbearia and x.fim > now() - interval '1 day' and x.inicio < now() + interval '62 days'), '[]'),
    'avaliacoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'membro_id', v.membro_id, 'nota', v.nota,
        'comentario', case when v.publica then v.comentario end, 'publica', v.publica, 'criado_em', v.criado_em,
        'cliente_nome', case when v.publica then split_part(c.nome, ' ', 1) end) order by v.criado_em desc)
      from public.avaliacoes v left join public.clientes c on c.id = v.cliente_id
      where v.barbearia_id = p_barbearia), '[]')
  );
$$;

create or replace function public.pagina_publica(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.barbearias where slug = lower(trim(p_slug));
  if v_id is null or not privado.barbearia_publica(v_id) then
    return null;
  end if;
  return privado.dados_publicos(v_id);
end $$;

-- Confere se o horário cabe: dentro da jornada, sem bloqueio, no futuro e
-- dentro da janela da agenda. Conflito com outro cliente é a trava do banco.
create or replace function privado.validar_horario(
  p_barbearia uuid, p_membro uuid, p_inicio timestamptz, p_fim timestamptz)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  b public.barbearias%rowtype;
  v_ini timestamp; v_fim timestamp;
begin
  select * into b from public.barbearias where id = p_barbearia;
  if p_inicio < now() + interval '15 minutes' then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = 'P0001';
  end if;
  if p_inicio > now() + make_interval(days => b.antecedencia_max_dias + 1) then
    raise exception 'A agenda ainda não abriu para essa data.' using errcode = 'P0001';
  end if;
  v_ini := p_inicio at time zone b.fuso_horario;
  v_fim := p_fim at time zone b.fuso_horario;
  if v_ini::date <> v_fim::date or not exists (
    select 1 from public.jornadas j
    where j.membro_id = p_membro and j.dia_semana = extract(dow from v_ini)
      and j.inicio <= v_ini::time and j.fim >= v_fim::time
  ) then
    raise exception 'Esse horário está fora do expediente do barbeiro.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.bloqueios x
    where x.barbearia_id = p_barbearia and (x.membro_id is null or x.membro_id = p_membro)
      and tstzrange(x.inicio, x.fim, '[)') && tstzrange(p_inicio, p_fim, '[)')
  ) then
    raise exception 'O barbeiro não atende nesse horário. Escolha outro.' using errcode = 'P0001';
  end if;
end $$;

-- Agendamento pelo link. Cria o cliente pelo telefone se ainda não existe.
create or replace function public.agendar_publico(
  p_slug text, p_servicos uuid[], p_membro uuid, p_inicio timestamptz,
  p_nome text, p_telefone text, p_observacao text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_bar uuid; v_cli uuid; v_ag uuid; v_token text;
  v_dur integer; v_valor integer; v_qtd integer;
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '[^0-9+]', '', 'g');
  v_nome text := left(trim(coalesce(p_nome, '')), 80);
begin
  select id into v_bar from public.barbearias where slug = lower(trim(p_slug));
  if v_bar is null or not privado.barbearia_publica(v_bar) then
    raise exception 'Barbearia não encontrada.' using errcode = 'P0001';
  end if;
  if length(v_nome) < 2 then raise exception 'Escreva seu nome.' using errcode = 'P0001'; end if;
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then
    raise exception 'Confira o número com DDD.' using errcode = 'P0001';
  end if;
  if v_tel !~ '^\+' then v_tel := '+55' || v_tel; end if;
  if coalesce(array_length(p_servicos, 1), 0) = 0 or array_length(p_servicos, 1) > 6 then
    raise exception 'Escolha pelo menos um serviço.' using errcode = 'P0001';
  end if;

  -- serviços ativos da barbearia e feitos por esse barbeiro
  select count(*), sum(s.duracao_min), sum(s.preco_centavos) into v_qtd, v_dur, v_valor
  from public.servicos s
  where s.id = any(p_servicos) and s.barbearia_id = v_bar and s.ativo
    and exists (select 1 from public.servico_membros sm where sm.servico_id = s.id and sm.membro_id = p_membro);
  if v_qtd <> (select count(distinct x) from unnest(p_servicos) x) then
    raise exception 'Esse barbeiro não faz um dos serviços escolhidos.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membros where id = p_membro and barbearia_id = v_bar and ativo and atende) then
    raise exception 'Barbeiro não encontrado.' using errcode = 'P0001';
  end if;

  perform privado.validar_horario(v_bar, p_membro, p_inicio, p_inicio + make_interval(mins => v_dur));

  -- cliente (mesmo telefone = mesmo cliente)
  insert into public.clientes (barbearia_id, nome, telefone, membro_preferido_id, consentimento_lgpd_em)
  values (v_bar, v_nome, v_tel, p_membro, now())
  on conflict (barbearia_id, telefone) do update set consentimento_lgpd_em = now()
  returning id into v_cli;

  -- trava contra abuso: no máximo 3 horários futuros por telefone
  if (select count(*) from public.agendamentos
      where cliente_id = v_cli and inicio > now() and status in ('agendado', 'confirmado')) >= 3 then
    raise exception 'Você já tem 3 horários marcados aqui. Cancele um para marcar outro.' using errcode = 'P0001';
  end if;

  begin
    insert into public.agendamentos (barbearia_id, cliente_id, membro_id, inicio, fim, status, origem,
                                     valor_previsto_centavos, observacao_cliente)
    values (v_bar, v_cli, p_membro, p_inicio, p_inicio + make_interval(mins => v_dur), 'agendado', 'link',
            v_valor, nullif(left(trim(coalesce(p_observacao, '')), 300), ''))
    returning id, token_publico into v_ag, v_token;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.' using errcode = 'P0001';
  end;

  insert into public.agendamento_servicos (agendamento_id, barbearia_id, servico_id, nome, preco_centavos, duracao_min, ordem)
  select v_ag, v_bar, s.id, s.nome, s.preco_centavos, s.duracao_min, array_position(p_servicos, s.id)
  from public.servicos s where s.id = any(p_servicos);

  return jsonb_build_object('id', v_ag, 'token', v_token, 'cliente_id', v_cli);
end $$;

-- ---------------------------------------------------------------------
-- 3. MEU HORÁRIO (link com token)
-- ---------------------------------------------------------------------
create or replace function privado.agendamento_do_token(p_id uuid, p_token text)
returns public.agendamentos language plpgsql stable security definer set search_path = '' as $$
declare a public.agendamentos%rowtype;
begin
  select * into a from public.agendamentos where id = p_id and token_publico = p_token;
  if not found then
    raise exception 'Horário não encontrado. Confira o link.' using errcode = 'P0001';
  end if;
  return a;
end $$;

create or replace function public.meu_horario(p_id uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.agendamentos%rowtype;
begin
  begin
    a := privado.agendamento_do_token(p_id, p_token);
  exception when others then
    return null;
  end;
  return privado.dados_publicos(a.barbearia_id) || jsonb_build_object(
    'agendamento', jsonb_build_object(
      'id', a.id, 'cliente_id', a.cliente_id, 'membro_id', a.membro_id, 'inicio', a.inicio, 'fim', a.fim,
      'status', a.status, 'origem', a.origem, 'valor_previsto_centavos', a.valor_previsto_centavos,
      'observacao_cliente', a.observacao_cliente, 'confirmado_em', a.confirmado_em, 'criado_em', a.criado_em,
      'servicos', coalesce((select jsonb_agg(jsonb_build_object('servico_id', s.servico_id, 'nome', s.nome,
                    'preco_centavos', s.preco_centavos, 'duracao_min', s.duracao_min) order by s.ordem)
                  from public.agendamento_servicos s where s.agendamento_id = a.id), '[]')));
end $$;

create or replace function privado.pode_mudar(a public.agendamentos)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_min integer;
begin
  if a.status not in ('agendado', 'confirmado') then
    raise exception 'Esse horário não pode mais ser mudado.' using errcode = 'P0001';
  end if;
  select antecedencia_cancelamento_min into v_min from public.barbearias where id = a.barbearia_id;
  if a.inicio < now() + make_interval(mins => v_min) then
    raise exception 'Faltam menos de % horas. Fale com a barbearia pelo WhatsApp.', round(v_min / 60.0, 1) using errcode = 'P0001';
  end if;
end $$;

create or replace function public.remarcar_publico(p_id uuid, p_token text, p_inicio timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.agendamentos%rowtype; v_fim timestamptz;
begin
  a := privado.agendamento_do_token(p_id, p_token);
  perform privado.pode_mudar(a);
  v_fim := p_inicio + (a.fim - a.inicio);
  perform privado.validar_horario(a.barbearia_id, a.membro_id, p_inicio, v_fim);
  begin
    update public.agendamentos set inicio = p_inicio, fim = v_fim, status = 'agendado', confirmado_em = null
    where id = a.id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.' using errcode = 'P0001';
  end;
  insert into public.eventos (barbearia_id, evento, metadados)
  values (a.barbearia_id, 'agendamento.remarcado', jsonb_build_object('agendamento_id', a.id, 'pelo_cliente', true));
  return jsonb_build_object('id', a.id, 'inicio', p_inicio, 'fim', v_fim);
end $$;

create or replace function public.cancelar_publico(p_id uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.agendamentos%rowtype;
begin
  a := privado.agendamento_do_token(p_id, p_token);
  perform privado.pode_mudar(a);
  update public.agendamentos
  set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = 'Cancelado pelo cliente no link'
  where id = a.id;
  return jsonb_build_object('id', a.id, 'status', 'cancelado');
end $$;

create or replace function public.confirmar_publico(p_id uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.agendamentos%rowtype;
begin
  a := privado.agendamento_do_token(p_id, p_token);
  if a.status = 'agendado' and a.inicio > now() then
    update public.agendamentos set status = 'confirmado', confirmado_em = now() where id = a.id;
  end if;
  return jsonb_build_object('id', a.id, 'status', 'confirmado');
end $$;

-- ---------------------------------------------------------------------
-- CUPONS DE DIVULGADOR (barbeiros com muitos seguidores indicam o Kort)
-- O barbeiro que se cadastra digita o cupom (ou chega pelo link
-- kort.app.br/criar-conta?cupom=CODIGO). Ele ganha desconto na
-- mensalidade (padrão 5%) e o divulgador ganha comissão sobre o valor
-- CHEIO do plano (padrão 25%) de cada mensalidade paga no mês.
-- Não confundir com public.cupons (cupons que a barbearia dá aos clientes).
-- ---------------------------------------------------------------------
create table if not exists public.cupons_divulgador (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique check (codigo ~ '^[A-Z0-9_-]{3,24}$'),
  nome          text not null,
  contato       text,
  desconto_pct  numeric(5,2) not null default 5  check (desconto_pct between 0 and 100),
  comissao_pct  numeric(5,2) not null default 25 check (comissao_pct between 0 and 100),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
alter table public.cupons_divulgador enable row level security;   -- sem regra: só pelas funções abaixo

create table if not exists public.cupom_repasses (
  id             uuid primary key default gen_random_uuid(),
  cupom_id       uuid not null references public.cupons_divulgador(id) on delete cascade,
  competencia    date not null,                      -- 1º dia do mês
  barbearias     integer not null,
  valor_centavos integer not null,
  pago_em        timestamptz not null default now(),
  pago_por       uuid,
  unique (cupom_id, competencia)
);
alter table public.cupom_repasses enable row level security;

-- o cupom fica na assinatura (só o admin altera essa tabela; o dono só lê)
alter table public.assinaturas_saas
  add column if not exists cupom_id     uuid references public.cupons_divulgador(id) on delete set null,
  add column if not exists cupom_em     timestamptz,
  add column if not exists desconto_pct numeric(5,2) not null default 0;
create index if not exists assinaturas_saas_cupom_idx on public.assinaturas_saas (cupom_id) where cupom_id is not null;
-- valor do plano antes do desconto (base da comissão do divulgador)
alter table public.faturas add column if not exists valor_cheio_centavos integer;

insert into public.cupons_divulgador (codigo, nome) values ('PHBARBER', 'PHBARBER')
on conflict (codigo) do nothing;

create or replace function privado.normalizar_cupom(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')), '')
$$;

create or replace function privado.com_desconto(p_preco integer, p_pct numeric)
returns integer language sql immutable set search_path = '' as $$
  select round(p_preco * (100 - least(greatest(coalesce(p_pct, 0), 0), 100)) / 100)::integer
$$;

-- Tela de cadastro: o cupom existe? (nome de quem indicou e o desconto, ou null)
create or replace function public.cupom_valido(p_codigo text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nome', nome, 'desconto_pct', desconto_pct)
  from public.cupons_divulgador where codigo = privado.normalizar_cupom(p_codigo) and ativo
$$;

-- ---------------- painel admin ----------------
create or replace function public.admin_salvar_cupom(
  p_id uuid, p_codigo text, p_nome text, p_contato text, p_desconto_pct numeric, p_comissao_pct numeric, p_ativo boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_cod text := privado.normalizar_cupom(p_codigo); v_id uuid;
begin
  perform privado.exigir_admin();
  if v_cod is null or v_cod !~ '^[A-Z0-9_-]{3,24}$' then
    raise exception 'O código precisa ter de 3 a 24 letras ou números, sem espaço.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Escreva o nome do divulgador.' using errcode = 'P0001'; end if;
  if coalesce(p_desconto_pct, 0) not between 0 and 100 or coalesce(p_comissao_pct, 0) not between 0 and 100 then
    raise exception 'Desconto e comissão vão de 0 a 100%%.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cupons_divulgador where codigo = v_cod and id is distinct from p_id) then
    raise exception 'Já existe um cupom %.', v_cod using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.cupons_divulgador (codigo, nome, contato, desconto_pct, comissao_pct, ativo)
    values (v_cod, trim(p_nome), nullif(trim(p_contato), ''), coalesce(p_desconto_pct, 5), coalesce(p_comissao_pct, 25), coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.cupons_divulgador set codigo = v_cod, nome = trim(p_nome), contato = nullif(trim(p_contato), ''),
      desconto_pct = coalesce(p_desconto_pct, 5), comissao_pct = coalesce(p_comissao_pct, 25), ativo = coalesce(p_ativo, true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Cupom não encontrado.' using errcode = 'P0001'; end if;
    -- desconto novo vale para quem já usa o cupom (próximas faturas)
    update public.assinaturas_saas set desconto_pct = coalesce(p_desconto_pct, 5) where cupom_id = v_id;
  end if;
  insert into public.admin_logs (admin_id, acao, detalhes)
  values (auth.uid(), 'cupom_salvo', jsonb_build_object('cupom', v_cod, 'desconto', p_desconto_pct, 'comissao', p_comissao_pct, 'ativo', p_ativo));
  return v_id;
end $$;

-- Liga uma barbearia a um cupom depois do cadastro (ou tira, com código vazio)
create or replace function public.admin_vincular_cupom(p_barbearia uuid, p_codigo text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare c public.cupons_divulgador%rowtype; v_cod text := privado.normalizar_cupom(p_codigo);
begin
  perform privado.exigir_admin();
  if v_cod is not null then
    select * into c from public.cupons_divulgador where codigo = v_cod;
    if c.id is null then raise exception 'Cupom % não existe.', v_cod using errcode = 'P0001'; end if;
  end if;
  update public.assinaturas_saas
  set cupom_id = c.id, desconto_pct = coalesce(c.desconto_pct, 0),
      cupom_em = case when c.id is null then null else coalesce(cupom_em, now()) end
  where barbearia_id = p_barbearia;
  if not found then raise exception 'Barbearia não encontrada.' using errcode = 'P0001'; end if;
  insert into public.admin_logs (admin_id, barbearia_id, acao, detalhes)
  values (auth.uid(), p_barbearia, 'cupom_vinculado', jsonb_build_object('cupom', v_cod));
end $$;

-- Resumo do mês: por cupom, quem pagou a mensalidade e quanto repassar
create or replace function public.admin_cupons(p_competencia date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_mes date := date_trunc('month', coalesce(p_competencia, (now() at time zone 'America/Sao_Paulo')::date))::date;
begin
  perform privado.exigir_admin();
  return coalesce((
    select jsonb_agg(x order by x->>'codigo') from (
      select jsonb_build_object(
        'id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'contato', c.contato,
        'desconto_pct', c.desconto_pct, 'comissao_pct', c.comissao_pct, 'ativo', c.ativo, 'criado_em', c.criado_em,
        'barbearias', coalesce(bs.lista, '[]'::jsonb),
        'total', coalesce(bs.total, 0),
        'pagantes', coalesce(bs.pagantes, 0),
        'a_pagar_centavos', coalesce(bs.comissao, 0),
        'repasse', (select jsonb_build_object('valor_centavos', r.valor_centavos, 'barbearias', r.barbearias, 'pago_em', r.pago_em)
                    from public.cupom_repasses r where r.cupom_id = c.id and r.competencia = v_mes)) as x
      from public.cupons_divulgador c
      left join lateral (
        select count(*)::integer as total,
               count(*) filter (where y.pagou)::integer as pagantes,
               coalesce(sum(y.comissao), 0)::integer as comissao,
               jsonb_agg(jsonb_build_object('id', y.id, 'nome', y.nome, 'slug', y.slug, 'status', y.status,
                         'parceiro', y.parceiro, 'desde', y.cupom_em, 'pagou', y.pagou,
                         'valor_pago_centavos', y.valor, 'comissao_centavos', y.comissao)
                         order by y.pagou desc, y.nome) as lista
        from (
          select b.id, b.nome, b.slug, a.status, coalesce(a.parceiro, false) as parceiro, a.cupom_em,
                 f.valor_centavos as valor, f.id is not null as pagou,
                 round(coalesce(f.valor_cheio_centavos, f.valor_centavos) * c.comissao_pct / 100)::integer as comissao
          from public.assinaturas_saas a
          join public.barbearias b on b.id = a.barbearia_id
          left join public.faturas f on f.assinatura_id = a.id and f.competencia = v_mes and f.status = 'paga'
          where a.cupom_id = c.id) y
      ) bs on true) z), '[]'::jsonb);
end $$;

-- Marca (ou desmarca) que o divulgador já recebeu o repasse do mês
create or replace function public.admin_marcar_repasse(p_cupom uuid, p_competencia date, p_pago boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_mes date := date_trunc('month', p_competencia)::date; v_qtd integer; v_valor integer;
begin
  perform privado.exigir_admin();
  if p_pago then
    if not exists (select 1 from public.cupons_divulgador where id = p_cupom) then
      raise exception 'Cupom não encontrado.' using errcode = 'P0001';
    end if;
    select count(*), coalesce(sum(round(coalesce(f.valor_cheio_centavos, f.valor_centavos) * c.comissao_pct / 100)), 0)
      into v_qtd, v_valor
    from public.cupons_divulgador c
    join public.assinaturas_saas a on a.cupom_id = c.id
    join public.faturas f on f.assinatura_id = a.id and f.competencia = v_mes and f.status = 'paga'
    where c.id = p_cupom;
    insert into public.cupom_repasses (cupom_id, competencia, barbearias, valor_centavos, pago_por)
    values (p_cupom, v_mes, v_qtd, v_valor, auth.uid())
    on conflict (cupom_id, competencia) do update
      set barbearias = excluded.barbearias, valor_centavos = excluded.valor_centavos, pago_em = now(), pago_por = excluded.pago_por;
  else
    delete from public.cupom_repasses where cupom_id = p_cupom and competencia = v_mes;
  end if;
  insert into public.admin_logs (admin_id, acao, detalhes)
  values (auth.uid(), 'cupom_repasse', jsonb_build_object('cupom', p_cupom, 'mes', v_mes, 'pago', p_pago, 'valor', v_valor));
end $$;

revoke execute on function public.cupom_valido(text),
  public.admin_salvar_cupom(uuid, text, text, text, numeric, numeric, boolean),
  public.admin_vincular_cupom(uuid, text), public.admin_cupons(date), public.admin_marcar_repasse(uuid, date, boolean) from public;
grant execute on function public.cupom_valido(text) to anon, authenticated;
grant execute on function public.admin_salvar_cupom(uuid, text, text, text, numeric, numeric, boolean),
  public.admin_vincular_cupom(uuid, text), public.admin_cupons(date), public.admin_marcar_repasse(uuid, date, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CADASTRO DA BARBEARIA (onboarding em uma chamada)
-- ---------------------------------------------------------------------
create or replace function public.criar_barbearia(
  p_nome text, p_slug text, p_bairro text, p_cidade text, p_modo public.modo_operacao,
  p_servicos jsonb,        -- [{"nome":"Corte","preco_centavos":4000,"duracao_min":30}]
  p_dias smallint[], p_abre time, p_fecha time, p_whatsapp text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_bar uuid; v_membro uuid; v_serv uuid; s jsonb; d smallint; i integer := 0;
  v_slug text := lower(trim(p_slug));
begin
  if v_uid is null then raise exception 'Entre na sua conta primeiro.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Escreva o nome da barbearia.' using errcode = 'P0001'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) < 3 then
    raise exception 'O link só pode ter letras, números e hífen (mínimo 3).' using errcode = 'P0001';
  end if;
  if v_slug in ('esquina-77', 'demo', 'admin', 'app', 'kort', 'entrar', 'api') then
    raise exception 'Esse link é reservado. Escolha outro.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.barbearias where slug = v_slug) then
    raise exception 'O link kort/b/% já é de outra barbearia. Escolha outro.', v_slug using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros where perfil_id = v_uid and papel = 'dono' and ativo) then
    raise exception 'Sua conta já tem uma barbearia.' using errcode = 'P0001';
  end if;
  if p_fecha <= p_abre then raise exception 'O horário de fechar precisa ser depois do de abrir.' using errcode = 'P0001'; end if;

  insert into public.barbearias (slug, nome, bairro, cidade, modo_operacao, whatsapp, telefone, criado_por)
  values (v_slug, trim(p_nome), nullif(trim(p_bairro), ''), nullif(trim(p_cidade), ''), p_modo,
          nullif(p_whatsapp, ''), nullif(p_whatsapp, ''), v_uid)
  returning id into v_bar;                -- trigger cria o dono e o teste de 15 dias

  select id into v_membro from public.membros where barbearia_id = v_bar and perfil_id = v_uid;
  update public.membros set cor_agenda = '#E7F738' where id = v_membro;

  for s in select * from jsonb_array_elements(coalesce(p_servicos, '[]')) loop
    continue when length(trim(coalesce(s->>'nome', ''))) = 0;
    insert into public.servicos (barbearia_id, nome, preco_centavos, duracao_min, intervalo_min, ordem)
    values (v_bar, trim(s->>'nome'), greatest(coalesce((s->>'preco_centavos')::integer, 0), 0),
            greatest(coalesce((s->>'duracao_min')::integer, 30), 5), 0, i)
    returning id into v_serv;
    insert into public.servico_membros (servico_id, membro_id, barbearia_id) values (v_serv, v_membro, v_bar);
    i := i + 1;
  end loop;

  foreach d in array coalesce(p_dias, '{}') loop
    insert into public.horarios_funcionamento (barbearia_id, dia_semana, abre, fecha) values (v_bar, d, p_abre, p_fecha);
    insert into public.jornadas (barbearia_id, membro_id, dia_semana, inicio, fim) values (v_bar, v_membro, d, p_abre, p_fecha);
  end loop;

  insert into public.modelos_mensagem (barbearia_id, tipo, texto, ativo) values
    (v_bar, 'confirmacao',  'Fechou, {cliente}! Seu horário com {barbeiro} está marcado para {data} às {horario}. Precisa mudar? {link}', true),
    (v_bar, 'lembrete_24h', 'E aí, {cliente}! Amanhã às {horario} tem {servico} com {barbeiro}. Responde 1 para confirmar ou acesse {link} para remarcar.', true),
    (v_bar, 'lembrete_2h',  '{cliente}, daqui a 2 horas é a sua vez aqui na {barbearia}. Te esperamos às {horario}.', true),
    (v_bar, 'retorno',      'Fala, {cliente}! Já tá na hora de dar aquele tapa no visual. {barbeiro} tem horário essa semana: {link}', true),
    (v_bar, 'resgate',      'Sumiu, hein {cliente}? Volta pra {barbearia} essa semana e ganha {desconto} no corte. Agende: {link}', true),
    (v_bar, 'lista_espera', '{cliente}, abriu um horário {data} às {horario} com {barbeiro}. Quer? Garanta aqui: {link}', true),
    (v_bar, 'resumo_diario','Resumo de hoje: {faturamento} em {atendimentos} atendimentos, {faltas} faltas. Amanhã: {agendados} horários marcados.', false);

  insert into public.programas_fidelidade (barbearia_id, tipo, visitas_para_premio, premio_descricao, ativo)
  values (v_bar, 'cartao_visitas', 10, 'Corte grátis', false);

  update public.perfis set telefone = coalesce(telefone, nullif(p_whatsapp, '')), ultimo_acesso_em = now() where id = v_uid;
  insert into public.eventos (barbearia_id, perfil_id, evento) values (v_bar, v_uid, 'conta.criada');
  return v_bar;
end $$;

-- Slug livre? (para avisar no onboarding enquanto digita)
create or replace function public.slug_disponivel(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(trim(p_slug)) not in ('esquina-77', 'demo', 'admin', 'app', 'kort', 'entrar', 'api')
     and not exists (select 1 from public.barbearias where slug = lower(trim(p_slug)));
$$;

-- Convite da equipe: ver (sem login) e aceitar (logado)
create or replace function public.ver_convite(p_membro uuid, p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('barbearia', b.nome, 'nome', m.nome_exibicao)
  from public.membros m
  join public.membro_configuracoes c on c.membro_id = m.id
  join public.barbearias b on b.id = m.barbearia_id
  where m.id = p_membro and c.convite_token = p_token and m.perfil_id is null and m.ativo;
$$;

create or replace function public.aceitar_convite(p_membro uuid, p_token text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_bar uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.' using errcode = 'P0001'; end if;
  select m.barbearia_id into v_bar
  from public.membros m join public.membro_configuracoes c on c.membro_id = m.id
  where m.id = p_membro and c.convite_token = p_token and m.perfil_id is null and m.ativo
  for update of m;
  if v_bar is null then raise exception 'Convite inválido ou já usado. Peça um novo ao dono.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.membros where barbearia_id = v_bar and perfil_id = auth.uid()) then
    raise exception 'Você já faz parte dessa equipe.' using errcode = 'P0001';
  end if;
  update public.membros set perfil_id = auth.uid() where id = p_membro;
  update public.membro_configuracoes set convite_token = null where membro_id = p_membro;
  insert into public.eventos (barbearia_id, perfil_id, evento) values (v_bar, auth.uid(), 'equipe.convite_aceito');
  return v_bar;
end $$;

-- ---------------------------------------------------------------------
-- 5. LIMITE DO PLANO GRÁTIS (agendamentos por mês)
-- ---------------------------------------------------------------------
create or replace function privado.tg_limite_plano()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max integer; v_status public.status_assin_saas; v_qtd integer;
begin
  select p.max_agendamentos_mes, a.status into v_max, v_status
  from public.assinaturas_saas a join public.planos p on p.id = a.plano_id
  where a.barbearia_id = new.barbearia_id;
  if v_status = 'suspensa' or v_status = 'cancelada' then
    raise exception 'A conta desta barbearia está suspensa.' using errcode = 'P0001';
  end if;
  if v_max is not null and v_status <> 'teste' then
    select count(*) into v_qtd from public.agendamentos
    where barbearia_id = new.barbearia_id and criado_em >= date_trunc('month', now());
    if v_qtd >= v_max then
      raise exception 'A barbearia chegou ao limite de % horários do plano grátis neste mês.', v_max using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_agendamento_limite on public.agendamentos;
create trigger tg_agendamento_limite before insert on public.agendamentos
  for each row execute function privado.tg_limite_plano();

-- ---------------------------------------------------------------------
-- 6. MENSALIDADE
-- ---------------------------------------------------------------------
create or replace function privado.gerar_fatura(p_assinatura uuid, p_competencia date, p_vencimento date)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_bar uuid; v_preco integer; v_desc numeric; v_id uuid;
begin
  select a.barbearia_id, p.preco_centavos, coalesce(a.desconto_pct, 0) into v_bar, v_preco, v_desc
  from public.assinaturas_saas a join public.planos p on p.id = a.plano_id where a.id = p_assinatura;
  if v_preco is null or v_preco <= 0 then return null; end if;
  -- desconto do cupom de divulgador: a fatura sai com desconto, mas guarda o valor cheio (base da comissão)
  insert into public.faturas (barbearia_id, assinatura_id, competencia, valor_centavos, valor_cheio_centavos, vencimento, status, provedor, txid)
  values (v_bar, p_assinatura, p_competencia, privado.com_desconto(v_preco, v_desc), v_preco, p_vencimento, 'aberta', 'pix_manual',
          upper('KORT' || left(replace(p_assinatura::text, '-', ''), 12) || to_char(p_competencia, 'YYMM')))
  on conflict (assinatura_id, competencia) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Dono escolhe o plano. Grátis não gera fatura.
create or replace function public.escolher_plano(p_barbearia uuid, p_plano text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_plano public.planos%rowtype; a public.assinaturas_saas%rowtype; v_venc date;
begin
  if not privado.eh_dono(p_barbearia) then raise exception 'Só o dono muda o plano.' using errcode = 'P0001'; end if;
  select * into v_plano from public.planos where slug = p_plano and ativo;
  if not found then raise exception 'Plano não encontrado.' using errcode = 'P0001'; end if;
  select * into a from public.assinaturas_saas where barbearia_id = p_barbearia;
  if a.parceiro then
    raise exception 'Sua barbearia é parceira do Kort: o acesso já é liberado, sem mensalidade.' using errcode = 'P0001';
  end if;
  if v_plano.max_barbeiros is not null and
     (select count(*) from public.membros where barbearia_id = p_barbearia and ativo and atende) > v_plano.max_barbeiros then
    raise exception 'O plano % é para até % barbeiro. Desative os outros na Equipe primeiro.', v_plano.nome, v_plano.max_barbeiros using errcode = 'P0001';
  end if;

  update public.assinaturas_saas set plano_id = v_plano.id where id = a.id;
  -- faturas em aberto passam a ter o valor do plano novo (com o desconto do cupom, se tiver)
  update public.faturas set valor_centavos = privado.com_desconto(v_plano.preco_centavos, coalesce(a.desconto_pct, 0)),
                            valor_cheio_centavos = v_plano.preco_centavos
  where assinatura_id = a.id and status in ('aberta', 'vencida') and v_plano.preco_centavos > 0;
  update public.faturas set status = 'cancelada'
  where assinatura_id = a.id and status in ('aberta', 'vencida') and v_plano.preco_centavos = 0;

  if v_plano.preco_centavos = 0 then
    update public.assinaturas_saas set status = 'ativa', proximo_vencimento = null where id = a.id and status not in ('teste', 'cancelada');
    update public.barbearias set publicada = true where id = p_barbearia and a.status = 'suspensa';
  elsif a.status in ('ativa', 'inadimplente') and not exists (
      select 1 from public.faturas where assinatura_id = a.id and status in ('aberta', 'vencida')) then
    v_venc := coalesce(a.proximo_vencimento, current_date + 3);
    perform privado.gerar_fatura(a.id, date_trunc('month', v_venc)::date, v_venc);
    update public.assinaturas_saas set proximo_vencimento = v_venc where id = a.id;
  end if;
  insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
  values (p_barbearia, auth.uid(), 'conta.plano', jsonb_build_object('plano', p_plano));
end $$;

-- Dono avisa que pagou o Pix. Você confere no app do Nu e dá baixa no painel.
create or replace function public.informar_pagamento(p_fatura uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_bar uuid;
begin
  select barbearia_id into v_bar from public.faturas where id = p_fatura and status in ('aberta', 'vencida');
  if v_bar is null or not privado.eh_dono(v_bar) then raise exception 'Fatura não encontrada.' using errcode = 'P0001'; end if;
  update public.faturas set informado_em = now() where id = p_fatura;
  insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
  values (v_bar, auth.uid(), 'conta.pagamento_informado', jsonb_build_object('fatura', p_fatura));
end $$;

-- Teste grátis de 15 dias para quem se cadastra (substitui os 14 do schema.sql)
create or replace function privado.tg_nova_barbearia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_plano uuid; v_nome text; c public.cupons_divulgador%rowtype;
begin
  if new.criado_por is not null then
    select nome into v_nome from public.perfis where id = new.criado_por;
    insert into public.membros (barbearia_id, perfil_id, papel, nome_exibicao)
    values (new.id, new.criado_por, 'dono', coalesce(nullif(v_nome, ''), 'Dono'));
    -- cupom de divulgador digitado no cadastro (fica no metadado da conta)
    select cd.* into c from auth.users u
      join public.cupons_divulgador cd on cd.codigo = privado.normalizar_cupom(u.raw_user_meta_data ->> 'cupom') and cd.ativo
      where u.id = new.criado_por;
  end if;
  select id into v_plano from public.planos where slug = 'barbearia' and ativo;
  if v_plano is null then
    select id into v_plano from public.planos where ativo order by preco_centavos desc limit 1;
  end if;
  if v_plano is not null then
    insert into public.assinaturas_saas (barbearia_id, plano_id, status, teste_ate, cupom_id, cupom_em, desconto_pct)
    values (new.id, v_plano, 'teste', current_date + 15, c.id, case when c.id is not null then now() end, coalesce(c.desconto_pct, 0));
  end if;
  return new;
end $$;

-- Pagamento confirmado (Mercado Pago, ou baixa manual do admin):
-- fatura paga, conta ativa, página no ar, próximo vencimento um mês depois.
create or replace function privado.confirmar_pagamento(p_fatura uuid, p_provedor public.provedor_cobranca, p_id_externo text, p_por uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare f public.faturas%rowtype; v_prox date;
begin
  update public.faturas
  set status = 'paga', pago_em = now(), confirmado_por = p_por, provedor = p_provedor,
      id_externo = coalesce(p_id_externo, id_externo)
  where id = p_fatura and status in ('aberta', 'vencida')
  returning * into f;
  if not found then return false; end if;           -- já estava paga (aviso repetido)
  v_prox := (greatest(f.vencimento, (now() at time zone 'America/Sao_Paulo')::date) + interval '1 month')::date;
  update public.assinaturas_saas
  set status = 'ativa', proximo_vencimento = v_prox,
      dia_vencimento = least(greatest(extract(day from v_prox)::integer, 1), 28)
  where id = f.assinatura_id and status <> 'cancelada';
  update public.barbearias set publicada = true where id = f.barbearia_id and not publicada;
  insert into public.eventos (barbearia_id, evento, metadados)
  values (f.barbearia_id, 'conta.pagamento_confirmado', jsonb_build_object('fatura', f.id, 'valor', f.valor_centavos, 'provedor', p_provedor));
  return true;
end $$;

-- O dono quer pagar agora (fim do teste, conta suspensa ou adiantado no teste):
-- devolve a fatura em aberto ou cria a do mês com o valor do plano.
create or replace function public.fatura_para_pagar(p_barbearia uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.assinaturas_saas%rowtype; p public.planos%rowtype; f public.faturas%rowtype; v_venc date;
  h date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not privado.eh_dono(p_barbearia) then raise exception 'Só o dono paga a mensalidade.' using errcode = 'P0001'; end if;
  select * into a from public.assinaturas_saas where barbearia_id = p_barbearia;
  select * into p from public.planos where id = a.plano_id;
  if p.preco_centavos <= 0 then raise exception 'Escolha um plano pago para pagar.' using errcode = 'P0001'; end if;
  select * into f from public.faturas where assinatura_id = a.id and status in ('aberta', 'vencida') order by vencimento limit 1;
  if not found then
    v_venc := case when a.status = 'teste' and a.teste_ate >= h then a.teste_ate else h end;
    perform privado.gerar_fatura(a.id, date_trunc('month', v_venc)::date, v_venc);
    select * into f from public.faturas where assinatura_id = a.id and status in ('aberta', 'vencida') order by vencimento limit 1;
    if not found then  -- já existe fatura paga para esse mês: cobra o mês seguinte
      v_venc := (date_trunc('month', v_venc) + interval '1 month')::date + (extract(day from v_venc)::integer - 1);
      perform privado.gerar_fatura(a.id, date_trunc('month', v_venc)::date, v_venc);
      select * into f from public.faturas where assinatura_id = a.id and status in ('aberta', 'vencida') order by vencimento limit 1;
    end if;
  end if;
  -- valor sempre o do plano atual (com o desconto do cupom, se tiver)
  if f.valor_centavos <> privado.com_desconto(p.preco_centavos, coalesce(a.desconto_pct, 0)) then
    update public.faturas set valor_centavos = privado.com_desconto(p.preco_centavos, coalesce(a.desconto_pct, 0)),
                              valor_cheio_centavos = p.preco_centavos
    where id = f.id returning * into f;
  end if;
  return jsonb_build_object('id', f.id, 'valor_centavos', f.valor_centavos, 'competencia', f.competencia,
                            'vencimento', f.vencimento, 'plano', p.nome, 'barbearia_id', p_barbearia);
end $$;

-- Chamada só pela função de servidor do Mercado Pago (chave service_role)
create or replace function public.mp_confirmar_pagamento(p_fatura uuid, p_pagamento text, p_valor_centavos integer)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_valor integer;
begin
  select valor_centavos into v_valor from public.faturas where id = p_fatura;
  if v_valor is null then return false; end if;
  if p_valor_centavos < v_valor then
    raise exception 'Valor pago (%) menor que a fatura (%).', p_valor_centavos, v_valor;
  end if;
  return privado.confirmar_pagamento(p_fatura, 'mercado_pago', p_pagamento, null);
end $$;

-- Rotina diária (pg_cron, 06:00 de Brasília):
--  1. teste acabou sem pagamento -> fatura do mês e conta SUSPENSA na hora
--     (o app abre na tela de pagamento e a página de agendamento sai do ar)
--  2. 5 dias antes do vencimento -> fatura do mês
--  3. passou do vencimento -> fatura vencida e conta "pagamento atrasado"
--  4. 3 dias de atraso -> suspensa
--  Pagou (Mercado Pago ou baixa manual) -> volta na hora para ativa.
create or replace function privado.rotina_mensalidades()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  h date := (now() at time zone 'America/Sao_Paulo')::date;
  r record; m date; v_venc date;
  n_testes integer := 0; n_faturas integer := 0; n_venc integer := 0; n_inad integer := 0; n_susp integer := 0;
begin
  for r in select a.id, a.barbearia_id, p.preco_centavos from public.assinaturas_saas a join public.planos p on p.id = a.plano_id
           where a.status = 'teste' and a.teste_ate < h and not a.parceiro loop
    if r.preco_centavos > 0 then
      if privado.gerar_fatura(r.id, date_trunc('month', h)::date, h) is not null then n_faturas := n_faturas + 1; end if;
      update public.assinaturas_saas set status = 'suspensa', proximo_vencimento = h where id = r.id;
      update public.barbearias set publicada = false where id = r.barbearia_id;
    else
      update public.assinaturas_saas set status = 'ativa', proximo_vencimento = null where id = r.id;   -- plano grátis
    end if;
    n_testes := n_testes + 1;
  end loop;

  for r in select a.id, a.dia_vencimento from public.assinaturas_saas a join public.planos p on p.id = a.plano_id
           where a.status in ('ativa', 'inadimplente') and p.preco_centavos > 0 and not a.parceiro loop
    foreach m in array array[date_trunc('month', h)::date, (date_trunc('month', h) + interval '1 month')::date] loop
      v_venc := m + (r.dia_vencimento - 1);
      if h between v_venc - 5 and v_venc
         and not exists (select 1 from public.faturas where assinatura_id = r.id and competencia = m) then
        if privado.gerar_fatura(r.id, m, v_venc) is not null then
          n_faturas := n_faturas + 1;
          update public.assinaturas_saas set proximo_vencimento = v_venc where id = r.id;
        end if;
      end if;
    end loop;
  end loop;

  update public.faturas set status = 'vencida' where status = 'aberta' and vencimento < h;
  get diagnostics n_venc = row_count;

  update public.assinaturas_saas a set status = 'inadimplente'
  where a.status = 'ativa' and not a.parceiro and exists (
    select 1 from public.faturas f where f.assinatura_id = a.id and f.status = 'vencida');
  get diagnostics n_inad = row_count;

  with s as (
    update public.assinaturas_saas a set status = 'suspensa'
    where a.status = 'inadimplente' and not a.parceiro and exists (
      select 1 from public.faturas f where f.assinatura_id = a.id and f.status = 'vencida' and f.vencimento < h - 3)
    returning a.barbearia_id)
  update public.barbearias b set publicada = false from s where b.id = s.barbearia_id;
  get diagnostics n_susp = row_count;

  return jsonb_build_object('testes_encerrados', n_testes, 'faturas_criadas', n_faturas,
                            'vencidas', n_venc, 'inadimplentes', n_inad, 'suspensas', n_susp);
end $$;

-- ---------------------------------------------------------------------
-- 7. PAINEL ADMIN (só super admin; tudo vai para admin_logs)
-- ---------------------------------------------------------------------
create or replace function privado.exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.eh_super_admin() then raise exception 'Acesso só do Kort.' using errcode = '42501'; end if;
end $$;

create or replace function public.admin_baixa_fatura(p_fatura uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare f public.faturas%rowtype;
begin
  perform privado.exigir_admin();
  select * into f from public.faturas where id = p_fatura;
  if not privado.confirmar_pagamento(p_fatura, 'pix_manual', null, auth.uid()) then
    raise exception 'Fatura não encontrada ou já paga.' using errcode = 'P0001';
  end if;
  insert into public.admin_logs (admin_id, barbearia_id, acao, detalhes)
  values (auth.uid(), f.barbearia_id, 'baixa_fatura', jsonb_build_object('fatura', f.id, 'valor', f.valor_centavos));
end $$;

create or replace function public.admin_mudar_status(p_barbearia uuid, p_status public.status_assin_saas)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform privado.exigir_admin();
  update public.assinaturas_saas
  set status = p_status, cancelada_em = case when p_status = 'cancelada' then now() end
  where barbearia_id = p_barbearia;
  update public.barbearias set publicada = (p_status in ('teste', 'ativa', 'inadimplente')) where id = p_barbearia;
  insert into public.admin_logs (admin_id, barbearia_id, acao, detalhes)
  values (auth.uid(), p_barbearia, 'mudar_status', jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_estender_teste(p_barbearia uuid, p_dias integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform privado.exigir_admin();
  update public.assinaturas_saas
  set status = 'teste', teste_ate = greatest(coalesce(teste_ate, current_date), current_date) + p_dias
  where barbearia_id = p_barbearia;
  update public.barbearias set publicada = true where id = p_barbearia;
  insert into public.admin_logs (admin_id, barbearia_id, acao, detalhes)
  values (auth.uid(), p_barbearia, 'estender_teste', jsonb_build_object('dias', p_dias));
end $$;

-- Liga ou desliga a parceria (acesso vitalício, sem mensalidade).
-- Ao ligar: conta ativa, mensalidades em aberto canceladas e página no ar.
-- Ao desligar: volta a ser cobrada no próximo vencimento normal.
create or replace function public.admin_definir_parceiro(p_barbearia uuid, p_parceiro boolean, p_obs text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_assin uuid;
begin
  perform privado.exigir_admin();
  select id into v_assin from public.assinaturas_saas where barbearia_id = p_barbearia;
  if v_assin is null then raise exception 'Assinatura não encontrada.' using errcode = 'P0001'; end if;
  if p_parceiro then
    update public.assinaturas_saas
    set parceiro = true, parceiro_desde = coalesce(parceiro_desde, now()), parceiro_obs = nullif(trim(p_obs), ''),
        status = 'ativa', proximo_vencimento = null, cancelada_em = null
    where id = v_assin;
    update public.faturas set status = 'cancelada' where assinatura_id = v_assin and status in ('aberta', 'vencida');
    update public.barbearias set publicada = true where id = p_barbearia;
  else
    update public.assinaturas_saas
    set parceiro = false, parceiro_desde = null, parceiro_obs = null, proximo_vencimento = null
    where id = v_assin;
  end if;
  insert into public.admin_logs (admin_id, barbearia_id, acao, detalhes)
  values (auth.uid(), p_barbearia, 'parceiro', jsonb_build_object('parceiro', p_parceiro, 'obs', p_obs));
end $$;

-- Lista de barbearias do painel com contato, preço e uso por função
drop view if exists public.admin_barbearias;
create view public.admin_barbearias with (security_invoker = true) as
select b.id, b.nome, b.slug, coalesce(b.cidade, '') as cidade, coalesce(b.uf, '') as uf, b.criado_em,
       coalesce(dono.nome_exibicao, '') as responsavel,
       coalesce(b.whatsapp, b.telefone, dono.telefone, '') as telefone,
       p.nome as plano, coalesce(p.preco_centavos, 0) as preco_centavos,
       a.status as status_assinatura, a.teste_ate, a.proximo_vencimento,
       coalesce(a.parceiro, false) as parceiro, a.parceiro_desde, a.parceiro_obs,
       (select count(*) from public.membros m where m.barbearia_id = b.id and m.ativo)::integer as barbeiros,
       (select count(*) from public.clientes c where c.barbearia_id = b.id)::integer as clientes,
       (select count(*) from public.agendamentos ag
         where ag.barbearia_id = b.id and ag.criado_em > now() - interval '30 days')::integer as agendamentos_30d,
       (select max(e.criado_em) from public.eventos e where e.barbearia_id = b.id) as ultimo_uso,
       (select jsonb_build_object(
          'agenda',       count(*) filter (where e.modulo in ('agendamento', 'agenda')),
          'lembretes',    count(*) filter (where e.modulo = 'mensagem'),
          'link_publico', count(*) filter (where e.evento = 'agendamento.criado' and e.metadados->>'origem' = 'link'),
          'fidelidade',   count(*) filter (where e.modulo = 'fidelidade'),
          'clube',        count(*) filter (where e.modulo = 'clube'),
          'estoque',      count(*) filter (where e.modulo = 'estoque'),
          'relatorios',   count(*) filter (where e.modulo = 'relatorio'),
          'caixa',        count(*) filter (where e.modulo = 'comanda'))
        from public.eventos e where e.barbearia_id = b.id and e.criado_em > now() - interval '30 days') as uso_modulos
from public.barbearias b
left join public.assinaturas_saas a on a.barbearia_id = b.id
left join public.planos p on p.id = a.plano_id
left join lateral (select m.nome_exibicao, pf.telefone from public.membros m
                   left join public.perfis pf on pf.id = m.perfil_id
                   where m.barbearia_id = b.id and m.papel = 'dono' order by m.criado_em limit 1) dono on true
where privado.eh_super_admin();

-- ---------------------------------------------------------------------
-- VISITAS DO SITE (contador para o painel admin)
-- Sem dado pessoal: guarda a página, o site de onde a pessoa veio e,
-- só se ela aceitou os cookies, um código aleatório do navegador para
-- contar pessoas diferentes. Ninguém lê a tabela direto (RLS sem regra):
-- entra por registrar_visita e sai por admin_visitas_resumo.
-- ---------------------------------------------------------------------
create table if not exists public.visitas (
  id         bigint generated always as identity primary key,
  pagina     text not null,
  origem     text,
  visitante  text,
  celular    boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index if not exists visitas_criado_em on public.visitas (criado_em);
alter table public.visitas enable row level security;

create or replace function public.registrar_visita(p_pagina text, p_origem text default null, p_visitante text default null, p_celular boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_pag text := left(coalesce(nullif(trim(p_pagina), ''), '/'), 80);
        v_vis text := nullif(left(trim(coalesce(p_visitante, '')), 40), '');
begin
  -- mesma pessoa na mesma página em 30 minutos conta uma vez só
  if v_vis is not null and exists (
    select 1 from public.visitas where visitante = v_vis and pagina = v_pag and criado_em > now() - interval '30 minutes') then
    return;
  end if;
  insert into public.visitas (pagina, origem, visitante, celular)
  values (v_pag, nullif(left(lower(trim(coalesce(p_origem, ''))), 80), ''), v_vis, coalesce(p_celular, false));
end $$;

create or replace function public.admin_visitas_resumo(p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_desde timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') - make_interval(days => greatest(p_dias, 1) - 1)) at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia::date, 'visitas', coalesce(v.visitas, 0), 'pessoas', coalesce(v.pessoas, 0)) order by d.dia)
      from generate_series((v_desde at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') as d(dia)
      left join (
        select (criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as visitas,
               count(distinct coalesce(visitante, 'anon-' || id)) as pessoas
        from public.visitas where criado_em >= v_desde group by 1) v on v.dia = d.dia::date), '[]'::jsonb),
    'paginas', coalesce((
      select jsonb_agg(jsonb_build_object('pagina', pagina, 'visitas', n) order by n desc)
      from (select pagina, count(*) n from public.visitas where criado_em >= v_desde group by pagina order by n desc limit 8) x), '[]'::jsonb),
    'origens', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'visitas', n) order by n desc)
      from (select coalesce(origem, 'direto') origem, count(*) n from public.visitas where criado_em >= v_desde group by 1 order by n desc limit 8) x), '[]'::jsonb),
    'celular', (select count(*) filter (where celular) from public.visitas where criado_em >= v_desde),
    'cadastros', (select count(*) from public.barbearias where criado_em >= v_desde)
  );
end $$;

revoke execute on function public.registrar_visita(text, text, text, boolean), public.admin_visitas_resumo(integer) from public;
grant execute on function public.registrar_visita(text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_visitas_resumo(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 8. PERMISSÕES, TEMPO REAL E ROTINA
-- ---------------------------------------------------------------------
-- Funções públicas: o cliente sem login pode chamar só estas.
revoke execute on function public.pagina_publica(text), public.agendar_publico(text, uuid[], uuid, timestamptz, text, text, text),
  public.meu_horario(uuid, text), public.remarcar_publico(uuid, text, timestamptz), public.cancelar_publico(uuid, text),
  public.confirmar_publico(uuid, text), public.slug_disponivel(text), public.ver_convite(uuid, text) from public;
grant execute on function public.pagina_publica(text), public.agendar_publico(text, uuid[], uuid, timestamptz, text, text, text),
  public.meu_horario(uuid, text), public.remarcar_publico(uuid, text, timestamptz), public.cancelar_publico(uuid, text),
  public.confirmar_publico(uuid, text), public.slug_disponivel(text), public.ver_convite(uuid, text) to anon, authenticated;

revoke execute on function public.criar_barbearia(text, text, text, text, public.modo_operacao, jsonb, smallint[], time, time, text),
  public.escolher_plano(uuid, text), public.informar_pagamento(uuid), public.admin_baixa_fatura(uuid),
  public.admin_mudar_status(uuid, public.status_assin_saas), public.admin_estender_teste(uuid, integer),
  public.admin_definir_parceiro(uuid, boolean, text),
  public.aceitar_convite(uuid, text), public.fatura_para_pagar(uuid) from public;
grant execute on function public.criar_barbearia(text, text, text, text, public.modo_operacao, jsonb, smallint[], time, time, text),
  public.escolher_plano(uuid, text), public.informar_pagamento(uuid), public.admin_baixa_fatura(uuid),
  public.admin_mudar_status(uuid, public.status_assin_saas), public.admin_estender_teste(uuid, integer),
  public.admin_definir_parceiro(uuid, boolean, text),
  public.aceitar_convite(uuid, text), public.fatura_para_pagar(uuid) to authenticated;

-- só o servidor (Edge Function com a chave service_role) confirma pagamento do Mercado Pago
revoke execute on function public.mp_confirmar_pagamento(uuid, text, integer) from public, anon, authenticated;
do $$ begin
  grant execute on function public.mp_confirmar_pagamento(uuid, text, integer) to service_role;
exception when undefined_object then null; end $$;

-- O schema "privado" não é exposto pela API, mas as políticas de RLS
-- chamam algumas funções dele com o papel de quem consulta. Só essas
-- ficam liberadas; o resto roda apenas por dentro das funções acima.
grant usage on schema privado to anon, authenticated;
revoke execute on all functions in schema privado from public;
grant execute on function privado.eh_super_admin(), privado.eh_membro(uuid), privado.eh_dono(uuid),
  privado.pode_ver_do_membro(uuid, uuid), privado.barbearia_publica(uuid) to anon, authenticated;

-- Agenda atualiza sozinha quando chega horário pelo link
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agendamentos') then
    alter publication supabase_realtime add table public.agendamentos;
  end if;
end $$;

-- Rotina da mensalidade todo dia às 06:00 de Brasília (09:00 UTC).
-- No Supabase: Database > Extensions > ative "pg_cron" antes, se este
-- bloco avisar que a extensão não existe.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'kort-mensalidades';
  perform cron.schedule('kort-mensalidades', '0 9 * * *', 'select privado.rotina_mensalidades()');
exception when others then
  raise notice 'pg_cron indisponível (%). Ative a extensão e rode este arquivo de novo.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 9. SUPORTE: chat da barbearia com o Kort (dúvida, problema, sugestão)
--    Só leitura direta pelo RLS; tudo que grava passa pelas funções.
-- ---------------------------------------------------------------------
do $$ begin
  create type public.tipo_suporte as enum ('duvida', 'problema', 'sugestao', 'outro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.status_suporte as enum ('aberta', 'respondida', 'resolvida');
exception when duplicate_object then null; end $$;

create table if not exists public.suporte_conversas (
  id             uuid primary key default gen_random_uuid(),
  barbearia_id   uuid not null references public.barbearias(id) on delete cascade,
  perfil_id      uuid references public.perfis(id) on delete set null,   -- quem abriu
  tipo           public.tipo_suporte not null default 'duvida',
  assunto        text not null,
  status         public.status_suporte not null default 'aberta',
  pagina         text,                                                    -- tela onde estava ao abrir
  ultima_msg_em  timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);

create table if not exists public.suporte_mensagens (
  id             uuid primary key default gen_random_uuid(),
  conversa_id    uuid not null references public.suporte_conversas(id) on delete cascade,
  barbearia_id   uuid not null references public.barbearias(id) on delete cascade,
  autor_id       uuid references public.perfis(id) on delete set null,
  do_kort        boolean not null default false,   -- true = resposta do suporte
  automatica     boolean not null default false,
  texto          text not null check (length(texto) between 1 and 4000),
  lida_em        timestamptz,
  criado_em      timestamptz not null default now()
);

create index if not exists suporte_conversas_barbearia on public.suporte_conversas (barbearia_id, ultima_msg_em desc);
create index if not exists suporte_mensagens_conversa on public.suporte_mensagens (conversa_id, criado_em);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;

drop policy if exists suporte_conversas_ler on public.suporte_conversas;
create policy suporte_conversas_ler on public.suporte_conversas for select
  using (privado.eh_membro(barbearia_id) or privado.eh_super_admin());
drop policy if exists suporte_mensagens_ler on public.suporte_mensagens;
create policy suporte_mensagens_ler on public.suporte_mensagens for select
  using (privado.eh_membro(barbearia_id) or privado.eh_super_admin());

-- Lista com a última mensagem e o que falta ler de cada lado
create or replace view public.suporte_resumo with (security_invoker = true) as
select c.*, b.nome as barbearia_nome, b.slug as barbearia_slug,
       pf.nome as aberta_por,
       (select m.texto from public.suporte_mensagens m where m.conversa_id = c.id order by m.criado_em desc limit 1) as ultima_msg,
       (select count(*) from public.suporte_mensagens m where m.conversa_id = c.id and m.do_kort and m.lida_em is null)::integer as nao_lidas_barbearia,
       (select count(*) from public.suporte_mensagens m where m.conversa_id = c.id and not m.do_kort and m.lida_em is null)::integer as nao_lidas_kort
from public.suporte_conversas c
join public.barbearias b on b.id = c.barbearia_id
left join public.perfis pf on pf.id = c.perfil_id;

-- Barbearia abre um chamado (com a primeira mensagem e a resposta automática)
create or replace function public.suporte_abrir(p_tipo public.tipo_suporte, p_assunto text, p_texto text, p_pagina text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_bar uuid; v_id uuid;
begin
  select barbearia_id into v_bar from public.membros where perfil_id = auth.uid() and ativo order by criado_em limit 1;
  if v_bar is null then raise exception 'Entre na sua barbearia para falar com o suporte.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Escreva a mensagem.' using errcode = 'P0001'; end if;
  if (select count(*) from public.suporte_mensagens where autor_id = auth.uid() and criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'Muitas mensagens em pouco tempo. Espere um pouco.' using errcode = 'P0001';
  end if;
  insert into public.suporte_conversas (barbearia_id, perfil_id, tipo, assunto, pagina)
  values (v_bar, auth.uid(), p_tipo, left(coalesce(nullif(trim(p_assunto), ''), left(trim(p_texto), 60)), 120), left(p_pagina, 200))
  returning id into v_id;
  insert into public.suporte_mensagens (conversa_id, barbearia_id, autor_id, texto)
  values (v_id, v_bar, auth.uid(), left(trim(p_texto), 4000));
  insert into public.suporte_mensagens (conversa_id, barbearia_id, do_kort, automatica, criado_em, texto)
  values (v_id, v_bar, true, true, now() + interval '1 millisecond',
    case p_tipo
      when 'problema' then 'Recebemos o seu relato. Já está com a equipe do Kort e a resposta vem por aqui mesmo. Se puder, conte em qual tela aconteceu e o que você fez antes.'
      when 'sugestao' then 'Valeu pela sugestão! Ela entrou na nossa lista e a resposta vem por aqui mesmo.'
      else 'Recebemos sua mensagem. O suporte do Kort responde por aqui mesmo, e você é avisado quando chegar a resposta.'
    end);
  insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
  values (v_bar, auth.uid(), 'suporte.aberto', jsonb_build_object('tipo', p_tipo));
  return v_id;
end $$;

-- Mensagem nova numa conversa (barbearia ou Kort)
create or replace function public.suporte_enviar(p_conversa uuid, p_texto text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare c public.suporte_conversas%rowtype; v_admin boolean := privado.eh_super_admin(); v_id uuid;
begin
  select * into c from public.suporte_conversas where id = p_conversa;
  if not found or not (v_admin or privado.eh_membro(c.barbearia_id)) then
    raise exception 'Conversa não encontrada.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Escreva a mensagem.' using errcode = 'P0001'; end if;
  if not v_admin and (select count(*) from public.suporte_mensagens where autor_id = auth.uid() and criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'Muitas mensagens em pouco tempo. Espere um pouco.' using errcode = 'P0001';
  end if;
  insert into public.suporte_mensagens (conversa_id, barbearia_id, autor_id, do_kort, texto)
  values (c.id, c.barbearia_id, auth.uid(), v_admin, left(trim(p_texto), 4000))
  returning id into v_id;
  update public.suporte_conversas
  set ultima_msg_em = now(), status = (case when v_admin then 'respondida' else 'aberta' end)::public.status_suporte
  where id = c.id;
  return v_id;
end $$;

-- Marca como lidas as mensagens do outro lado
create or replace function public.suporte_marcar_lidas(p_conversa uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare c public.suporte_conversas%rowtype; v_admin boolean := privado.eh_super_admin();
begin
  select * into c from public.suporte_conversas where id = p_conversa;
  if not found then return; end if;
  if v_admin then
    update public.suporte_mensagens set lida_em = now() where conversa_id = c.id and not do_kort and lida_em is null;
  elsif privado.eh_membro(c.barbearia_id) then
    update public.suporte_mensagens set lida_em = now() where conversa_id = c.id and do_kort and lida_em is null;
  end if;
end $$;

-- Resolver ou reabrir (os dois lados podem)
create or replace function public.suporte_status(p_conversa uuid, p_status public.status_suporte)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare c public.suporte_conversas%rowtype;
begin
  select * into c from public.suporte_conversas where id = p_conversa;
  if not found or not (privado.eh_super_admin() or privado.eh_membro(c.barbearia_id)) then
    raise exception 'Conversa não encontrada.' using errcode = 'P0001';
  end if;
  update public.suporte_conversas set status = p_status where id = c.id;
end $$;

revoke execute on function public.suporte_abrir(public.tipo_suporte, text, text, text), public.suporte_enviar(uuid, text),
  public.suporte_marcar_lidas(uuid), public.suporte_status(uuid, public.status_suporte) from public;
grant execute on function public.suporte_abrir(public.tipo_suporte, text, text, text), public.suporte_enviar(uuid, text),
  public.suporte_marcar_lidas(uuid), public.suporte_status(uuid, public.status_suporte) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'suporte_mensagens') then
      alter publication supabase_realtime add table public.suporte_mensagens;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'suporte_conversas') then
      alter publication supabase_realtime add table public.suporte_conversas;
    end if;
  end if;
end $$;
