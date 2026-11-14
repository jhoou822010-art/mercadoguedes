-- =====================================================================
-- Loja Fácil — Migração 0001 (estrutura inicial)
-- Rode este arquivo UMA VEZ no SQL Editor do Supabase, num projeto novo.
-- Ele não apaga nada: só cria tabelas, funções e regras de segurança.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfis de usuário (papéis: admin, operador, pendente)
-- ---------------------------------------------------------------------
create table public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text not null default '',
  papel      text not null default 'pendente'
             check (papel in ('admin', 'operador', 'pendente')),
  criado_em  timestamptz not null default now()
);

comment on table public.perfis is
  'Um perfil por usuário. O primeiro cadastrado vira admin; os demais entram como pendente até o admin liberar.';

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text;
begin
  -- Bloqueia a tabela para que dois cadastros simultâneos não virem admin.
  lock table public.perfis in exclusive mode;
  if exists (select 1 from public.perfis where papel = 'admin') then
    v_papel := 'pendente';
  else
    v_papel := 'admin';
  end if;

  insert into public.perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    v_papel
  );
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Funções auxiliares usadas nas regras de segurança.
create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.perfis where id = auth.uid();
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.meu_papel() = 'admin', false);
$$;

create or replace function public.tem_acesso()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.meu_papel() in ('admin', 'operador'), false);
$$;

-- O admin altera o papel de outro usuário por esta função.
create or replace function public.definir_papel(p_usuario uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem alterar papéis.';
  end if;
  if p_papel not in ('admin', 'operador', 'pendente') then
    raise exception 'Papel inválido: %', p_papel;
  end if;
  if p_papel <> 'admin'
     and (select papel from public.perfis where id = p_usuario) = 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'O sistema precisa de pelo menos um administrador.';
  end if;

  update public.perfis set papel = p_papel where id = p_usuario;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Configurações da loja (uma linha só)
-- ---------------------------------------------------------------------
create table public.configuracoes (
  id                    smallint primary key default 1 check (id = 1),
  nome_loja             text not null default 'Minha Loja',
  dias_alerta_validade  integer not null default 30 check (dias_alerta_validade between 1 and 365),
  atualizado_em         timestamptz not null default now()
);

insert into public.configuracoes (id) values (1);

-- ---------------------------------------------------------------------
-- 3. Produtos
-- ---------------------------------------------------------------------
create table public.produtos (
  id              bigint generated always as identity primary key,
  codigo          text not null,
  barras          text,
  nome            text not null,
  categoria       text,
  unidade         text not null default 'UN'
                  check (unidade in ('UN', 'KG', 'LT', 'PCT', 'CX')),
  modelo          text,
  fornecedor      text,
  custo           numeric(12, 2) not null default 0 check (custo >= 0),
  preco           numeric(12, 2) not null default 0 check (preco >= 0),
  estoque         numeric(12, 3) not null default 0 check (estoque >= 0),
  estoque_minimo  numeric(12, 3) not null default 0 check (estoque_minimo >= 0),
  validade        date,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint produtos_codigo_unico unique (codigo),
  constraint produtos_codigo_preenchido check (length(trim(codigo)) > 0),
  constraint produtos_nome_preenchido check (length(trim(nome)) > 0)
);

-- Código de barras único quando informado (vários produtos podem ficar sem).
create unique index produtos_barras_unico on public.produtos (barras) where barras is not null and barras <> '';
create index produtos_nome_idx       on public.produtos (lower(nome));
create index produtos_categoria_idx  on public.produtos (categoria);
create index produtos_validade_idx   on public.produtos (validade);

-- Mantém "atualizado_em" e impede alterar o estoque fora das movimentações.
create or replace function public.produtos_antes_de_atualizar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if new.estoque is distinct from old.estoque
     and coalesce(current_setting('lojafacil.movimentando', true), '') <> 'sim' then
    raise exception 'O estoque só pode ser alterado pela tela de Estoque (entrada, saída ou ajuste).';
  end if;
  return new;
end;
$$;

create trigger produtos_antes_de_atualizar
  before update on public.produtos
  for each row execute function public.produtos_antes_de_atualizar();

-- ---------------------------------------------------------------------
-- 4. Movimentações de estoque (histórico — não pode ser editado)
-- ---------------------------------------------------------------------
create table public.movimentacoes (
  id              bigint generated always as identity primary key,
  produto_id      bigint references public.produtos (id) on delete set null,
  produto_codigo  text not null,      -- cópia, para o histórico sobreviver se o produto for removido
  produto_nome    text not null,
  tipo            text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  quantidade      numeric(12, 3) not null check (quantidade >= 0),
  saldo_anterior  numeric(12, 3) not null,
  saldo_apos      numeric(12, 3) not null check (saldo_apos >= 0),
  observacao      text,
  usuario_id      uuid references auth.users (id) on delete set null,
  usuario_nome    text,
  criado_em       timestamptz not null default now()
);

create index movimentacoes_produto_idx on public.movimentacoes (produto_id, criado_em desc);
create index movimentacoes_data_idx    on public.movimentacoes (criado_em desc);

-- Registra entrada/saída/ajuste de forma segura (trava a linha do produto).
create or replace function public.movimentar_estoque(
  p_produto_id  bigint,
  p_tipo        text,
  p_quantidade  numeric,
  p_observacao  text default null
)
returns public.movimentacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto  public.produtos;
  v_novo     numeric(12, 3);
  v_mov      public.movimentacoes;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para movimentar estoque.';
  end if;
  if p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimentação inválido.';
  end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'A quantidade não pode ser negativa.';
  end if;
  if p_tipo in ('entrada', 'saida') and p_quantidade = 0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;

  select * into v_produto from public.produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;

  v_novo := case p_tipo
              when 'entrada' then v_produto.estoque + p_quantidade
              when 'saida'   then v_produto.estoque - p_quantidade
              else p_quantidade
            end;

  if v_novo < 0 then
    raise exception 'Estoque insuficiente: saldo atual % e saída de %.', v_produto.estoque, p_quantidade;
  end if;

  perform set_config('lojafacil.movimentando', 'sim', true);
  update public.produtos set estoque = v_novo where id = p_produto_id;
  perform set_config('lojafacil.movimentando', '', true);

  insert into public.movimentacoes
    (produto_id, produto_codigo, produto_nome, tipo, quantidade,
     saldo_anterior, saldo_apos, observacao, usuario_id, usuario_nome)
  values
    (v_produto.id, v_produto.codigo, v_produto.nome, p_tipo, p_quantidade,
     v_produto.estoque, v_novo, nullif(trim(p_observacao), ''), auth.uid(),
     (select nome from public.perfis where id = auth.uid()))
  returning * into v_mov;

  return v_mov;
end;
$$;

-- Ao cadastrar um produto com estoque, registra a "entrada inicial" no histórico.
create or replace function public.produtos_apos_inserir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estoque > 0 then
    insert into public.movimentacoes
      (produto_id, produto_codigo, produto_nome, tipo, quantidade,
       saldo_anterior, saldo_apos, observacao, usuario_id, usuario_nome)
    values
      (new.id, new.codigo, new.nome, 'entrada', new.estoque, 0, new.estoque,
       'Estoque inicial no cadastro', auth.uid(),
       (select nome from public.perfis where id = auth.uid()));
  end if;
  return new;
end;
$$;

create trigger produtos_apos_inserir
  after insert on public.produtos
  for each row execute function public.produtos_apos_inserir();

-- ---------------------------------------------------------------------
-- 5. Visão de produtos com indicadores calculados
--    (security_invoker = respeita as regras de segurança de quem consulta)
-- ---------------------------------------------------------------------
create or replace view public.vw_produtos
with (security_invoker = true)
as
select
  p.*,
  round(p.custo * p.estoque, 2)                                     as valor_estoque,
  (p.estoque_minimo > 0 and p.estoque < p.estoque_minimo)           as abaixo_minimo,
  case when p.validade is null then null
       else p.validade - (now() at time zone 'America/Sao_Paulo')::date
  end                                                               as dias_para_vencer,
  case
    when p.validade is null then 'sem_validade'
    when p.validade <  (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    when p.validade <= (now() at time zone 'America/Sao_Paulo')::date + 7 then 'critico'
    when p.validade <= (now() at time zone 'America/Sao_Paulo')::date + c.dias_alerta_validade then 'proximo'
    else 'ok'
  end                                                               as situacao_validade
from public.produtos p
cross join public.configuracoes c;

-- Números do painel em uma única chamada.
create or replace function public.resumo_painel()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'total_produtos',       count(*) filter (where ativo),
    'total_inativos',       count(*) filter (where not ativo),
    'valor_estoque',        coalesce(sum(valor_estoque) filter (where ativo), 0),
    'abaixo_minimo',        count(*) filter (where ativo and abaixo_minimo),
    'proximos_vencimento',  count(*) filter (where ativo and situacao_validade in ('proximo', 'critico')),
    'vencidos',             count(*) filter (where ativo and situacao_validade = 'vencido')
  )
  from public.vw_produtos;
$$;

-- ---------------------------------------------------------------------
-- 6. Regras de segurança (RLS)
--    admin    → tudo
--    operador → consulta produtos, movimenta estoque, etiquetas e relatórios
--    pendente → nada (aguarda liberação do admin)
-- ---------------------------------------------------------------------
alter table public.perfis        enable row level security;
alter table public.configuracoes enable row level security;
alter table public.produtos      enable row level security;
alter table public.movimentacoes enable row level security;

-- Perfis: cada um vê o próprio; admin vê todos. Alteração só pela função definir_papel.
create policy perfis_ver on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_admin());

