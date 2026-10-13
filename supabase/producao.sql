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
  returning id into v_bar;                -- trigger cria o dono e o teste de 14 dias

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
declare v_bar uuid; v_preco integer; v_id uuid;
begin
  select a.barbearia_id, p.preco_centavos into v_bar, v_preco
  from public.assinaturas_saas a join public.planos p on p.id = a.plano_id where a.id = p_assinatura;
  if v_preco is null or v_preco <= 0 then return null; end if;
  insert into public.faturas (barbearia_id, assinatura_id, competencia, valor_centavos, vencimento, status, provedor, txid)
  values (v_bar, p_assinatura, p_competencia, v_preco, p_vencimento, 'aberta', 'pix_manual',
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
    update public.assinaturas_saas set status = 'ativa', proximo_vencimento = null where id = a.id and status <> 'teste';
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

-- Rotina diária (pg_cron). Mesma regra do server/src/rotinas/mensalidades.ts:
--  1. teste acabou -> ativa e primeira fatura (vence em 3 dias)
--  2. 5 dias antes do vencimento -> fatura do mês
--  3. vencida; 3 dias depois -> inadimplente
--  4. inadimplente com fatura vencida há 15+ dias -> suspensa e página fora do ar
create or replace function privado.rotina_mensalidades()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  h date := (now() at time zone 'America/Sao_Paulo')::date;
  r record; m date; v_venc date;
  n_testes integer := 0; n_faturas integer := 0; n_venc integer := 0; n_inad integer := 0; n_susp integer := 0;
begin
  for r in select a.id, p.preco_centavos from public.assinaturas_saas a join public.planos p on p.id = a.plano_id
           where a.status = 'teste' and a.teste_ate < h loop
    update public.assinaturas_saas
    set status = 'ativa', proximo_vencimento = case when r.preco_centavos > 0 then h + 3 end,
        dia_vencimento = least(greatest(extract(day from h + 3)::integer, 1), 28)
    where id = r.id;
    if privado.gerar_fatura(r.id, date_trunc('month', h)::date, h + 3) is not null then n_faturas := n_faturas + 1; end if;
    n_testes := n_testes + 1;
  end loop;

  for r in select a.id, a.dia_vencimento from public.assinaturas_saas a join public.planos p on p.id = a.plano_id
           where a.status in ('ativa', 'inadimplente') and p.preco_centavos > 0 loop
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
  where a.status = 'ativa' and exists (
    select 1 from public.faturas f where f.assinatura_id = a.id and f.status = 'vencida' and f.vencimento < h - 3);
  get diagnostics n_inad = row_count;

  with s as (
    update public.assinaturas_saas a set status = 'suspensa'
    where a.status = 'inadimplente' and exists (
      select 1 from public.faturas f where f.assinatura_id = a.id and f.status = 'vencida' and f.vencimento < h - 15)
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
declare f public.faturas%rowtype; v_dia smallint;
begin
  perform privado.exigir_admin();
  update public.faturas set status = 'paga', pago_em = now(), confirmado_por = auth.uid()
  where id = p_fatura and status in ('aberta', 'vencida') returning * into f;
  if not found then raise exception 'Fatura não encontrada ou já paga.' using errcode = 'P0001'; end if;
  select dia_vencimento into v_dia from public.assinaturas_saas where id = f.assinatura_id;
  update public.assinaturas_saas
  set status = 'ativa', proximo_vencimento = (date_trunc('month', f.competencia) + interval '1 month')::date + (v_dia - 1)
  where id = f.assinatura_id and status in ('teste', 'ativa', 'inadimplente', 'suspensa');
  update public.barbearias set publicada = true where id = f.barbearia_id and not publicada;
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

-- Lista de barbearias do painel com contato, preço e uso por função
drop view if exists public.admin_barbearias;
create view public.admin_barbearias with (security_invoker = true) as
select b.id, b.nome, b.slug, coalesce(b.cidade, '') as cidade, coalesce(b.uf, '') as uf, b.criado_em,
       coalesce(dono.nome_exibicao, '') as responsavel,
       coalesce(b.whatsapp, b.telefone, dono.telefone, '') as telefone,
       p.nome as plano, coalesce(p.preco_centavos, 0) as preco_centavos,
       a.status as status_assinatura, a.teste_ate, a.proximo_vencimento,
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
  public.aceitar_convite(uuid, text) from public;
grant execute on function public.criar_barbearia(text, text, text, text, public.modo_operacao, jsonb, smallint[], time, time, text),
  public.escolher_plano(uuid, text), public.informar_pagamento(uuid), public.admin_baixa_fatura(uuid),
  public.admin_mudar_status(uuid, public.status_assin_saas), public.admin_estender_teste(uuid, integer),
  public.aceitar_convite(uuid, text) to authenticated;

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
