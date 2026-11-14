# Plano de implementação — Loja Fácil

## Decisão de arquitetura (aprovada pelo responsável)

O prompt mestre previa React + Express + tRPC + MySQL + Drizzle. Como o banco escolhido é o
**Supabase (PostgreSQL)**, a arquitetura aprovada é:

- **Frontend:** React + TypeScript + Tailwind, gerado com Vite.
- **Backend:** o próprio Supabase. Não há servidor Express.
  - Login: Supabase Auth (e-mail e senha). Nenhuma autenticação paralela.
  - Permissões: Row Level Security (RLS) no banco. Mesmo que alguém altere o navegador, o banco recusa o que o papel não permite.
  - Regras de estoque: função SQL `movimentar_estoque`, que trava o produto, calcula o saldo, impede saldo negativo e grava o histórico numa única transação.
- **Hospedagem:** GitHub Pages, publicado pelo GitHub Actions (`.github/workflows/publicar.yml`). O site roda em `/NOME-DO-REPOSITORIO/` (variável `VITE_BASE`), e um `404.html` igual ao `index.html` permite recarregar qualquer tela. Também funciona com `pnpm dev` ou `pnpm preview` na rede local.

Equivalências com o prompt original:

| Prompt original | Neste projeto |
|---|---|
| `drizzle/schema.ts` + `drizzle/` | `supabase/migrations/*.sql` (versionadas, numeradas) |
| `server/routers.ts` + `server/db.ts` | funções SQL + consultas em `src/pages/*` via `@supabase/supabase-js` |
| `client/src/pages/Home.tsx` | `src/pages/Painel.tsx` e demais páginas |
| `client/src/index.css` | `src/index.css` |
| `manus-routes.json` | rotas em `src/App.tsx` (o arquivo era específico da plataforma Manus) |
| `pnpm check` / `pnpm build` | mantidos |

## Banco de dados

- `perfis` — um por usuário (admin / operador / pendente).
- `configuracoes` — linha única: nome da loja, dias de alerta de validade.
- `produtos` — todos os campos do item 4.2; checagens impedem preço, custo e estoque negativos; código interno e código de barras únicos.
- `movimentacoes` — histórico imutável; guarda cópia do código e nome do produto para não perder o histórico se o produto for removido.
- `vw_produtos` — visão com valor em estoque, alerta de mínimo, dias para vencer e situação da validade.
- `resumo_painel()` — números do painel.

O estoque **só muda** por `movimentar_estoque` (um gatilho bloqueia alterações diretas). O cadastro com estoque inicial gera uma entrada automática no histórico.

## Preparado para o futuro (sem complexidade agora)

- Filiais / tabelas de preço: adicionar `loja_id` em produtos e movimentações numa nova migração.
- Restauração de backup: o JSON tem `formato` e `versao_formato` para permitir importação futura.

## Etapa 2 — Caixa e vendas (migração 0002)

- `caixas` e `caixa_movimentos`: abertura, sangria, suprimento, recebimento de fiado e fechamento. Um caixa aberto por usuário (índice único).
- `vendas`, `venda_itens`, `venda_pagamentos`: o número interno da venda é o `id`.
- `finalizar_venda(...)`: uma transação só. Lê os **preços do banco** (a tela não decide preço), valida o desconto contra o limite, exige pagamento ≥ total, permite troco só sobre dinheiro, exige cliente no fiado, baixa o estoque e grava o histórico ("Venda nº X").
- `cancelar_venda(...)`: somente administrador; devolve o estoque com histórico.
- `resumo_caixa(...)`: dinheiro esperado = abertura + dinheiro recebido − trocos + suprimentos + fiado recebido em dinheiro − sangrias.
- Todas as tabelas novas são somente leitura pela API; só as funções gravam.
- Sem TEF: cartão e Pix são apenas registrados (a maquininha e o banco ficam fora do sistema).
