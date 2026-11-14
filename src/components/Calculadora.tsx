import { useEffect, useRef, useState } from "react";
import { centavos, fmtMoeda } from "../lib/format";
import { Modal } from "./Modal";

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

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    const tecla = (e: KeyboardEvent) => {
      const k = e.key;
      let tratado = true;
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
  }, []);

  const resultado = valorVisor();
  const Botao = ({ t, onClick, cor = "bg-white hover:bg-slate-100", largo }: { t: string; onClick: () => void; cor?: string; largo?: boolean }) => (
    <button type="button" onClick={onClick} className={`h-14 rounded-xl text-xl font-semibold shadow-sm ring-1 ring-slate-200 active:scale-95 ${cor} ${largo ? "col-span-2" : ""}`}>{t}</button>
  );

  return (
    <Modal
      aberto
      titulo="Calculadora"
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn-secundario" onClick={onFechar}>Fechar (Esc)</button>
          {onUsar && (
            <button className="btn-acao" disabled={Number.isNaN(resultado) || resultado <= 0} onClick={() => onUsar(centavos(resultado))}>
              {textoUsar}: {Number.isNaN(resultado) ? "—" : fmtMoeda(centavos(resultado))}
            </button>
          )}
        </>
      }
    >
      <div className="mb-3 rounded-xl bg-petroleo-900 px-4 py-3 text-right text-white">
        <p className="h-5 text-sm text-petroleo-200">{historico}</p>
        <p className="truncate text-4xl font-bold tabular-nums" aria-live="polite">{visor}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
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
      <p className="mt-3 text-center text-xs text-slate-500">Use o teclado numérico: números, + − * / , Enter (=), Backspace (apaga), Delete (limpa).</p>
    </Modal>
  );
}

function simbolo(o: Op) {
  return o === "*" ? "×" : o === "/" ? "÷" : o === "-" ? "−" : "+";
}
