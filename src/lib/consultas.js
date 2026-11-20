/** Colunas de "caixas" que todos podem ler direto (o resto vem por listar_caixas/resumo_caixa). */
export const COLUNAS_CAIXA = "id, usuario_id, usuario_nome, status, valor_abertura, aberto_em, fechado_em, fechado_por_nome, valor_contado, observacao_fechamento";
/** Venda com itens e pagamentos (e parcelas, se o SQL 0006 já foi rodado). */
export const selecaoVenda = (tem0006) => tem0006 ? "*, venda_itens(*), venda_pagamentos(*), parcelas(*)" : "*, venda_itens(*), venda_pagamentos(*)";
