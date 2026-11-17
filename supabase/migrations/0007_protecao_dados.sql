-- =====================================================================
-- Loja Fácil · 0007 · PROTEÇÃO DOS DADOS
--
-- O que este arquivo faz (pode rodar mais de uma vez, não apaga nada):
--
-- 1) TRAVA CONTRA APAGAR: vendas, itens, pagamentos, fiado, crediário
--    (parcelas), caixas, sangrias/suprimentos e movimentações de estoque
--    NÃO podem mais ser apagados — nem pelo sistema, nem por engano no
--    SQL Editor do Supabase (DELETE ou TRUNCATE). Para corrigir uma venda,
--    use "Cancelar venda"; para corrigir estoque, faça um "Ajuste".
--
-- 2) PRODUTO E CLIENTE COM HISTÓRICO não podem ser apagados: devem ser
--    DESATIVADOS (continuam nos relatórios e no histórico).
--
-- 3) HISTÓRICO DE ALTERAÇÕES (auditoria): toda mudança de preço, custo,
--    nome, cadastro de cliente, limite de crédito, dados da loja,
--    cancelamento de venda, recebimento de fiado e de parcela fica
--    registrada com quem fez, quando, o valor antes e o valor depois.
--    Só o administrador vê. Ninguém consegue apagar esse histórico.
--
-- 4) Data do último backup (para o aviso "faça o backup de hoje").
-- =====================================================================

-- ---------- 1) Trava contra apagar ----------
create or replace function public.impedir_apagar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Válvula de emergência só para o suporte técnico, numa sessão do SQL Editor:
  --   set local lojafacil.permitir_apagar = 'sim';
  if coalesce(current_setting('lojafacil.permitir_apagar', true), '') = 'sim' then
    return case when tg_level = 'ROW' then old else null end;
  end if;
  raise exception 'Proteção do Loja Fácil: registros de "%" não podem ser apagados. Vendas, caixa, fiado, crediário e estoque ficam guardados para sempre. Para corrigir: cancele a venda ou faça um ajuste de estoque.', tg_table_name
    using errcode = 'P0001';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['vendas', 'venda_itens', 'venda_pagamentos', 'caixas', 'caixa_movimentos', 'movimentacoes', 'parcelas']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_impedir_apagar on public.%I', t);
      execute format('create trigger trg_impedir_apagar before delete on public.%I for each row execute function public.impedir_apagar()', t);
      execute format('drop trigger if exists trg_impedir_truncate on public.%I', t);
      execute format('create trigger trg_impedir_truncate before truncate on public.%I for each statement execute function public.impedir_apagar()', t);
    end if;
  end loop;
end;
$$;

-- ---------- 2) Produto / cliente com histórico: desativar, não apagar ----------
create or replace function public.impedir_apagar_com_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('lojafacil.permitir_apagar', true), '') = 'sim' then
    return old;
  end if;
  if tg_table_name = 'produtos' then
    if exists (select 1 from public.venda_itens where produto_id = old.id)
       or exists (select 1 from public.movimentacoes where produto_id = old.id) then
      raise exception 'Este produto já tem vendas ou movimentações de estoque e não pode ser apagado. Para tirá-lo da lista, edite o produto e desmarque "Produto ativo".'
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'clientes' then
    if exists (select 1 from public.vendas where cliente_id = old.id)
       or (to_regclass('public.parcelas') is not null and exists (select 1 from public.parcelas where cliente_id = old.id)) then
      raise exception 'Este cliente já tem compras registradas e não pode ser apagado. Para tirá-lo da lista, edite o cliente e desmarque "Cliente ativo".'
        using errcode = 'P0001';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_impedir_apagar_historico on public.produtos;
create trigger trg_impedir_apagar_historico before delete on public.produtos
  for each row execute function public.impedir_apagar_com_historico();

do $$
begin
  if to_regclass('public.clientes') is not null then
    execute 'drop trigger if exists trg_impedir_apagar_historico on public.clientes';
    execute 'create trigger trg_impedir_apagar_historico before delete on public.clientes for each row execute function public.impedir_apagar_com_historico()';
  end if;
end;
$$;

-- ---------- 3) Histórico de alterações (auditoria) ----------
create table if not exists public.auditoria (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  operacao      text not null,          -- INSERT / UPDATE / DELETE
  registro_id   text,
  antes         jsonb,
  depois        jsonb,
  usuario_id    uuid,
  usuario_nome  text,
  em            timestamptz not null default now()
);
create index if not exists auditoria_em_idx on public.auditoria (em desc);
create index if not exists auditoria_tabela_idx on public.auditoria (tabela, registro_id);

alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
drop policy if exists auditoria_ver on public.auditoria;
create policy auditoria_ver on public.auditoria for select to authenticated using (public.eh_admin());

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- A logo (imagem) é grande e não precisa ir para o histórico.
  v_antes  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'logo' end;
  v_depois jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) - 'logo' end;
  v_nome   text;
begin
  -- Mudança só de estoque (cada venda mexe nele) já fica em "movimentações": não repete aqui.
  if tg_op = 'UPDATE'
     and (v_antes - 'estoque' - 'atualizado_em') = (v_depois - 'estoque' - 'atualizado_em') then
    return new;
  end if;
  select nome into v_nome from public.perfis where id = auth.uid();
  insert into public.auditoria (tabela, operacao, registro_id, antes, depois, usuario_id, usuario_nome)
  values (tg_table_name, tg_op, coalesce(v_depois ->> 'id', v_antes ->> 'id'), v_antes, v_depois,
          auth.uid(), coalesce(v_nome, 'SQL Editor / sistema'));
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['produtos', 'clientes', 'configuracoes', 'vendas', 'venda_pagamentos', 'parcelas', 'caixas', 'perfis']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_auditoria on public.%I', t);
      execute format('create trigger trg_auditoria after update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
    end if;
  end loop;
end;
$$;

-- O próprio histórico também não pode ser apagado nem alterado.
drop trigger if exists trg_impedir_apagar on public.auditoria;
create trigger trg_impedir_apagar before delete or update on public.auditoria
  for each row execute function public.impedir_apagar();
drop trigger if exists trg_impedir_truncate on public.auditoria;
create trigger trg_impedir_truncate before truncate on public.auditoria
  for each statement execute function public.impedir_apagar();

-- ---------- 4) Data do último backup ----------
alter table public.configuracoes add column if not exists ultimo_backup_em timestamptz;
alter table public.configuracoes add column if not exists ultimo_backup_por text;

create or replace function public.registrar_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente o administrador faz backup.';
  end if;
  update public.configuracoes
     set ultimo_backup_em = now(),
         ultimo_backup_por = (select nome from public.perfis where id = auth.uid())
   where id = 1;
end;
$$;
revoke all on function public.registrar_backup() from public, anon;
grant execute on function public.registrar_backup() to authenticated;

-- Conferência: deve listar as travas criadas.
select tgrelid::regclass as tabela, tgname as protecao
  from pg_trigger
 where tgname in ('trg_impedir_apagar', 'trg_impedir_truncate', 'trg_impedir_apagar_historico', 'trg_auditoria')
 order by 1, 2;
