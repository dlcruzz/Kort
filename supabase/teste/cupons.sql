-- Teste dos cupons de divulgador (rode depois de fluxo.sql, no mesmo banco)
\set QUIET on
reset role;

-- cupom inicial existe e a tela de cadastro reconhece (sem login, ignorando maiúscula e espaço)
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select (public.cupom_valido(' phbarber ') ->> 'desconto_pct')::numeric = 5 as ok1 \gset
\if :ok1 \else \echo 'FALHA cupom_valido nao reconheceu' \quit \endif
select public.cupom_valido('NAOEXISTE') is null as ok2 \gset
\if :ok2 \else \echo 'FALHA cupom inexistente' \quit \endif
reset role;

-- barbeiro se cadastra com o cupom no metadado e cria a barbearia
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'cupom@teste.com', '{"nome":"Barbeiro Cupom","cupom":"phBarber"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'semcupom@teste.com', '{"nome":"Sem Cupom","cupom":"ERRADO"}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select public.criar_barbearia('Barbearia do Cupom', 'barbearia-cupom', '', '', 'equipe', '[]', '{1,2}', '09:00', '18:00') as bar1 \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
select public.criar_barbearia('Barbearia Sem', 'barbearia-sem', '', '', 'equipe', '[]', '{1,2}', '09:00', '18:00') as bar2 \gset
-- dono não lê os cupons nem chama as funções de admin
do $$ begin
  perform 1 from public.cupons_divulgador;
  if found then raise exception 'FALHA dono leu cupons'; end if;
end $$;
do $$ begin
  perform public.admin_cupons(null);
  raise exception 'FALHA dono abriu admin_cupons';
exception when insufficient_privilege then null; end $$;
-- dono não troca o próprio cupom nem o desconto
update public.assinaturas_saas set desconto_pct = 90 where barbearia_id = (select id from public.barbearias where slug = 'barbearia-sem');
reset role;
select (desconto_pct = 0) as ok_rls from public.assinaturas_saas where barbearia_id = :'bar2' \gset
\if :ok_rls \else \echo 'FALHA dono mudou o desconto' \quit \endif

select (c.codigo = 'PHBARBER' and a.cupom_em is not null and a.desconto_pct = 5 and a.teste_ate = current_date + 15) as ok3
from public.assinaturas_saas a join public.cupons_divulgador c on c.id = a.cupom_id where a.barbearia_id = :'bar1' \gset
\if :ok3 \else \echo 'FALHA cupom nao ficou na assinatura' \quit \endif
select (cupom_id is null and desconto_pct = 0) as ok4 from public.assinaturas_saas where barbearia_id = :'bar2' \gset
\if :ok4 \else \echo 'FALHA cupom invalido foi aceito' \quit \endif

-- plano Solo (R$ 39,90): fatura sai com 5% de desconto e guarda o valor cheio
select id as assin1 from public.assinaturas_saas where barbearia_id = :'bar1' \gset
update public.assinaturas_saas set plano_id = (select id from public.planos where slug = 'solo') where id = :'assin1';
select privado.gerar_fatura(:'assin1', date_trunc('month', current_date)::date, current_date) as fat1 \gset
select (valor_centavos = 3791 and valor_cheio_centavos = 3990) as ok5 from public.faturas where id = :'fat1' \gset
\if :ok5 \else \echo 'FALHA desconto na fatura' \quit \endif
-- dono pede para pagar: valor continua com desconto
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select (public.fatura_para_pagar(:'bar1') ->> 'valor_centavos')::int = 3791 as ok6 \gset
\if :ok6 \else \echo 'FALHA fatura_para_pagar perdeu o desconto' \quit \endif
reset role;
select privado.confirmar_pagamento(:'fat1', 'pix_manual', null, null);

-- admin vê o resumo do mês: 25% de R$ 39,90 (valor cheio) = R$ 9,98
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select (x->>'total')::int = 1 and (x->>'pagantes')::int = 1 and (x->>'a_pagar_centavos')::int = 998 as ok7
from jsonb_array_elements(public.admin_cupons(null)) x where x->>'codigo' = 'PHBARBER' \gset
\if :ok7 \else \echo 'FALHA resumo do mes' \quit \endif
select (x->>'pagantes')::int = 0 as ok8
from jsonb_array_elements(public.admin_cupons((date_trunc('month', current_date) - interval '1 month')::date)) x where x->>'codigo' = 'PHBARBER' \gset
\if :ok8 \else \echo 'FALHA mes passado' \quit \endif

-- código inválido e repetido
do $$ begin
  perform public.admin_salvar_cupom(null, 'a!', 'X', null, 5, 25, true);
  raise exception 'FALHA aceitou codigo invalido';
exception when others then if sqlerrm not like '%3 a 24%' then raise; end if; end $$;
do $$ begin
  perform public.admin_salvar_cupom(null, 'phbarber', 'Dup', null, 5, 25, true);
  raise exception 'FALHA aceitou cupom repetido';
exception when others then if sqlerrm not like '%Já existe%' then raise; end if; end $$;
-- cria outro cupom, liga a barbearia sem cupom a ele, marca repasse
select public.admin_salvar_cupom(null, 'zeca10', 'Zeca', '@zeca', 10, 30, true) as cupom2 \gset
select public.admin_vincular_cupom(:'bar2', 'ZECA10');
select public.admin_marcar_repasse((select (x->>'id')::uuid from jsonb_array_elements(public.admin_cupons(null)) x where x->>'codigo' = 'PHBARBER'), current_date, true);
select (x->'repasse'->>'valor_centavos')::int = 998 as ok9
from jsonb_array_elements(public.admin_cupons(null)) x where x->>'codigo' = 'PHBARBER' \gset
\if :ok9 \else \echo 'FALHA repasse' \quit \endif
select (x->>'total')::int = 1 and (x->>'pagantes')::int = 0 as ok10
from jsonb_array_elements(public.admin_cupons(null)) x where x->>'codigo' = 'ZECA10' \gset
\if :ok10 \else \echo 'FALHA vincular cupom' \quit \endif
reset role;
select (desconto_pct = 10) as ok11 from public.assinaturas_saas where barbearia_id = :'bar2' \gset
\if :ok11 \else \echo 'FALHA desconto do cupom vinculado' \quit \endif
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.admin_vincular_cupom(:'bar2', '');
reset role;
select (cupom_id is null and desconto_pct = 0) as ok12 from public.assinaturas_saas where barbearia_id = :'bar2' \gset
\if :ok12 \else \echo 'FALHA desvincular cupom' \quit \endif

\echo 'CUPONS OK'
