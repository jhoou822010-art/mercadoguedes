import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useState } from "react";
const ToastCtx = createContext(() => { });
const ESTILO = {
    sucesso: "border-ok-600 bg-ok-50 text-ok-700",
    erro: "border-critico-600 bg-critico-50 text-critico-700",
    info: "border-petroleo-500 bg-petroleo-50 text-petroleo-800",
};
const ICONE = { sucesso: "✓", erro: "!", info: "i" };
export function ToastProvider({ children }) {
    const [avisos, setAvisos] = useState([]);
    const avisar = useCallback((tipo, texto) => {
        const id = Date.now() + Math.random();
        setAvisos((a) => [...a, { id, tipo, texto }]);
        setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "erro" ? 7000 : 4000);
    }, []);
    return (_jsxs(ToastCtx.Provider, { value: avisar, children: [children, _jsx("div", { className: "nao-imprimir pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 lg:top-4 lg:right-4 lg:left-auto lg:items-end", children: avisos.map((a) => (_jsxs("div", { role: a.tipo === "erro" ? "alert" : "status", className: `pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-sm shadow-lg ${ESTILO[a.tipo]}`, children: [_jsx("span", { className: "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold", children: ICONE[a.tipo] }), _jsx("span", { className: "flex-1", children: a.texto }), _jsx("button", { className: "opacity-60 hover:opacity-100", onClick: () => setAvisos((x) => x.filter((y) => y.id !== a.id)), "aria-label": "Fechar aviso", children: "\u2715" })] }, a.id))) })] }));
}
export const useToast = () => useContext(ToastCtx);
