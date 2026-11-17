-- =====================================================================
-- Loja Fácil · 0008 · CADASTRO DE OPERADORES PELO ADMINISTRADOR
--
-- O administrador cadastra cada balconista dentro do sistema
-- (Usuários e loja → Cadastrar operador) com NOME, USUÁRIO e SENHA.
-- O operador entra digitando só o usuário (ex.: maria) e a senha —
-- não precisa ter e-mail. Também é possível trocar a senha de um
-- operador que esqueceu.
--
-- Segurança: só o administrador consegue usar estas funções; quem é
-- cadastrado aqui entra SEMPRE como operador (nunca como administrador).
-- Pode rodar mais de uma vez. Não apaga nada.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Usuário "maria" vira o login interno "maria@operador.lojafacil".
create or replace function public.login_do_usuario(p_usuario text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_usuario, '')));
begin
  if position('@' in v) > 0 then
    return v;  -- já é um e-mail
  end if;
  if v !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Usuário inválido: use de 3 a 30 letras sem acento, números, ponto, traço ou sublinhado (ex.: maria, joao.silva).'
      using errcode = 'P0001';
  end if;
  return v || '@operador.lojafacil';
end;
$$;

create or replace function public.criar_operador(p_nome text, p_usuario text, p_senha text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text;
  v_nome  text := trim(coalesce(p_nome, ''));
begin
  if not public.eh_admin() then
    raise exception 'Somente o administrador cadastra operadores.' using errcode = 'P0001';
  end if;
  if length(v_nome) < 2 then
    raise exception 'Informe o nome do operador.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.' using errcode = 'P0001';
  end if;
  v_email := public.login_do_usuario(p_usuario);
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Já existe alguém com esse usuário. Escolha outro (ex.: maria2, maria.silva).' using errcode = 'P0001';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_senha, gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nome', v_nome), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  -- O gatilho de cadastro cria o perfil como "aguardando"; aqui já entra liberado como operador.
  update public.perfis set papel = 'operador', nome = v_nome where id = v_id;
  return v_id;
end;
$$;

create or replace function public.trocar_senha_operador(p_usuario_id uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente o administrador troca a senha de operadores.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.' using errcode = 'P0001';
  end if;
  if p_usuario_id = auth.uid() then
    raise exception 'Para trocar a sua própria senha, use "Meu perfil".' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfis where id = p_usuario_id and papel = 'admin') then
    raise exception 'A senha de um administrador só pode ser trocada por ele mesmo, em "Meu perfil".' using errcode = 'P0001';
  end if;
  update auth.users
     set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now()
   where id = p_usuario_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.criar_operador(text, text, text) from public, anon;
grant execute on function public.criar_operador(text, text, text) to authenticated;
revoke all on function public.trocar_senha_operador(uuid, text) from public, anon;
grant execute on function public.trocar_senha_operador(uuid, text) to authenticated;
grant execute on function public.login_do_usuario(text) to anon, authenticated;

-- Conferência: deve mostrar as 3 funções.
select proname as funcao_criada
  from pg_proc
 where proname in ('criar_operador', 'trocar_senha_operador', 'login_do_usuario')
 order by 1;
