-- Teste do pagamento automático (rode depois de fluxo.sql, no mesmo banco)
\set QUIET on
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f1', 'novo@teste.com', '{"nome":"Novo"}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select public.criar_barbearia('Barbearia Nova', 'barbearia-nova', '', '', 'equipe', '[{"nome":"Corte","preco_centavos":4000,"duracao_min":30}]', '{1,2,3,4,5}', '09:00', '18:00') as bar \gset
reset role;
select teste_ate = current_date + 7 as sete_dias from assinaturas_saas where barbearia_id = :'bar' \gset
\if :sete_dias \else \echo 'FALHA teste de 7 dias' \quit \endif
-- teste acaba sem pagar -> suspensa na hora
update assinaturas_saas set teste_ate = current_date - 1 where barbearia_id = :'bar';
select privado.rotina_mensalidades();
select a.status = 'suspensa' and not b.publicada as bloqueada from assinaturas_saas a join barbearias b on b.id = a.barbearia_id where a.barbearia_id = :'bar' \gset
\if :bloqueada \else \echo 'FALHA bloqueio no fim do teste' \quit \endif
-- dono pede para pagar
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select (public.fatura_para_pagar(:'bar') ->> 'id') as fatura, (public.fatura_para_pagar(:'bar') ->> 'valor_centavos')::int as valor \gset
-- ninguém logado confirma pagamento sozinho
do $$ begin perform public.mp_confirmar_pagamento(gen_random_uuid(), 'x', 1); raise exception 'deveria barrar';
exception when insufficient_privilege then null; end $$;
reset role;
-- valor menor é recusado
do $$ begin perform public.mp_confirmar_pagamento((select id from public.faturas where status in ('aberta','vencida') and barbearia_id = (select id from public.barbearias where slug='barbearia-nova')), 'pg1', 100); raise exception 'deveria recusar valor';
exception when others then if sqlerrm not like '%menor que a fatura%' then raise; end if; end $$;
-- aviso do Mercado Pago (servidor) -> libera na hora
select public.mp_confirmar_pagamento(:'fatura', 'pg-123', :valor) as liberou \gset
select public.mp_confirmar_pagamento(:'fatura', 'pg-123', :valor) as repetido \gset
select a.status = 'ativa' and b.publicada and a.proximo_vencimento > current_date as ativa from assinaturas_saas a join barbearias b on b.id = a.barbearia_id where a.barbearia_id = :'bar' \gset
\if :ativa \else \echo 'FALHA liberar' \quit \endif
\echo liberou=:liberou repetido=:repetido
\echo PAGAMENTO OK
