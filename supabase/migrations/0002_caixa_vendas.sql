-- =====================================================================
-- Loja Fácil — Migração 0002 (caixa, vendas e comprovante não fiscal)
-- Rode DEPOIS da 0001, uma única vez, no SQL Editor do Supabase.
-- Não apaga nada: só acrescenta colunas, tabelas e funções.
-- Faça um backup pelo sistema (menu Backup) antes de rodar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dados da loja para o comprovante e limite de desconto
-- ---------------------------------------------------------------------
alter table public.configuracoes
  add column if not exists cnpj                        text,
  add column if not exists mostrar_cnpj                boolean not null default true,
  add column if not exists endereco                    text,
  add column if not exists telefone                    text,
  add column if not exists mensagem_comprovante        text not null default 'Obrigado pela preferência!',
  add column if not exists desconto_maximo_percentual  numeric(5, 2) not null default 100
    check (desconto_maximo_percentual between 0 and 100);

comment on column public.configuracoes.desconto_maximo_percentual is
  'Desconto máximo (em % do subtotal) que um operador pode dar por venda. Administrador não tem limite.';

-- ---------------------------------------------------------------------
-- 2. Caixas (abertura e fechamento) — um caixa aberto por usuário
-- ---------------------------------------------------------------------
create table public.caixas (
  id                     bigint generated always as identity primary key,
  usuario_id             uuid not null references auth.users (id),
  usuario_nome           text,
  status                 text not null default 'aberto' check (status in ('aberto', 'fechado')),
  valor_abertura         numeric(12, 2) not null default 0 check (valor_abertura >= 0),
  aberto_em              timestamptz not null default now(),
  fechado_em             timestamptz,
  fechado_por_nome       text,
  valor_esperado         numeric(12, 2),
  valor_contado          numeric(12, 2) check (valor_contado >= 0),
  diferenca              numeric(12, 2),
  observacao_fechamento  text,
  resumo                 jsonb
);

create unique index caixas_um_aberto_por_usuario on public.caixas (usuario_id) where status = 'aberto';
create index caixas_aberto_em_idx on public.caixas (aberto_em desc);

-- Sangria (retirada), suprimento (reforço de troco) e recebimento de fiado.
create table public.caixa_movimentos (
  id            bigint generated always as identity primary key,
  caixa_id      bigint not null references public.caixas (id),
  tipo          text not null check (tipo in ('sangria', 'suprimento', 'recebimento_fiado')),
  forma         text not null default 'dinheiro',
  valor         numeric(12, 2) not null check (valor > 0),
  observacao    text,
  venda_id      bigint,
  usuario_id    uuid references auth.users (id) on delete set null,
  usuario_nome  text,
  criado_em     timestamptz not null default now()
);

create index caixa_movimentos_caixa_idx on public.caixa_movimentos (caixa_id);

-- ---------------------------------------------------------------------
-- 3. Vendas
-- ---------------------------------------------------------------------
create table public.vendas (
  id                   bigint generated always as identity primary key,   -- número interno da venda
  caixa_id             bigint not null references public.caixas (id),
  usuario_id           uuid references auth.users (id) on delete set null,
  usuario_nome         text,
  status               text not null default 'concluida' check (status in ('concluida', 'cancelada')),
  subtotal             numeric(12, 2) not null check (subtotal >= 0),
  desconto             numeric(12, 2) not null default 0 check (desconto >= 0),
  total                numeric(12, 2) not null check (total >= 0),
  valor_pago           numeric(12, 2) not null default 0,
  troco                numeric(12, 2) not null default 0 check (troco >= 0),
  cliente_nome         text,
  cliente_telefone     text,
  criado_em            timestamptz not null default now(),
  cancelada_em         timestamptz,
  cancelada_por_nome   text,
  motivo_cancelamento  text,
  constraint vendas_desconto_ate_subtotal check (desconto <= subtotal)
);

create index vendas_criado_em_idx on public.vendas (criado_em desc);
create index vendas_caixa_idx     on public.vendas (caixa_id);

alter table public.caixa_movimentos
  add constraint caixa_movimentos_venda_fk foreign key (venda_id) references public.vendas (id);

