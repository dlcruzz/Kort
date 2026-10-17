-- =====================================================================
--  KORT  |  Parte 4: Nichos (barbearia e nail designer) com cor da marca
--
--  Rode DEPOIS do minha-barbearia.sql, no SQL Editor. Idempotente.
--
--   1. Colunas: nicho (barbearia | nail) e cor_destaque (hex)
--   2. Cadastro: criar_barbearia aceita nicho e cor
--   3. Página pública entrega nicho e cor
-- =====================================================================

alter table public.barbearias
  add column if not exists nicho text not null default 'barbearia' check (nicho in ('barbearia', 'nail')),
  add column if not exists cor_destaque text check (cor_destaque ~* '^#[0-9a-f]{6}$');

-- Cadastro (sobrescreve o do producao.sql: agora aceita nicho e cor)
create or replace function public.criar_barbearia(
  p_nome text, p_slug text, p_bairro text, p_cidade text, p_modo public.modo_operacao,
  p_servicos jsonb, p_dias smallint[], p_abre time, p_fecha time, p_whatsapp text default null,
  p_nicho text default 'barbearia', p_cor text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_bar uuid; v_membro uuid; v_serv uuid; s jsonb; d smallint; i integer := 0;
  v_slug text := lower(trim(p_slug));
  v_nicho text := lower(coalesce(p_nicho, 'barbearia'));
  v_cor text := nullif(trim(coalesce(p_cor, '')), '');
begin
  if v_uid is null then raise exception 'Entre na sua conta primeiro.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Escreva o nome.' using errcode = 'P0001'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) < 3 then
    raise exception 'O link só pode ter letras, números e hífen (mínimo 3).' using errcode = 'P0001';
  end if;
  if v_slug in ('esquina-77', 'demo', 'admin', 'app', 'kort', 'entrar', 'api') then
    raise exception 'Esse link é reservado. Escolha outro.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.barbearias where slug = v_slug) then
    raise exception 'Esse link já é de outro cadastro. Escolha outro.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros where perfil_id = v_uid and papel = 'dono' and ativo) then
    raise exception 'Sua conta já tem um cadastro.' using errcode = 'P0001';
  end if;
  if p_fecha <= p_abre then raise exception 'O horário de fechar precisa ser depois do de abrir.' using errcode = 'P0001'; end if;
  if v_nicho not in ('barbearia', 'nail') then v_nicho := 'barbearia'; end if;
  if v_cor is not null and v_cor !~* '^#[0-9a-f]{6}$' then v_cor := null; end if;

  insert into public.barbearias (slug, nome, bairro, cidade, modo_operacao, whatsapp, telefone, criado_por, nicho, cor_destaque)
  values (v_slug, trim(p_nome), nullif(trim(p_bairro), ''), nullif(trim(p_cidade), ''), p_modo,
          nullif(p_whatsapp, ''), nullif(p_whatsapp, ''), v_uid, v_nicho, v_cor)
  returning id into v_bar;                -- trigger cria o dono e o teste de 15 dias

  select id into v_membro from public.membros where barbearia_id = v_bar and perfil_id = v_uid;
  update public.membros set cor_agenda = coalesce(v_cor, case when v_nicho = 'nail' then '#FF4FA3' else '#E7F738' end) where id = v_membro;

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
    (v_bar, 'lembrete_2h',  '{cliente}, daqui a 2 horas é a sua vez. Te esperamos às {horario}.', true),
    (v_bar, 'retorno',      'Fala, {cliente}! Já tá na hora de agendar de novo. {barbeiro} tem horário essa semana: {link}', true),
    (v_bar, 'resgate',      'Sumiu, hein {cliente}? Volta essa semana e ganha {desconto} no seu próximo. Agende: {link}', true),
    (v_bar, 'lista_espera', '{cliente}, abriu um horário {data} às {horario} com {barbeiro}. Quer? Garanta aqui: {link}', true),
    (v_bar, 'resumo_diario','Resumo de hoje: {faturamento} em {atendimentos} atendimentos, {faltas} faltas. Amanhã: {agendados} horários marcados.', false);

  insert into public.programas_fidelidade (barbearia_id, tipo, visitas_para_premio, premio_descricao, ativo)
  values (v_bar, 'cartao_visitas', 10, case when v_nicho = 'nail' then 'Serviço grátis' else 'Corte grátis' end, false);

  update public.perfis set telefone = coalesce(telefone, nullif(p_whatsapp, '')), ultimo_acesso_em = now() where id = v_uid;
  insert into public.eventos (barbearia_id, perfil_id, evento) values (v_bar, v_uid, 'conta.criada');
  return v_bar;
end $$;

-- A assinatura nova substitui a antiga (do producao.sql) nos grants
revoke execute on function public.criar_barbearia(text, text, text, text, public.modo_operacao, jsonb, smallint[], time, time, text) from public, anon, authenticated;
revoke execute on function public.criar_barbearia(text, text, text, text, public.modo_operacao, jsonb, smallint[], time, time, text, text, text) from public;
grant execute on function public.criar_barbearia(text, text, text, text, public.modo_operacao, jsonb, smallint[], time, time, text, text, text) to authenticated;

-- Página pública entrega os dois campos novos
create or replace function privado.dados_publicos(p_barbearia uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'barbearia', (
      select jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'nome', b.nome, 'descricao', b.descricao, 'telefone', b.telefone,
        'whatsapp', b.whatsapp, 'instagram', b.instagram, 'logradouro', b.logradouro, 'numero', b.numero,
        'bairro', b.bairro, 'cidade', b.cidade, 'uf', b.uf, 'logo_url', b.logo_url, 'capa_url', b.capa_url,
        'modo_operacao', b.modo_operacao, 'antecedencia_cancelamento_min', b.antecedencia_cancelamento_min,
        'antecedencia_max_dias', b.antecedencia_max_dias, 'intervalo_slots_min', b.intervalo_slots_min,
        'publicada', b.publicada, 'criado_em', b.criado_em,
        'nicho', b.nicho, 'cor_destaque', b.cor_destaque)
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
      where v.barbearia_id = p_barbearia), '[]'),
    'portfolio', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'membro_id', f.membro_id, 'url', f.caminho_storage,
        'legenda', f.legenda) order by f.criado_em desc)
      from public.fotos_portfolio f where f.barbearia_id = p_barbearia and f.publica), '[]'),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'descricao', p.descricao,
        'preco_venda_centavos', p.preco_venda_centavos, 'foto_url', p.foto_url,
        'disponivel', privado.disponivel_produto(p.id)) order by p.nome)
      from public.produtos p where p.barbearia_id = p_barbearia and p.ativo and p.mostrar_na_pagina), '[]')
  );
$$;
