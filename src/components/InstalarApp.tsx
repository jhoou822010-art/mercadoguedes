import { useEffect, useState } from "react";
import { ehIos, estaInstalado, instalar, ouvirInstalacao, podeInstalar } from "../lib/instalar";
import { Modal } from "./Modal";
import { useModoImpressao } from "../lib/imprimir";

/** Botão "Instalar aplicativo". Some quando já está instalado ou o navegador não permite. */
export function InstalarApp({ claro = false }: { claro?: boolean }) {
  const [, atualizar] = useState(0);
  const [ajudaIos, setAjudaIos] = useState(false);
  useEffect(() => ouvirInstalacao(() => atualizar((n) => n + 1)), []);
  const modoImpressao = useModoImpressao();

  if (estaInstalado()) return null;
  // No atalho de impressão direta não oferece instalar: o app instalado abriria sem a impressão direta.
  if (modoImpressao === "direta") return null;
  const ios = ehIos();
  if (!podeInstalar() && !ios) return null;

  const estilo = claro
    ? "w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
    : "btn-secundario w-full";

  return (
    <>
      <button type="button" className={estilo} onClick={() => (ios ? setAjudaIos(true) : void instalar())} title="Coloca o Gerenciador de Mercado como um aplicativo, com ícone na área de trabalho ou na tela do celular">
        ⬇ Instalar aplicativo
      </button>
      {ajudaIos && (
        <Modal aberto titulo="Instalar no iPhone ou iPad" onFechar={() => setAjudaIos(false)}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Abra este endereço no <strong>Safari</strong>.</li>
            <li>Toque no botão <strong>Compartilhar</strong> (quadrado com uma seta para cima).</li>
            <li>Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</li>
          </ol>
          <div className="mt-4 text-right">
            <button className="btn-primario" onClick={() => setAjudaIos(false)}>Entendi</button>
          </div>
        </Modal>
      )}
    </>
  );
}
