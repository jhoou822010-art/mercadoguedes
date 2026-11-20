import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
/** Pilha de janelas abertas: o Esc fecha só a que está por cima. */
const pilha = [];
const LARGURA = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
export function Modal({ aberto, titulo, onFechar, children, rodape, largura = "md" }) {
    const id = useId();
    // Camada: cada janela aberta por cima de outra fica um degrau acima (nunca por baixo).
    const [camada, setCamada] = useState(0);
    useEffect(() => {
        if (!aberto)
            return;
        pilha.push(id);
        setCamada(pilha.length);
        document.body.style.overflow = "hidden";
        return () => {
            const i = pilha.lastIndexOf(id);
            if (i >= 0)
                pilha.splice(i, 1);
            if (pilha.length === 0)
                document.body.style.overflow = "";
        };
    }, [aberto, id]);
    useEffect(() => {
        if (!aberto)
            return;
        const tecla = (e) => {
            if (e.key === "Escape" && pilha[pilha.length - 1] === id) {
                e.preventDefault();
                onFechar();
            }
        };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    }, [aberto, onFechar, id]);
    if (!aberto)
        return null;
    // A janela é desenhada direto no <body> (portal), fora de qualquer outra tela ou janela,
    // para não ser cortada nem ficar escondida atrás de outra.
    return createPortal(_jsx("div", { className: "nao-imprimir fixed inset-0 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4", style: { zIndex: 40 + Math.max(camada, 1) * 2 }, onMouseDown: onFechar, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": titulo, className: `flex max-h-[92vh] max-h-[92dvh] w-full ${LARGURA[largura]} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`, onMouseDown: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-200 px-5 py-4", children: [_jsx("h2", { className: "text-lg font-semibold text-slate-800", children: titulo }), _jsx("button", { onClick: onFechar, className: "rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600", "aria-label": "Fechar", children: "\u2715" })] }), _jsx("div", { className: "flex-1 overflow-y-auto px-5 py-4", children: children }), rodape && _jsx("div", { className: "flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3", children: rodape })] }) }), document.body);
}
/** Caixa de confirmação para operações sensíveis. */
export function Confirmar({ aberto, titulo, mensagem, textoConfirmar = "Confirmar", perigo, processando, onConfirmar, onCancelar }) {
    return (_jsx(Modal, { aberto: aberto, titulo: titulo, onFechar: onCancelar, largura: "sm", rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onCancelar, disabled: processando, children: "Cancelar" }), _jsx("button", { className: perigo ? "btn-perigo" : "btn-primario", onClick: onConfirmar, disabled: processando, autoFocus: true, children: processando ? "Aguarde…" : textoConfirmar })] }), children: _jsx("div", { className: "text-sm text-slate-600", children: mensagem }) }));
}
