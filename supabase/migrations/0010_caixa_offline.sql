-- =====================================================================
-- Loja Fácil · 0010 · CAIXA SEM INTERNET (modo offline, etapa 2)
--
-- Cada computador grava a abertura do caixa, as vendas, sangrias,
-- suprimentos, recebimentos de fiado/parcela, clientes novos, movimentações
-- de estoque e o fechamento PRIMEIRO no próprio computador, com um código
-- único (uuid). Depois envia ao servidor por estas funções, que:
--   * aceitam a mesma operação UMA vez só (mandar de novo não duplica);
--   * gravam a data/hora em que aconteceu de verdade (no caixa);
--   * aceitam a venda já feita mesmo que o estoque fique negativo, o desconto
--     passe do limite ou o crédito passe do limite — a venda aconteceu e o
--     dinheiro foi recebido —, mas ANOTAM a divergência para o administrador.
--
-- Mudanças: colunas novas (uuid_local, dispositivo, codigo_local,
-- divergencias), estoque pode ficar negativo (só por venda já feita), um
-- caixa aberto por usuário POR COMPUTADOR. NÃO apaga nem altera dados.
-- Pode rodar mais de uma vez.
-- =====================================================================

-- 1) Colunas novas
alter table public.caixas            add column if not exists uuid_local uuid;
alter table public.caixas            add column if not exists dispositivo text;
alter table public.vendas            add column if not exists uuid_local uuid;
alter table public.vendas            add column if not exists dispositivo text;
alter table public.vendas            add column if not exists codigo_local text;
alter table public.vendas            add column if not exists divergencias text;
alter table public.caixa_movimentos  add column if not exists uuid_local uuid;

create unique index if not exists caixas_uuid_local_unico           on public.caixas (uuid_local) where uuid_local is not null;
create unique index if not exists vendas_uuid_local_unico           on public.vendas (uuid_local) where uuid_local is not null;
create unique index if not exists caixa_movimentos_uuid_local_unico on public.caixa_movimentos (uuid_local) where uuid_local is not null;

grant select (uuid_local, dispositivo) on public.caixas to authenticated;

-- 2) Um caixa aberto por usuário em CADA computador (antes: um no total).
drop index if exists public.caixas_um_aberto_por_usuario;
create unique index if not exists caixas_um_aberto_por_usuario_dispositivo
  on public.caixas (usuario_id, coalesce(dispositivo, '')) where status = 'aberto';

-- 3) Estoque pode ficar negativo quando uma venda JÁ FEITA sem internet chega
--    depois de o produto ter acabado (dois caixas vendendo o último item).
--    Entrada/saída/ajuste manuais continuam sem deixar ficar negativo.
alter table public.produtos drop constraint if exists produtos_estoque_check;
alter table public.movimentacoes drop constraint if exists movimentacoes_saldo_apos_check;
alter table public.movimentacoes drop constraint if exists movimentacoes_saldo_anterior_check;

-- Ajuda: localizar o caixa pelo código local ou pelo número.
create or replace function public.sinc_achar_caixa(p_caixa_uuid uuid, p_caixa_id bigint)
returns public.caixas
language plpgsql security definer set search_path = public
as $$
declare v public.caixas;
begin
  if p_caixa_uuid is not null then
    select * into v from public.caixas where uuid_local = p_caixa_uuid;
  end if;
  if v.id is null and p_caixa_id is not null then
    select * into v from public.caixas where id = p_caixa_id;
  end if;
  if v.id is null then
    raise exception 'Caixa não encontrado (a abertura ainda não chegou ao servidor).';
  end if;
  if not (public.eh_admin() or (v.usuario_id = auth.uid() and public.tem_acesso())) then
    raise exception 'Este caixa é de outro usuário.';
  end if;
  return v;
end;
$$;

-- Data informada pelo computador, sem aceitar data no futuro (relógio errado).
create or replace function public.sinc_data(p timestamptz)
returns timestamptz language sql immutable as $$ select p $$;

create or replace function public.sinc_quando(p timestamptz)
returns timestamptz language sql stable as $$ select least(coalesce(p, now()), now()) $$;

