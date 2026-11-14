# Loja Fácil

**Controle de loja sem complicação.**

Sistema de gestão interna para mercados, mercearias, padarias, açougues e pequenos comércios:
caixa (venda com desconto, troco, fiado e comprovante não fiscal), produtos, estoque, preços, validade, etiquetas de gôndola, relatórios e backup.

> Não emite documento fiscal (NF-e, NFC-e, cupom fiscal). Não tem acesso remoto nem monitoramento.

## Tecnologias

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Supabase (PostgreSQL, login por e-mail e regras de segurança RLS)

## Comandos

```bash
pnpm install     # instala as dependências
pnpm dev         # abre em http://localhost:5173
pnpm check       # verifica os tipos TypeScript
pnpm build       # gera a versão de produção em dist/
```

Antes de rodar, copie `.env.example` para `.env` e preencha com os dados do seu projeto Supabase.

**Passo a passo completo de instalação: [GUIA.md](GUIA.md).**

## Estrutura

```
supabase/migrations/   SQL do banco (rodar no SQL Editor do Supabase)
src/lib/               conexão, tipos, formatação BR, CSV, código de barras
src/contexts/          login e perfil do usuário
src/components/        layout, modais, avisos, busca de produto, código de barras
src/pages/             Painel, Produtos, Estoque, Etiquetas, Relatórios, Backup, Usuários
src/index.css          identidade visual e regras de impressão
```

## Papéis

| Papel | Pode |
|---|---|
| Administrador | tudo: produtos e preços, cancelar vendas, ver todos os caixas, backup, usuários e dados da loja |
| Operador (balconista) | vender no caixa, dar desconto até o limite, receber fiado, consultar produtos, movimentar estoque, imprimir etiquetas, ver relatórios |
| Aguardando liberação | nada, até o administrador liberar |

A primeira conta criada vira administrador automaticamente.

Veja também: [plan.md](plan.md) (decisões e arquitetura) e [TODO.md](TODO.md) (estado do projeto).
