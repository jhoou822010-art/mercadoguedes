# TODO — Loja Fácil

## Primeira versão (pronta para teste)

- [x] Painel com indicadores clicáveis e ações rápidas
- [x] Cadastro de produtos (incluir, editar, pesquisar, filtrar, detalhes, remover com confirmação)
- [x] Validação de campos obrigatórios e de valores negativos (tela + banco)
- [x] Estoque: entrada, saída, ajuste, confirmação, saldo nunca negativo, histórico com usuário
- [x] Validade: alertas de próximo, crítico (7 dias) e vencido; datas no padrão brasileiro
- [x] Etiquetas de gôndola com código de barras, impressas pela janela do navegador
- [x] Relatórios: cadastrados, estoque atual, abaixo do mínimo, vencimento, movimentações
- [x] Exportação CSV (Excel em português)
- [x] Backup manual em JSON (com data e versão do formato)
- [x] Login, papéis admin/operador e liberação de novos usuários
- [x] Funciona em computador, tablet e celular
- [x] `pnpm check` e `pnpm build` sem erros
- [x] Regras do banco testadas (permissões, estoque negativo, histórico imutável)

## Segunda etapa — Caixa e vendas (pronta para teste)

- [x] Abertura de caixa (um caixa aberto por balconista) com valor de troco inicial
- [x] Venda com leitor de código de barras, quantidade inteira (UN/PCT/CX) ou por peso (KG/LT)
- [x] Desconto em R$ ou % pela balconista, com limite configurável pelo administrador
- [x] Formas de pagamento: dinheiro, Pix, débito, crédito, vale-alimentação, vale-refeição, fiado, outro
- [x] Pagamento dividido e cálculo de troco (só sobre dinheiro)
- [x] Fiado com nome/telefone do cliente, lista por cliente e recebimento posterior
- [x] Comprovante não fiscal (80 mm / 58 mm) com nome, CNPJ, endereço e telefone
- [x] Sangria e suprimento
- [x] Fechamento com dinheiro esperado × contado (sobra/falta) e comprovante de fechamento
- [x] Histórico de vendas, reimpressão, cancelamento pelo administrador (devolve o estoque)
- [x] Vendas de hoje no painel; vendas e caixas no backup (formato versão 2)
- [x] Regras do banco testadas (sem caixa, desconto acima do limite, troco em cartão, fiado sem cliente, estoque insuficiente)

## Terceira etapa — Teclado e calculadora (pronta para teste)

- [x] Teclas de atalho configuráveis pelo administrador (tela "Teclado do caixa"), gravadas no banco (migração 0003)
- [x] Validação: recusa teclas de digitação/navegador e avisa conflito entre ações
- [x] Atalhos no caixa (pagamento, busca, desconto, calculadora, cancelar, quantidade, +1/−1, remover último, sangria, suprimento, fechar, ajuda)
- [x] Atalhos na janela de pagamento (cada forma de pagamento, valor exato, calculadora)
- [x] Calculadora com teclado numérico; resultado pode virar o valor recebido
- [x] Esc fecha só a janela de cima

## Quarta etapa — Revisão e crediário (branch revisao-e-melhorias, aguardando aprovação)

- [x] Rotas internas com HTTP 200 no GitHub Pages (páginas <rota>.html)
- [x] Crediário com parcelas, clientes, limite de crédito, carnê e extrato
- [x] Fiado: imprimir lista e extrato por cliente
- [x] Card "A receber (fiado + crediário)" no painel
- [x] Ocultar valores para operadores + fechamento cego (garantido no banco)
- [x] "Item sem cadastro" renomeado para "Digite o produto"
- [x] Importar/exportar/imprimir planilha de produtos
- [x] Telas carregadas sob demanda (site 18% mais leve) e aviso de "Sem internet"
- [x] Juros opcionais (%) no crediário
- [x] Pix com QR Code (estático, chave da loja) no caixa, comprovante, extrato e carnê
- [ ] Pix com confirmação automática / integração com maquininha (depende do banco e da maquininha)
- [ ] Discutir: proteção da troca de senha (Meu perfil)

## Antes de publicar — perguntas para o responsável (item 14 do prompt)

1. O nome final continuará sendo Loja Fácil?
2. Uma loja ou várias filiais?
3. Quais produtos reais serão cadastrados no teste?
4. Quais campos são obrigatórios para a operação? (hoje: código, descrição, unidade e preço)
5. ~~O comprovante não fiscal será a próxima função?~~ Feito (com CNPJ).
6. Qual impressora será usada?
7. Qual leitor de código de barras será usado?
8. Qual balança será usada futuramente?
9. Os computadores estarão na mesma rede?
10. Quem poderá cadastrar, alterar preço e movimentar estoque? (hoje: admin cadastra e altera preço; operador movimenta)
11. Servidor local, hospedagem ou os dois?
12. Qual função do programa antigo não pode faltar?
13. O responsável autoriza a publicação?

## Próximas etapas (só depois de validar a primeira versão)

- [ ] Troca/devolução parcial de itens (hoje só cancela a venda inteira)
- [ ] Cadastro de clientes para fiado (hoje é só nome e telefone na venda)
- [ ] Restauração de backup (com teste antes de liberar)
- [ ] Importação de produtos por planilha
- [ ] Filiais / tabelas de preço (se necessário)

## Fora do escopo

NF-e, NFC-e, certificado digital, SEFAZ, TEF, operadoras de cartão, acesso remoto,
monitoramento, balança automática, gaveta de dinheiro, impressão silenciosa.
