# Guia de instalação — Loja Fácil

Siga na ordem. Cada etapa diz **onde clicar** e **como conferir** se deu certo.

São 6 etapas:

1. Preparar o computador
2. Criar o banco no Supabase
3. Rodar o sistema no seu computador
4. Enviar o código para o GitHub (conta nova)
5. Publicar na internet (GitHub Pages)
6. Primeiro uso

---

## 1. Preparar o computador

Instale (uma vez só):

| Programa | Onde baixar | Para conferir, no terminal |
|---|---|---|
| Node.js 20 ou mais novo (versão LTS) | https://nodejs.org | `node -v` |
| Git | https://git-scm.com | `git --version` |
| pnpm | no terminal: `npm install -g pnpm` | `pnpm -v` |

> No Windows, use o **PowerShell** ou o **Git Bash** como terminal. Feche e abra o terminal depois de instalar.

Descompacte o arquivo `loja-facil.zip` numa pasta, por exemplo `C:\projetos\loja-facil` ou `~/projetos/loja-facil`.

---

## 2. Criar o banco no Supabase

### 2.1 Criar o projeto

1. Entre em https://supabase.com com a **conta nova** e clique em **New project**.
2. Preencha:
   - **Name:** `loja-facil`
   - **Database Password:** crie uma senha forte e **guarde** (não vai no código).
   - **Region:** `South America (São Paulo)`.
3. Clique em **Create new project** e espere 1 a 2 minutos.

### 2.2 Criar as tabelas

São **3 arquivos**, rodados **nesta ordem**, cada um **uma vez só**:

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1º | `supabase/migrations/0001_inicial.sql` | usuários, produtos, estoque, validade |
| 2º | `supabase/migrations/0002_caixa_vendas.sql` | caixa, vendas, pagamentos, fiado, comprovante |
| 3º | `supabase/migrations/0003_atalhos_teclado.sql` | teclas de atalho do caixa |

Para cada arquivo:

1. No menu da esquerda, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo num editor de texto (Bloco de Notas, VS Code), copie **tudo** e cole no SQL Editor.
4. Clique em **Run**.
5. Deve aparecer **"Success. No rows returned"**.

**Conferir:** abra **Table Editor**. Devem aparecer 9 tabelas:
`perfis`, `configuracoes`, `produtos`, `movimentacoes`, `caixas`, `caixa_movimentos`, `vendas`, `venda_itens` e `venda_pagamentos`.
Todas devem mostrar o selo de **RLS ativado** (cadeado).

> ⚠️ Se rodar um arquivo de novo, vai dar erro de "already exists". Isso não estraga nada, mas também não é necessário.
> Se rodar fora de ordem, dá erro: rode o 0001, depois o 0002, depois o 0003.

### 2.3 Configurar o login

1. Abra **Authentication → Sign In / Providers** (em versões antigas: **Authentication → Providers**).
2. Confirme que **Email** está ativado.
3. **Confirm email:**
   - **Ligado** (recomendado em produção): quem se cadastra precisa clicar no link enviado por e-mail.
   - **Desligado**: mais prático para os primeiros testes.

   > O envio de e-mail grátis do Supabase tem limite baixo por hora. Para uso real, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**, ou deixe a confirmação desligada e controle o acesso pela liberação de usuários (etapa 6).

### 2.4 Copiar as chaves

1. Abra **Project Settings → API Keys** (ou clique no botão **Connect** no topo do projeto).
2. Copie:
   - **Project URL**, algo como `https://abcdxyz.supabase.co`
   - **Chave pública**: a **Publishable key** (`sb_publishable_...`) ou, em projetos antigos, a **anon public**.

> 🔒 **Nunca** use a chave `service_role` / **Secret key** no sistema. Ela ignora todas as regras de segurança.

---

## 3. Rodar no seu computador

No terminal, dentro da pasta do projeto:

```bash
cp .env.example .env        # no Windows PowerShell: copy .env.example .env
```

Abra o arquivo `.env` e cole os seus dados:

```
VITE_SUPABASE_URL=https://abcdxyz.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

Depois rode:

```bash
pnpm install
pnpm dev
```

Abra **http://localhost:5173**.

- Clique em **Criar conta** e cadastre **você** primeiro: a primeira conta vira **administrador**.
- Se a confirmação de e-mail estiver ligada, clique no link recebido e depois entre.

**Conferir:** o painel aparece com "Olá, (seu nome)" e o menu mostra **Backup** e **Usuários e loja**.

> Para outros computadores da **mesma rede** usarem o sistema enquanto ele roda no seu PC, o `pnpm dev` mostra um endereço "Network" (ex.: `http://192.168.0.10:5173`). Para uso no dia a dia, prefira a publicação da etapa 5.

---

## 4. Enviar o código para o GitHub (conta nova)

### 4.1 Criar o repositório

1. Entre em https://github.com com a **conta nova**.
2. Clique em **+ → New repository**.
3. **Repository name:** `loja-facil`.
4. Marque **Private**.
5. **Não** marque "Add a README", ".gitignore" nem "license": o projeto já tem esses arquivos.
6. Clique em **Create repository** e copie o endereço, por exemplo `https://github.com/SUA-CONTA/loja-facil.git`.

### 4.2 Enviar pelo terminal (recomendado)

Dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Loja Fácil - primeira versão"
git branch -M main
git remote add origin https://github.com/SUA-CONTA/loja-facil.git
git push -u origin main
```

Se pedir login, uma janela do navegador abre para você entrar **com a conta nova**.
Se pedir senha no terminal, use um **token**: GitHub → Settings → Developer settings → Personal access tokens.

> ⚠️ Se o seu computador já tem outra conta do GitHub salva, o push pode tentar usar a conta antiga. No Windows, remova a credencial antiga em **Gerenciador de Credenciais → Credenciais do Windows → git:https://github.com**, e rode `git push` de novo.

**Conferir:** a página do repositório mostra as pastas `src`, `supabase` e `public` e os arquivos `GUIA.md`, `README.md` etc.
**Não** deve aparecer `.env` nem `node_modules`; o `.gitignore` já bloqueia os dois.

### 4.3 Alternativa sem terminal

Na página do repositório vazio, clique em **uploading an existing file** e arraste o conteúdo da pasta, **menos** `node_modules`, `dist` e `.env`.

---

## 5. Publicar na internet (GitHub Pages)

O projeto já vem com o arquivo `.github/workflows/publicar.yml`. Ele gera e publica o site **sozinho** a cada `git push` na branch `main`.

### ⚠️ Antes: repositório público ou privado?

No **plano grátis** do GitHub, o GitHub Pages só funciona com repositório **público**.
- **Público** (grátis): qualquer pessoa vê o **código**, mas **não vê os dados da loja**. Os dados ficam no Supabase, protegidos por login e pelas regras de segurança (RLS). O código não tem senhas: o `.env` não vai para o GitHub, e a chave pública do Supabase foi feita para ficar no navegador.
- **Privado**: exige o plano pago **GitHub Pro** (ou Team).

Em qualquer caso, o **site** fica acessível pela internet, e só entra quem tiver login liberado pelo administrador.

### 5.1 Cadastrar as chaves do Supabase no GitHub

No repositório: **Settings → Secrets and variables → Actions → New repository secret**. Crie os dois:

| Name | Secret |
|---|---|
| `VITE_SUPABASE_URL` | a URL do projeto (ex.: `https://abcdxyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | a chave pública (`sb_publishable_...` ou `anon`) |

### 5.2 Ligar o GitHub Pages

1. No repositório: **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**. Não use "Deploy from a branch".

### 5.3 Publicar

- Se você já enviou o código: abra a aba **Actions → Publicar no GitHub Pages → Run workflow**.
- Daqui pra frente, cada `git push` publica sozinho.
- Acompanhe na aba **Actions**: bolinha amarela = publicando, ✅ verde = publicado, ❌ vermelho = erro (clique para ver o motivo).

O endereço do sistema fica assim:

```
https://SUA-CONTA.github.io/loja-facil/
```

(`SUA-CONTA` = usuário do GitHub; `loja-facil` = nome do repositório. Ele também aparece em **Settings → Pages**.)

### 5.4 Avisar o Supabase do endereço

No Supabase: **Authentication → URL Configuration**.

- **Site URL:** `https://SUA-CONTA.github.io/loja-facil/`
- **Redirect URLs:** adicione `https://SUA-CONTA.github.io/loja-facil/**` e `http://localhost:5173/**`

Sem isso, o link de confirmação de e-mail leva para o endereço errado.