create table public.venda_itens (
  id              bigint generated always as identity primary key,
  venda_id        bigint not null references public.vendas (id),
  produto_id      bigint references public.produtos (id) on delete set null,
  produto_codigo  text not null,
  produto_nome    text not null,
  unidade         text not null,
  quantidade      numeric(12, 3) not null check (quantidade > 0),
  preco_unitario  numeric(12, 2) not null check (preco_unitario >= 0),
  total           numeric(12, 2) not null check (total >= 0)
);

create index venda_itens_venda_idx on public.venda_itens (venda_id);

create table public.venda_pagamentos (
  id                     bigint generated always as identity primary key,
  venda_id               bigint not null references public.vendas (id),
  forma                  text not null check (forma in
                           ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'fiado', 'outro')),
  valor                  numeric(12, 2) not null check (valor > 0),
  -- Somente para fiado:
  fiado_recebido_em      timestamptz,
  fiado_recebido_forma   text,
  fiado_recebido_por     text
);

create index venda_pagamentos_venda_idx on public.venda_pagamentos (venda_id);
create index venda_pagamentos_fiado_idx on public.venda_pagamentos (forma) where forma = 'fiado' and fiado_recebido_em is null;

-- Liga a movimentação de estoque à venda que a gerou.
alter table public.movimentacoes
  add column if not exists venda_id bigint references public.vendas (id);

-- ---------------------------------------------------------------------
-- 4. Funções do caixa
-- ---------------------------------------------------------------------
create or replace function public.meu_nome()
returns text language sql stable security definer set search_path = public as $$
  select nome from public.perfis where id = auth.uid();
$$;

create or replace function public.abrir_caixa(p_valor_abertura numeric)
returns public.caixas
language plpgsql security definer set search_path = public
as $$
declare
  v_caixa public.caixas;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para abrir caixa.';
  end if;
  if p_valor_abertura is null or p_valor_abertura < 0 then
    raise exception 'O valor de abertura não pode ser negativo.';
  end if;
  if exists (select 1 from public.caixas where usuario_id = auth.uid() and status = 'aberto') then
    raise exception 'Você já tem um caixa aberto.';
  end if;
  insert into public.caixas (usuario_id, usuario_nome, valor_abertura)
  values (auth.uid(), public.meu_nome(), round(p_valor_abertura, 2))
  returning * into v_caixa;
  return v_caixa;
end;
$$;

-- Resumo de um caixa: totais por forma de pagamento e dinheiro esperado na gaveta.
create or replace function public.resumo_caixa(p_caixa_id bigint)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_caixa public.caixas;
  v_resultado json;
begin
  select * into v_caixa from public.caixas where id = p_caixa_id;
  if not found then
    raise exception 'Caixa não encontrado.';
  end if;
  if not (public.eh_admin() or (v_caixa.usuario_id = auth.uid() and public.tem_acesso())) then
    raise exception 'Você não tem permissão para ver este caixa.';
  end if;

  with
  vendas_ok as (
    select * from public.vendas where caixa_id = p_caixa_id and status = 'concluida'
  ),
  pag as (
    select p.forma, sum(p.valor) as valor
    from public.venda_pagamentos p join vendas_ok v on v.id = p.venda_id
    group by p.forma
  ),
  mov as (
    select
      coalesce(sum(valor) filter (where tipo = 'sangria'), 0)                                         as sangrias,
      coalesce(sum(valor) filter (where tipo = 'suprimento'), 0)                                      as suprimentos,
      coalesce(sum(valor) filter (where tipo = 'recebimento_fiado' and forma = 'dinheiro'), 0)        as fiado_dinheiro,
      coalesce(sum(valor) filter (where tipo = 'recebimento_fiado'), 0)                               as fiado_total
    from public.caixa_movimentos where caixa_id = p_caixa_id
  ),
  tot as (
    select
      count(*)                       as qtd_vendas,
      coalesce(sum(subtotal), 0)     as subtotal,
      coalesce(sum(desconto), 0)     as descontos,
      coalesce(sum(total), 0)        as total_vendas,
      coalesce(sum(troco), 0)        as trocos
    from vendas_ok
  )
  select json_build_object(
    'caixa_id',              v_caixa.id,
    'status',                v_caixa.status,
    'usuario_nome',          v_caixa.usuario_nome,
    'aberto_em',             v_caixa.aberto_em,
    'fechado_em',            v_caixa.fechado_em,
    'valor_abertura',        v_caixa.valor_abertura,
    'qtd_vendas',            tot.qtd_vendas,
    'qtd_canceladas',        (select count(*) from public.vendas where caixa_id = p_caixa_id and status = 'cancelada'),
    'subtotal',              tot.subtotal,
    'descontos',             tot.descontos,
    'total_vendas',          tot.total_vendas,
    'trocos',                tot.trocos,
    'por_forma',             coalesce((select json_object_agg(forma, valor) from pag), '{}'::json),
    'sangrias',              mov.sangrias,
    'suprimentos',           mov.suprimentos,
    'recebimentos_fiado',    mov.fiado_total,
    'recebimentos_fiado_dinheiro', mov.fiado_dinheiro,
    'dinheiro_esperado',     v_caixa.valor_abertura
                             + coalesce((select valor from pag where forma = 'dinheiro'), 0)
                             - tot.trocos
                             + mov.suprimentos
                             + mov.fiado_dinheiro
                             - mov.sangrias
  ) into v_resultado
  from tot, mov;

  return v_resultado;
