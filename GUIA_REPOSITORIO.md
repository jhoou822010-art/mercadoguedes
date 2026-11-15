# Guia do repositório — Loja Fácil

Como colocar o projeto no GitHub (conta nova) e como as pastas devem ficar.

---

## 1. Regra principal

A **raiz do repositório** é o **conteúdo** da pasta `loja-facil`, e não a pasta em si.

✅ Certo: ao abrir o repositório no GitHub, você vê direto `src`, `supabase`, `package.json`…

```
github.com/SUA-CONTA/loja-facil
├── src/
├── supabase/
├── package.json
└── ...
```

❌ Errado: uma pasta `loja-facil` dentro do repositório.

```
github.com/SUA-CONTA/loja-facil
└── loja-facil/        ← pasta a mais: a publicação automática não acha o projeto
    ├── src/
    └── ...
```

---

## 2. Como o repositório deve ficar (51 arquivos)

```
loja-facil/                          (raiz do repositório)
│
├── .env.example                     modelo das chaves do Supabase (o .env verdadeiro NÃO vai)
├── .gitignore                       impede que .env, node_modules e dist subam para o GitHub
├── GUIA.md                          passo a passo completo (Supabase, GitHub Pages, uso do caixa)
├── GUIA_REPOSITORIO.md              este guia
├── README.md                        apresentação do projeto (aparece na página do GitHub)
├── TODO.md                          o que está pronto e o que falta
├── plan.md                          decisões técnicas
├── index.html                       página base do site
├── package.json                     lista de bibliotecas e comandos (pnpm dev / check / build)
├── pnpm-lock.yaml                   versões exatas das bibliotecas
├── tsconfig.json                    configuração do TypeScript
├── vite.config.ts                   configuração do Vite (gerador do site) + 404.html para o GitHub Pages
│
├── .github/
│   └── workflows/
│       └── publicar.yml             ⚙️ publica no GitHub Pages sozinho a cada git push
│
├── public/
│   └── favicon.svg                  ícone do site
│
├── supabase/
│   └── migrations/                  ⚠️ rodar no SQL Editor do Supabase, NESTA ORDEM:
│       ├── 0001_inicial.sql             1º  usuários, produtos, estoque, validade
│       ├── 0002_caixa_vendas.sql        2º  caixa, vendas, pagamentos, fiado, comprovante
│       ├── 0003_atalhos_teclado.sql     3º  teclas de atalho do caixa
│       ├── 0004_logo_loja.sql           4º  logo da loja
│       ├── 0005_item_avulso.sql         5º  “Digite o produto” no caixa
│       └── 0006_crediario_clientes_ocultar.sql  6º  crediário, clientes, fechamento cego
│
└── src/
    ├── main.tsx                     ponto de partida do sistema
    ├── App.tsx                      rotas (qual tela abre em cada endereço)
    ├── index.css                    cores, visual e regras de impressão
    │
    ├── contexts/
    │   └── AuthContext.tsx          login, perfil e dados da loja
    │
    ├── lib/                         funções de apoio
    │   ├── supabase.ts              conexão com o Supabase e mensagens de erro em português
    │   ├── types.ts                 formato dos dados (produto, venda, caixa…)
    │   ├── format.ts                R$, datas, quantidades, CNPJ
    │   ├── data.ts                  busca de dados em páginas
    │   ├── csv.ts                   exportação para Excel
    │   ├── barcode.ts               desenho do código de barras
    │   ├── imprimir.ts              impressão do comprovante
    │   └── atalhos.ts               teclas de atalho do caixa
    │
    ├── components/                  peças usadas em várias telas
    │   ├── Layout.tsx               menu lateral e topo
    │   ├── Modal.tsx                janelas e confirmações
    │   ├── Toast.tsx                avisos (sucesso/erro)
    │   ├── Ui.tsx                   selos, títulos, carregando
    │   ├── ProdutoBusca.tsx         busca de produto / leitor de código de barras
    │   ├── CodigoBarras.tsx         código de barras nas etiquetas
    │   ├── Comprovante.tsx          comprovante não fiscal e fechamento de caixa
    │   └── Calculadora.tsx          calculadora do caixa
    │
    └── pages/                       telas do sistema
        ├── Login.tsx                entrar / criar conta
        ├── Pendente.tsx             "aguardando liberação"
        ├── NaoConfigurado.tsx       aviso quando falta o .env
        ├── Painel.tsx               tela inicial
        ├── Caixa.tsx                🛒 venda, desconto, pagamento, troco, fechamento
        ├── Vendas.tsx               histórico de vendas, fiado, caixas
        ├── Produtos.tsx             lista de produtos
        ├── ProdutoForm.tsx          cadastro / edição de produto
        ├── Estoque.tsx              entrada, saída, ajuste
        ├── Etiquetas.tsx            etiquetas de gôndola
        ├── Relatorios.tsx           relatórios e CSV
        ├── Backup.tsx               backup em JSON
        ├── Configuracoes.tsx        usuários, dados da loja e prévia do comprovante
        └── Teclado.tsx              escolher as teclas do caixa
```

