import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NOME_TIPO, textoDias } from "../lib/format";
const COR = {
    ok: "bg-ok-100 text-ok-700",
    atencao: "bg-atencao-100 text-atencao-700",
    critico: "bg-critico-100 text-critico-700",
    neutro: "bg-slate-100 text-slate-600",
    petroleo: "bg-petroleo-100 text-petroleo-700",
    acao: "bg-orange-100 text-acao-700",
};
export function Selo({ cor = "neutro", children }) {
    return _jsx("span", { className: `inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR[cor]}`, children: children });
}
export function SeloTipo({ tipo }) {
    const cor = tipo === "entrada" ? "ok" : tipo === "saida" ? "acao" : "petroleo";
    const sinal = tipo === "entrada" ? "↑ " : tipo === "saida" ? "↓ " : "⇄ ";
    return _jsxs(Selo, { cor: cor, children: [sinal, NOME_TIPO[tipo]] });
}
export function SeloValidade({ p }) {
    switch (p.situacao_validade) {
        case "vencido": return _jsx(Selo, { cor: "critico", children: "Vencido" });
        case "critico": return _jsx(Selo, { cor: "critico", children: textoDias(p.dias_para_vencer) });
        case "proximo": return _jsx(Selo, { cor: "atencao", children: textoDias(p.dias_para_vencer) });
        case "ok": return _jsx(Selo, { cor: "ok", children: "Dentro da validade" });
        default: return _jsx(Selo, { children: "Sem validade" });
    }
}
export function SeloEstoque({ p }) {
    if (Number(p.estoque) === 0)
        return _jsx(Selo, { cor: "critico", children: "Sem estoque" });
    if (p.abaixo_minimo)
        return _jsx(Selo, { cor: "atencao", children: "Abaixo do m\u00EDnimo" });
    return _jsx(Selo, { cor: "ok", children: "Normal" });
}
export function Carregando({ texto = "Carregando…" }) {
    return (_jsxs("div", { className: "flex items-center justify-center gap-3 py-12 text-sm text-slate-500", role: "status", children: [_jsx("span", { className: "h-5 w-5 animate-spin rounded-full border-2 border-petroleo-200 border-t-petroleo-700" }), texto] }));
}
export function Vazio({ titulo, children }) {
    return (_jsxs("div", { className: "py-12 text-center", children: [_jsx("p", { className: "font-medium text-slate-600", children: titulo }), children && _jsx("div", { className: "mt-2 text-sm text-slate-500", children: children })] }));
}
export function Cabecalho({ titulo, descricao, acoes }) {
    return (_jsxs("div", { className: "mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: titulo }), descricao && _jsx("p", { className: "mt-1 text-sm text-slate-500", children: descricao })] }), acoes && _jsx("div", { className: "nao-imprimir flex flex-wrap gap-2", children: acoes })] }));
}
export function Aviso({ cor = "atencao", children }) {
    const estilo = {
        atencao: "border-atencao-500 bg-atencao-50 text-atencao-700",
        critico: "border-critico-600 bg-critico-50 text-critico-700",
        petroleo: "border-petroleo-500 bg-petroleo-50 text-petroleo-800",
        ok: "border-ok-600 bg-ok-50 text-ok-700",
    }[cor];
    return _jsx("div", { className: `rounded-lg border-l-4 px-4 py-3 text-sm ${estilo}`, children: children });
}
