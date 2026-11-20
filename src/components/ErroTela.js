import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
/*
  Se alguma tela der erro, em vez de ficar tudo BRANCO aparece uma mensagem
  com o que aconteceu e botões para recarregar ou voltar ao Painel.
  Quando o erro é "versão nova publicada" (arquivo antigo que não existe mais),
  o sistema recarrega sozinho, uma vez.
*/
const CHAVE = "lojafacil.recarregou-versao";
export function ehErroDeVersao(e) {
    const m = String(e?.message ?? e);
    return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError|Unable to preload CSS/i.test(m);
}
/** Recarrega a página uma única vez a cada 30 s (evita ficar recarregando sem parar). */
export function recarregarParaVersaoNova() {
    try {
        const ult = Number(sessionStorage.getItem(CHAVE) || 0);
        if (Date.now() - ult < 30_000)
            return false;
        sessionStorage.setItem(CHAVE, String(Date.now()));
    }
    catch { /* sem memória: recarrega assim mesmo */ }
    window.location.reload();
    return true;
}
export class ErroTela extends Component {
    state = { erro: null };
    static getDerivedStateFromError(erro) {
        return { erro };
    }
    componentDidCatch(erro, info) {
        console.error("Erro na tela:", erro, info.componentStack);
        if (ehErroDeVersao(erro))
            recarregarParaVersaoNova();
    }
    render() {
        const { erro } = this.state;
        if (!erro)
            return this.props.children;
        const versao = ehErroDeVersao(erro);
        const base = import.meta.env.BASE_URL;
        return (_jsx("div", { className: "flex min-h-[60vh] items-center justify-center p-6", children: _jsxs("div", { className: "cartao max-w-lg space-y-4 p-6 text-center", children: [_jsx("p", { className: "text-4xl", children: "\u26A0\uFE0F" }), _jsx("h1", { className: "text-xl font-bold text-slate-800", children: versao ? "Saiu uma versão nova do sistema" : "Esta tela não abriu" }), _jsx("p", { className: "text-sm text-slate-600", children: versao
                            ? "Clique em Recarregar para usar a versão nova. Nenhum dado foi perdido."
                            : "Nenhum dado foi perdido: vendas, caixa e estoque ficam guardados no servidor. Clique em Recarregar. Se continuar, tire um print desta tela e mande para o suporte." }), !versao && _jsx("p", { className: "break-words rounded bg-slate-100 p-2 text-left font-mono text-xs text-slate-500", children: erro.message }), _jsxs("div", { className: "flex flex-wrap justify-center gap-2", children: [_jsx("button", { className: "btn-acao", onClick: () => window.location.reload(), children: "\u21BB Recarregar" }), _jsx("a", { className: "btn-secundario", href: base, children: "Voltar ao Painel" })] })] }) }));
    }
}
