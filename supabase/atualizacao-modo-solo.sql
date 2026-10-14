-- =====================================================================
-- KORT | Atualização: modo "Trabalho sozinho" (solo)
-- Rode UMA vez no SQL Editor do Supabase (projeto que já está no ar),
-- ANTES de publicar a versão nova do site. Sem ela, quem escolher
-- "Trabalho sozinho" ou "Alugo uma cadeira" no cadastro recebe erro.
-- Instalação nova não precisa: o schema.sql já traz tudo isso.
-- =====================================================================

alter type public.modo_operacao add value if not exists 'solo';

-- solo funciona como equipe na hora de ver os dados (só tem o dono)
create or replace function privado.pode_ver_do_membro(p_barbearia uuid, p_membro uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.membros m
    join public.barbearias b on b.id = m.barbearia_id
    where m.barbearia_id = p_barbearia and m.perfil_id = auth.uid() and m.ativo
      and ( b.modo_operacao::text in ('equipe', 'solo')
            or m.papel in ('dono', 'recepcao')
            or p_membro is null
            or m.id = p_membro )
  );
$$;
