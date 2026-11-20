import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { registrarTelaImpressao } from "../lib/imprimir";

interface Pergunta { titulo: string; paragrafos: string[]; sim: string; responder: (ok: boolean) => void }

/** Colocado uma vez (main.tsx): mostra as perguntas e avisos da impressão. */
export function PerguntasImpressao() {
  const avisar = useToast();
  const [p, setP] = useState<Pergunta | null>(null);
  useEffect(() => {
    registrarTelaImpressao({
      perguntar: (titulo, paragrafos, sim) => new Promise((ok) => setP({ titulo, paragrafos, sim, responder: ok })),
      avisar,
    });
    return () => registrarTelaImpressao(null);
  }, [avisar]);
  if (!p) return null;
  const fim = (ok: boolean) => { setP(null); p.responder(ok); };
  return (
    <Modal
      aberto
      titulo={p.titulo}
      largura="sm"
      onFechar={() => fim(false)}
      rodape={
        <>
          <button className="btn-secundario" onClick={() => fim(false)}>Cancelar</button>
          <button className="btn-acao" onClick={() => fim(true)} autoFocus>{p.sim}</button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-slate-600">{p.paragrafos.map((t, i) => <p key={i}>{t}</p>)}</div>
    </Modal>
  );
}
