-- =====================================================================
-- Loja Fácil — Migração 0006 (crediário, clientes, ocultar valores e fechamento cego)
-- Rode DEPOIS da 0001 a 0005, uma única vez, no SQL Editor do Supabase.
-- Não apaga dados: cria tabelas/colunas e atualiza funções.
-- Pode ser rodado de novo sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Opção: esconder valores das vendas dos operadores (fechamento cego)
-- ---------------------------------------------------------------------
alter table public.configuracoes
  add column if not exists ocultar_valores_operador boolean not null default false;

comment on column public.configuracoes.ocultar_valores_operador is
  'Se verdadeiro, operadores não veem totais de vendas nem o valor esperado no fechamento do caixa (fechamento cego).';

-- ---------------------------------------------------------------------
-- 2. Clientes (para o crediário)
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id              bigint generated always as identity primary key,
  nome            text not null check (length(trim(nome)) > 0),
  telefone        text,
  cpf             text,
  endereco        text,
  limite_credito  numeric(12, 2) check (limite_credito is null or limite_credito >= 0),
  observacao      text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

comment on column public.clientes.limite_credito is 'Limite de crédito do crediário (vazio = sem limite). Só o administrador altera.';

create index if not exists clientes_nome_idx on public.clientes (lower(nome));
create unique index if not exists clientes_cpf_unico on public.clientes (cpf) where cpf is not null and cpf <> '';

-- Só o administrador define ou muda o limite de crédito.
create or replace function public.clientes_antes_de_gravar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if not public.eh_admin() then
    if tg_op = 'INSERT' and new.limite_credito is not null then
      raise exception 'Somente o administrador define o limite de crédito.';
    end if;
    if tg_op = 'UPDATE' and new.limite_credito is distinct from old.limite_credito then
      raise exception 'Somente o administrador altera o limite de crédito.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_antes_de_gravar on public.clientes;
create trigger clientes_antes_de_gravar
  before insert or update on public.clientes
  for each row execute function public.clientes_antes_de_gravar();

alter table public.clientes enable row level security;
drop policy if exists clientes_ver on public.clientes;
drop policy if exists clientes_incluir on public.clientes;
drop policy if exists clientes_editar on public.clientes;
drop policy if exists clientes_remover on public.clientes;
create policy clientes_ver     on public.clientes for select to authenticated using (public.tem_acesso());
create policy clientes_incluir on public.clientes for insert to authenticated with check (public.tem_acesso());
create policy clientes_editar  on public.clientes for update to authenticated using (public.tem_acesso()) with check (public.tem_acesso());
create policy clientes_remover on public.clientes for delete to authenticated using (public.eh_admin());
revoke all on public.clientes from anon;

alter table public.vendas
  add column if not exists cliente_id bigint references public.clientes (id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. Nova forma de pagamento "crediario" e novo movimento de caixa
-- ---------------------------------------------------------------------
alter table public.venda_pagamentos drop constraint if exists venda_pagamentos_forma_check;
alter table public.venda_pagamentos add constraint venda_pagamentos_forma_check
  check (forma in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'fiado', 'crediario', 'outro'));

-- Juros opcionais do crediário (percentual sobre o valor parcelado).
alter table public.venda_pagamentos
  add column if not exists juros_percentual numeric(6, 2) not null default 0
    check (juros_percentual >= 0 and juros_percentual <= 100),
  add column if not exists valor_com_juros numeric(12, 2);

comment on column public.venda_pagamentos.juros_percentual is 'Crediário: juros (%) aplicados uma vez sobre o valor parcelado. 0 = sem juros.';
comment on column public.venda_pagamentos.valor_com_juros is 'Crediário: valor parcelado + juros (soma das parcelas).';

alter table public.caixa_movimentos drop constraint if exists caixa_movimentos_tipo_check;
alter table public.caixa_movimentos add constraint caixa_movimentos_tipo_check
  check (tipo in ('sangria', 'suprimento', 'recebimento_fiado', 'recebimento_crediario'));

-- ---------------------------------------------------------------------
-- 4. Parcelas do crediário
-- ---------------------------------------------------------------------
create table if not exists public.parcelas (
  id              bigint generated always as identity primary key,
  venda_id        bigint not null references public.vendas (id),
  pagamento_id    bigint references public.venda_pagamentos (id),
  cliente_id      bigint not null references public.clientes (id),
  numero          integer not null check (numero >= 1),
  total_parcelas  integer not null check (total_parcelas >= 1),
  valor           numeric(12, 2) not null check (valor > 0),
  vencimento      date not null,
  status          text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  pago_em         timestamptz,
  pago_forma      text,
  pago_por        text,
  caixa_id        bigint references public.caixas (id),
  criado_em       timestamptz not null default now()
);

