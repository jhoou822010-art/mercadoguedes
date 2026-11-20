import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Suspense, useEffect, useState } from "react";
import { SOFTWARE } from "../lib/sobre";
import { RodapeAutoria } from "./Sobre";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { MeuPerfil } from "./MeuPerfil";
import { LOGO_PADRAO } from "../lib/marca";
import { Carregando } from "./Ui";
import { IndicadorConexao, SemConexao } from "./SemConexao";
import { MantemCopiaLocal } from "./CopiaLocal";
import { InstalarApp } from "./InstalarApp";
import { ErroTela } from "./ErroTela";
import { abrirCaixaEmJanela, comprasEmAndamento, ehJanelaDoCaixa, EVENTO_CARRINHO, ouvirFixarCaixa } from "../lib/carrinho";
import { fmtMoeda } from "../lib/format";
/** Lembrete diário para o administrador baixar o backup (precisa do SQL 0007). */
function LembreteBackup() {
    const { ehAdmin, config } = useAuth();
    const local = useLocation();
    if (!ehAdmin || !config || config.ultimo_backup_em === undefined || local.pathname.endsWith("/backup"))
        return null;
    const ultimo = config.ultimo_backup_em ? new Date(config.ultimo_backup_em) : null;
    const horas = ultimo ? (Date.now() - ultimo.getTime()) / 36e5 : Infinity;
    if (horas < 24)
        return null;
    return (_jsxs("div", { className: "nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-atencao-500 bg-atencao-50 px-4 py-3 text-sm text-atencao-700", children: [_jsxs("span", { children: ["\uD83D\uDCE6 ", _jsx("strong", { children: "Fa\u00E7a o backup de hoje." }), " ", ultimo ? `O último foi em ${ultimo.toLocaleDateString("pt-BR")} às ${ultimo.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : "Nenhum backup foi feito ainda.", " ", "Guarde o arquivo num pen drive ou no Google Drive."] }), _jsx(NavLink, { to: "/backup", className: "btn-acao btn-pequeno", children: "Fazer backup agora" })] }));
}
/** Aviso nas outras telas: tem compra no caixa esperando. Nada se perde. */
function CompraEmAndamento() {
    const { perfil } = useAuth();
    const local = useLocation();
    const [, atualizar] = useState(0);
    useEffect(() => {
        const f = () => atualizar((n) => n + 1);
        window.addEventListener(EVENTO_CARRINHO, f);
        window.addEventListener("storage", f);
        return () => { window.removeEventListener(EVENTO_CARRINHO, f); window.removeEventListener("storage", f); };
    }, []);
    if (local.pathname.endsWith("/caixa"))
        return null;
    const compras = comprasEmAndamento(perfil?.id);
    if (!compras.length)
        return null;
    const c = compras[0];
    return (_jsxs("div", { className: "nao-imprimir fixed bottom-3 left-3 z-[35] flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 rounded-xl border-2 border-acao-500 bg-white px-3 py-2 text-sm shadow-xl lg:left-[17rem]", role: "status", children: [_jsx("span", { className: "font-semibold text-slate-800", children: "\uD83D\uDED2 Compra em andamento" }), _jsxs("span", { className: "text-slate-600", children: [c.itens, " ", c.itens === 1 ? "item" : "itens", " \u00B7 ", fmtMoeda(c.total)] }), _jsx(NavLink, { to: "/caixa", className: "btn-acao btn-pequeno", children: "Voltar ao caixa" }), _jsx("button", { type: "button", className: "btn-secundario btn-pequeno", onClick: () => abrirCaixaEmJanela(), title: "Abre o caixa numa janela pr\u00F3pria, que pode ser movida e mudar de tamanho", children: "\u29C9 Janela separada" })] }));
}
const ITENS = [
    { para: "/", rotulo: "Painel", icone: "▦" },
    { para: "/caixa", rotulo: "Caixa (venda)", icone: "🛒" },
    { para: "/vendas", rotulo: "Vendas e crediário", icone: "🧾" },
    { para: "/produtos", rotulo: "Produtos", icone: "▤" },
    { para: "/estoque", rotulo: "Estoque", icone: "⇅" },
    { para: "/etiquetas", rotulo: "Etiquetas", icone: "🏷" },
    { para: "/relatorios", rotulo: "Relatórios", icone: "≡" },
    { para: "/backup", rotulo: "Backup", icone: "⤓", admin: true },
    { para: "/configuracoes", rotulo: "Usuários e loja", icone: "⚙", admin: true },
    { para: "/teclado", rotulo: "Teclado do caixa", icone: "⌨", admin: true },
];
export function Logo({ claro = false, loja, compacto = false, grande = false }) {
    const nome = loja?.nome?.trim();
    const fonte = loja?.logo || LOGO_PADRAO;
    const [falhou, setFalhou] = useState(null);
    // Logo da loja (enviada pela tela ou a padrão do sistema), num fundo branco para ficar legível.
    if (falhou !== fonte) {
        return (_jsx("div", { className: `flex items-center justify-center rounded-xl bg-white ${compacto ? "h-11 px-2" : "w-full p-2"}`, children: _jsx("img", { src: fonte, alt: nome ? `Logo ${nome}` : "Logo da loja", className: compacto ? "h-9 w-auto max-w-[160px] object-contain" : `mx-auto w-auto max-w-full object-contain ${grande ? "max-h-40" : "max-h-20"}`, onError: () => setFalhou(fonte) }) }));
    }
    // Sem logo: ícone e nome.
    return (_jsxs("div", { className: "flex min-w-0 items-center gap-2.5", children: [_jsx("img", { src: `${import.meta.env.BASE_URL}favicon.svg`, alt: "", className: "h-9 w-9 shrink-0" }), _jsxs("div", { className: "min-w-0 leading-tight", children: [_jsx("div", { className: `truncate text-lg font-bold ${claro ? "text-white" : "text-petroleo-800"}`, children: nome || SOFTWARE.nome }), _jsx("div", { className: `truncate text-[11px] ${claro ? "text-petroleo-200" : "text-slate-500"}`, children: nome ? SOFTWARE.nome : "Gestão de caixa, estoque e vendas" })] })] }));
}
function Menu({ onNavegar }) {
    const { ehAdmin } = useAuth();
    return (_jsx("nav", { className: "flex flex-col gap-1", children: ITENS.filter((i) => !i.admin || ehAdmin).map((i) => (_jsxs(NavLink, { to: i.para, end: i.para === "/", onClick: onNavegar, className: ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-white/15 text-white" : "text-petroleo-100 hover:bg-white/10 hover:text-white"}`, children: [_jsx("span", { className: "w-5 text-center text-base", children: i.icone }), i.rotulo] }, i.para))) }));
}
function Usuario() {
    const { perfil, sair } = useAuth();
    const [editando, setEditando] = useState(false);
    return (_jsxs("div", { className: "border-t border-white/10 pt-4 text-sm", children: [_jsx("div", { className: "mb-2 px-2", children: _jsx(IndicadorConexao, {}) }), _jsxs("button", { onClick: () => setEditando(true), className: "group mb-3 block w-full rounded-lg px-2 py-1 text-left hover:bg-white/10", title: "Editar meu nome e senha", children: [_jsx("span", { className: "block truncate font-medium text-white", children: perfil?.nome }), _jsxs("span", { className: "block text-xs text-petroleo-200", children: [perfil?.papel === "admin" ? "Administrador" : "Operador", " \u00B7 ", _jsx("span", { className: "underline group-hover:text-white", children: "Meu perfil" })] })] }), _jsx("div", { className: "mb-2", children: _jsx(InstalarApp, { claro: true }) }), _jsx("button", { onClick: sair, className: "w-full rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10", children: "Sair" }), editando && _jsx(MeuPerfil, { onFechar: () => setEditando(false) })] }));
}
export function Layout() {
    const [menuAberto, setMenuAberto] = useState(false);
    const local = useLocation();
    const { config } = useAuth();
    const loja = config ? { nome: config.nome_loja, logo: config.logo } : null;
    useEffect(() => setMenuAberto(false), [local.pathname]);
    const navegar = useNavigate();
    useEffect(() => ouvirFixarCaixa(() => navegar("/caixa")), [navegar]);
    useEffect(() => {
        document.title = config?.nome_loja ? `${config.nome_loja} · ${SOFTWARE.nome}` : SOFTWARE.nome;
    }, [config?.nome_loja]);
    // Caixa aberto em janela separada: só o caixa, sem menu (a janela principal continua com tudo).
    if (ehJanelaDoCaixa() && local.pathname.endsWith("/caixa")) {
        return (_jsxs("div", { className: "min-h-screen", children: [_jsxs("header", { className: "nao-imprimir flex items-center justify-between gap-2 bg-petroleo-800 px-4 py-1.5 text-xs text-petroleo-100", children: [_jsx("span", { children: "\uD83D\uDED2 Caixa em janela separada \u00B7 mova e mude o tamanho desta janela \u00E0 vontade" }), _jsx("span", { children: "A compra \u00E9 a mesma da janela principal" })] }), _jsxs("main", { className: "min-w-0 px-3 py-3 sm:px-4", children: [_jsx(SemConexao, {}), _jsx(ErroTela, { children: _jsx(Suspense, { fallback: _jsx(Carregando, { texto: "Abrindo a tela\u2026" }), children: _jsx(Outlet, {}) }) }, local.pathname)] })] }));
    }
    return (_jsxs("div", { className: "min-h-screen lg:flex", children: [_jsxs("aside", { className: "nao-imprimir hidden w-64 shrink-0 flex-col justify-between bg-petroleo-800 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto", children: [_jsxs("div", { className: "space-y-6", children: [_jsx(Logo, { claro: true, loja: loja }), _jsx(Menu, {})] }), _jsx(Usuario, {})] }), _jsxs("header", { className: "nao-imprimir sticky top-0 z-20 flex items-center justify-between bg-petroleo-800 px-4 py-3 lg:hidden", children: [_jsx(Logo, { claro: true, loja: loja, compacto: true }), _jsx("span", { className: "ml-auto mr-2", children: _jsx(IndicadorConexao, {}) }), _jsx("button", { onClick: () => setMenuAberto(true), className: "rounded-lg p-2 text-2xl leading-none text-white hover:bg-white/10", "aria-label": "Abrir menu", children: "\u2630" })] }), menuAberto && (_jsx("div", { className: "nao-imprimir fixed inset-0 z-30 bg-slate-900/50 lg:hidden", onClick: () => setMenuAberto(false), children: _jsxs("div", { className: "flex h-full w-72 max-w-[85vw] flex-col justify-between gap-4 overflow-y-auto bg-petroleo-800 p-4", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsx(Logo, { claro: true, loja: loja }), _jsx("button", { onClick: () => setMenuAberto(false), className: "p-1 text-white", "aria-label": "Fechar menu", children: "\u2715" })] }), _jsx(Menu, { onNavegar: () => setMenuAberto(false) })] }), _jsx(Usuario, {})] }) })), _jsx("main", { className: "min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8", children: _jsxs("div", { className: "mx-auto max-w-7xl", children: [_jsx(SemConexao, {}), _jsx(LembreteBackup, {}), _jsx(ErroTela, { children: _jsx(Suspense, { fallback: _jsx(Carregando, { texto: "Abrindo a tela\u2026" }), children: _jsx(Outlet, {}) }) }, local.pathname), _jsx("div", { className: "mt-10 border-t border-slate-200/70 pt-4", children: _jsx(RodapeAutoria, {}) })] }) }), _jsx(CompraEmAndamento, {}), _jsx(MantemCopiaLocal, {})] }));
}
