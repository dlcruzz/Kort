-- =====================================================================
-- KORT | Atualização: barbearias parceiras + contador de visitas do site
-- Rode UMA vez no SQL Editor do Supabase (projeto que já está no ar).
-- Instalação nova não precisa: o producao.sql já traz tudo isso.
-- =====================================================================

alter table public.assinaturas_saas
  add column if not exists parceiro       boolean not null default false,
  add column if not exists parceiro_desde timestamptz,
  add column if not exists parceiro_obs   text;

-- rotina diária: parceiros nunca recebem fatura nem são suspensos
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

-- dono de barbearia parceira não troca de plano (não há mensalidade)
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
  -- faturas em aberto passam a ter o valor do plano novo
  update public.faturas set valor_centavos = v_plano.preco_centavos
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

revoke execute on function public.admin_definir_parceiro(uuid, boolean, text) from public;
grant execute on function public.admin_definir_parceiro(uuid, boolean, text) to authenticated;

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
