-- =====================================================================
-- Loja Fácil · LIMPAR OS DADOS DE TESTE (rodar UMA vez, antes de começar
-- a usar o sistema de verdade)
--
-- APAGA:  todas as vendas (itens, pagamentos, fiado), parcelas do
--         crediário, caixas (aberturas, sangrias, suprimentos, fechamentos),
--         o histórico de movimentações de estoque e o histórico de
--         alterações. A numeração recomeça: a próxima venda será a nº 1 e o
--         próximo caixa o nº 1.
-- DEVOLVE: ao estoque de cada produto o que foi "vendido" nos testes
--          (as vendas canceladas já tinham devolvido).
-- MANTÉM: produtos, preços, clientes, usuários, dados da loja, logo, Pix,
--         teclas de atalho e configurações.
--
-- ATENÇÃO:
--  * NÃO TEM COMO DESFAZER. Faça antes um BACKUP pela tela Backup.
--  * Rode só se TODAS as vendas que existem hoje forem de teste.
--  * Ninguém pode estar usando o caixa enquanto roda.
-- =====================================================================

begin;

-- Libera a trava de proteção SÓ durante esta limpeza (volta sozinha no fim).
set local lojafacil.permitir_apagar = 'sim';
set local lojafacil.movimentando = 'sim';

-- 1) Devolve ao estoque o que as vendas de teste (não canceladas) tiraram.
update public.produtos p
   set estoque = p.estoque + v.qtd
  from (
    select vi.produto_id, sum(vi.quantidade) as qtd
      from public.venda_itens vi
      join public.vendas ve on ve.id = vi.venda_id
     where ve.status = 'concluida'
       and vi.produto_id is not null
       and coalesce(vi.avulso, false) = false
     group by vi.produto_id
  ) v
 where p.id = v.produto_id;

-- 2) Apaga vendas, fiado, crediário, caixas e históricos, e recomeça a numeração.
truncate table
  public.parcelas,
  public.venda_pagamentos,
  public.venda_itens,
  public.caixa_movimentos,
  public.vendas,
  public.caixas,
  public.movimentacoes,
  public.auditoria
  restart identity cascade;

-- 3) Zera a data do último backup (o lembrete volta a aparecer).
update public.configuracoes set ultimo_backup_em = null, ultimo_backup_por = null where id = 1;

commit;

-- Conferência: tudo deve estar 0 e os produtos com o estoque devolvido.
select (select count(*) from public.vendas)        as vendas,
       (select count(*) from public.parcelas)      as parcelas,
       (select count(*) from public.caixas)        as caixas,
       (select count(*) from public.movimentacoes) as movimentacoes,
       (select count(*) from public.produtos)      as produtos_mantidos,
       (select count(*) from public.clientes)      as clientes_mantidos;
