import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Pilha de janelas abertas: o Esc fecha só a que está por cima. */
const pilha: string[] = [];

interface Props {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: "sm" | "md" | "lg" | "xl";
}

const LARGURA = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Modal({ aberto, titulo, onFechar, children, rodape, largura = "md" }: Props) {
  const id = useId();
  // Camada: cada janela aberta por cima de outra fica um degrau acima (nunca por baixo).
  const [camada, setCamada] = useState(0);
  useEffect(() => {
    if (!aberto) return;
    pilha.push(id);
    setCamada(pilha.length);
    document.body.style.overflow = "hidden";
    return () => {
      const i = pilha.lastIndexOf(id);
      if (i >= 0) pilha.splice(i, 1);
      if (pilha.length === 0) document.body.style.overflow = "";
    };
  }, [aberto, id]);
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pilha[pilha.length - 1] === id) {
        e.preventDefault();
        onFechar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, onFechar, id]);

  if (!aberto) return null;
  // A janela é desenhada direto no <body> (portal), fora de qualquer outra tela ou janela,
  // para não ser cortada nem ficar escondida atrás de outra.
  return createPortal(
    <div
      className="nao-imprimir fixed inset-0 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      style={{ zIndex: 40 + Math.max(camada, 1) * 2 }}
      onMouseDown={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[92vh] max-h-[92dvh] w-full ${LARGURA[largura]} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{titulo}</h2>
          <button onClick={onFechar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmarProps {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  textoConfirmar?: string;
  perigo?: boolean;
  processando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Caixa de confirmação para operações sensíveis. */
export function Confirmar({ aberto, titulo, mensagem, textoConfirmar = "Confirmar", perigo, processando, onConfirmar, onCancelar }: ConfirmarProps) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onCancelar}
      largura="sm"
      rodape={
        <>
          <button className="btn-secundario" onClick={onCancelar} disabled={processando}>Cancelar</button>
          <button className={perigo ? "btn-perigo" : "btn-primario"} onClick={onConfirmar} disabled={processando} autoFocus>
            {processando ? "Aguarde…" : textoConfirmar}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{mensagem}</div>
    </Modal>
  );
}