-- ---------------------------------------------------------------------
-- 4) Abrir caixa
-- ---------------------------------------------------------------------
create or replace function public.sinc_abrir_caixa(p_uuid uuid, p_valor_abertura numeric, p_aberto_em timestamptz, p_dispositivo text)
returns public.caixas
language plpgsql security definer set search_path = public
as $$
declare v public.caixas;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para abrir caixa.';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into v from public.caixas where uuid_local = p_uuid;
  if found then return v; end if;   -- já recebido antes: devolve o mesmo
  if p_valor_abertura is null or p_valor_abertura < 0 then
    raise exception 'O valor de abertura não pode ser negativo.';
  end if;
  insert into public.caixas (usuario_id, usuario_nome, valor_abertura, aberto_em, uuid_local, dispositivo)
  values (auth.uid(), public.meu_nome(), round(p_valor_abertura, 2), public.sinc_quando(p_aberto_em), p_uuid, p_dispositivo)
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Sangria / suprimento
-- ---------------------------------------------------------------------
create or replace function public.sinc_movimento_caixa(p_uuid uuid, p_caixa_uuid uuid, p_caixa_id bigint, p_tipo text, p_valor numeric, p_observacao text, p_criado_em timestamptz)
returns public.caixa_movimentos
language plpgsql security definer set search_path = public
as $$
declare
  v public.caixa_movimentos;
  c public.caixas;
