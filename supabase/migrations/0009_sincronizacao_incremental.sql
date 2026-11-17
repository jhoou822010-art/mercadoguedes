-- =====================================================================
-- Loja Fácil · 0009 · SINCRONIZAÇÃO INCREMENTAL (modo offline, etapa 1)
--
-- Para cada computador guardar uma cópia dos dados e baixar SÓ o que mudou
-- desde a última vez (economiza internet e é rápido), as tabelas que podem
-- mudar ganham a coluna "atualizado_em", preenchida sozinha pelo banco.
--
-- NÃO apaga nem altera nenhum dado existente. Pode rodar mais de uma vez.
-- =====================================================================

-- Função única que carimba a hora da alteração.
create or replace function public.carimbar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['vendas', 'venda_pagamentos', 'parcelas', 'caixas', 'perfis', 'clientes']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists atualizado_em timestamptz not null default now()', t);
      execute format('create index if not exists %I on public.%I (atualizado_em)', t || '_atualizado_em_idx', t);
      -- clientes já tem o próprio gatilho que carimba (0006); nas outras, cria.
      if t <> 'clientes' then
        execute format('drop trigger if exists trg_carimbar_atualizado_em on public.%I', t);
        execute format('create trigger trg_carimbar_atualizado_em before update on public.%I for each row execute function public.carimbar_atualizado_em()', t);
      end if;
    end if;
  end loop;
end;
$$;

-- Produtos já têm atualizado_em (0001); só o índice para a busca incremental.
create index if not exists produtos_atualizado_em_idx on public.produtos (atualizado_em);

-- Tabelas que só recebem linhas novas (nunca mudam): basta o número (id).
create index if not exists movimentacoes_criado_em_idx on public.movimentacoes (criado_em);

-- "caixas" tem leitura por coluna (0006): libera a nova coluna para leitura.
grant select (atualizado_em) on public.caixas to authenticated;

-- Conferência: deve listar as 6 tabelas com a coluna nova.
select table_name as tabela, 'atualizado_em' as coluna
  from information_schema.columns
 where table_schema = 'public' and column_name = 'atualizado_em'
   and table_name in ('vendas', 'venda_pagamentos', 'parcelas', 'caixas', 'perfis', 'clientes', 'produtos')
 order by 1;
