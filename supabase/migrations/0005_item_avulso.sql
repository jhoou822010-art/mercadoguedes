-- =====================================================================
-- Loja Fácil — Migração 0005 (item avulso no caixa)
-- Rode DEPOIS da 0001, 0002, 0003 e 0004, uma única vez, no SQL Editor do Supabase.
-- Não apaga nada: acrescenta colunas e atualiza a função que finaliza a venda.
--
-- Item avulso = produto sem cadastro (ou sem código), vendido com descrição,
-- preço e quantidade digitados no caixa. Entra na venda, no comprovante e no
-- fechamento do caixa, mas NÃO mexe no estoque.
-- =====================================================================

-- O administrador pode bloquear o item avulso para operadores (balconistas).
alter table public.configuracoes
  add column if not exists permitir_item_avulso boolean not null default true;

-- Marca os itens vendidos sem cadastro.
alter table public.venda_itens
  add column if not exists avulso boolean not null default false;

-- Função de venda atualizada: aceita itens no formato
--   {"produto_id": 1, "quantidade": 2}                                   (produto cadastrado)
--   {"avulso": true, "descricao": "Bolo caseiro", "preco": 12.5, "quantidade": 1}   (sem cadastro)
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
  v_av          record;
  v_permite_av  boolean;
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
      from jsonb_array_elements(p_itens) x
      where not coalesce((x ->> 'avulso')::boolean, false)
      group by 1 order by 1 loop
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

  -- Itens avulsos (sem cadastro): descrição, preço e quantidade digitados no caixa. Não mexem no estoque.
  select coalesce(permitir_item_avulso, true) into v_permite_av from public.configuracoes where id = 1;
  for v_av in
    select coalesce(nullif(trim(x ->> 'descricao'), ''), 'Item avulso') as descricao,
           round((x ->> 'preco')::numeric, 2) as preco,
           round((x ->> 'quantidade')::numeric, 3) as quantidade
    from jsonb_array_elements(p_itens) x
    where coalesce((x ->> 'avulso')::boolean, false)
  loop
    if not v_permite_av and not public.eh_admin() then
      raise exception 'Item avulso (sem cadastro) não está liberado para operador. Peça ao administrador.';
    end if;
    if v_av.preco is null or v_av.preco <= 0 then
      raise exception 'Informe um preço maior que zero para "%".', v_av.descricao;
    end if;
    if v_av.preco > 100000 then
      raise exception 'Preço muito alto para "%". Confira o valor.', v_av.descricao;
    end if;
    if v_av.quantidade is null or v_av.quantidade <= 0 then
      raise exception 'Quantidade inválida para "%".', v_av.descricao;
    end if;
    v_subtotal := v_subtotal + round(v_av.preco * v_av.quantidade, 2);
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
      from jsonb_array_elements(p_itens) x
      where not coalesce((x ->> 'avulso')::boolean, false)
      group by 1 order by 1 loop
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

  insert into public.venda_itens
    (venda_id, produto_id, produto_codigo, produto_nome, unidade, quantidade, preco_unitario, total, avulso)
  select v_venda.id, null, 'AVULSO',
         left(coalesce(nullif(trim(x ->> 'descricao'), ''), 'Item avulso'), 120), 'UN',
         round((x ->> 'quantidade')::numeric, 3),
         round((x ->> 'preco')::numeric, 2),
         round(round((x ->> 'preco')::numeric, 2) * round((x ->> 'quantidade')::numeric, 3), 2),
         true
  from jsonb_array_elements(p_itens) x
  where coalesce((x ->> 'avulso')::boolean, false);

  return v_venda;
end;
$$;

revoke all on function public.finalizar_venda(jsonb, numeric, jsonb, text, text) from public, anon;
grant execute on function public.finalizar_venda(jsonb, numeric, jsonb, text, text) to authenticated;