begin
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into v from public.caixa_movimentos where uuid_local = p_uuid;
  if found then return v; end if;
  if p_tipo not in ('sangria', 'suprimento') then
    raise exception 'Tipo de movimento inválido.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor inválido.';
  end if;
  c := public.sinc_achar_caixa(p_caixa_uuid, p_caixa_id);
  insert into public.caixa_movimentos (caixa_id, tipo, valor, observacao, usuario_id, usuario_nome, criado_em, uuid_local)
  values (c.id, p_tipo, round(p_valor, 2), nullif(trim(p_observacao), ''), auth.uid(), public.meu_nome(), public.sinc_quando(p_criado_em), p_uuid)
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Venda
--   p_itens: [{produto_id, quantidade, preco_unitario, produto_codigo, produto_nome, unidade}
--             | {avulso: true, descricao, preco, quantidade}]
--   Usa o PREÇO COBRADO no caixa (a venda já aconteceu). Diferenças viram
--   anotação em "divergencias", nunca recusa.
-- ---------------------------------------------------------------------
create or replace function public.sinc_venda(
  p_uuid uuid, p_caixa_uuid uuid, p_caixa_id bigint,
  p_itens jsonb, p_desconto numeric, p_pagamentos jsonb,
  p_cliente_nome text, p_cliente_telefone text,
  p_criado_em timestamptz, p_codigo_local text, p_dispositivo text
)
returns public.vendas
language plpgsql security definer set search_path = public
as $$
declare
  v_venda      public.vendas;
  c            public.caixas;
  v_item       record;
  v_produto    public.produtos;
  v_subtotal   numeric(12, 2) := 0;
  v_desconto   numeric(12, 2) := round(coalesce(p_desconto, 0), 2);
  v_total      numeric(12, 2);
  v_pago       numeric(12, 2) := 0;
  v_dinheiro   numeric(12, 2) := 0;
  v_troco      numeric(12, 2);
  v_pag        record;
  v_cred       jsonb;
  v_cliente    public.clientes;
  v_parcelas   integer;
  v_primeiro   date;
  v_juros      numeric(6, 2);
  v_total_cred numeric(12, 2);
  v_em_aberto  numeric(12, 2);
  v_pag_id     bigint;
  v_base       numeric(12, 2);
  v_limite     numeric;
  v_quando     timestamptz := public.sinc_quando(p_criado_em);
  v_diverg     text[] := '{}';
  i            integer;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para vender.';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into v_venda from public.vendas where uuid_local = p_uuid;
  if found then return v_venda; end if;   -- já recebida antes: não duplica

  c := public.sinc_achar_caixa(p_caixa_uuid, p_caixa_id);
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda não tem produtos.';
  end if;

  -- Subtotal pelo preço cobrado no caixa
  for v_item in
    select coalesce((x ->> 'avulso')::boolean, false) as avulso,
           nullif(x ->> 'produto_id', '')::bigint as produto_id,
           round((x ->> 'quantidade')::numeric, 3) as quantidade,
           round(coalesce((x ->> 'preco_unitario')::numeric, (x ->> 'preco')::numeric), 2) as preco
    from jsonb_array_elements(p_itens) x
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 or v_item.preco is null or v_item.preco < 0 then
      raise exception 'Item com quantidade ou preço inválido.';
    end if;
    v_subtotal := v_subtotal + round(v_item.preco * v_item.quantidade, 2);
  end loop;

  if v_desconto < 0 or v_desconto > v_subtotal then
    raise exception 'Desconto inválido.';
  end if;
  if not public.eh_admin() then
    select desconto_maximo_percentual into v_limite from public.configuracoes where id = 1;
    if v_subtotal > 0 and v_desconto > round(v_subtotal * v_limite / 100, 2) then
      v_diverg := v_diverg || format('desconto de R$ %s acima do limite do operador', v_desconto);
    end if;
  end if;
  v_total := v_subtotal - v_desconto;

  for v_pag in select x ->> 'forma' as forma, round((x ->> 'valor')::numeric, 2) as valor from jsonb_array_elements(p_pagamentos) x loop
    if v_pag.forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'fiado', 'crediario', 'outro') then
      raise exception 'Forma de pagamento inválida: %.', v_pag.forma;
    end if;
    if v_pag.valor is null or v_pag.valor <= 0 then
      raise exception 'Valor de pagamento inválido.';
    end if;
    v_pago := v_pago + v_pag.valor;
    if v_pag.forma = 'dinheiro' then v_dinheiro := v_dinheiro + v_pag.valor; end if;
  end loop;
  if v_pago < v_total then
    raise exception 'Pagamentos (R$ %) menores que o total (R$ %).', v_pago, v_total;
  end if;
  v_troco := v_pago - v_total;
  if v_troco > v_dinheiro then
    raise exception 'Troco maior que o pago em dinheiro.';
  end if;

  -- Crediário
  select x into v_cred from jsonb_array_elements(p_pagamentos) x where x ->> 'forma' = 'crediario' limit 1;
  if v_cred is not null then
    v_cliente := public.sinc_achar_cliente(nullif(v_cred ->> 'cliente_id', '')::bigint, nullif(v_cred ->> 'cliente_uuid', '')::uuid);
    if v_cliente.id is null then
      raise exception 'Cliente do crediário não encontrado (o cadastro ainda não chegou ao servidor).';
    end if;
    if not v_cliente.ativo then
      v_diverg := v_diverg || format('cliente "%s" estava inativo', v_cliente.nome);
    end if;
    v_parcelas := least(greatest(coalesce(nullif(v_cred ->> 'parcelas', '')::integer, 1), 1), 24);
    v_juros := least(greatest(round(coalesce(nullif(v_cred ->> 'juros_percentual', '')::numeric, 0), 2), 0), 100);
    v_total_cred := round(round((v_cred ->> 'valor')::numeric, 2) * (1 + v_juros / 100), 2);
    v_primeiro := coalesce(nullif(v_cred ->> 'primeiro_vencimento', '')::date, (v_quando at time zone 'America/Sao_Paulo')::date + 30);
    if v_cliente.limite_credito is not null and not public.eh_admin() then
      select coalesce(sum(valor), 0) into v_em_aberto from public.parcelas where cliente_id = v_cliente.id and status = 'aberta';
      if v_em_aberto + v_total_cred > v_cliente.limite_credito then
        v_diverg := v_diverg || format('limite de crédito de "%s" excedido', v_cliente.nome);
      end if;
    end if;
  end if;

  insert into public.vendas
    (caixa_id, usuario_id, usuario_nome, subtotal, desconto, total, valor_pago, troco, cliente_nome, cliente_telefone, cliente_id,
     criado_em, uuid_local, dispositivo, codigo_local)
  values
    (c.id, auth.uid(), public.meu_nome(), v_subtotal, v_desconto, v_total, v_pago, v_troco,
     coalesce(nullif(trim(p_cliente_nome), ''), v_cliente.nome), coalesce(nullif(trim(p_cliente_telefone), ''), v_cliente.telefone), v_cliente.id,
     v_quando, p_uuid, p_dispositivo, p_codigo_local)
  returning * into v_venda;

  insert into public.venda_pagamentos (venda_id, forma, valor)
  select v_venda.id, x ->> 'forma', round((x ->> 'valor')::numeric, 2) from jsonb_array_elements(p_pagamentos) x;

  if v_cred is not null then
    select id into v_pag_id from public.venda_pagamentos where venda_id = v_venda.id and forma = 'crediario' limit 1;
    update public.venda_pagamentos set juros_percentual = v_juros, valor_com_juros = v_total_cred where id = v_pag_id;
    v_base := floor(v_total_cred * 100 / v_parcelas) / 100;
    for i in 1 .. v_parcelas loop
      insert into public.parcelas (venda_id, pagamento_id, cliente_id, numero, total_parcelas, valor, vencimento)
      values (v_venda.id, v_pag_id, v_cliente.id, i, v_parcelas,
              case when i = v_parcelas then v_total_cred - v_base * (v_parcelas - 1) else v_base end,
              (v_primeiro + make_interval(months => i - 1))::date);
    end loop;
  end if;

  -- Itens e baixa de estoque
  perform set_config('lojafacil.movimentando', 'sim', true);
  for v_item in
    select coalesce((x ->> 'avulso')::boolean, false) as avulso,
           nullif(x ->> 'produto_id', '')::bigint as produto_id,
           round((x ->> 'quantidade')::numeric, 3) as quantidade,
           round(coalesce((x ->> 'preco_unitario')::numeric, (x ->> 'preco')::numeric), 2) as preco,
           coalesce(nullif(trim(x ->> 'descricao'), ''), nullif(trim(x ->> 'produto_nome'), ''), 'Item') as nome,
           coalesce(x ->> 'produto_codigo', 'AVULSO') as codigo,
           coalesce(x ->> 'unidade', 'UN') as unidade
    from jsonb_array_elements(p_itens) x
  loop
    v_produto := null;
    if not v_item.avulso and v_item.produto_id is not null then
      select * into v_produto from public.produtos where id = v_item.produto_id for update;
    end if;
    if not v_item.avulso and v_produto.id is null then
      v_diverg := v_diverg || format('produto "%s" não existe mais no cadastro (gravado sem baixa de estoque)', v_item.nome);
    end if;
    insert into public.venda_itens (venda_id, produto_id, produto_codigo, produto_nome, unidade, quantidade, preco_unitario, total, avulso)
    values (v_venda.id, v_produto.id, coalesce(v_produto.codigo, v_item.codigo), left(coalesce(v_produto.nome, v_item.nome), 120),
            coalesce(v_produto.unidade, v_item.unidade), v_item.quantidade, v_item.preco, round(v_item.preco * v_item.quantidade, 2),
            v_item.avulso or v_produto.id is null);
    if v_produto.id is not null then
      if v_produto.estoque < v_item.quantidade then
        v_diverg := v_diverg || format('estoque de "%s" ficou negativo (%s)', v_produto.nome, v_produto.estoque - v_item.quantidade);
      end if;
      if v_produto.preco <> v_item.preco then
        v_diverg := v_diverg || format('"%s" vendido a R$ %s (cadastro: R$ %s)', v_produto.nome, v_item.preco, v_produto.preco);
      end if;
      update public.produtos set estoque = estoque - v_item.quantidade where id = v_produto.id;
      insert into public.movimentacoes (produto_id, produto_codigo, produto_nome, tipo, quantidade, saldo_anterior, saldo_apos,
                                        observacao, usuario_id, usuario_nome, venda_id, criado_em)
      values (v_produto.id, v_produto.codigo, v_produto.nome, 'saida', v_item.quantidade, v_produto.estoque, v_produto.estoque - v_item.quantidade,
              'Venda nº ' || v_venda.id, auth.uid(), public.meu_nome(), v_venda.id, v_quando);
    end if;
  end loop;
  perform set_config('lojafacil.movimentando', '', true);

  if array_length(v_diverg, 1) > 0 then
    update public.vendas set divergencias = array_to_string(v_diverg, '; ') where id = v_venda.id returning * into v_venda;
  end if;
  return v_venda;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Fechar caixa (o valor esperado é calculado no servidor)
