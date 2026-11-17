import { useEffect, useRef, useState } from "react";
import { useConexao } from "../lib/conexao";
import { useAuth } from "../contexts/AuthContext";
import { quando, useEstadoCopia, useFila } from "./CopiaLocal";
import { Modal } from "./Modal";
import { operacoesComErro, processarFila, tentarDeNovo, type Operacao } from "../lib/local/fila";

const ROTULO = {
  online: { texto: "Online", cor: "bg-ok-600", dica: "Conectado ao servidor." },
  servidor: { texto: "Servidor fora do ar", cor: "bg-atencao-500", dica: "Há internet, mas o servidor não respondeu." },
  offline: { texto: "Offline", cor: "bg-critico-600", dica: "Sem internet. O sistema continua aberto com os dados guardados neste computador." },
  verificando: { texto: "Verificando…", cor: "bg-slate-400", dica: "Conferindo a conexão com o servidor." },
} as const;

/** Indicador discreto de conexão (fica no menu). */
const NOME_OP: Record<string, string> = { abrir_caixa: "Abertura de caixa", venda: "Venda", movimento_caixa: "Sangria/suprimento", fechar_caixa: "Fechamento de caixa", receber_fiado: "Recebimento de fiado", receber_parcela: "Recebimento de parcela", cliente: "Cliente novo", estoque: "Movimentação de estoque" };

/** Janela com o que ainda falta enviar ao servidor e os erros (com "Tentar de novo"). */
function JanelaEnvio({ onFechar }: { onFechar: () => void }) {
  const fila = useFila();
  const { estado } = useConexao();
  const [erros, setErros] = useState<Operacao[] | null>(null);
  useEffect(() => { void operacoesComErro().then(setErros); }, [fila.erros, fila.pendentes]);
  return (
    <Modal aberto titulo="Envio para o servidor" largura="lg" onFechar={onFechar}
      rodape={<>
        <button className="btn-secundario" onClick={onFechar}>Fechar</button>
        <button className="btn-acao" disabled={estado === "offline" || fila.enviando} onClick={() => void (fila.erros ? tentarDeNovo() : processarFila())}>
          {fila.enviando ? "Enviando…" : fila.erros ? "Tentar de novo" : "Enviar agora"}
        </button>
      </>}>
      <div className="space-y-3 text-sm">
        <p><strong>{fila.pendentes}</strong> operação(ões) aguardando envio · <strong className={fila.erros ? "text-critico-600" : ""}>{fila.erros}</strong> com erro.</p>
        <p className="text-slate-600">Tudo o que foi feito neste computador está guardado aqui e é enviado sozinho quando há conexão. Cada operação tem um código único: enviar de novo nunca duplica.</p>
        {fila.ultimaFalha && <p className="text-atencao-700">{fila.ultimaFalha}</p>}
        {erros && erros.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabela text-sm">
              <thead><tr><th>Quando</th><th>O quê</th><th>Motivo</th></tr></thead>
              <tbody>
                {erros.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap">{quando(o.criado_em)}</td>
                    <td className="whitespace-nowrap">{NOME_OP[o.tipo] ?? o.tipo}{o.tipo === "venda" ? ` ${String(o.parametros.p_codigo_local ?? "")}` : ""}</td>
                    <td>{o.erro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Os dados continuam guardados neste computador. Se o motivo foi corrigido (ex.: caixa aberto chegou ao servidor), clique em "Tentar de novo". Se persistir, chame o suporte e não limpe os dados do navegador.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function IndicadorConexao({ claro = true }: { claro?: boolean }) {
  const { estado } = useConexao();
  const copia = useEstadoCopia();
  const fila = useFila();
  const [vendoEnvio, setVendoEnvio] = useState(false);
  const r = ROTULO[estado];
  const dica = `${r.dica}\nCópia dos dados neste computador: ${quando(copia.ultima)}${copia.rodando ? " (atualizando agora)" : ""}${copia.erro ? `\nÚltima atualização da cópia falhou: ${copia.erro}` : ""}`;
  return (
    <>
      <button type="button" onClick={() => setVendoEnvio(true)} className={`inline-flex flex-wrap items-center gap-1.5 rounded text-left text-xs font-medium hover:underline ${claro ? "text-petroleo-100" : "text-slate-600"}`} title={dica} aria-label={`Conexão: ${r.texto}. ${fila.pendentes} pendente(s), ${fila.erros} com erro. Ver envio.`}>
        <span className={`h-2.5 w-2.5 rounded-full ${fila.erros ? "bg-critico-600" : r.cor} ${estado === "verificando" || copia.rodando || fila.enviando ? "animate-pulse" : ""}`} aria-hidden="true" />
        {r.texto}
        {fila.enviando && <span className="font-normal opacity-90">· sincronizando…</span>}
        {!fila.enviando && fila.pendentes > 0 && <span className="rounded bg-atencao-500 px-1 font-semibold text-white">{fila.pendentes} pendente{fila.pendentes > 1 ? "s" : ""}</span>}
        {fila.erros > 0 && <span className="rounded bg-critico-600 px-1 font-semibold text-white">{fila.erros} erro{fila.erros > 1 ? "s" : ""}</span>}
        {!fila.enviando && !fila.pendentes && !fila.erros && copia.rodando && <span className="font-normal opacity-80">· atualizando cópia…</span>}
      </button>
      {vendoEnvio && <JanelaEnvio onFechar={() => setVendoEnvio(false)} />}
    </>
  );
}

/** Faixa de aviso no alto da tela quando não há servidor. */
export function SemConexao() {
  const { estado } = useConexao();
  const { perfilOffline, perfilConferidoEm } = useAuth();
  const copia = useEstadoCopia();
  const fila = useFila();
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
        As telas mostram a <strong>cópia guardada neste computador</strong> (atualizada em {quando(copia.ultima)}).
        {perfilOffline && perfilConferidoEm ? ` Seu acesso foi conferido pela última vez em ${quando(perfilConferidoEm)}.` : ""}
        {" "}<strong>O caixa funciona normalmente</strong> (abrir, vender, sangria, receber fiado e parcela, cadastrar cliente, movimentar estoque, fechar): tudo fica guardado aqui e é enviado sozinho quando a conexão voltar. Cadastro de produto, preços, cancelamento de venda e usuários precisam de conexão.
      </div>
    );
  }
  if (fila.ultimaFalha && fila.pendentes > 0 && estado === "online") {
    return (
      <div role="alert" className="nao-imprimir mb-4 rounded-lg border-l-4 border-atencao-500 bg-atencao-50 px-4 py-3 text-sm text-atencao-700">
        <strong>{fila.pendentes} operação(ões) aguardando envio.</strong> {fila.ultimaFalha}
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