create index if not exists parcelas_abertas_idx on public.parcelas (vencimento) where status = 'aberta';
create index if not exists parcelas_cliente_idx on public.parcelas (cliente_id);
create index if not exists parcelas_venda_idx   on public.parcelas (venda_id);

alter table public.parcelas enable row level security;
drop policy if exists parcelas_ver on public.parcelas;
create policy parcelas_ver on public.parcelas for select to authenticated using (public.tem_acesso());
revoke insert, update, delete on public.parcelas from anon, authenticated;
revoke all on public.parcelas from anon;

-- ---------------------------------------------------------------------
-- 5. Resumo do caixa
--    calcular_resumo_caixa = cálculo completo, usado só por dentro do banco.
--    resumo_caixa          = o que a tela recebe (esconde valores do operador
--                            quando "ocultar valores" estiver ligado).
-- ---------------------------------------------------------------------
create or replace function public.calcular_resumo_caixa(p_caixa_id bigint)
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
      coalesce(sum(valor) filter (where tipo = 'sangria'), 0)                                             as sangrias,
      coalesce(sum(valor) filter (where tipo = 'suprimento'), 0)                                          as suprimentos,
      coalesce(sum(valor) filter (where tipo = 'recebimento_fiado' and forma = 'dinheiro'), 0)            as fiado_dinheiro,
      coalesce(sum(valor) filter (where tipo = 'recebimento_fiado'), 0)                                   as fiado_total,
      coalesce(sum(valor) filter (where tipo = 'recebimento_crediario' and forma = 'dinheiro'), 0)        as cred_dinheiro,
      coalesce(sum(valor) filter (where tipo = 'recebimento_crediario'), 0)                               as cred_total
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
    'caixa_id',                         v_caixa.id,
    'status',                           v_caixa.status,
    'usuario_nome',                     v_caixa.usuario_nome,
    'aberto_em',                        v_caixa.aberto_em,
    'fechado_em',                       v_caixa.fechado_em,
    'valor_abertura',                   v_caixa.valor_abertura,
    'qtd_vendas',                       tot.qtd_vendas,
    'qtd_canceladas',                   (select count(*) from public.vendas where caixa_id = p_caixa_id and status = 'cancelada'),
    'subtotal',                         tot.subtotal,
    'descontos',                        tot.descontos,
    'total_vendas',                     tot.total_vendas,
    'trocos',                           tot.trocos,
    'por_forma',                        coalesce((select json_object_agg(forma, valor) from pag), '{}'::json),
    'sangrias',                         mov.sangrias,
    'suprimentos',                      mov.suprimentos,
    'recebimentos_fiado',               mov.fiado_total,
    'recebimentos_fiado_dinheiro',      mov.fiado_dinheiro,
    'recebimentos_crediario',           mov.cred_total,
    'recebimentos_crediario_dinheiro',  mov.cred_dinheiro,
    'oculto',                           false,
    'dinheiro_esperado',                v_caixa.valor_abertura
                                        + coalesce((select valor from pag where forma = 'dinheiro'), 0)
                                        - tot.trocos
                                        + mov.suprimentos
                                        + mov.fiado_dinheiro
                                        + mov.cred_dinheiro
                                        - mov.sangrias
  ) into v_resultado
  from tot, mov;

  return v_resultado;
end;
$$;

revoke all on function public.calcular_resumo_caixa(bigint) from public, anon, authenticated;

-- Verdadeiro quando o usuário atual NÃO deve ver valores (operador + opção ligada).
create or replace function public.valores_ocultos()
returns boolean
language sql stable security definer set search_path = public
as $$
  select not public.eh_admin()
     and coalesce((select ocultar_valores_operador from public.configuracoes where id = 1), false);
$$;

create or replace function public.resumo_caixa(p_caixa_id bigint)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_caixa public.caixas;
  v_r     json;
