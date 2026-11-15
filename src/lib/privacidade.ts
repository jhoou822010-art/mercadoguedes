import { useEffect, useState } from "react";
import { fmtMoeda } from "./format";

/*
  Olho de "ocultar valores" (como nos apps de banco).
  Esconde os valores em dinheiro das telas de consulta (Painel e Vendas) neste
  computador, para quem está do lado não ver. É só visual: não muda nada no
  sistema e não afeta o caixa nem o comprovante impresso.
*/
const CHAVE = "lojafacil.ocultar-valores";
const EVENTO = "lojafacil:privacidade";

function ler() {
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
}

export function alternarPrivacidade() {
  try { localStorage.setItem(CHAVE, ler() ? "0" : "1"); } catch { /* sem memória */ }
  window.dispatchEvent(new Event(EVENTO));
}

export function usePrivacidade() {
  const [oculto, setOculto] = useState(ler);
  useEffect(() => {
    const f = () => setOculto(ler());
    window.addEventListener(EVENTO, f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener(EVENTO, f); window.removeEventListener("storage", f); };
  }, []);
  return oculto;
}

/** fmtMoeda que respeita o olho: "R$ •••••" quando oculto. */
export function useMoeda() {
  const oculto = usePrivacidade();
  return (v: number | string | null | undefined) => (oculto ? "R$ •••••" : fmtMoeda(v));
}