-- ---------------------------------------------------------------------
create or replace function public.sinc_fechar_caixa(p_caixa_uuid uuid, p_caixa_id bigint, p_valor_contado numeric, p_observacao text, p_fechado_em timestamptz)
returns public.caixas
language plpgsql security definer set search_path = public
as $$
declare c public.caixas;
begin
  c := public.sinc_achar_caixa(p_caixa_uuid, p_caixa_id);
  perform pg_advisory_xact_lock(hashtext('fechar' || c.id));
  select * into c from public.caixas where id = c.id;
  if c.status = 'fechado' then return c; end if;   -- já fechado: não repete
  perform public.fechar_caixa(c.id, p_valor_contado, p_observacao);
  update public.caixas set fechado_em = greatest(aberto_em, public.sinc_quando(p_fechado_em)) where id = c.id returning * into c;
  return c;
end;
$$;

revoke all on function public.sinc_abrir_caixa(uuid, numeric, timestamptz, text) from public, anon;
revoke all on function public.sinc_movimento_caixa(uuid, uuid, bigint, text, numeric, text, timestamptz) from public, anon;
revoke all on function public.sinc_venda(uuid, uuid, bigint, jsonb, numeric, jsonb, text, text, timestamptz, text, text) from public, anon;
revoke all on function public.sinc_fechar_caixa(uuid, bigint, numeric, text, timestamptz) from public, anon;
revoke all on function public.sinc_achar_caixa(uuid, bigint) from public, anon;
grant execute on function public.sinc_abrir_caixa(uuid, numeric, timestamptz, text) to authenticated;
grant execute on function public.sinc_movimento_caixa(uuid, uuid, bigint, text, numeric, text, timestamptz) to authenticated;
grant execute on function public.sinc_venda(uuid, uuid, bigint, jsonb, numeric, jsonb, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.sinc_fechar_caixa(uuid, bigint, numeric, text, timestamptz) to authenticated;
drop function if exists public.sinc_data(timestamptz);

-- ---------------------------------------------------------------------
-- 8) Receber fiado e parcela, cadastrar cliente e movimentar estoque
--    feitos SEM internet (mesmas regras, por uuid, uma vez só).
-- ---------------------------------------------------------------------
alter table public.clientes      add column if not exists uuid_local uuid;
alter table public.movimentacoes add column if not exists uuid_local uuid;
create unique index if not exists clientes_uuid_local_unico      on public.clientes (uuid_local) where uuid_local is not null;
create unique index if not exists movimentacoes_uuid_local_unico on public.movimentacoes (uuid_local) where uuid_local is not null;

