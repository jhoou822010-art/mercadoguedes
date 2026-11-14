/** Gera e baixa um CSV pronto para o Excel em português (separador ";" e acentos corretos). */
export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  baixarArquivo(nomeArquivo, "﻿" + conteudo, "text/csv;charset=utf-8");
}

export function baixarArquivo(nomeArquivo: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "2026-11-14" para usar em nomes de arquivo. */
export const hojeArquivo = () => new Date().toLocaleDateString("sv-SE");
