/*
  Estado da conexão, diferenciando:
   - "online":      internet OK E o servidor (Supabase) respondeu;
   - "servidor":    há internet, mas o Supabase não respondeu;
   - "offline":     sem internet.
  Ter internet não basta: o sistema confere o servidor de verdade.
*/
import { useEffect, useState } from "react";
const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;
let estado = typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "verificando";
let ultimaConfirmacao = null;
const ouvintes = new Set();
const mudar = (e) => { if (e !== estado) {
    estado = e;
    ouvintes.forEach((f) => f());
} };
/** Pergunta ao Supabase se está no ar (rápido, sem dados). */
export async function verificarServidor() {
    if (!navigator.onLine) {
        mudar("offline");
        return estado;
    }
    if (!url || !chave) {
        mudar("servidor");
        return estado;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
        const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: chave }, signal: ctrl.signal, cache: "no-store" });
        if (r.ok) {
            ultimaConfirmacao = Date.now();
            mudar("online");
        }
        else
            mudar("servidor");
    }
    catch {
        mudar(navigator.onLine ? "servidor" : "offline");
    }
    finally {
        clearTimeout(t);
    }
    return estado;
}
let iniciado = false;
function iniciar() {
    if (iniciado || typeof window === "undefined")
        return;
    iniciado = true;
    window.addEventListener("online", () => void verificarServidor());
    window.addEventListener("offline", () => mudar("offline"));
    void verificarServidor();
    // Confere de tempos em tempos (a cada 30 s; sem internet, só espera o aviso do navegador).
    setInterval(() => { if (navigator.onLine)
        void verificarServidor(); }, 30_000);
}
export const estadoConexaoAgora = () => { iniciar(); return estado; };
export function useConexao() {
    iniciar();
    const [, atualizar] = useState(0);
    useEffect(() => {
        const f = () => atualizar((n) => n + 1);
        ouvintes.add(f);
        return () => { ouvintes.delete(f); };
    }, []);
    return { estado, ultimaConfirmacao };
}
