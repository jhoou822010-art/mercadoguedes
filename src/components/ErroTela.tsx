import { Component, type ErrorInfo, type ReactNode } from "react";

/*
  Se alguma tela der erro, em vez de ficar tudo BRANCO aparece uma mensagem
  com o que aconteceu e botões para recarregar ou voltar ao Painel.
  Quando o erro é "versão nova publicada" (arquivo antigo que não existe mais),
  o sistema recarrega sozinho, uma vez.
*/
const CHAVE = "lojafacil.recarregou-versao";

export function ehErroDeVersao(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError|Unable to preload CSS/i.test(m);
}

/** Recarrega a página uma única vez a cada 30 s (evita ficar recarregando sem parar). */
export function recarregarParaVersaoNova() {
  try {
    const ult = Number(sessionStorage.getItem(CHAVE) || 0);
    if (Date.now() - ult < 30_000) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch { /* sem memória: recarrega assim mesmo */ }
  window.location.reload();
  return true;
}

export class ErroTela extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Erro na tela:", erro, info.componentStack);
    if (ehErroDeVersao(erro)) recarregarParaVersaoNova();
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    const versao = ehErroDeVersao(erro);
    const base = import.meta.env.BASE_URL;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="cartao max-w-lg space-y-4 p-6 text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-xl font-bold text-slate-800">{versao ? "Saiu uma versão nova do sistema" : "Esta tela não abriu"}</h1>
          <p className="text-sm text-slate-600">
            {versao
              ? "Clique em Recarregar para usar a versão nova. Nenhum dado foi perdido."
              : "Nenhum dado foi perdido: vendas, caixa e estoque ficam guardados no servidor. Clique em Recarregar. Se continuar, tire um print desta tela e mande para o suporte."}
          </p>
          {!versao && <p className="break-words rounded bg-slate-100 p-2 text-left font-mono text-xs text-slate-500">{erro.message}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-acao" onClick={() => window.location.reload()}>↻ Recarregar</button>
            <a className="btn-secundario" href={base}>Voltar ao Painel</a>
          </div>
        </div>
      </div>
    );
  }
}
