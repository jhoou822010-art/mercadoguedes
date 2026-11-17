import { useEffect, useRef, useState } from "react";
import { useConexao } from "../lib/conexao";
import { useAuth } from "../contexts/AuthContext";

const ROTULO = {
  online: { texto: "Online", cor: "bg-ok-600", dica: "Conectado ao servidor." },
  servidor: { texto: "Servidor fora do ar", cor: "bg-atencao-500", dica: "Há internet, mas o servidor não respondeu." },
  offline: { texto: "Offline", cor: "bg-critico-600", dica: "Sem internet. O sistema continua aberto com os dados guardados neste computador." },
  verificando: { texto: "Verificando…", cor: "bg-slate-400", dica: "Conferindo a conexão com o servidor." },
} as const;

/** Indicador discreto de conexão (fica no menu). */
export function IndicadorConexao({ claro = true }: { claro?: boolean }) {
  const { estado } = useConexao();
  const r = ROTULO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${claro ? "text-petroleo-100" : "text-slate-600"}`} title={r.dica} role="status" aria-label={`Conexão: ${r.texto}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${r.cor} ${estado === "verificando" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {r.texto}
    </span>
  );
}

/** Faixa de aviso no alto da tela quando não há servidor. */
export function SemConexao() {
  const { estado } = useConexao();
  const { perfilOffline, perfilConferidoEm } = useAuth();
  const [voltou, setVoltou] = useState(false);
  const anterior = useRef(estado);

  useEffect(() => {
    if ((anterior.current === "offline" || anterior.current === "servidor") && estado === "online") {
      setVoltou(true);
      const t = setTimeout(() => setVoltou(false), 5000);
      anterior.current = estado;
      return () => clearTimeout(t);
    }
    anterior.current = estado;
  }, [estado]);

  if (estado === "offline" || estado === "servidor") {
    return (
      <div role="alert" className="nao-imprimir mb-4 rounded-lg border-l-4 border-critico-600 bg-critico-50 px-4 py-3 text-sm text-critico-700">
        <strong>{estado === "offline" ? "Sem internet." : "O servidor não está respondendo."}</strong>{" "}
        O sistema continua aberto neste computador
        {perfilOffline && perfilConferidoEm ? ` (seu acesso foi conferido pela última vez em ${new Date(perfilConferidoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })})` : ""}.
        Nesta versão, as telas que mostram ou gravam dados (vendas, estoque, cadastros) ainda precisam do servidor: elas voltam a funcionar quando a conexão voltar.
        Se estiver no meio de uma venda, os itens ficam guardados.
      </div>
    );
  }
  if (voltou) {
    return (
      <div role="status" className="nao-imprimir mb-4 rounded-lg border-l-4 border-ok-600 bg-ok-50 px-4 py-3 text-sm text-ok-700">
        Conexão com o servidor de volta. Pode continuar.
      </div>
    );
  }
  return null;
}
