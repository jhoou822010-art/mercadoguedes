import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
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
export function teclaEhDaCalculadora(e: KeyboardEvent) {
  return ativaGlobal && (TECLAS_CALC.test(e.key) || e.code.startsWith("Numpad"));
}
/** Teclado numérico funciona mesmo com o Num Lock desligado. */
function teclaReal(e: KeyboardEvent) {
  const m = /^Numpad(\d)$/.exec(e.code);
  if (m) return m[1];
  if (e.code === "NumpadDecimal" || e.code === "NumpadComma") return ",";
  return e.key;
}
/** Traz a calculadora aberta para a frente e liga o teclado nela. */
export function ativarCalculadora() {
  window.dispatchEvent(new Event("calculadora:ativar"));
}

const CHAVE_POS = "lojafacil.calculadora.posicao";
const LARG = 300;
function posicaoInicial() {
  const vw = window.innerWidth, vh = window.innerHeight;
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_POS) || "null");
    if (p && typeof p.x === "number") return limitar(p.x, p.y);
  } catch { /* sem memória: usa o padrão */ }
  return vw < 640 ? limitar(8, vh - 470) : limitar(vw - LARG - 24, 90);
}
function limitar(x: number, y: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(LARG, vw - 16);
  return { x: Math.min(Math.max(8, x), Math.max(8, vw - w - 8)), y: Math.min(Math.max(8, y), Math.max(8, vh - 60)) };
}

type Op = "+" | "-" | "*" | "/";

function calcular(a: number, b: number, op: Op) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? NaN : a / b;
  }
}

const fmt = (n: number) =>
  Number.isNaN(n) ? "Erro" : n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });

/**
 * Calculadora simples para o balcão. Funciona com o mouse, com toque
 * e com o teclado (inclusive o teclado numérico).
 * Se `onUsar` for informado, aparece o botão "Usar este valor".
 */
