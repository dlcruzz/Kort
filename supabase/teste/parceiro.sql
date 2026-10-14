-- Teste da barbearia parceira (rodar depois de fluxo.sql)
\set QUIET on
reset role;
-- barbearia nova com plano pago, teste já acabou e fatura vencida
select b.id as bar, a.id as assin from public.barbearias b join public.assinaturas_saas a on a.barbearia_id = b.id
where b.slug = 'barbearia-teste' \gset
update public.assinaturas_saas set status = 'inadimplente', teste_ate = current_date - 30 where id = :'assin';
insert into public.faturas (barbearia_id, assinatura_id, competencia, valor_centavos, vencimento, status)
values (:'bar', :'assin', date_trunc('month', current_date - 40)::date, 9990, current_date - 10, 'vencida')
on conflict (assinatura_id, competencia) do update set status = 'vencida', vencimento = current_date - 10;

-- intruso não consegue
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  perform public.admin_definir_parceiro((select id from public.barbearias where slug = 'barbearia-teste'), true, 'x');
  raise exception 'FALHA intruso virou admin';
exception when insufficient_privilege then null; end $$;

-- admin liga a parceria
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.admin_definir_parceiro(:'bar', true, '@zedono: 2 posts por mês');
reset role;
select (status = 'ativa' and parceiro and parceiro_obs = '@zedono: 2 posts por mês') as ok1 from public.assinaturas_saas where id = :'assin' \gset
\if :ok1 \else \echo 'FALHA parceiro nao ativou' \quit \endif
select not exists (select 1 from public.faturas where assinatura_id = :'assin' and status in ('aberta','vencida')) as ok2 \gset
\if :ok2 \else \echo 'FALHA faturas nao canceladas' \quit \endif

-- rotina diária roda o mês inteiro sem gerar fatura nem suspender
select privado.rotina_mensalidades();
update public.assinaturas_saas set dia_vencimento = extract(day from current_date + 2)::smallint where id = :'assin' and extract(day from current_date + 2) <= 28;
select privado.rotina_mensalidades();
select (status = 'ativa') as ok3 from public.assinaturas_saas where id = :'assin' \gset
\if :ok3 \else \echo 'FALHA rotina mexeu no parceiro' \quit \endif
select not exists (select 1 from public.faturas where assinatura_id = :'assin' and status in ('aberta','vencida')) as ok4 \gset
\if :ok4 \else \echo 'FALHA rotina gerou fatura para parceiro' \quit \endif

-- dono não troca plano sendo parceiro
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  perform public.escolher_plano((select id from public.barbearias where slug = 'barbearia-teste'), 'pro');
  raise exception 'FALHA trocou plano';
exception when sqlstate 'P0001' then
  if sqlerrm not like '%parceira%' then raise; end if;
end $$;

-- painel enxerga a marcação
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select parceiro as ok5 from public.admin_barbearias where id = :'bar' \gset
\if :ok5 \else \echo 'FALHA view admin' \quit \endif

-- desligar volta a cobrar normalmente
select public.admin_definir_parceiro(:'bar', false, null);
reset role;
select (not parceiro and parceiro_desde is null) as ok6 from public.assinaturas_saas where id = :'assin' \gset
\if :ok6 \else \echo 'FALHA desligar' \quit \endif
\echo 'PARCEIRO OK'