### O que NÃO pode ir para o GitHub

| Item | Por quê |
|---|---|
| `.env` | Tem a URL e a chave do seu Supabase. Fica só no seu computador; no GitHub as chaves vão em **Secrets** (seção 7). |
| `node_modules/` | São as bibliotecas baixadas, centenas de MB. São recriadas com `pnpm install`. |
| `dist/` | É o site já gerado. O GitHub Actions gera sozinho a cada publicação. |

O arquivo `.gitignore` já bloqueia esses três quando você usa o terminal (opção A).

---

## 3. Antes de começar

1. Baixe o `loja-facil.zip` e descompacte, por exemplo em `C:\projetos\` (Windows) ou `~/projetos/` (Mac/Linux).
   Vai ficar `C:\projetos\loja-facil\` com os arquivos dentro.
2. No GitHub da **conta nova**: **+ → New repository**.
   - Nome: `loja-facil` (vira parte do endereço: `https://SUA-CONTA.github.io/loja-facil/`)
   - **Public**: o GitHub Pages grátis só funciona com repositório público. Os dados da loja não ficam no código: ficam no Supabase, protegidos por login. **Private** só se tiver o plano GitHub Pro.
   - **Não** marque README, .gitignore nem licença: o repositório tem que nascer vazio.
   - Clique em **Create repository**.

Depois escolha **uma** das duas opções abaixo.

---

## 4. Opção A — pelo terminal (recomendada)