end;
$$;

create or replace function public.movimentar_caixa(p_tipo text, p_valor numeric, p_observacao text default null)
returns public.caixa_movimentos
language plpgsql security definer set search_path = public
as $$
declare
  v_caixa public.caixas;
  v_mov   public.caixa_movimentos;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão.';
  end if;
  if p_tipo not in ('sangria', 'suprimento') then
    raise exception 'Tipo inválido. Use sangria ou suprimento.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  select * into v_caixa from public.caixas where usuario_id = auth.uid() and status = 'aberto' for update;
  if not found then
    raise exception 'Abra o caixa antes.';
  end if;
  if p_tipo = 'sangria'
     and p_valor > (public.resumo_caixa(v_caixa.id) ->> 'dinheiro_esperado')::numeric then
    raise exception 'A sangria é maior que o dinheiro esperado no caixa.';
  end if;
  insert into public.caixa_movimentos (caixa_id, tipo, valor, observacao, usuario_id, usuario_nome)
  values (v_caixa.id, p_tipo, round(p_valor, 2), nullif(trim(p_observacao), ''), auth.uid(), public.meu_nome())
  returning * into v_mov;
  return v_mov;
end;
$$;

create or replace function public.fechar_caixa(p_caixa_id bigint, p_valor_contado numeric, p_observacao text default null)
returns public.caixas
language plpgsql security definer set search_path = public
as $$
declare
  v_caixa  public.caixas;
  v_resumo json;
  v_esperado numeric(12, 2);
begin
  select * into v_caixa from public.caixas where id = p_caixa_id for update;
  if not found then
    raise exception 'Caixa não encontrado.';
  end if;
  if not (public.eh_admin() or (v_caixa.usuario_id = auth.uid() and public.tem_acesso())) then
    raise exception 'Você não tem permissão para fechar este caixa.';
  end if;
  if v_caixa.status <> 'aberto' then
    raise exception 'Este caixa já está fechado.';
  end if;
  if p_valor_contado is null or p_valor_contado < 0 then
    raise exception 'Informe o valor contado na gaveta.';
  end if;

  v_resumo   := public.resumo_caixa(p_caixa_id);
  v_esperado := (v_resumo ->> 'dinheiro_esperado')::numeric;

  update public.caixas set
    status = 'fechado',
    fechado_em = now(),
    fechado_por_nome = public.meu_nome(),
    valor_esperado = v_esperado,
    valor_contado = round(p_valor_contado, 2),
    diferenca = round(p_valor_contado, 2) - v_esperado,
    observacao_fechamento = nullif(trim(p_observacao), ''),
    resumo = v_resumo::jsonb
  where id = p_caixa_id
  returning * into v_caixa;

  -- guarda o resumo final já com status/fechamento
  update public.caixas set resumo = public.resumo_caixa(p_caixa_id)::jsonb where id = p_caixa_id
  returning * into v_caixa;
  return v_caixa;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Finalizar venda (tudo numa transação: venda, itens, pagamentos e estoque)
