-- Teste de ponta a ponta do producao.sql num Postgres local.
-- psql -v ON_ERROR_STOP=1 -f fluxo.sql (depois de supabase-local.sql, schema.sql e producao.sql)
\set QUIET on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'dono@teste.com', '{"nome":"Zé Dono","telefone":"+5511900000001"}'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@teste.com', '{"nome":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@teste.com', '{"nome":"Intruso"}');
update public.perfis set super_admin = true where id = '00000000-0000-0000-0000-00000000000b';

-- 1. dono cria a barbearia
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.criar_barbearia('Barbearia Teste', 'barbearia-teste', 'Centro', 'São Paulo', 'equipe',
  '[{"nome":"Corte","preco_centavos":4000,"duracao_min":30},{"nome":"Barba","preco_centavos":3000,"duracao_min":20}]',
  '{0,1,2,3,4,5,6}', '09:00', '19:00', '+5511900000001') as barbearia \gset
select count(*) = 2 as servicos_ok from servicos \gset
\if :servicos_ok \else \echo 'FALHA servicos' \quit \endif
-- slug repetido
do $$ begin
  perform public.criar_barbearia('Outra', 'barbearia-teste', '', '', 'equipe', '[]', '{1}', '09:00', '18:00');
  raise exception 'deveria falhar';
exception when others then if sqlerrm not like '%já tem uma barbearia%' and sqlerrm not like '%outra barbearia%' then raise; end if; end $$;
reset role;

-- 2. cliente sem login usa o link
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select (public.pagina_publica('barbearia-teste') -> 'servicos' -> 0 ->> 'id') as servico,
       (public.pagina_publica('barbearia-teste') -> 'membros' -> 0 ->> 'id') as membro \gset
select public.pagina_publica('nao-existe') is null as nulo_ok \gset
\if :nulo_ok \else \echo 'FALHA slug inexistente' \quit \endif
select ((current_date + 2)::timestamp + time '10:00') at time zone 'America/Sao_Paulo' as horario \gset
select public.agendar_publico('barbearia-teste', array[:'servico'::uuid], :'membro', :'horario', 'Carlos Cliente', '(11) 98888-7777', 'tirar pouco') as ag \gset
select (:'ag'::jsonb ->> 'id') as ag_id, (:'ag'::jsonb ->> 'token') as token \gset
-- mesmo horário de novo: conflito
do $$ declare v jsonb := public.pagina_publica('barbearia-teste'); begin
  perform public.agendar_publico('barbearia-teste', array[(v->'servicos'->0->>'id')::uuid], (v->'membros'->0->>'id')::uuid,
    (((current_date + 2)::timestamp + time '10:15') at time zone 'America/Sao_Paulo'), 'Outro', '11977776666');
  raise exception 'deveria dar conflito';
exception when others then if sqlerrm not like '%acabou de ser ocupado%' then raise; end if; end $$;
-- fora do expediente
do $$ declare v jsonb := public.pagina_publica('barbearia-teste'); begin
  perform public.agendar_publico('barbearia-teste', array[(v->'servicos'->0->>'id')::uuid], (v->'membros'->0->>'id')::uuid,
    (((current_date + 2)::timestamp + time '18:50') at time zone 'America/Sao_Paulo'), 'Outro', '11977776666');
  raise exception 'deveria recusar';
exception when others then if sqlerrm not like '%fora do expediente%' then raise; end if; end $$;
-- anônimo não lê clientes nem agendamentos direto
select count(*) = 0 as rls_ok from clientes \gset
\if :rls_ok \else \echo 'FALHA RLS clientes' \quit \endif
select jsonb_array_length(public.pagina_publica('barbearia-teste') -> 'ocupados') = 1 as ocupado_ok \gset
\if :ocupado_ok \else \echo 'FALHA ocupados' \quit \endif
-- meu horário
select public.meu_horario(:'ag_id', 'token-errado') is null as token_ok \gset
\if :token_ok \else \echo 'FALHA token' \quit \endif
select public.meu_horario(:'ag_id', :'token') -> 'agendamento' ->> 'status' as st \gset
\echo status inicial: :st
select public.remarcar_publico(:'ag_id', :'token', (((current_date + 3)::timestamp + time '11:00') at time zone 'America/Sao_Paulo')) is not null as remarcou \gset
select public.confirmar_publico(:'ag_id', :'token') ->> 'status' as st \gset
\echo depois de confirmar: :st
-- anônimo não cria barbearia
do $$ begin
  perform public.criar_barbearia('X', 'xxx', '', '', 'equipe', '[]', '{1}', '09:00', '18:00');
  raise exception 'anon nao pode';
exception when insufficient_privilege then null; end $$;
reset role;

-- 3. dono vê o agendamento e fecha a comanda
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select count(*) = 1 as dono_ve from agendamentos \gset
\if :dono_ve \else \echo 'FALHA dono nao ve agendamento' \quit \endif
select id as cliente_id from clientes limit 1 \gset
insert into comandas (id, barbearia_id, agendamento_id, cliente_id, membro_id)
values ('00000000-0000-0000-0000-0000000000c1', :'barbearia', :'ag_id', :'cliente_id', :'membro');
insert into comanda_itens (comanda_id, barbearia_id, tipo, servico_id, membro_id, descricao, preco_unit_centavos, comissao_pct)
values ('00000000-0000-0000-0000-0000000000c1', :'barbearia', 'servico', :'servico', :'membro', 'Corte', 4000, 40);
update comandas set status = 'paga', forma_pagamento = 'pix', pago_em = now(), confirmado_por = auth.uid()
where id = '00000000-0000-0000-0000-0000000000c1';
select total_visitas = 1 and total_gasto_centavos = 4000 as cliente_ok from clientes where id = :'cliente_id' \gset
\if :cliente_ok \else \echo 'FALHA trigger comanda' \quit \endif
select public.escolher_plano(:'barbearia', 'solo');
reset role;

-- 4. intruso não vê nada da barbearia
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select (select count(*) from clientes) + (select count(*) from comandas) + (select count(*) from agendamentos) = 0 as isolado \gset
\if :isolado \else \echo 'FALHA isolamento' \quit \endif
do $$ begin perform public.admin_estender_teste(gen_random_uuid(), 3); raise exception 'nao admin';
exception when insufficient_privilege then null; end $$;
reset role;

-- 4b. convite: dono cadastra barbeiro, o intruso aceita com o token e passa a ver a agenda
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into membros (id, barbearia_id, nome_exibicao) values ('00000000-0000-0000-0000-0000000000d1', :'barbearia', 'Rafa');
select convite_token from membro_configuracoes where membro_id = '00000000-0000-0000-0000-0000000000d1' \gset
reset role;
set role anon;
select public.ver_convite('00000000-0000-0000-0000-0000000000d1', :'convite_token') ->> 'barbearia' as conv \gset
\echo convite para: :conv
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin perform public.aceitar_convite('00000000-0000-0000-0000-0000000000d1', 'errado'); raise exception 'aceitou token errado';
exception when others then if sqlerrm not like '%Convite inválido%' then raise; end if; end $$;
select public.aceitar_convite('00000000-0000-0000-0000-0000000000d1', :'convite_token') is not null as aceitou \gset
select count(*) > 0 as ve_agenda from agendamentos \gset
\if :ve_agenda \else \echo 'FALHA convite' \quit \endif
reset role;

-- 5. teste acaba -> rotina cria fatura; dono avisa; admin dá baixa
update assinaturas_saas set teste_ate = current_date - 1;
select privado.rotina_mensalidades();
select id as fatura, valor_centavos from faturas \gset
\echo fatura de :valor_centavos centavos
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.informar_pagamento(:'fatura');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.admin_baixa_fatura(:'fatura');
select nome, plano, status_assinatura, clientes, agendamentos_30d, uso_modulos from admin_barbearias;
select * from admin_indicadores;
reset role;
select status, proximo_vencimento from assinaturas_saas;
-- vencimento e suspensão
update faturas set status = 'aberta', pago_em = null;
update faturas set vencimento = current_date - 20;
select privado.rotina_mensalidades();
select privado.rotina_mensalidades();
select a.status, b.publicada from assinaturas_saas a join barbearias b on b.id = a.barbearia_id;
\echo TUDO OK
