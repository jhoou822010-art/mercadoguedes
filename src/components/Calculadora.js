import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { centavos, fmtMoeda } from "../lib/format";
/*
  Calculadora FLUTUANTE: não escurece a tela nem trava o sistema.
  - Arraste pela barra de cima para qualquer lugar (a posição fica guardada).
  - "–" encolhe (fica só o visor); "▢" volta ao normal.
  - Teclado: os números vão para a calculadora só quando ela está "ativa"
    (borda laranja). Clique fora dela e o teclado volta para o caixa;
    clique nela (ou aperte a tecla da calculadora) e ela volta a receber.
*/
let ativaGlobal = false;
const TECLAS_CALC = /^(\d|,|\.|\+|-|\*|\/|x|X|=|Enter|Backspace|Delete|c|C|Escape)$/;
/** Os atalhos do caixa perguntam isto antes de agir, para não roubar a tecla da calculadora. */
export function teclaEhDaCalculadora(e) {
    return ativaGlobal && (TECLAS_CALC.test(e.key) || e.code.startsWith("Numpad"));
}
/** Teclado numérico funciona mesmo com o Num Lock desligado. */
function teclaReal(e) {
    const m = /^Numpad(\d)$/.exec(e.code);
    if (m)
        return m[1];
    if (e.code === "NumpadDecimal" || e.code === "NumpadComma")
        return ",";
    return e.key;
}
/** Traz a calculadora aberta para a frente e liga o teclado nela. */
export function ativarCalculadora() {
    window.dispatchEvent(new Event("calculadora:ativar"));
}
const CHAVE_POS = "lojafacil.calculadora.posicao";
const CHAVE_TAM = "lojafacil.calculadora.largura";
const LARG = 300;
const LARG_MIN = 220;
const LARG_MAX = 560;
function larguraInicial() {
    try {
        const w = Number(localStorage.getItem(CHAVE_TAM));
        if (w >= LARG_MIN && w <= LARG_MAX)
            return w;
    }
    catch { /* sem memória */ }
    return LARG;
}
function posicaoInicial() {
    const vw = window.innerWidth, vh = window.innerHeight;
    try {
        const p = JSON.parse(localStorage.getItem(CHAVE_POS) || "null");
        if (p && typeof p.x === "number")
            return limitar(p.x, p.y);
    }
    catch { /* sem memória: usa o padrão */ }
    return vw < 640 ? limitar(8, vh - 470) : limitar(vw - LARG - 24, 90);
}
function limitar(x, y, larg = LARG) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(larg, vw - 16);
    return { x: Math.min(Math.max(8, x), Math.max(8, vw - w - 8)), y: Math.min(Math.max(8, y), Math.max(8, vh - 60)) };
}
function calcular(a, b, op) {
    switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? NaN : a / b;
    }
}
const fmt = (n) => Number.isNaN(n) ? "Erro" : n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
/**
 * Calculadora simples para o balcão. Funciona com o mouse, com toque
 * e com o teclado (inclusive o teclado numérico).
 * Se `onUsar` for informado, aparece o botão "Usar este valor".
 */
