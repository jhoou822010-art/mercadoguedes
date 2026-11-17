import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Telas do sistema (manter igual às rotas de src/App.tsx).
 * Para cada uma o build gera "<rota>.html" (cópia do index.html). O GitHub Pages
 * entrega /mercadoguedes/caixa a partir de caixa.html com HTTP 200 — sem 404 e
 * sem redirecionamento — e o React Router abre a tela certa.
 */
export const ROTAS = ["caixa", "vendas", "produtos", "estoque", "etiquetas", "relatorios", "backup", "configuracoes", "teclado"];

function paginasParaGithubPages(): Plugin {
  return {
    name: "lojafacil-paginas-github-pages",
    apply: "build",
    closeBundle() {
      const dist = resolve(process.cwd(), "dist");
      const index = resolve(dist, "index.html");
      if (!existsSync(index)) return;
      for (const rota of ROTAS) copyFileSync(index, resolve(dist, `${rota}.html`));
      // Endereço desconhecido: mostra o sistema (que volta para o Painel).
      copyFileSync(index, resolve(dist, "404.html"));
      // Aplicativo instalável: cada publicação ganha uma versão nova do service worker,
      // o que faz os computadores e celulares baixarem a versão nova e apagarem a antiga.
      const sw = resolve(dist, "sw.js");
      if (existsSync(sw)) {
        // Todos os arquivos publicados (menos as cópias de rota e o próprio sw), para guardar offline.
        const listar = (dir: string, pre = ""): string[] => readdirSync(dir).flatMap((n) => {
          const caminho = resolve(dir, n);
          return statSync(caminho).isDirectory() ? listar(caminho, `${pre}${n}/`) : [`${pre}${n}`];
        });
        const pular = new Set(["sw.js", "404.html", "index.html", ...ROTAS.map((r) => `${r}.html`)]);
        const arquivos = listar(dist).filter((a) => !pular.has(a));
        writeFileSync(sw, readFileSync(sw, "utf8")
          .replace("__VERSAO__", new Date().toISOString())
          .replace("/*__ARQUIVOS__*/[]", JSON.stringify(arquivos)));
      }
    },
  };
}

export default defineConfig({
  // No GitHub Pages o site fica em /NOME-DO-REPOSITORIO/. O arquivo de publicação
  // (.github/workflows/publicar.yml) informa esse caminho em VITE_BASE automaticamente.
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss(), paginasParaGithubPages()],
  // Data da versão, mostrada em "Sobre o sistema".
  define: { __VERSAO_APP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")) },
  server: { host: true, port: 5173 },
});