begin
  select * into v_caixa from public.caixas where id = p_caixa_id;
  if not found then
    raise exception 'Caixa não encontrado.';
  end if;
  if not (public.eh_admin() or (v_caixa.usuario_id = auth.uid() and public.tem_acesso())) then
    raise exception 'Você não tem permissão para ver este caixa.';
  end if;
  v_r := public.calcular_resumo_caixa(p_caixa_id);
  if public.valores_ocultos() then
    return json_build_object(
      'caixa_id', v_caixa.id, 'status', v_caixa.status, 'usuario_nome', v_caixa.usuario_nome,
      'aberto_em', v_caixa.aberto_em, 'fechado_em', v_caixa.fechado_em,
      'qtd_vendas', v_r -> 'qtd_vendas', 'qtd_canceladas', v_r -> 'qtd_canceladas',
      'oculto', true);
  end if;
  return v_r;
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
     and p_valor > (public.calcular_resumo_caixa(v_caixa.id) ->> 'dinheiro_esperado')::numeric then
    raise exception 'A sangria é maior que o dinheiro que deveria estar no caixa.';
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
  v_caixa    public.caixas;
  v_resumo   json;
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

  v_resumo   := public.calcular_resumo_caixa(p_caixa_id);
  v_esperado := (v_resumo ->> 'dinheiro_esperado')::numeric;

  update public.caixas set
    status = 'fechado',
    fechado_em = now(),
    fechado_por_nome = public.meu_nome(),
    valor_esperado = v_esperado,
    valor_contado = round(p_valor_contado, 2),
    diferenca = round(p_valor_contado, 2) - v_esperado,
    observacao_fechamento = nullif(trim(p_observacao), '')
  where id = p_caixa_id;

  update public.caixas set resumo = public.calcular_resumo_caixa(p_caixa_id)::jsonb where id = p_caixa_id
  returning * into v_caixa;

  if public.valores_ocultos() then
    v_caixa.valor_esperado := null;
    v_caixa.diferenca := null;
    v_caixa.resumo := jsonb_build_object(
      'caixa_id', v_caixa.id, 'status', v_caixa.status, 'usuario_nome', v_caixa.usuario_nome,
      'aberto_em', v_caixa.aberto_em, 'fechado_em', v_caixa.fechado_em,
      'qtd_vendas', v_caixa.resumo -> 'qtd_vendas', 'qtd_canceladas', v_caixa.resumo -> 'qtd_canceladas',
      'oculto', true);
  end if;
  return v_caixa;
end;
$$;

-- Lista de caixas para a tela: administrador vê todos; operador vê os seus
-- (sem esperado/diferença/resumo quando "ocultar valores" estiver ligado).
create or replace function public.listar_caixas(p_limite integer default 300)
returns setof public.caixas
language plpgsql stable security definer set search_path = public
as $$
declare
  v_c       public.caixas;
  v_ocultar boolean := public.valores_ocultos();
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão.';
  end if;
  for v_c in
    select * from public.caixas
    where public.eh_admin() or usuario_id = auth.uid()
    order by aberto_em desc
    limit greatest(1, least(coalesce(p_limite, 300), 5000))
  loop
    if v_ocultar then
      v_c.valor_esperado := null;
      v_c.diferenca := null;
      v_c.resumo := null;
    end if;
    return next v_c;
  end loop;
end;
$$;

-- A tabela "caixas" deixa de mostrar esperado/diferença/resumo pela API direta.
-- (A tela usa listar_caixas e resumo_caixa, que respeitam a regra acima.)
revoke select on public.caixas from anon, authenticated;
grant select (id, usuario_id, usuario_nome, status, valor_abertura, aberto_em, fechado_em,
              fechado_por_nome, valor_contado, observacao_fechamento)
  on public.caixas to authenticated;

