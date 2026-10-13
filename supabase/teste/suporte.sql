-- Teste do chat de suporte (rode depois de fluxo.sql, no mesmo banco)
\set QUIET on
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.suporte_abrir('problema', 'Caixa não fecha', 'Cliquei em confirmar e nada aconteceu', '/app/caixa') as conv \gset
select count(*) = 2 as duas from suporte_mensagens where conversa_id = :'conv' \gset
\if :duas \else \echo 'FALHA abrir' \quit \endif
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select nao_lidas_kort = 1 as admin_ve from suporte_resumo where id = :'conv' \gset
\if :admin_ve \else \echo 'FALHA admin nao ve' \quit \endif
select public.suporte_enviar(:'conv', 'Já corrigimos, tenta de novo?');
select public.suporte_marcar_lidas(:'conv');
select status = 'respondida' and nao_lidas_kort = 0 and nao_lidas_barbearia = 2 as resp from suporte_resumo where id = :'conv' \gset
\if :resp \else \echo 'FALHA resposta' \quit \endif
reset role;
-- alguém sem barbearia não vê nem escreve
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ee', 'x@x.com');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ee', false);
select count(*) = 0 as isolado from suporte_conversas \gset
\if :isolado \else \echo 'FALHA isolamento' \quit \endif
do $$ begin perform public.suporte_enviar((select id from public.suporte_conversas limit 1), 'oi'); raise exception 'deveria barrar';
exception when others then if sqlerrm not like '%não encontrada%' then raise; end if; end $$;
reset role;
\echo SUPORTE OK
