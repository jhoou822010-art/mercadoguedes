import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useConexao } from "../lib/conexao";
import { atualizarCopiaLocal, estadoEspelho, ouvirEspelho } from "../lib/local/espelho";

const A_CADA_MS = 2 * 60_000;

/** Mantém a cópia local atualizada enquanto há servidor (sem mostrar nada na tela). */
export function MantemCopiaLocal() {
  const { perfil, ehAdmin, tem0006 } = useAuth();
  const { estado } = useConexao();
  const pode = estado === "online" && perfil && perfil.papel !== "pendente";
  useEffect(() => {
    if (!pode) return;
    const rodar = () => void atualizarCopiaLocal({ ehAdmin, tem0006 });
    rodar();
    const t = setInterval(rodar, A_CADA_MS);
    return () => clearInterval(t);
  }, [pode, ehAdmin, tem0006]);
  return null;
}

export function useEstadoCopia() {
  const [, atualizar] = useState(0);
  useEffect(() => ouvirEspelho(() => atualizar((n) => n + 1)), []);
  return estadoEspelho();
}

export const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca";