-- ---------------------------------------------------------------------
-- 6. Venda com crediário (atualiza finalizar_venda)
--    Pagamento: {"forma":"crediario","valor":150,"cliente_id":3,"parcelas":3,"primeiro_vencimento":"2026-12-15","juros_percentual":5}
--    "valor" é a parte da compra paga no crediário; as parcelas somam valor + juros.
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
  v_av          record;
  v_permite_av  boolean;
  v_cred        jsonb;            -- pagamento em crediário (no máximo um por venda)
  v_qtd_cred    integer := 0;
  v_cliente     public.clientes;
  v_parcelas    integer;
  v_primeiro    date;
  v_valor_cred  numeric(12, 2);
  v_em_aberto   numeric(12, 2);
  v_pag_id      bigint;
  v_base        numeric(12, 2);
  v_juros       numeric(6, 2) := 0;   -- % de juros do crediário (opcional)
  v_total_cred  numeric(12, 2);       -- valor parcelado + juros = soma das parcelas
  i             integer;
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
    if v_pag.forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'fiado', 'crediario', 'outro') then
      raise exception 'Forma de pagamento inválida: %.', v_pag.forma;
    end if;
    if v_pag.valor is null or v_pag.valor <= 0 then
      raise exception 'Valor de pagamento inválido.';
    end if;
    v_pago := v_pago + v_pag.valor;
    if v_pag.forma = 'dinheiro' then v_dinheiro := v_dinheiro + v_pag.valor; end if;
    if v_pag.forma = 'fiado' then v_tem_fiado := true; end if;
    if v_pag.forma = 'crediario' then v_qtd_cred := v_qtd_cred + 1; end if;
  end loop;

  -- Crediário: cliente cadastrado, número de parcelas, 1º vencimento e limite de crédito.
  if v_qtd_cred > 1 then
    raise exception 'Use apenas um pagamento em crediário por venda.';
  end if;
  if v_qtd_cred = 1 then
    select x into v_cred from jsonb_array_elements(p_pagamentos) x where x ->> 'forma' = 'crediario';
    v_valor_cred := round((v_cred ->> 'valor')::numeric, 2);
    select * into v_cliente from public.clientes where id = nullif(v_cred ->> 'cliente_id', '')::bigint;
    if not found then
      raise exception 'Para vender no crediário, escolha um cliente cadastrado.';
    end if;
    if not v_cliente.ativo then
      raise exception 'O cliente "%" está inativo.', v_cliente.nome;
    end if;
    v_parcelas := coalesce(nullif(v_cred ->> 'parcelas', '')::integer, 1);
    if v_parcelas < 1 or v_parcelas > 24 then
      raise exception 'Número de parcelas deve ficar entre 1 e 24.';
    end if;
    v_juros := round(coalesce(nullif(v_cred ->> 'juros_percentual', '')::numeric, 0), 2);
    if v_juros < 0 or v_juros > 100 then
      raise exception 'Juros do crediário deve ficar entre 0 e 100 por cento.';
    end if;
    v_total_cred := round(v_valor_cred * (1 + v_juros / 100), 2);
    v_primeiro := coalesce(nullif(v_cred ->> 'primeiro_vencimento', '')::date,
                           (now() at time zone 'America/Sao_Paulo')::date + 30);
    if v_primeiro < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'O primeiro vencimento não pode ser uma data passada.';
    end if;
    if v_cliente.limite_credito is not null and not public.eh_admin() then
      select coalesce(sum(valor), 0) into v_em_aberto from public.parcelas where cliente_id = v_cliente.id and status = 'aberta';
      if v_em_aberto + v_total_cred > v_cliente.limite_credito then
        raise exception 'Limite de crédito de "%" excedido: limite R$ %, em aberto R$ %.',
          v_cliente.nome,
          replace(to_char(v_cliente.limite_credito, 'FM999999990.00'), '.', ','),
          replace(to_char(v_em_aberto, 'FM999999990.00'), '.', ',');
      end if;
    end if;
  end if;

  if v_pago < v_total then
    raise exception 'Falta pagar R$ %.', replace(to_char(v_total - v_pago, 'FM999999990.00'), '.', ',');
  end if;
  v_troco := v_pago - v_total;
  if v_troco > v_dinheiro then
    raise exception 'Só é possível dar troco sobre pagamento em dinheiro. Confira os valores do cartão, Pix ou fiado.';
  end if;
  if v_tem_fiado and nullif(trim(p_cliente_nome), '') is null and v_qtd_cred = 0 then
    raise exception 'Para vender fiado, informe o nome do cliente.';
  end if;

  -- Grava a venda
  insert into public.vendas
    (caixa_id, usuario_id, usuario_nome, subtotal, desconto, total, valor_pago, troco, cliente_nome, cliente_telefone, cliente_id)
  values
    (v_caixa.id, auth.uid(), public.meu_nome(), v_subtotal, v_desconto, v_total, v_pago, v_troco,
     coalesce(nullif(trim(p_cliente_nome), ''), v_cliente.nome),
     coalesce(nullif(trim(p_cliente_telefone), ''), v_cliente.telefone),
     v_cliente.id)
  returning * into v_venda;

  insert into public.venda_pagamentos (venda_id, forma, valor)
  select v_venda.id, x ->> 'forma', round((x ->> 'valor')::numeric, 2)
  from jsonb_array_elements(p_pagamentos) x;

  -- Parcelas do crediário (mensais). A última absorve os centavos da divisão.
  if v_qtd_cred = 1 then
    select id into v_pag_id from public.venda_pagamentos where venda_id = v_venda.id and forma = 'crediario';
    update public.venda_pagamentos set juros_percentual = v_juros, valor_com_juros = v_total_cred where id = v_pag_id;
    v_base := floor(v_total_cred * 100 / v_parcelas) / 100;
    for i in 1 .. v_parcelas loop
      insert into public.parcelas (venda_id, pagamento_id, cliente_id, numero, total_parcelas, valor, vencimento)
      values (v_venda.id, v_pag_id, v_cliente.id, i, v_parcelas,
              case when i = v_parcelas then v_total_cred - v_base * (v_parcelas - 1) else v_base end,
              (v_primeiro + make_interval(months => i - 1))::date);
    end loop;
  end if;

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