--    p_itens:      [{"produto_id": 1, "quantidade": 2}, ...]
--    p_pagamentos: [{"forma": "dinheiro", "valor": 50}, {"forma": "pix", "valor": 10}]
--    Os preços são lidos do banco (a tela não decide preço).
-- ---------------------------------------------------------------------
create or replace function public.finalizar_venda(
  p_itens             jsonb,
  p_desconto          numeric,
  p_pagamentos        jsonb,
  p_cliente_nome      text default null,
  p_cliente_telefone  text default null
)
returns public.vendas
language plpgsql security definer set search_path = public
as $$
declare
  v_caixa       public.caixas;
  v_venda       public.vendas;
  v_item        record;
  v_produto     public.produtos;
  v_pag         record;
  v_subtotal    numeric(12, 2) := 0;
  v_desconto    numeric(12, 2) := round(coalesce(p_desconto, 0), 2);
  v_total       numeric(12, 2);
  v_pago        numeric(12, 2) := 0;
  v_dinheiro    numeric(12, 2) := 0;
  v_troco       numeric(12, 2);
  v_tem_fiado   boolean := false;
  v_limite      numeric;
  v_qtd_itens   integer := 0;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para vender.';
  end if;

  select * into v_caixa from public.caixas where usuario_id = auth.uid() and status = 'aberto';
  if not found then
    raise exception 'Abra o caixa antes de vender.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda não tem produtos.';
  end if;

  -- Soma quantidades repetidas do mesmo produto e confere estoque/preço.
  for v_item in select (x ->> 'produto_id')::bigint as produto_id, sum((x ->> 'quantidade')::numeric) as quantidade
      from jsonb_array_elements(p_itens) x group by 1 order by 1 loop
    select * into v_produto from public.produtos where id = v_item.produto_id for update;
    if not found then
      raise exception 'Produto % não encontrado.', v_item.produto_id;
    end if;
    if not v_produto.ativo then
      raise exception 'O produto "%" está inativo.', v_produto.nome;
    end if;
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida para "%".', v_produto.nome;
    end if;
    if v_produto.unidade in ('UN', 'PCT', 'CX') and v_item.quantidade <> trunc(v_item.quantidade) then
      raise exception 'Para "%" (%) use quantidade inteira.', v_produto.nome, v_produto.unidade;
    end if;
    if v_produto.estoque < v_item.quantidade then
      raise exception 'Estoque insuficiente para "%": saldo %, venda de %.',
        v_produto.nome, v_produto.estoque, v_item.quantidade;
    end if;
    v_subtotal := v_subtotal + round(v_produto.preco * v_item.quantidade, 2);
    v_qtd_itens := v_qtd_itens + 1;
  end loop;

  -- Desconto
  if v_desconto < 0 then
    raise exception 'O desconto não pode ser negativo.';
  end if;
  if v_desconto > v_subtotal then
    raise exception 'O desconto não pode ser maior que o valor da compra.';
  end if;
  if not public.eh_admin() then
    select desconto_maximo_percentual into v_limite from public.configuracoes where id = 1;
    if v_subtotal > 0 and v_desconto > round(v_subtotal * v_limite / 100, 2) then
      raise exception 'Desconto acima do permitido para operador: máximo de % por cento do valor da compra.', replace(rtrim(rtrim(v_limite::text, '0'), '.'), '.', ',');
    end if;
  end if;
  v_total := v_subtotal - v_desconto;

  -- Pagamentos
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' then
    raise exception 'Informe a forma de pagamento.';
  end if;
  for v_pag in
    select x ->> 'forma' as forma, round((x ->> 'valor')::numeric, 2) as valor
    from jsonb_array_elements(p_pagamentos) x
  loop
    if v_pag.forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'fiado', 'outro') then
      raise exception 'Forma de pagamento inválida: %.', v_pag.forma;
    end if;
    if v_pag.valor is null or v_pag.valor <= 0 then
      raise exception 'Valor de pagamento inválido.';
    end if;
    v_pago := v_pago + v_pag.valor;
    if v_pag.forma = 'dinheiro' then v_dinheiro := v_dinheiro + v_pag.valor; end if;
    if v_pag.forma = 'fiado' then v_tem_fiado := true; end if;
  end loop;

  if v_pago < v_total then
    raise exception 'Falta pagar R$ %.', replace(to_char(v_total - v_pago, 'FM999999990.00'), '.', ',');
  end if;
  v_troco := v_pago - v_total;
  if v_troco > v_dinheiro then
    raise exception 'Só é possível dar troco sobre pagamento em dinheiro. Confira os valores do cartão, Pix ou fiado.';
  end if;
  if v_tem_fiado and nullif(trim(p_cliente_nome), '') is null then
    raise exception 'Para vender fiado, informe o nome do cliente.';
  end if;

  -- Grava a venda
  insert into public.vendas
    (caixa_id, usuario_id, usuario_nome, subtotal, desconto, total, valor_pago, troco, cliente_nome, cliente_telefone)
  values
    (v_caixa.id, auth.uid(), public.meu_nome(), v_subtotal, v_desconto, v_total, v_pago, v_troco,
     nullif(trim(p_cliente_nome), ''), nullif(trim(p_cliente_telefone), ''))
  returning * into v_venda;

  insert into public.venda_pagamentos (venda_id, forma, valor)
  select v_venda.id, x ->> 'forma', round((x ->> 'valor')::numeric, 2)
  from jsonb_array_elements(p_pagamentos) x;

  perform set_config('lojafacil.movimentando', 'sim', true);
  for v_item in select (x ->> 'produto_id')::bigint as produto_id, sum((x ->> 'quantidade')::numeric) as quantidade
      from jsonb_array_elements(p_itens) x group by 1 order by 1 loop
    select * into v_produto from public.produtos where id = v_item.produto_id;

    insert into public.venda_itens (venda_id, produto_id, produto_codigo, produto_nome, unidade, quantidade, preco_unitario, total)
    values (v_venda.id, v_produto.id, v_produto.codigo, v_produto.nome, v_produto.unidade,
            v_item.quantidade, v_produto.preco, round(v_produto.preco * v_item.quantidade, 2));

    update public.produtos set estoque = estoque - v_item.quantidade where id = v_produto.id;

    insert into public.movimentacoes
      (produto_id, produto_codigo, produto_nome, tipo, quantidade, saldo_anterior, saldo_apos,
       observacao, usuario_id, usuario_nome, venda_id)
    values
      (v_produto.id, v_produto.codigo, v_produto.nome, 'saida', v_item.quantidade,
       v_produto.estoque, v_produto.estoque - v_item.quantidade,
       'Venda nº ' || v_venda.id, auth.uid(), public.meu_nome(), v_venda.id);
  end loop;
  perform set_config('lojafacil.movimentando', '', true);

  return v_venda;