-- Crediário de cliente cadastrado sem internet: a venda chega com o uuid do cliente.
create or replace function public.sinc_achar_cliente(p_id bigint, p_uuid uuid)
returns public.clientes language sql stable security definer set search_path = public as $$
  select * from public.clientes where (p_id is not null and p_id > 0 and id = p_id) or (p_uuid is not null and uuid_local = p_uuid) limit 1
$$;

create or replace function public.sinc_cliente(p_uuid uuid, p_nome text, p_telefone text, p_cpf text, p_endereco text, p_observacao text)
returns public.clientes
language plpgsql security definer set search_path = public
as $$
declare v public.clientes;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para cadastrar cliente.';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into v from public.clientes where uuid_local = p_uuid;
  if found then return v; end if;
  -- Mesmo CPF/CNPJ já cadastrado (ex.: no outro computador): usa o existente, não duplica.
  if nullif(trim(p_cpf), '') is not null then
    select * into v from public.clientes where cpf = trim(p_cpf);
    if found then return v; end if;
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Nome do cliente inválido.';
  end if;
  insert into public.clientes (nome, telefone, cpf, endereco, observacao, uuid_local)
  values (trim(p_nome), nullif(trim(p_telefone), ''), nullif(trim(p_cpf), ''), nullif(trim(p_endereco), ''), nullif(trim(p_observacao), ''), p_uuid)
  returning * into v;
  return v;
end;
$$;

