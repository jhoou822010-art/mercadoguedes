import { useState } from "react";
import { Modal } from "./Modal";
import { COPYRIGHT, LINHA_AUTORIA, LINHA_USO, SOFTWARE, VERSAO } from "../lib/sobre";

/** Janela "Sobre o sistema". */
export function JanelaSobre({ onFechar }: { onFechar: () => void }) {
  return (
    <Modal aberto titulo="Sobre o sistema" largura="sm" onFechar={onFechar}
      rodape={<button className="btn-primario" onClick={onFechar}>Fechar</button>}>
      <div className="space-y-4 text-sm text-slate-700">
        <div>
          <p className="text-lg font-bold text-petroleo-800">{SOFTWARE.nome}</p>
          <p className="text-slate-500">Gestão de caixa, vendas, estoque, fiado, crediário, etiquetas, relatórios e backup.</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-slate-500">Autor e desenvolvedor</dt><dd className="font-medium">{SOFTWARE.autor}</dd>
          <dt className="text-slate-500">Estabelecimento usuário</dt><dd className="font-medium">{SOFTWARE.estabelecimento}</dd>
          <dt className="text-slate-500">Ano de criação</dt><dd className="font-medium">{SOFTWARE.ano}</dd>
          <dt className="text-slate-500">Versão</dt><dd className="font-mono text-xs">{VERSAO}</dd>
        </dl>
        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-700">{SOFTWARE.nome}</p>
          <p>{LINHA_AUTORIA}</p>
          <p>{LINHA_USO}</p>
          <p>{COPYRIGHT}</p>
        </div>
        <p className="text-xs text-slate-500">Os dados cadastrados (produtos, vendas, clientes, caixa e estoque) pertencem ao estabelecimento usuário.</p>
      </div>
    </Modal>
  );
}

/** Rodapé discreto com a autoria e o link "Sobre o sistema". */
export function RodapeAutoria({ claro = false }: { claro?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const cor = claro ? "text-petroleo-100/80" : "text-slate-400";
  return (
    <footer className={`nao-imprimir text-center text-[11px] leading-relaxed ${cor}`}>
      <p>
        <span className="whitespace-nowrap font-semibold">{SOFTWARE.nome}</span> · <span className="whitespace-nowrap">{LINHA_AUTORIA}</span> · <span className="whitespace-nowrap">{COPYRIGHT}</span>{" "}
        <button type="button" className="underline decoration-dotted underline-offset-2 hover:opacity-80" onClick={() => setAberto(true)}>Sobre o sistema</button>
      </p>
      <p>{LINHA_USO}</p>
      {aberto && <JanelaSobre onFechar={() => setAberto(false)} />}
    </footer>
  );
}