export function Calculadora({ onFechar, onUsar, textoUsar = "Usar este valor" }) {
    const [visor, setVisor] = useState("0");
    const [guardado, setGuardado] = useState(null);
    const [op, setOp] = useState(null);
    const [novo, setNovo] = useState(true);
    const [historico, setHistorico] = useState("");
    const estado = useRef({ visor, guardado, op, novo });
    estado.current = { visor, guardado, op, novo };
    const valorVisor = () => Number(estado.current.visor.replace(/\./g, "").replace(",", "."));
    function digito(d) {
        const { visor: v, novo: n } = estado.current;
        if (d === ",") {
            if (n) {
                setVisor("0,");
                setNovo(false);
                return;
            }
            if (!v.includes(","))
                setVisor(v + ",");
            return;
        }
        if (n || v === "0" || v === "Erro") {
            setVisor(d === "00" ? "0" : d);
            setNovo(false);
            return;
        }
        if (v.replace(/\D/g, "").length >= 12)
            return;
        setVisor(v + d);
    }
    function operacao(o) {
        const { guardado: g, op: atual, novo: n } = estado.current;
        const v = valorVisor();
        let base = v;
        if (g !== null && atual && !n) {
            base = calcular(g, v, atual);
            setVisor(fmt(base));
        }
        setGuardado(base);
        setOp(o);
        setNovo(true);
        setHistorico(`${fmt(base)} ${simbolo(o)}`);
    }
    function igual() {
        const { guardado: g, op: atual } = estado.current;
        if (g === null || !atual)
            return;
        const v = valorVisor();
        const r = calcular(g, v, atual);
        setHistorico(`${fmt(g)} ${simbolo(atual)} ${fmt(v)} =`);
        setVisor(fmt(r));
        setGuardado(null);
        setOp(null);
        setNovo(true);
    }
    function limpar() { setVisor("0"); setGuardado(null); setOp(null); setNovo(true); setHistorico(""); }
    function apagar() {
        const { visor: v, novo: n } = estado.current;
        if (n)
            return;
        setVisor(v.length > 1 ? v.slice(0, -1) : "0");
    }
    const [ativa, setAtiva] = useState(true);
    const [mini, setMini] = useState(false);
    const [pos, setPos] = useState(posicaoInicial);
    const [larg, setLarg] = useState(larguraInicial);
    const redim = useRef(null);
    const caixaRef = useRef(null);
    const arraste = useRef(null);
    const fecharRef = useRef(onFechar);
    fecharRef.current = onFechar;
    useEffect(() => { ativaGlobal = ativa; return () => { ativaGlobal = false; }; }, [ativa]);
    // Clique fora: o teclado volta para a tela. Clique dentro ou tecla da calculadora: volta para ela.
    useEffect(() => {
        const fora = (e) => { if (caixaRef.current && !caixaRef.current.contains(e.target))
            setAtiva(false); };
        const ativar = () => { setAtiva(true); setMini(false); document.activeElement?.blur(); };
        document.addEventListener("pointerdown", fora, true);
        document.addEventListener("focusin", fora, true);
        window.addEventListener("calculadora:ativar", ativar);
        const aoMudarTela = () => setPos((p) => limitar(p.x, p.y));
        window.addEventListener("resize", aoMudarTela);
        return () => {
            document.removeEventListener("pointerdown", fora, true);
            document.removeEventListener("focusin", fora, true);
            window.removeEventListener("calculadora:ativar", ativar);
            window.removeEventListener("resize", aoMudarTela);
        };
    }, []);
    useEffect(() => {
        document.activeElement?.blur();
    }, []);
    // Não deixa a calculadora passar da parte de baixo da tela (celular, tela pequena).
    useEffect(() => {
        const el = caixaRef.current;
        if (!el)
            return;
        const h = el.offsetHeight;
        setPos((p) => {
            const maxY = Math.max(8, window.innerHeight - h - 8);
            return p.y > maxY ? { ...p, y: maxY } : p;
        });
    }, [larg, mini]);
    useEffect(() => {
        if (!ativa)
            return;
        const tecla = (e) => {
            const k = teclaReal(e);
            if (e.ctrlKey || e.altKey || e.metaKey)
                return;
            let tratado = true;
            if (k === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                fecharRef.current();
                return;
            }
            if (/^\d$/.test(k))
                digito(k);
            else if (k === "," || k === ".")
                digito(",");
            else if (k === "+" || k === "-" || k === "*" || k === "/")
                operacao(k);
            else if (k === "x" || k === "X")
                operacao("*");
            else if (k === "Enter" || k === "=")
                igual();
            else if (k === "Backspace")
                apagar();
            else if (k === "Delete" || k === "c" || k === "C")
                limpar();
            else
                tratado = false;
            if (tratado) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener("keydown", tecla, true);
        return () => window.removeEventListener("keydown", tecla, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ativa]);
    function iniciarArraste(e) {
        if (e.target.closest("button"))
            return;
        arraste.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    function mover(e) {
        if (!arraste.current)
            return;
        setPos(limitar(e.clientX - arraste.current.dx, e.clientY - arraste.current.dy, larg));
    }
    // Canto de baixo à direita: puxe para aumentar ou diminuir (tudo cresce junto).
    /** Maior largura que ainda cabe na tela, para a direita e para baixo. */
    function larguraMaxima() {
        const el = caixaRef.current;
        const razao = el && el.offsetWidth ? el.offsetHeight / el.offsetWidth : 1.6;
        return Math.max(LARG_MIN, Math.min(LARG_MAX, window.innerWidth - pos.x - 8, (window.innerHeight - pos.y - 8) / razao));
    }
    function iniciarRedim(e) {
        e.stopPropagation();
        redim.current = { x0: e.clientX, w0: larg };
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    function redimensionar(e) {
        if (!redim.current)
            return;
        setLarg(Math.round(Math.min(Math.max(LARG_MIN, redim.current.w0 + e.clientX - redim.current.x0), Math.max(larg, larguraMaxima()))));
    }
    function soltarRedim() {
        if (!redim.current)
            return;
        redim.current = null;
        try {
            localStorage.setItem(CHAVE_TAM, String(larg));
        }
        catch { /* sem memória */ }
    }
    function tamanho(delta) {
        const novo = Math.round(Math.min(delta > 0 ? Math.max(larg, larguraMaxima()) : LARG_MAX, Math.max(LARG_MIN, larg + delta)));
        setLarg(novo);
        setPos((p) => limitar(p.x, p.y, novo));
        try {
            localStorage.setItem(CHAVE_TAM, String(novo));
        }
        catch { /* sem memória */ }
    }
    function soltar() {
        if (!arraste.current)
            return;
        arraste.current = null;
        try {
            localStorage.setItem(CHAVE_POS, JSON.stringify(pos));
        }
        catch { /* sem memória */ }
    }
    const resultado = valorVisor();
    const Botao = ({ t, onClick, cor = "bg-white hover:bg-slate-100", largo }) => (_jsx("button", { type: "button", onClick: onClick, className: `h-[2.75em] rounded-lg text-[1.125em] font-semibold shadow-sm ring-1 ring-slate-200 active:scale-95 ${cor} ${largo ? "col-span-2" : ""}`, children: t }));
    return createPortal(_jsxs("div", { ref: caixaRef, role: "dialog", "aria-label": "Calculadora", onMouseDown: (e) => e.stopPropagation(), onPointerDown: () => { if (!ativa)
            setAtiva(true); }, className: `nao-imprimir fixed z-[90] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-2 ${ativa ? "ring-acao-500" : "ring-slate-300"}`, style: { left: pos.x, top: pos.y, width: `min(${larg}px, calc(100vw - 16px))`, fontSize: `${(Math.min(larg, window.innerWidth - 16) / LARG) * 16}px` }, children: [_jsxs("div", { className: "flex cursor-move touch-none select-none items-center justify-between gap-2 bg-petroleo-800 px-3 py-2 text-white", onPointerDown: iniciarArraste, onPointerMove: mover, onPointerUp: soltar, onPointerCancel: soltar, title: "Arraste para mudar de lugar", children: [_jsxs("span", { className: "truncate text-[0.875em] font-semibold", children: ["\uD83E\uDDEE Calculadora ", _jsx("span", { className: "ml-1 text-[0.75em] font-normal text-petroleo-200", children: ativa ? "· teclado aqui" : "· clique p/ digitar" })] }), _jsxs("span", { className: "flex shrink-0 gap-0.5", children: [_jsx("button", { type: "button", className: "rounded px-1.5 text-sm leading-none hover:bg-white/15", onClick: () => tamanho(-40), "aria-label": "Diminuir calculadora", title: "Diminuir", children: "A\u2212" }), _jsx("button", { type: "button", className: "rounded px-1.5 text-sm leading-none hover:bg-white/15", onClick: () => tamanho(40), "aria-label": "Aumentar calculadora", title: "Aumentar", children: "A+" }), _jsx("button", { type: "button", className: "rounded px-2 text-lg leading-none hover:bg-white/15", onClick: () => setMini((m) => !m), "aria-label": mini ? "Mostrar teclas" : "Encolher", title: mini ? "Mostrar teclas" : "Encolher", children: mini ? "▢" : "–" }), _jsx("button", { type: "button", className: "rounded px-2 text-lg leading-none hover:bg-white/15", onClick: onFechar, "aria-label": "Fechar calculadora", title: "Fechar (Esc)", children: "\u2715" })] })] }), _jsxs("div", { className: "p-3", children: [_jsxs("div", { className: "rounded-xl bg-petroleo-900 px-3 py-2 text-right text-white", children: [_jsx("p", { className: "h-[1.25em] text-[0.75em] text-petroleo-200", children: historico }), _jsx("p", { className: "truncate text-[1.875em] font-bold tabular-nums", "aria-live": "polite", children: visor })] }), !mini && (_jsxs("div", { className: "mt-2 grid grid-cols-4 gap-[0.4em]", children: [_jsx(Botao, { t: "C", onClick: limpar, cor: "bg-critico-50 text-critico-700 hover:bg-critico-100" }), _jsx(Botao, { t: "\u232B", onClick: apagar }), _jsx(Botao, { t: "\u00F7", onClick: () => operacao("/"), cor: "bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" }), _jsx(Botao, { t: "\u00D7", onClick: () => operacao("*"), cor: "bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" }), ["7", "8", "9"].map((d) => _jsx(Botao, { t: d, onClick: () => digito(d) }, d)), _jsx(Botao, { t: "\u2212", onClick: () => operacao("-"), cor: "bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" }), ["4", "5", "6"].map((d) => _jsx(Botao, { t: d, onClick: () => digito(d) }, d)), _jsx(Botao, { t: "+", onClick: () => operacao("+"), cor: "bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" }), ["1", "2", "3"].map((d) => _jsx(Botao, { t: d, onClick: () => digito(d) }, d)), _jsx(Botao, { t: "=", onClick: igual, cor: "bg-acao-500 text-white hover:bg-acao-600" }), _jsx(Botao, { t: "0", onClick: () => digito("0"), largo: true }), _jsx(Botao, { t: ",", onClick: () => digito(",") }), _jsx(Botao, { t: "00", onClick: () => digito("00") })] })), onUsar && (_jsxs("button", { type: "button", className: "btn-acao mt-2 w-full text-[0.875em]", disabled: Number.isNaN(resultado) || resultado <= 0, onClick: () => onUsar(centavos(resultado)), children: [textoUsar, ": ", Number.isNaN(resultado) ? "—" : fmtMoeda(centavos(resultado))] })), !mini && _jsx("p", { className: "mt-2 text-center text-[0.7em] leading-tight text-slate-500", children: "Arraste pela barra de cima; puxe o canto \u25E2 para mudar o tamanho. Teclado num\u00E9rico: n\u00FAmeros, + \u2212 * /, Enter (=), Backspace, Delete (limpa), Esc (fecha)." })] }), _jsx("div", { className: "absolute bottom-0 right-0 flex h-6 w-6 cursor-nwse-resize touch-none select-none items-end justify-end p-0.5 text-xs leading-none text-slate-400 hover:text-acao-600", onPointerDown: iniciarRedim, onPointerMove: redimensionar, onPointerUp: soltarRedim, onPointerCancel: soltarRedim, title: "Puxe para mudar o tamanho", "aria-label": "Mudar o tamanho da calculadora", children: "\u25E2" })] }), document.body);
}
function simbolo(o) {
    return o === "*" ? "×" : o === "/" ? "÷" : o === "-" ? "−" : "+";
}
