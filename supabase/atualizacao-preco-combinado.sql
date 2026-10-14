-- =====================================================================
-- KORT | Preço combinado por barbearia (negociação do admin)
-- Rode UMA vez no SQL Editor do Supabase.
--
-- Para quê: fechar um valor diferente do plano para uma barbearia,
-- por um tempo. Ex.: "Resenha barbearia paga R$ 40 por 6 meses, em vez
-- dos R$ 79,90 do plano Barbearia". Quando o prazo acaba, a cobrança
-- volta sozinha para o preço do plano, sem ninguém precisar mexer.
-- =====================================================================

alter table public.assinaturas_saas
  add column if not exists preco_combinado_centavos integer check (preco_combinado_centavos is null or preco_combinado_centavos >= 0),
  add column if not exists preco_combinado_ate      date,
  add column if not exists preco_combinado_obs      text;

comment on column public.assinaturas_saas.preco_combinado_centavos is
  'Valor negociado da mensalidade. Null = cobra o preço do plano.';
comment on column public.assinaturas_saas.preco_combinado_ate is
  'Último mês (competência) em que o valor negociado vale. Null = sem prazo.';

-- ---------------------------------------------------------------------
-- A cobrança passa a olhar o preço combinado antes do preço do plano.
-- Ordem: preço combinado (se estiver no prazo) > preço do plano + cupom.
-- Quando tem preço combinado, o desconto do cupom NÃO entra por cima:
-- o valor negociado já é o valor final, e a comissão do divulgador sai
-- sobre ele (senão 25% de um valor cheio que você não recebeu comeria
-- a margem toda).
-- ---------------------------------------------------------------------
create or replace function privado.gerar_fatura(p_assinatura uuid, p_competencia date, p_vencimento date)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_bar uuid; v_preco integer; v_desc numeric; v_id uuid;
  v_comb integer; v_comb_ate date; v_valor integer; v_cheio integer;
begin
  select a.barbearia_id, p.preco_centavos, coalesce(a.desconto_pct, 0),
         a.preco_combinado_centavos, a.preco_combinado_ate
    into v_bar, v_preco, v_desc, v_comb, v_comb_ate
  from public.assinaturas_saas a join public.planos p on p.id = a.plano_id
  where a.id = p_assinatura;

  if v_comb is not null and (v_comb_ate is null or p_competencia <= v_comb_ate) then
    -- preço negociado: é o valor final, sem cupom por cima
    v_valor := v_comb;
    v_cheio := v_comb;
  else
    if v_preco is null or v_preco <= 0 then return null; end if;
    v_valor := privado.com_desconto(v_preco, v_desc);
    v_cheio := v_preco;
  end if;
  if v_valor <= 0 then return null; end if;

  insert into public.faturas (barbearia_id, assinatura_id, competencia, valor_centavos, valor_cheio_centavos, vencimento, status, provedor, txid)
  values (v_bar, p_assinatura, p_competencia, v_valor, v_cheio, p_vencimento, 'aberta', 'pix_manual',
          upper('KORT' || left(replace(p_assinatura::text, '-', ''), 12) || to_char(p_competencia, 'YYMM')))
  on conflict (assinatura_id, competencia) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Painel admin: definir ou tirar o preço combinado.
--   p_centavos null  -> tira o combinado, volta ao preço do plano
--   p_meses   null/0 -> sem prazo (vale até você tirar)
--   p_meses   6      -> vale para este mês e os 5 seguintes
-- Também corrige as faturas em aberto para o valor novo.
-- ---------------------------------------------------------------------
create or replace function public.admin_definir_preco(
  p_barbearia uuid, p_centavos integer, p_meses integer default null, p_obs text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare a public.assinaturas_saas%rowtype; v_ate date; v_plano integer;
begin
  if not privado.eh_super_admin() then
    raise exception 'Só o admin do Kort muda o preço.' using errcode = 'P0001';
  end if;
  select * into a from public.assinaturas_saas where barbearia_id = p_barbearia;
  if not found then raise exception 'Barbearia sem assinatura.' using errcode = 'P0001'; end if;
  if p_centavos is not null and p_centavos < 0 then
    raise exception 'Valor inválido.' using errcode = 'P0001';
  end if;

  v_ate := case when p_centavos is null or coalesce(p_meses, 0) <= 0 then null
                else (date_trunc('month', current_date) + make_interval(months => p_meses - 1))::date end;

  update public.assinaturas_saas
     set preco_combinado_centavos = p_centavos,
         preco_combinado_ate      = v_ate,
         preco_combinado_obs      = nullif(btrim(coalesce(p_obs, '')), ''),
         atualizado_em            = now()
   where id = a.id;

  -- faturas em aberto deste mês em diante acompanham o valor novo
  if p_centavos is not null then
    update public.faturas
       set valor_centavos = p_centavos, valor_cheio_centavos = p_centavos
     where assinatura_id = a.id and status in ('aberta', 'vencida')
       and (v_ate is null or competencia <= v_ate);
  else
    select p.preco_centavos into v_plano from public.planos p where p.id = a.plano_id;
    update public.faturas
       set valor_centavos = privado.com_desconto(v_plano, coalesce(a.desconto_pct, 0)),
           valor_cheio_centavos = v_plano
     where assinatura_id = a.id and status in ('aberta', 'vencida') and coalesce(v_plano, 0) > 0;
  end if;

  insert into public.eventos (barbearia_id, perfil_id, evento, metadados)
  values (p_barbearia, auth.uid(), 'admin.preco_combinado',
          jsonb_build_object('centavos', p_centavos, 'ate', v_ate, 'obs', p_obs));
end $$;

revoke execute on function public.admin_definir_preco(uuid, integer, integer, text) from public;
grant  execute on function public.admin_definir_preco(uuid, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- A lista do painel passa a mostrar o preço combinado.
-- ---------------------------------------------------------------------
drop view if exists public.admin_barbearias;
create view public.admin_barbearias with (security_invoker = true) as
select b.id, b.nome, b.slug, coalesce(b.cidade, '') as cidade, coalesce(b.uf, '') as uf, b.criado_em,
       coalesce(dono.nome_exibicao, '') as responsavel,
       coalesce(b.whatsapp, b.telefone, dono.telefone, '') as telefone,
       p.nome as plano, coalesce(p.preco_centavos, 0) as preco_centavos,
       a.status as status_assinatura, a.teste_ate, a.proximo_vencimento,
       coalesce(a.parceiro, false) as parceiro, a.parceiro_desde, a.parceiro_obs,
       a.preco_combinado_centavos, a.preco_combinado_ate, a.preco_combinado_obs,
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
