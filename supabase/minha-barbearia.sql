-- =====================================================================
--  KORT  |  Parte 3: Minha Barbearia (fotos, portfólio, produtos, reservas)
--
--  Rode DEPOIS do producao.sql, no SQL Editor (colar inteiro > Run).
--  Pode rodar de novo sem problema: tudo aqui é idempotente.
--
--  O que tem aqui:
--   1. Produtos: foto, descrição e "mostrar na página"
--   2. Storage: buckets e regras de quem envia foto
--      Convenção: todo arquivo começa com a pasta <barbearia_id>/
--   3. Reservas de produto (cliente reserva pela página, sem login)
--   4. Página pública: capa, portfólio e produtos
--   5. Função pública de reserva + permissões
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PRODUTOS
-- ---------------------------------------------------------------------
alter table public.produtos add column if not exists foto_url text;
alter table public.produtos add column if not exists descricao text;
alter table public.produtos add column if not exists mostrar_na_pagina boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. STORAGE
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('barbearias', 'barbearias', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('membros',    'membros',    true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio',  'portfolio',  true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('produtos',   'produtos',   true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pasta da barbearia = primeiro pedaço do caminho do arquivo
create or replace function privado.pasta_barbearia(p_nome text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (storage.foldername(p_nome))[1]::uuid;
exception when others then
  return null;   -- caminho fora do padrão: ninguém passa
end $$;
grant execute on function privado.pasta_barbearia(text) to anon, authenticated;

-- Remove as regras antigas (inclusive as 9 criadas na mão) e recria todas
do $$
declare p text;
begin
  foreach p in array array[
    'Dono envia foto da barbearia', 'Dono atualiza foto da barbearia', 'Dono apaga foto da barbearia',
    'Membro envia foto de membro', 'Membro atualiza foto de membro', 'Membro apaga foto de membro',
    'Membro envia foto do portfolio', 'Membro atualiza foto do portfolio', 'Membro apaga foto do portfolio',
    'kort_fotos_enviar', 'kort_fotos_atualizar', 'kort_fotos_apagar'
  ] loop
    execute format('drop policy if exists %I on storage.objects', p);
  end loop;
end $$;

-- Logo e capa: só o dono. Fotos de barbeiro, portfólio e produtos: qualquer membro ativo.
create policy kort_fotos_enviar on storage.objects for insert to authenticated
  with check (
    (bucket_id = 'barbearias' and privado.eh_dono(privado.pasta_barbearia(name)))
    or (bucket_id in ('membros', 'portfolio', 'produtos') and privado.eh_membro(privado.pasta_barbearia(name)))
  );

create policy kort_fotos_atualizar on storage.objects for update to authenticated
  using (
    (bucket_id = 'barbearias' and privado.eh_dono(privado.pasta_barbearia(name)))
    or (bucket_id in ('membros', 'portfolio', 'produtos') and privado.eh_membro(privado.pasta_barbearia(name)))
  );

create policy kort_fotos_apagar on storage.objects for delete to authenticated
  using (
    (bucket_id = 'barbearias' and privado.eh_dono(privado.pasta_barbearia(name)))
    or (bucket_id in ('membros', 'portfolio', 'produtos') and privado.eh_membro(privado.pasta_barbearia(name)))
  );

-- ---------------------------------------------------------------------
-- 3. RESERVAS DE PRODUTO
-- ---------------------------------------------------------------------
create table if not exists public.reservas_produto (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias(id) on delete cascade,
  produto_id      uuid not null references public.produtos(id) on delete cascade,
  cliente_nome    text not null,
  telefone        text not null,
  quantidade      integer not null default 1 check (quantidade between 1 and 10),
  status          text not null default 'reservado' check (status in ('reservado', 'retirado', 'cancelado')),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists reservas_produto_barbearia_idx on public.reservas_produto (barbearia_id, status, criado_em desc);

alter table public.reservas_produto enable row level security;
drop policy if exists reservas_produto_equipe on public.reservas_produto;
create policy reservas_produto_equipe on public.reservas_produto for all
  using (privado.eh_membro(barbearia_id) or privado.eh_super_admin())
  with check (privado.eh_membro(barbearia_id));

-- Quantas unidades ainda dá para reservar (estoque menos o que já está reservado)
create or replace function privado.disponivel_produto(p_produto uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0, p.estoque_atual - coalesce((
    select sum(r.quantidade) from public.reservas_produto r
    where r.produto_id = p.id and r.status = 'reservado'), 0))::integer
  from public.produtos p where p.id = p_produto;
$$;

-- ---------------------------------------------------------------------
-- 4. PÁGINA PÚBLICA (mesma função do producao.sql + capa, portfólio e produtos)
-- ---------------------------------------------------------------------
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
      where v.barbearia_id = p_barbearia), '[]'),
    'portfolio', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'membro_id', f.membro_id, 'url', f.caminho_storage,
        'legenda', f.legenda) order by f.criado_em desc)
      from public.fotos_portfolio f where f.barbearia_id = p_barbearia and f.publica), '[]'),
    -- produtos: sem custo, só o que o cliente precisa ver
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'descricao', p.descricao,
        'preco_venda_centavos', p.preco_venda_centavos, 'foto_url', p.foto_url,
        'disponivel', privado.disponivel_produto(p.id)) order by p.nome)
      from public.produtos p where p.barbearia_id = p_barbearia and p.ativo and p.mostrar_na_pagina), '[]')
  );
$$;

-- ---------------------------------------------------------------------
-- 5. RESERVA PELA PÁGINA (cliente sem login)
-- ---------------------------------------------------------------------
create or replace function public.reservar_produto_publico(
  p_slug text, p_produto uuid, p_quantidade integer, p_nome text, p_telefone text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_bar uuid; v_id uuid; v_disp integer;
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
  if coalesce(p_quantidade, 0) < 1 or p_quantidade > 10 then
    raise exception 'Escolha de 1 a 10 unidades.' using errcode = 'P0001';
  end if;

  -- trava a linha do produto: duas reservas ao mesmo tempo não passam do estoque
  perform 1 from public.produtos
  where id = p_produto and barbearia_id = v_bar and ativo and mostrar_na_pagina
  for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;

  v_disp := privado.disponivel_produto(p_produto);
  if v_disp < p_quantidade then
    raise exception '%', case when v_disp = 0 then 'Esse produto acabou.'
                              else format('Só tem %s disponível agora.', v_disp) end using errcode = 'P0001';
  end if;

  -- trava contra abuso: no máximo 3 reservas abertas por telefone
  if (select count(*) from public.reservas_produto
      where barbearia_id = v_bar and telefone = v_tel and status = 'reservado') >= 3 then
    raise exception 'Você já tem 3 reservas abertas aqui. Retire uma para reservar outra.' using errcode = 'P0001';
  end if;

  insert into public.reservas_produto (barbearia_id, produto_id, cliente_nome, telefone, quantidade)
  values (v_bar, p_produto, v_nome, v_tel, p_quantidade)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end $$;

revoke execute on function public.reservar_produto_publico(text, uuid, integer, text, text) from public;
grant execute on function public.reservar_produto_publico(text, uuid, integer, text, text) to anon, authenticated;
revoke execute on function privado.disponivel_produto(uuid) from public;

-- reserva nova aparece na hora no painel
do $$ begin
  alter publication supabase_realtime add table public.reservas_produto;
exception when duplicate_object or undefined_object then null; end $$;