end;
$$;

-- Cancelar venda (somente administrador): devolve os produtos ao estoque.
create or replace function public.cancelar_venda(p_venda_id bigint, p_motivo text)
returns public.vendas
language plpgsql security definer set search_path = public
as $$
declare
  v_venda   public.vendas;
  v_item    public.venda_itens;
  v_produto public.produtos;
begin
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode cancelar vendas.';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  select * into v_venda from public.vendas where id = p_venda_id for update;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'Esta venda já foi cancelada.';
  end if;
  if exists (select 1 from public.venda_pagamentos where venda_id = p_venda_id and forma = 'fiado' and fiado_recebido_em is not null) then
    raise exception 'Esta venda tem fiado já recebido. Não é possível cancelar automaticamente.';
  end if;

  perform set_config('lojafacil.movimentando', 'sim', true);
  for v_item in select * from public.venda_itens where venda_id = p_venda_id loop
    if v_item.produto_id is null then
      continue; -- produto removido do cadastro: nada a devolver
    end if;
    select * into v_produto from public.produtos where id = v_item.produto_id for update;
    update public.produtos set estoque = estoque + v_item.quantidade where id = v_produto.id;
    insert into public.movimentacoes
      (produto_id, produto_codigo, produto_nome, tipo, quantidade, saldo_anterior, saldo_apos,
       observacao, usuario_id, usuario_nome, venda_id)
    values
      (v_produto.id, v_produto.codigo, v_produto.nome, 'entrada', v_item.quantidade,
       v_produto.estoque, v_produto.estoque + v_item.quantidade,
       'Cancelamento da venda nº ' || p_venda_id, auth.uid(), public.meu_nome(), p_venda_id);
  end loop;
  perform set_config('lojafacil.movimentando', '', true);

  update public.vendas set
    status = 'cancelada', cancelada_em = now(), cancelada_por_nome = public.meu_nome(),
    motivo_cancelamento = trim(p_motivo)
  where id = p_venda_id
  returning * into v_venda;
  return v_venda;
