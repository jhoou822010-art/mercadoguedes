import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useConexao } from "../lib/conexao";
import { atualizarCopiaLocal, estadoEspelho, ouvirEspelho } from "../lib/local/espelho";
import { aoTerminarEnvio, atualizarResumoFila, ouvirFila, processarFila, resumoFila } from "../lib/local/fila";

const A_CADA_MS = 2 * 60_000;

/** Mantém a cópia local atualizada enquanto há servidor (sem mostrar nada na tela). */
export function MantemCopiaLocal() {
  const { perfil, ehAdmin, tem0006 } = useAuth();
  const { estado } = useConexao();
  const pode = estado === "online" && perfil && perfil.papel !== "pendente";
  useEffect(() => {
    if (!pode) return;
    // Primeiro ENVIA o que foi feito aqui; depois atualiza a cópia.
    const rodar = () => void processarFila().then(() => atualizarCopiaLocal({ ehAdmin, tem0006 }));
    rodar();
    const t = setInterval(rodar, A_CADA_MS);
    // Pendências: tenta enviar a cada 15 s (rápido) enquanto houver.
    const envio = setInterval(() => { if (resumoFila().pendentes > 0) void processarFila(); }, 15_000);
    const depois = aoTerminarEnvio(() => void atualizarCopiaLocal({ ehAdmin, tem0006 }));
    return () => { clearInterval(t); clearInterval(envio); depois(); };
  }, [pode, ehAdmin, tem0006]);
  useEffect(() => { void atualizarResumoFila(); }, []);
  return null;
}

export function useFila() {
  const [, atualizar] = useState(0);
  useEffect(() => ouvirFila(() => atualizar((n) => n + 1)), []);
  return resumoFila();
}

export function useEstadoCopia() {
  const [, atualizar] = useState(0);
  useEffect(() => ouvirEspelho(() => atualizar((n) => n + 1)), []);
  return estadoEspelho();
}

export const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca";
