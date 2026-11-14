import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * GitHub Pages não sabe abrir endereços como /loja-facil/caixa ao recarregar a página.
 * Ele mostra o arquivo 404.html — então criamos um 404.html igual ao index.html,
 * e o próprio sistema abre a tela certa.
 */
function paginaParaGithubPages(): Plugin {
  return {
    name: "lojafacil-404-github-pages",
    apply: "build",
    closeBundle() {
      const dist = resolve(process.cwd(), "dist");
      if (existsSync(resolve(dist, "index.html"))) copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
    },
  };
}

export default defineConfig({
  // No GitHub Pages o site fica em /NOME-DO-REPOSITORIO/. O arquivo de publicação
  // (.github/workflows/publicar.yml) informa esse caminho em VITE_BASE automaticamente.
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss(), paginaParaGithubPages()],
  server: { host: true, port: 5173 },
});