> Se você mudar o nome do repositório, o endereço muda junto. O sistema se ajusta sozinho na próxima publicação, mas atualize o endereço no Supabase.

---

## 6. Primeiro uso

1. Entre com a conta de administrador.
2. Abra **Usuários e loja**:
   - preencha o **nome da loja**, que aparece nas etiquetas, relatórios e comprovantes;
   - ajuste com quantos dias de antecedência quer o alerta de validade (padrão: 30);
   - preencha **CNPJ, endereço e telefone** para o comprovante. Desmarque "Mostrar o CNPJ" se não quiser o CNPJ impresso;
   - à direita aparece a **prévia do comprovante**, que muda enquanto você digita; use **Imprimir comprovante de teste** para conferir na impressora;
   - defina o **desconto máximo** que a balconista pode dar (100 = sem limite).
3. Peça para os funcionários criarem conta. Eles aparecem como **Aguardando liberação**; mude cada um para **Operador**.
4. *(Opcional, mais seguro)* Depois que todos tiverem conta, desligue novos cadastros no Supabase:
   **Authentication → Sign In / Providers → Allow new users to sign up → desligado**.
5. Cadastre alguns produtos reais e faça entradas, saídas e ajustes de teste.
6. Gere um **backup** em **Backup** e guarde o arquivo.

### Como a balconista usa o caixa

1. **Abrir o caixa** (menu **Caixa**): conte o dinheiro de troco que está na gaveta e digite o valor. Cada balconista abre o **seu** caixa.
2. **Passar os produtos**: o cursor já fica no campo de busca. Passe o leitor ou digite o nome ou código e aperte Enter.
   - Produto por unidade: passou duas vezes, a quantidade vira 2. Também dá para usar os botões − e +.
   - Produto por **KG ou LT**: o cursor vai para a quantidade. Digite o peso (ex.: `1,250`) e aperte Enter.
3. **Desconto (F4)**: em reais ou em %. Respeita o limite definido pelo administrador.
4. **Pagamento (F2)**: escolha a forma, digite o valor e aperte Enter.
   - **Dinheiro**: digite o valor que o cliente entregou. O **troco** aparece em verde.
   - **Dividir o pagamento** (ex.: parte em dinheiro e parte no Pix): adicione um pagamento, depois o outro.
   - **Cartão**: passe na maquininha e só confirme no sistema depois de aprovado. O sistema **não** se comunica com a maquininha.
   - **Fiado**: exige o nome do cliente. O comprovante sai com linha para assinatura.
5. **Comprovante**: aparece na hora. Clique em **Imprimir** (escolha papel 80 mm ou 58 mm) ou em **Nova venda**.
6. **Sangria / Suprimento**: retirar dinheiro da gaveta (ex.: depósito) ou colocar mais troco.
7. **Fechar o caixa** no fim do turno: o sistema mostra quanto deve haver na gaveta, a balconista conta e digita o valor. Aparece sobra ou falta e sai o comprovante do fechamento.

**Atalhos (padrão):** F2 = pagamento · F3 = voltar para a busca · F4 = desconto · F7 = calculadora · F8 = cancelar compra · F9 = alterar quantidade · Num + / Num − = mais/menos 1 no último item · Ctrl+Delete = remover último item · Num / = ver atalhos · Enter = confirmar · Esc = fechar janela.
Na janela de pagamento: F2 dinheiro · F3 Pix · F4 débito · F7 crédito · F8 fiado · F9 valor exato · Num / calculadora.
("Num" = tecla do teclado numérico, o bloco de números à direita.)

A balconista vê a lista a qualquer momento no botão **⌨ Atalhos** do caixa.

### Calculadora

No caixa, botão **🧮 Calculadora** (ou a tecla de atalho). Funciona com mouse, toque ou teclado numérico (números, + − * /, Enter para "=", Backspace apaga, Delete limpa).
Aberta dentro da janela de pagamento, o botão **Usar como valor** coloca o resultado no valor recebido.

### Mudar as teclas (administrador)

Menu **Teclado do caixa**:
1. Clique em **Alterar** na ação, aperte a tecla desejada e clique em **Salvar teclas**.
2. Vale para todos os computadores da loja. Se o caixa já estava aberto, recarregue a página (F5) para pegar as teclas novas.
3. O sistema recusa teclas que atrapalham a digitação ou o navegador (letras e números sozinhos, F5, F11, F12, Ctrl+W…) e avisa quando a tecla já é de outra ação.
4. Use a **Área de teste** para conferir o que cada tecla faz. **Restaurar padrão** volta tudo ao original.

