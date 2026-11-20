import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { supabaseConfigurado } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/Ui";
import Login from "./pages/Login";
import Pendente from "./pages/Pendente";
import ErroPerfil from "./pages/ErroPerfil";
import NaoConfigurado from "./pages/NaoConfigurado";
// Cada tela é baixada só quando for aberta (o site abre mais rápido).
const Painel = lazy(() => import("./pages/Painel"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Estoque = lazy(() => import("./pages/Estoque"));
const Etiquetas = lazy(() => import("./pages/Etiquetas"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Backup = lazy(() => import("./pages/Backup"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Caixa = lazy(() => import("./pages/Caixa"));
const Vendas = lazy(() => import("./pages/Vendas"));
const Teclado = lazy(() => import("./pages/Teclado"));
/** Depois de entrar, já deixa o Caixa e o Painel baixados (abrem na hora quando clicar). */
function preCarregar() {
    const fazer = () => { void import("./pages/Caixa"); void import("./pages/Painel"); };
    if ("requestIdleCallback" in window)
        window.requestIdleCallback(fazer);
    else
        setTimeout(fazer, 1500);
}
export default function App() {
    const { sessao, perfil, carregando, ehAdmin, erroPerfil } = useAuth();
    useEffect(() => { if (sessao)
        preCarregar(); }, [sessao]);
    if (!supabaseConfigurado)
        return _jsx(NaoConfigurado, {});
    if (carregando)
        return _jsx(Carregando, { texto: "Abrindo o Gerenciador de Mercado\u2026" });
    if (!sessao)
        return _jsx(Login, {});
    if (!perfil)
        return erroPerfil ? _jsx(ErroPerfil, {}) : _jsx(Carregando, { texto: "Carregando seu perfil\u2026" });
    if (perfil.papel === "pendente")
        return _jsx(Pendente, {});
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(Painel, {}) }), _jsx(Route, { path: "caixa", element: _jsx(Caixa, {}) }), _jsx(Route, { path: "vendas", element: _jsx(Vendas, {}) }), _jsx(Route, { path: "produtos", element: _jsx(Produtos, {}) }), _jsx(Route, { path: "estoque", element: _jsx(Estoque, {}) }), _jsx(Route, { path: "etiquetas", element: _jsx(Etiquetas, {}) }), _jsx(Route, { path: "relatorios", element: _jsx(Relatorios, {}) }), _jsx(Route, { path: "backup", element: ehAdmin ? _jsx(Backup, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "configuracoes", element: ehAdmin ? _jsx(Configuracoes, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "teclado", element: ehAdmin ? _jsx(Teclado, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