create or replace function public.sinc_receber_fiado(p_uuid uuid, p_pagamento_id bigint, p_venda_uuid uuid, p_forma text, p_caixa_uuid uuid, p_caixa_id bigint, p_recebido_em timestamptz)
returns public.caixa_movimentos
language plpgsql security definer set search_path = public
as $$
declare
  m public.caixa_movimentos;
  v_pag public.venda_pagamentos;
  c public.caixas;
  v_status text;
  v_quando timestamptz := public.sinc_quando(p_recebido_em);
begin
  if not public.tem_acesso() then raise exception 'Seu usuário não tem permissão.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into m from public.caixa_movimentos where uuid_local = p_uuid;
  if found then return m; end if;
  if p_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'outro') then
    raise exception 'Forma de recebimento inválida.';
  end if;
  if p_pagamento_id is not null and p_pagamento_id > 0 then
    select * into v_pag from public.venda_pagamentos where id = p_pagamento_id for update;
  else
    select p.* into v_pag from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id
     where v.uuid_local = p_venda_uuid and p.forma = 'fiado' order by p.id limit 1 for update;
  end if;
  if v_pag.id is null or v_pag.forma <> 'fiado' then raise exception 'Fiado não encontrado.'; end if;
  if v_pag.fiado_recebido_em is not null then
    raise exception 'Este fiado já tinha sido recebido em % por % — foi recebido de novo neste computador. Confira com o cliente.',
      to_char(v_pag.fiado_recebido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), coalesce(v_pag.fiado_recebido_por, '?');
  end if;
  select status into v_status from public.vendas where id = v_pag.venda_id;
  if v_status = 'cancelada' then raise exception 'A venda deste fiado foi cancelada.'; end if;
  c := public.sinc_achar_caixa(p_caixa_uuid, p_caixa_id);
  update public.venda_pagamentos set fiado_recebido_em = v_quando, fiado_recebido_forma = p_forma, fiado_recebido_por = public.meu_nome()
   where id = v_pag.id returning * into v_pag;
  insert into public.caixa_movimentos (caixa_id, tipo, forma, valor, observacao, venda_id, usuario_id, usuario_nome, criado_em, uuid_local)
  values (c.id, 'recebimento_fiado', p_forma, v_pag.valor, 'Fiado da venda nº ' || v_pag.venda_id, v_pag.venda_id, auth.uid(), public.meu_nome(), v_quando, p_uuid)
  returning * into m;
  return m;
end;
$$;

create or replace function public.sinc_receber_parcela(p_uuid uuid, p_parcela_id bigint, p_venda_uuid uuid, p_numero integer, p_forma text, p_caixa_uuid uuid, p_caixa_id bigint, p_recebido_em timestamptz)
returns public.caixa_movimentos
language plpgsql security definer set search_path = public
as $$
declare
  m public.caixa_movimentos;
  v_par public.parcelas;
  c public.caixas;
  v_status text;
  v_quando timestamptz := public.sinc_quando(p_recebido_em);
begin
  if not public.tem_acesso() then raise exception 'Seu usuário não tem permissão.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into m from public.caixa_movimentos where uuid_local = p_uuid;
  if found then return m; end if;
  if p_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'outro') then
    raise exception 'Forma de recebimento inválida.';
  end if;
  if p_parcela_id is not null and p_parcela_id > 0 then
    select * into v_par from public.parcelas where id = p_parcela_id for update;
  else
    select p.* into v_par from public.parcelas p join public.vendas v on v.id = p.venda_id
     where v.uuid_local = p_venda_uuid and p.numero = p_numero for update;
  end if;
  if v_par.id is null then raise exception 'Parcela não encontrada.'; end if;
  if v_par.status = 'paga' then
    raise exception 'Esta parcela já tinha sido paga em % por % — foi recebida de novo neste computador. Confira com o cliente.',
      to_char(v_par.pago_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), coalesce(v_par.pago_por, '?');
  end if;
  if v_par.status = 'cancelada' then raise exception 'Esta parcela foi cancelada.'; end if;
  select status into v_status from public.vendas where id = v_par.venda_id;
  if v_status = 'cancelada' then raise exception 'A venda desta parcela foi cancelada.'; end if;
  c := public.sinc_achar_caixa(p_caixa_uuid, p_caixa_id);
  update public.parcelas set status = 'paga', pago_em = v_quando, pago_forma = p_forma, pago_por = public.meu_nome(), caixa_id = c.id
   where id = v_par.id returning * into v_par;
  insert into public.caixa_movimentos (caixa_id, tipo, forma, valor, observacao, venda_id, usuario_id, usuario_nome, criado_em, uuid_local)
  values (c.id, 'recebimento_crediario', p_forma, v_par.valor,
          'Parcela ' || v_par.numero || '/' || v_par.total_parcelas || ' da venda nº ' || v_par.venda_id, v_par.venda_id, auth.uid(), public.meu_nome(), v_quando, p_uuid)
  returning * into m;
  return m;