-- ---------------------------------------------------------------------
-- 7. Cancelar venda: também cancela as parcelas em aberto do crediário
-- ---------------------------------------------------------------------
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
  if exists (select 1 from public.parcelas where venda_id = p_venda_id and status = 'paga') then
    raise exception 'Esta venda tem parcela de crediário já paga. Não é possível cancelar automaticamente.';
  end if;

  perform set_config('lojafacil.movimentando', 'sim', true);
  for v_item in select * from public.venda_itens where venda_id = p_venda_id loop
    if v_item.produto_id is null then
      continue; -- item sem cadastro ou produto removido: nada a devolver
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

  update public.parcelas set status = 'cancelada' where venda_id = p_venda_id and status = 'aberta';

  update public.vendas set
    status = 'cancelada', cancelada_em = now(), cancelada_por_nome = public.meu_nome(),
    motivo_cancelamento = trim(p_motivo)
  where id = p_venda_id
  returning * into v_venda;
  return v_venda;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Receber parcela do crediário (o valor entra no caixa aberto de quem recebe)
-- ---------------------------------------------------------------------
create or replace function public.receber_parcela(p_parcela_id bigint, p_forma text)
returns public.parcelas
language plpgsql security definer set search_path = public
as $$
declare
  v_parcela public.parcelas;
  v_caixa   public.caixas;
  v_status  text;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão.';
  end if;
  if p_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'vale_alimentacao', 'vale_refeicao', 'outro') then
    raise exception 'Forma de recebimento inválida.';
  end if;
  select * into v_parcela from public.parcelas where id = p_parcela_id for update;
  if not found then
    raise exception 'Parcela não encontrada.';
  end if;
  if v_parcela.status = 'paga' then
    raise exception 'Esta parcela já foi paga.';
  end if;
  if v_parcela.status = 'cancelada' then
    raise exception 'Esta parcela foi cancelada.';
  end if;
  select status into v_status from public.vendas where id = v_parcela.venda_id;
  if v_status = 'cancelada' then
    raise exception 'A venda desta parcela foi cancelada.';
  end if;
  select * into v_caixa from public.caixas where usuario_id = auth.uid() and status = 'aberto';
  if not found then
    raise exception 'Abra o seu caixa para receber a parcela.';
  end if;

  update public.parcelas set
    status = 'paga', pago_em = now(), pago_forma = p_forma, pago_por = public.meu_nome(), caixa_id = v_caixa.id
  where id = p_parcela_id
  returning * into v_parcela;

  insert into public.caixa_movimentos (caixa_id, tipo, forma, valor, observacao, venda_id, usuario_id, usuario_nome)
  values (v_caixa.id, 'recebimento_crediario', p_forma, v_parcela.valor,
          'Parcela ' || v_parcela.numero || '/' || v_parcela.total_parcelas || ' da venda nº ' || v_parcela.venda_id,
          v_parcela.venda_id, auth.uid(), public.meu_nome());
  return v_parcela;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Permissões das funções
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.resumo_caixa(bigint)',
    'public.movimentar_caixa(text, numeric, text)',
    'public.fechar_caixa(bigint, numeric, text)',
    'public.listar_caixas(integer)',
    'public.finalizar_venda(jsonb, numeric, jsonb, text, text)',
    'public.cancelar_venda(bigint, text)',
    'public.receber_parcela(bigint, text)',
    'public.valores_ocultos()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Busca de produtos mais rápida em cadastros grandes (opcional:
--     se a extensão não estiver disponível, apenas segue sem o índice)
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
  execute 'create index if not exists produtos_nome_trgm on public.produtos using gin (nome extensions.gin_trgm_ops)';
exception when others then
  raise notice 'Índice de busca rápida não criado (%). O sistema funciona normalmente sem ele.', sqlerrm;
end;
$$;

-- Painel atualiza sozinho quando há recebimentos de crediário.
do $$
begin
  alter publication supabase_realtime add table public.parcelas;
exception when others then
  raise notice 'Tempo real das parcelas não ativado (%).', sqlerrm;
end;
$$;