create policy perfis_editar_proprio_nome on public.perfis
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and papel = public.meu_papel());

-- Configurações
create policy config_ver on public.configuracoes
  for select to authenticated using (public.tem_acesso());
create policy config_editar on public.configuracoes
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Produtos
create policy produtos_ver on public.produtos
  for select to authenticated using (public.tem_acesso());
create policy produtos_incluir on public.produtos
  for insert to authenticated with check (public.eh_admin());
create policy produtos_editar on public.produtos
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy produtos_remover on public.produtos
  for delete to authenticated using (public.eh_admin());

-- Movimentações: só leitura. Inclusão apenas pela função movimentar_estoque.
create policy movimentacoes_ver on public.movimentacoes
  for select to authenticated using (public.tem_acesso());

-- Permissões de execução das funções
revoke all on function public.movimentar_estoque(bigint, text, numeric, text) from public, anon;
grant execute on function public.movimentar_estoque(bigint, text, numeric, text) to authenticated;
revoke all on function public.definir_papel(uuid, text) from public, anon;
grant execute on function public.definir_papel(uuid, text) to authenticated;
revoke all on function public.resumo_painel() from public, anon;
grant execute on function public.resumo_painel() to authenticated;
revoke all on function public.criar_perfil_novo_usuario() from public, anon, authenticated;

-- Visitantes sem login não acessam nada.
revoke all on public.vw_produtos from anon;
grant select on public.vw_produtos to authenticated;

-- ---------------------------------------------------------------------
-- 7. Tempo real: o painel atualiza sozinho quando outro computador movimenta o estoque.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.produtos, public.movimentacoes;
