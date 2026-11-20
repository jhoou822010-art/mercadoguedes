import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ehIos, estaInstalado, instalar, ouvirInstalacao, podeInstalar } from "../lib/instalar";
import { Modal } from "./Modal";
/** Botão "Instalar aplicativo". Some quando já está instalado ou o navegador não permite. */
export function InstalarApp({ claro = false }) {
    const [, atualizar] = useState(0);
    const [ajudaIos, setAjudaIos] = useState(false);
    useEffect(() => ouvirInstalacao(() => atualizar((n) => n + 1)), []);
    if (estaInstalado())
        return null;
    const ios = ehIos();
    if (!podeInstalar() && !ios)
        return null;
    const estilo = claro
        ? "w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
        : "btn-secundario w-full";
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: estilo, onClick: () => (ios ? setAjudaIos(true) : void instalar()), title: "Coloca o Gerenciador de Mercado como um aplicativo, com \u00EDcone na \u00E1rea de trabalho ou na tela do celular", children: "\u2B07 Instalar aplicativo" }), ajudaIos && (_jsxs(Modal, { aberto: true, titulo: "Instalar no iPhone ou iPad", onFechar: () => setAjudaIos(false), children: [_jsxs("ol", { className: "list-decimal space-y-2 pl-5 text-sm text-slate-700", children: [_jsxs("li", { children: ["Abra este endere\u00E7o no ", _jsx("strong", { children: "Safari" }), "."] }), _jsxs("li", { children: ["Toque no bot\u00E3o ", _jsx("strong", { children: "Compartilhar" }), " (quadrado com uma seta para cima)."] }), _jsxs("li", { children: ["Escolha ", _jsx("strong", { children: "Adicionar \u00E0 Tela de In\u00EDcio" }), " e toque em ", _jsx("strong", { children: "Adicionar" }), "."] })] }), _jsx("div", { className: "mt-4 text-right", children: _jsx("button", { className: "btn-primario", onClick: () => setAjudaIos(false), children: "Entendi" }) })] }))] }));
}
