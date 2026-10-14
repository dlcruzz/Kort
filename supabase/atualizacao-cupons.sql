-- =====================================================================
-- KORT | Atualização: cupons de divulgador
-- Rode UMA vez no SQL Editor do Supabase (projeto que já está no ar).
-- Instalação nova não precisa: o producao.sql já traz tudo isso.
--
--   * O barbeiro que se cadastra digita o cupom (ou chega pelo link
--     kort.app.br/criar-conta?cupom=CODIGO) e ganha 5% de desconto
--     em todas as mensalidades enquanto estiver com o cupom.
--   * O divulgador ganha 25% do valor CHEIO do plano de cada
--     mensalidade paga no mês (o desconto sai só da parte do Kort).
--   * Painel admin > Cupons: quanto pagar a cada um no mês e
--     botão para marcar o repasse como pago.
--   Desconto e comissão podem ser mudados por cupom no painel.
-- =====================================================================

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

-- cobrança passa a aplicar o desconto do cupom e guardar o valor cheio
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

-- cadastro: liga a barbearia ao cupom digitado
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