export function Calculadora({ onFechar, onUsar, textoUsar = "Usar este valor" }: { onFechar: () => void; onUsar?: (v: number) => void; textoUsar?: string }) {
  const [visor, setVisor] = useState("0");
  const [guardado, setGuardado] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [novo, setNovo] = useState(true);
  const [historico, setHistorico] = useState("");
  const estado = useRef({ visor, guardado, op, novo });
  estado.current = { visor, guardado, op, novo };

  const valorVisor = () => Number(estado.current.visor.replace(/\./g, "").replace(",", "."));

  function digito(d: string) {
    const { visor: v, novo: n } = estado.current;
    if (d === ",") {
      if (n) { setVisor("0,"); setNovo(false); return; }
      if (!v.includes(",")) setVisor(v + ",");
      return;
    }
    if (n || v === "0" || v === "Erro") { setVisor(d === "00" ? "0" : d); setNovo(false); return; }
    if (v.replace(/\D/g, "").length >= 12) return;
    setVisor(v + d);
  }

  function operacao(o: Op) {
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
    if (g === null || !atual) return;
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
    if (n) return;
    setVisor(v.length > 1 ? v.slice(0, -1) : "0");
  }

  const [ativa, setAtiva] = useState(true);
  const [mini, setMini] = useState(false);
  const [pos, setPos] = useState(posicaoInicial);
  const caixaRef = useRef<HTMLDivElement>(null);
  const arraste = useRef<{ dx: number; dy: number } | null>(null);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => { ativaGlobal = ativa; return () => { ativaGlobal = false; }; }, [ativa]);

  // Clique fora: o teclado volta para a tela. Clique dentro ou tecla da calculadora: volta para ela.
  useEffect(() => {
    const fora = (e: Event) => { if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAtiva(false); };
    const ativar = () => { setAtiva(true); setMini(false); (document.activeElement as HTMLElement | null)?.blur(); };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("focusin", fora, true);
    window.addEventListener("calculadora:ativar", ativar);
    const redimensionar = () => setPos((p) => limitar(p.x, p.y));
    window.addEventListener("resize", redimensionar);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("focusin", fora, true);
      window.removeEventListener("calculadora:ativar", ativar);
      window.removeEventListener("resize", redimensionar);
    };
  }, []);

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  useEffect(() => {
    if (!ativa) return;
    const tecla = (e: KeyboardEvent) => {
      const k = teclaReal(e);
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      let tratado = true;
      if (k === "Escape") { e.preventDefault(); e.stopPropagation(); fecharRef.current(); return; }
      if (/^\d$/.test(k)) digito(k);
      else if (k === "," || k === ".") digito(",");
      else if (k === "+" || k === "-" || k === "*" || k === "/") operacao(k);
      else if (k === "x" || k === "X") operacao("*");
      else if (k === "Enter" || k === "=") igual();
      else if (k === "Backspace") apagar();
      else if (k === "Delete" || k === "c" || k === "C") limpar();
      else tratado = false;
      if (tratado) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa]);

  function iniciarArraste(e: PE<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    arraste.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function mover(e: PE<HTMLDivElement>) {
    if (!arraste.current) return;
    setPos(limitar(e.clientX - arraste.current.dx, e.clientY - arraste.current.dy));
  }
  function soltar() {
    if (!arraste.current) return;
    arraste.current = null;
    try { localStorage.setItem(CHAVE_POS, JSON.stringify(pos)); } catch { /* sem memória */ }
  }

  const resultado = valorVisor();
  const Botao = ({ t, onClick, cor = "bg-white hover:bg-slate-100", largo }: { t: string; onClick: () => void; cor?: string; largo?: boolean }) => (
    <button type="button" onClick={onClick} className={`h-11 rounded-lg text-lg font-semibold shadow-sm ring-1 ring-slate-200 active:scale-95 ${cor} ${largo ? "col-span-2" : ""}`}>{t}</button>
  );

  return createPortal(
    <div
      ref={caixaRef}
      role="dialog"
      aria-label="Calculadora"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={() => { if (!ativa) setAtiva(true); }}
      className={`nao-imprimir fixed z-[90] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-2 ${ativa ? "ring-acao-500" : "ring-slate-300"}`}
      style={{ left: pos.x, top: pos.y, width: `min(${LARG}px, calc(100vw - 16px))` }}
    >
      <div
        className="flex cursor-move touch-none select-none items-center justify-between gap-2 bg-petroleo-800 px-3 py-2 text-white"
        onPointerDown={iniciarArraste}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        title="Arraste para mudar de lugar"
      >
        <span className="text-sm font-semibold">🧮 Calculadora <span className="ml-1 text-[11px] font-normal text-petroleo-200">{ativa ? "· teclado aqui" : "· clique p/ digitar"}</span></span>
        <span className="flex gap-1">
          <button type="button" className="rounded px-2 text-lg leading-none hover:bg-white/15" onClick={() => setMini((m) => !m)} aria-label={mini ? "Mostrar teclas" : "Encolher"} title={mini ? "Mostrar teclas" : "Encolher"}>{mini ? "▢" : "–"}</button>
          <button type="button" className="rounded px-2 text-lg leading-none hover:bg-white/15" onClick={onFechar} aria-label="Fechar calculadora" title="Fechar (Esc)">✕</button>
        </span>
      </div>
      <div className="p-3">
        <div className="rounded-xl bg-petroleo-900 px-3 py-2 text-right text-white">
          <p className="h-4 text-xs text-petroleo-200">{historico}</p>
          <p className="truncate text-3xl font-bold tabular-nums" aria-live="polite">{visor}</p>
        </div>
        {!mini && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <Botao t="C" onClick={limpar} cor="bg-critico-50 text-critico-700 hover:bg-critico-100" />
            <Botao t="⌫" onClick={apagar} />
            <Botao t="÷" onClick={() => operacao("/")} cor="bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" />
            <Botao t="×" onClick={() => operacao("*")} cor="bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" />
            {["7", "8", "9"].map((d) => <Botao key={d} t={d} onClick={() => digito(d)} />)}
            <Botao t="−" onClick={() => operacao("-")} cor="bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" />
            {["4", "5", "6"].map((d) => <Botao key={d} t={d} onClick={() => digito(d)} />)}
            <Botao t="+" onClick={() => operacao("+")} cor="bg-petroleo-50 text-petroleo-800 hover:bg-petroleo-100" />
            {["1", "2", "3"].map((d) => <Botao key={d} t={d} onClick={() => digito(d)} />)}
            <Botao t="=" onClick={igual} cor="bg-acao-500 text-white hover:bg-acao-600" />
            <Botao t="0" onClick={() => digito("0")} largo />
            <Botao t="," onClick={() => digito(",")} />
            <Botao t="00" onClick={() => digito("00")} />
          </div>
        )}
        {onUsar && (
          <button type="button" className="btn-acao mt-2 w-full" disabled={Number.isNaN(resultado) || resultado <= 0} onClick={() => onUsar(centavos(resultado))}>
            {textoUsar}: {Number.isNaN(resultado) ? "—" : fmtMoeda(centavos(resultado))}
          </button>
        )}
        {!mini && <p className="mt-2 text-center text-[11px] leading-tight text-slate-500">Arraste pela barra de cima. Teclado numérico: números, + − * /, Enter (=), Backspace, Delete (limpa), Esc (fecha).</p>}
      </div>
    </div>,
    document.body,
  );
}

function simbolo(o: Op) {
  return o === "*" ? "×" : o === "/" ? "÷" : o === "-" ? "−" : "+";
}
