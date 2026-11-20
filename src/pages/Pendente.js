import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from "../contexts/AuthContext";
import { Logo } from "../components/Layout";
export default function Pendente() {
    const { perfil, recarregar, sair } = useAuth();
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-slate-50 px-4", children: _jsxs("div", { className: "cartao max-w-md space-y-4 p-6 text-center", children: [_jsx("div", { className: "flex justify-center", children: _jsx(Logo, {}) }), _jsx("h1", { className: "text-xl font-bold", children: "Aguardando libera\u00E7\u00E3o" }), _jsxs("p", { className: "text-sm text-slate-600", children: ["Ol\u00E1, ", _jsx("strong", { children: perfil?.nome }), ". Sua conta foi criada, mas o administrador da loja ainda precisa liberar o seu acesso em ", _jsx("em", { children: "Usu\u00E1rios e loja" }), "."] }), _jsxs("div", { className: "flex justify-center gap-2", children: [_jsx("button", { className: "btn-primario", onClick: recarregar, children: "Verificar novamente" }), _jsx("button", { className: "btn-secundario", onClick: sair, children: "Sair" })] })] }) }));
}
