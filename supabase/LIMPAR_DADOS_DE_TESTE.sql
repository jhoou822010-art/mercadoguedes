-- =====================================================================
-- Loja Fácil · LIMPAR OS DADOS DE TESTE (rodar UMA vez, antes de começar
-- a usar o sistema de verdade)
--
-- APAGA:  todas as vendas (itens, pagamentos, fiado), parcelas do
--         crediário, caixas (aberturas, sangrias, suprimentos, fechamentos),
--         o histórico de movimentações de estoque e o histórico de
--         alterações. A numeração recomeça: a próxima venda será a nº 1 e o
--         próximo caixa o nº 1.
--         TAMBÉM APAGA TODOS OS PRODUTOS (cadastro, preços e estoque).
-- MANTÉM: clientes, usuários, dados da loja, logo, Pix, teclas de atalho
--         e configurações.
--
-- ATENÇÃO:
--  * NÃO TEM COMO DESFAZER. Faça antes um BACKUP pela tela Backup.
--  * Rode só se TODAS as vendas que existem hoje forem de teste.
--  * Ninguém pode estar usando o caixa enquanto roda.
-- =====================================================================

begin;

-- Libera a trava de proteção SÓ durante esta limpeza (volta sozinha no fim).
set local lojafacil.permitir_apagar = 'sim';

-- 1) Apaga vendas, fiado, crediário, caixas, produtos e históricos, e recomeça a numeração.
truncate table
  public.parcelas,
  public.venda_pagamentos,
  public.venda_itens,
  public.caixa_movimentos,
  public.vendas,
  public.caixas,
  public.movimentacoes,
  public.produtos,
  public.auditoria
  restart identity cascade;

-- 2) Zera a data do último backup (o lembrete volta a aparecer).
update public.configuracoes set ultimo_backup_em = null, ultimo_backup_por = null where id = 1;

commit;

-- Conferência: tudo deve estar 0 (clientes ficam).
select (select count(*) from public.vendas)        as vendas,
       (select count(*) from public.parcelas)      as parcelas,
       (select count(*) from public.caixas)        as caixas,
       (select count(*) from public.movimentacoes) as movimentacoes,
       (select count(*) from public.produtos)      as produtos,
       (select count(*) from public.clientes)      as clientes_mantidos;
