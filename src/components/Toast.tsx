import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type TipoAviso = "sucesso" | "erro" | "info";
interface Aviso { id: number; tipo: TipoAviso; texto: string }

const ToastCtx = createContext<(tipo: TipoAviso, texto: string) => void>(() => {});

const ESTILO: Record<TipoAviso, string> = {
  sucesso: "border-ok-600 bg-ok-50 text-ok-700",
  erro: "border-critico-600 bg-critico-50 text-critico-700",
  info: "border-petroleo-500 bg-petroleo-50 text-petroleo-800",
};
const ICONE: Record<TipoAviso, string> = { sucesso: "✓", erro: "!", info: "i" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((tipo: TipoAviso, texto: string) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "erro" ? 7000 : 4000);
  }, []);

  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="nao-imprimir pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end">
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === "erro" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-sm shadow-lg ${ESTILO[a.tipo]}`}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold">
              {ICONE[a.tipo]}
            </span>
            <span className="flex-1">{a.texto}</span>
            <button className="opacity-60 hover:opacity-100" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))} aria-label="Fechar aviso">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
