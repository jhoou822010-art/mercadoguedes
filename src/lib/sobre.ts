/*
  IDENTIFICAÇÃO DO SOFTWARE (autoria). Fonte única: todas as telas leem daqui.
  É só informação institucional: não muda nenhum dado nem a propriedade dos
  dados do estabelecimento, que continuam sendo do Supermercado J.E. Guedes.
*/
export const SOFTWARE = {
  nome: "Gerenciador de Mercado",
  autor: "Jonatha Melo",
  estabelecimento: "Supermercado J.E. Guedes",
  ano: 2026,
} as const;

export const LINHA_AUTORIA = `Desenvolvido por ${SOFTWARE.autor}`;
export const LINHA_USO = `Sistema utilizado pelo ${SOFTWARE.estabelecimento}.`;
export const COPYRIGHT = `© ${SOFTWARE.ano} – ${SOFTWARE.autor}.`;

/** Data da versão publicada (preenchida na publicação). */
export const VERSAO = typeof __VERSAO_APP__ === "string" ? __VERSAO_APP__ : "desenvolvimento";