end;
$$;

-- Estoque sem internet. Ajuste (contagem) chega como DIFERENÇA em relação ao que
-- o computador mostrava, para não apagar vendas de outro caixa feitas no mesmo período.
create or replace function public.sinc_movimentar_estoque(p_uuid uuid, p_produto_id bigint, p_tipo text, p_quantidade numeric, p_delta numeric, p_observacao text, p_criado_em timestamptz)
returns public.movimentacoes
language plpgsql security definer set search_path = public
as $$
declare
  m public.movimentacoes;
  v_prod public.produtos;
  v_novo numeric(12, 3);
  v_obs text := nullif(trim(p_observacao), '');
begin
  if not public.tem_acesso() then raise exception 'Seu usuário não tem permissão para movimentar estoque.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into m from public.movimentacoes where uuid_local = p_uuid;
  if found then return m; end if;
  if p_tipo not in ('entrada', 'saida', 'ajuste') then raise exception 'Tipo de movimentação inválido.'; end if;
  select * into v_prod from public.produtos where id = p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if p_tipo = 'entrada' then v_novo := v_prod.estoque + abs(p_quantidade);
  elsif p_tipo = 'saida' then v_novo := v_prod.estoque - abs(p_quantidade);
  else v_novo := v_prod.estoque + coalesce(p_delta, 0);
       v_obs := concat_ws(' · ', v_obs, format('contagem sem internet: %s', p_quantidade));
  end if;
  if v_novo < 0 then v_obs := concat_ws(' · ', v_obs, 'estoque ficou negativo'); end if;
  perform set_config('lojafacil.movimentando', 'sim', true);
  update public.produtos set estoque = v_novo where id = v_prod.id;
  perform set_config('lojafacil.movimentando', '', true);
  insert into public.movimentacoes (produto_id, produto_codigo, produto_nome, tipo, quantidade, saldo_anterior, saldo_apos, observacao, usuario_id, usuario_nome, criado_em, uuid_local)
  values (v_prod.id, v_prod.codigo, v_prod.nome, p_tipo, case when p_tipo = 'ajuste' then greatest(v_novo, 0) else abs(p_quantidade) end,
          v_prod.estoque, v_novo, v_obs, auth.uid(), public.meu_nome(), public.sinc_quando(p_criado_em), p_uuid)
  returning * into m;
  return m;
end;
$$;

revoke all on function public.sinc_cliente(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.sinc_receber_fiado(uuid, bigint, uuid, text, uuid, bigint, timestamptz) from public, anon;
revoke all on function public.sinc_receber_parcela(uuid, bigint, uuid, integer, text, uuid, bigint, timestamptz) from public, anon;
revoke all on function public.sinc_movimentar_estoque(uuid, bigint, text, numeric, numeric, text, timestamptz) from public, anon;
revoke all on function public.sinc_achar_cliente(bigint, uuid) from public, anon;
grant execute on function public.sinc_cliente(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.sinc_receber_fiado(uuid, bigint, uuid, text, uuid, bigint, timestamptz) to authenticated;
grant execute on function public.sinc_receber_parcela(uuid, bigint, uuid, integer, text, uuid, bigint, timestamptz) to authenticated;
grant execute on function public.sinc_movimentar_estoque(uuid, bigint, text, numeric, numeric, text, timestamptz) to authenticated;

-- Conferência: deve listar as 8 funções.
select proname as funcao_criada from pg_proc
 where proname in ('sinc_abrir_caixa', 'sinc_movimento_caixa', 'sinc_venda', 'sinc_fechar_caixa',
                   'sinc_cliente', 'sinc_receber_fiado', 'sinc_receber_parcela', 'sinc_movimentar_estoque') order by 1;