> Se uma tecla abrir alguma função do navegador em vez da ação (raro, depende do navegador), troque por outra, por exemplo Ctrl + uma letra.

Em **Vendas e fiado**:
- **Vendas**: lista, reimpressão do comprovante, exportação CSV. **Cancelar venda** só o administrador; os produtos voltam ao estoque.
- **Fiado a receber**: total por cliente. Botão **Receber**: o dinheiro entra no caixa aberto de quem recebeu.
- **Caixas**: histórico de aberturas e fechamentos, com sobras e faltas.

> O comprovante é **não fiscal**: não substitui NF-e, NFC-e ou cupom fiscal.

### Impressora de comprovante (térmica)

Instale a impressora no Windows com o driver do fabricante e teste uma página.
No Chrome, ao imprimir: escolha a impressora térmica, **Margens: Nenhuma**, escala **100%** e desmarque **Cabeçalhos e rodapés**.
O Chrome lembra essas escolhas para as próximas vezes.

### Leitor de código de barras

Leitores USB funcionam como teclado: clique no campo de busca (Produtos, Estoque ou Etiquetas) e passe o produto.
Configure o leitor para **enviar Enter após a leitura** (o manual dele tem um código de configuração para isso). Assim o produto é selecionado na hora.

### Impressão de etiquetas

Em **Etiquetas**: adicione os produtos, escolha o tamanho e clique em **Imprimir**. Na janela do navegador:

- escolha a impressora;
- deixe a escala em **100%**;
- em **Mais definições**, marque **Gráficos de plano de fundo** para sair a faixa colorida.

---

## Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| Tela "Falta conectar ao Supabase" | No computador: `.env` não existe ou está errado. No GitHub Pages: faltam os secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Cadastre e rode de novo em **Actions → Run workflow**. |
| "E-mail ou senha incorretos" logo após cadastrar | E-mail ainda não confirmado, ou senha errada. Veja a caixa de spam. |
| Novo usuário só vê "Aguardando liberação" | Normal. O administrador libera em **Usuários e loja**. |
| "Seu usuário não tem permissão" | O operador tentou uma ação de administrador. |
| "O estoque só pode ser alterado pela tela de Estoque" | Proteção de propósito: use Entrada, Saída ou Ajuste. |
| Erro ao rodar o SQL: "already exists" | O SQL já tinha sido rodado. Não precisa rodar de novo. |
| Página em branco no GitHub Pages | Confira se **Settings → Pages → Source** está em **GitHub Actions** e se a última publicação em **Actions** ficou verde. |
| ❌ vermelho na aba Actions | Clique na execução e veja o passo que falhou. "Falta cadastrar VITE_SUPABASE_URL" = faltam os secrets (5.1). |
| GitHub diz que Pages não está disponível | O repositório é privado no plano grátis. Torne-o público (Settings → General → Danger Zone → Change visibility) ou assine o GitHub Pro. |
| "Abra o caixa antes de vender" | Cada balconista precisa abrir o próprio caixa no menu **Caixa**. |
| "Estoque insuficiente" ao vender | O sistema não deixa o estoque ficar negativo. Faça uma **Entrada** ou um **Ajuste** em Estoque, depois venda. |
| "Desconto acima do permitido" | A balconista passou do limite. O administrador ajusta em **Usuários e loja**. |
| Comprovante sai com cabeçalho/data do navegador | Na janela de impressão, desmarque **Cabeçalhos e rodapés**. |
| Esqueci qual conta é admin | No Supabase: **Table Editor → perfis** e veja a coluna `papel`. |

---

## Se você já tinha rodado parte das migrações

Rode só as que faltam, em ordem (ex.: já rodou 0001 e 0002 → rode só o `0003_atalhos_teclado.sql`). Rode no SQL Editor. Os produtos e o histórico continuam como estão. Faça um **backup** antes.

## Mudanças futuras no banco

Nunca altere o `0001_inicial.sql` depois de rodado.
Cada mudança nova vira um arquivo novo: `0004_descricao.sql`, `0005_...`, rodado uma vez no SQL Editor.
**Faça um backup antes** de rodar qualquer migração.