end;
$$;

-- Receber um fiado: o dinheiro entra no caixa aberto de quem recebe.
create or replace function public.receber_fiado(p_pagamento_id bigint, p_forma text)
returns public.venda_pagamentos
language plpgsql security definer set search_path = public
as $$
declare
  v_pag   public.venda_pagamentos;
  v_caixa public.caixas;
  v_status text;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão.';
  end if;
  if p_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'outro') then
    raise exception 'Forma de recebimento inválida.';
  end if;
  select * into v_pag from public.venda_pagamentos where id = p_pagamento_id for update;
  if not found or v_pag.forma <> 'fiado' then
    raise exception 'Fiado não encontrado.';
  end if;
  if v_pag.fiado_recebido_em is not null then
    raise exception 'Este fiado já foi recebido.';
  end if;
  select status into v_status from public.vendas where id = v_pag.venda_id;
  if v_status = 'cancelada' then
    raise exception 'A venda deste fiado foi cancelada.';
  end if;
  select * into v_caixa from public.caixas where usuario_id = auth.uid() and status = 'aberto';
  if not found then
    raise exception 'Abra o seu caixa para receber o fiado.';
  end if;

  update public.venda_pagamentos set
    fiado_recebido_em = now(), fiado_recebido_forma = p_forma, fiado_recebido_por = public.meu_nome()
  where id = p_pagamento_id
  returning * into v_pag;

  insert into public.caixa_movimentos (caixa_id, tipo, forma, valor, observacao, venda_id, usuario_id, usuario_nome)
  values (v_caixa.id, 'recebimento_fiado', p_forma, v_pag.valor,
          'Fiado da venda nº ' || v_pag.venda_id, v_pag.venda_id, auth.uid(), public.meu_nome());
  return v_pag;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Segurança (RLS)
--    Todos os registros são criados pelas funções acima; ninguém edita direto.
-- ---------------------------------------------------------------------
alter table public.caixas            enable row level security;
alter table public.caixa_movimentos  enable row level security;
alter table public.vendas            enable row level security;
alter table public.venda_itens       enable row level security;
alter table public.venda_pagamentos  enable row level security;

create policy caixas_ver on public.caixas
  for select to authenticated using (public.eh_admin() or (usuario_id = auth.uid() and public.tem_acesso()));
create policy caixa_movimentos_ver on public.caixa_movimentos
  for select to authenticated using (
    public.eh_admin() or exists (
      select 1 from public.caixas c where c.id = caixa_id and c.usuario_id = auth.uid() and public.tem_acesso()));
create policy vendas_ver on public.vendas
  for select to authenticated using (public.tem_acesso());
create policy venda_itens_ver on public.venda_itens
  for select to authenticated using (public.tem_acesso());
create policy venda_pagamentos_ver on public.venda_pagamentos
  for select to authenticated using (public.tem_acesso());

revoke insert, update, delete on public.caixas, public.caixa_movimentos, public.vendas,
  public.venda_itens, public.venda_pagamentos from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.abrir_caixa(numeric)',
    'public.resumo_caixa(bigint)',
    'public.movimentar_caixa(text, numeric, text)',
    'public.fechar_caixa(bigint, numeric, text)',
    'public.finalizar_venda(jsonb, numeric, jsonb, text, text)',
    'public.cancelar_venda(bigint, text)',
    'public.receber_fiado(bigint, text)',
    'public.meu_nome()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Painel atualiza "vendas de hoje" sozinho.
alter publication supabase_realtime add table public.vendas;