Precisa do **Git** instalado (https://git-scm.com).

```bash
# 1. Entre na pasta do projeto (a que tem o package.json)
cd C:\projetos\loja-facil          # Mac/Linux: cd ~/projetos/loja-facil

# 2. Diga ao Git quem é você (use os dados da CONTA NOVA)
git config user.name  "Seu Nome"
git config user.email "email-da-conta-nova@exemplo.com"

# 3. Crie o repositório local e confira o que vai subir
git init
git add .
git status
```

**Confira o `git status`:** devem aparecer `src/`, `supabase/`, `package.json` etc.
**Não** pode aparecer `.env`, `node_modules` nem `dist`. Se aparecer, pare e me chame.

```bash
# 4. Grave e envie
git commit -m "Loja Fácil - versão inicial"
git branch -M main
git remote add origin https://github.com/SUA-CONTA/loja-facil.git
git push -u origin main
```

- Se abrir uma janela de login, entre com a **conta nova**.
- Se o push for para a conta errada (o computador lembra da conta antiga):
  - **Windows:** Painel de Controle → **Gerenciador de Credenciais** → Credenciais do Windows → remova `git:https://github.com`, depois rode `git push -u origin main` de novo.
  - **Mac:** abra **Acesso às Chaves** (Keychain), procure `github.com`, apague e rode o push de novo.

---

## 5. Opção B — pelo navegador (sem terminal)

1. Na página do repositório vazio, clique em **uploading an existing file**.
2. Abra a pasta `loja-facil` no seu computador e **mostre os arquivos ocultos**, porque `.gitignore`, `.env.example` e a pasta `.github` começam com ponto:
   - **Windows:** Explorador de Arquivos → **Exibir → Mostrar → Itens ocultos**.
   - **Mac:** no Finder, aperte **Cmd + Shift + .** (ponto).
3. Selecione **tudo que está dentro** da pasta `loja-facil` (Ctrl+A ou Cmd+A), e não a pasta em si.
   Antes, confira se `node_modules`, `dist` e `.env` não estão na pasta. Se estiverem, não selecione esses três.
4. Arraste para a página do GitHub. As pastas `src`, `supabase` e `public` sobem com tudo o que têm dentro.
5. Em **Commit changes**, escreva `Loja Fácil - versão inicial` e clique em **Commit changes**.

> Pelo navegador, o `.gitignore` não protege nada: o GitHub sobe o que você arrastar. Por isso, confira o passo 3 com atenção.
>
> ⚠️ A pasta **`.github`** é essencial: sem ela, a publicação automática não acontece. Se o navegador não subir essa pasta, crie o arquivo à mão:
> 1. No repositório, clique em **Add file → Create new file**.
> 2. No nome, digite `.github/workflows/publicar.yml`.
> 3. Cole o conteúdo do arquivo e clique em **Commit changes**.

---

## 6. Conferência no GitHub

Abra `github.com/SUA-CONTA/loja-facil` e confira:

- [ ] Na raiz aparecem `.github`, `public`, `src`, `supabase`, `package.json`, `.gitignore`, `.env.example`.
- [ ] Existe `.github/workflows/publicar.yml`.
- [ ] **Não** existe uma pasta `loja-facil` dentro do repositório.
- [ ] **Não** aparecem `.env`, `node_modules` nem `dist`.
- [ ] `supabase/migrations` tem os 6 arquivos `.sql`.
- [ ] `src/pages` tem 14 arquivos, incluindo `Caixa.tsx` e `Teclado.tsx`.
- [ ] O repositório está **Public** (ou Private com GitHub Pro).
- [ ] O README aparece embaixo da lista de arquivos.

---

## 7. Sequência completa até o sistema funcionar

| Passo | Onde | O que fazer |
|---|---|---|
| 1 | Supabase (conta nova) | Criar o projeto (região São Paulo) |
| 2 | Supabase → SQL Editor | Rodar `0001_inicial.sql` |
| 3 | Supabase → SQL Editor | Rodar `0002_caixa_vendas.sql` |
| 4 | Supabase → SQL Editor | Rodar `0003_atalhos_teclado.sql` |
| 5 | Supabase → Project Settings → API Keys | Copiar a URL e a chave pública (publishable / anon) |
| 6 | Seu computador | Criar o `.env` a partir do `.env.example`, rodar `pnpm install` e `pnpm dev`, testar |
| 7 | GitHub (conta nova) | Subir os arquivos (seção 4 ou 5 deste guia) |
| 8 | GitHub → Settings → Secrets and variables → Actions | Criar os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` |
| 9 | GitHub → Settings → Pages | Source: **GitHub Actions**; depois **Actions → Publicar no GitHub Pages → Run workflow** |
| 9b | Supabase → Authentication → URL Configuration | Colocar `https://SUA-CONTA.github.io/loja-facil/` em Site URL e Redirect URLs |
| 10 | Sistema publicado | Criar a conta do administrador (a primeira), preencher os dados da loja e o CNPJ, liberar as balconistas |

Detalhes de cada passo: veja o `GUIA.md`.

---

## 8. Quando houver mudanças no futuro

Com a opção A, depois de alterar ou receber arquivos novos:

```bash
cd C:\projetos\loja-facil
git add .
git commit -m "Descreva o que mudou"
git push
```

O GitHub Actions publica a nova versão sozinho em cerca de 2 minutos. Acompanhe na aba **Actions**.

Se vier um SQL novo (ex.: `0004_....sql`):
1. Faça um **backup** pelo sistema (menu Backup).
2. Rode **só o arquivo novo** no SQL Editor.
3. Nunca rode de novo os arquivos antigos.
