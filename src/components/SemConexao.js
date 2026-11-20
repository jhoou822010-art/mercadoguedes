import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useConexao } from "../lib/conexao";
import { useAuth } from "../contexts/AuthContext";
import { quando, useEstadoCopia, useFila } from "./CopiaLocal";
import { Modal } from "./Modal";
import { operacoesComErro, processarFila, tentarDeNovo } from "../lib/local/fila";
const ROTULO = {
    online: { texto: "Online", cor: "bg-ok-600", dica: "Conectado ao servidor." },
    servidor: { texto: "Servidor fora do ar", cor: "bg-atencao-500", dica: "Há internet, mas o servidor não respondeu." },
    offline: { texto: "Offline", cor: "bg-critico-600", dica: "Sem internet. O sistema continua aberto com os dados guardados neste computador." },
    verificando: { texto: "Verificando…", cor: "bg-slate-400", dica: "Conferindo a conexão com o servidor." },
};
/** Indicador discreto de conexão (fica no menu). */
const NOME_OP = { abrir_caixa: "Abertura de caixa", venda: "Venda", movimento_caixa: "Sangria/suprimento", fechar_caixa: "Fechamento de caixa", receber_fiado: "Recebimento de fiado", receber_parcela: "Recebimento de parcela", cliente: "Cliente novo", estoque: "Movimentação de estoque" };
/** Janela com o que ainda falta enviar ao servidor e os erros (com "Tentar de novo"). */
function JanelaEnvio({ onFechar }) {
    const fila = useFila();
    const { estado } = useConexao();
    const [erros, setErros] = useState(null);
    useEffect(() => { void operacoesComErro().then(setErros); }, [fila.erros, fila.pendentes]);
    return (_jsx(Modal, { aberto: true, titulo: "Envio para o servidor", largura: "lg", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Fechar" }), _jsx("button", { className: "btn-acao", disabled: estado === "offline" || fila.enviando, onClick: () => void (fila.erros ? tentarDeNovo() : processarFila()), children: fila.enviando ? "Enviando…" : fila.erros ? "Tentar de novo" : "Enviar agora" })] }), children: _jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("p", { children: [_jsx("strong", { children: fila.pendentes }), " opera\u00E7\u00E3o(\u00F5es) aguardando envio \u00B7 ", _jsx("strong", { className: fila.erros ? "text-critico-600" : "", children: fila.erros }), " com erro."] }), _jsx("p", { className: "text-slate-600", children: "Tudo o que foi feito neste computador est\u00E1 guardado aqui e \u00E9 enviado sozinho quando h\u00E1 conex\u00E3o. Cada opera\u00E7\u00E3o tem um c\u00F3digo \u00FAnico: enviar de novo nunca duplica." }), fila.ultimaFalha && _jsx("p", { className: "text-atencao-700", children: fila.ultimaFalha }), erros && erros.length > 0 && (_jsxs("div", { className: "overflow-x-auto", children: [_jsxs("table", { className: "tabela text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Quando" }), _jsx("th", { children: "O qu\u00EA" }), _jsx("th", { children: "Motivo" })] }) }), _jsx("tbody", { children: erros.map((o) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap", children: quando(o.criado_em) }), _jsxs("td", { className: "whitespace-nowrap", children: [NOME_OP[o.tipo] ?? o.tipo, o.tipo === "venda" ? ` ${String(o.parametros.p_codigo_local ?? "")}` : ""] }), _jsx("td", { children: o.erro })] }, o.id))) })] }), _jsx("p", { className: "mt-2 text-xs text-slate-500", children: "Os dados continuam guardados neste computador. Se o motivo foi corrigido (ex.: caixa aberto chegou ao servidor), clique em \"Tentar de novo\". Se persistir, chame o suporte e n\u00E3o limpe os dados do navegador." })] }))] }) }));
}
export function IndicadorConexao({ claro = true }) {
    const { estado } = useConexao();
    const copia = useEstadoCopia();
    const fila = useFila();
    const [vendoEnvio, setVendoEnvio] = useState(false);
    const r = ROTULO[estado];
    const dica = `${r.dica}\nCópia dos dados neste computador: ${quando(copia.ultima)}${copia.rodando ? " (atualizando agora)" : ""}${copia.erro ? `\nÚltima atualização da cópia falhou: ${copia.erro}` : ""}`;
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", onClick: () => setVendoEnvio(true), className: `inline-flex flex-wrap items-center gap-1.5 rounded text-left text-xs font-medium hover:underline ${claro ? "text-petroleo-100" : "text-slate-600"}`, title: dica, "aria-label": `Conexão: ${r.texto}. ${fila.pendentes} pendente(s), ${fila.erros} com erro. Ver envio.`, children: [_jsx("span", { className: `h-2.5 w-2.5 rounded-full ${fila.erros ? "bg-critico-600" : r.cor} ${estado === "verificando" || copia.rodando || fila.enviando ? "animate-pulse" : ""}`, "aria-hidden": "true" }), r.texto, fila.enviando && _jsx("span", { className: "font-normal opacity-90", children: "\u00B7 sincronizando\u2026" }), !fila.enviando && fila.pendentes > 0 && _jsxs("span", { className: "rounded bg-atencao-500 px-1 font-semibold text-white", children: [fila.pendentes, " pendente", fila.pendentes > 1 ? "s" : ""] }), fila.erros > 0 && _jsxs("span", { className: "rounded bg-critico-600 px-1 font-semibold text-white", children: [fila.erros, " erro", fila.erros > 1 ? "s" : ""] }), !fila.enviando && !fila.pendentes && !fila.erros && copia.rodando && _jsx("span", { className: "font-normal opacity-80", children: "\u00B7 atualizando c\u00F3pia\u2026" })] }), vendoEnvio && _jsx(JanelaEnvio, { onFechar: () => setVendoEnvio(false) })] }));
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
        return (_jsxs("div", { role: "alert", className: "nao-imprimir mb-4 rounded-lg border-l-4 border-critico-600 bg-critico-50 px-4 py-3 text-sm text-critico-700", children: [_jsx("strong", { children: estado === "offline" ? "Sem internet." : "O servidor não está respondendo." }), " ", "As telas mostram a ", _jsx("strong", { children: "c\u00F3pia guardada neste computador" }), " (atualizada em ", quando(copia.ultima), ").", perfilOffline && perfilConferidoEm ? ` Seu acesso foi conferido pela última vez em ${quando(perfilConferidoEm)}.` : "", " ", _jsx("strong", { children: "O caixa funciona normalmente" }), " (abrir, vender, sangria, receber fiado e parcela, cadastrar cliente, movimentar estoque, fechar): tudo fica guardado aqui e \u00E9 enviado sozinho quando a conex\u00E3o voltar. Cadastro de produto, pre\u00E7os, cancelamento de venda e usu\u00E1rios precisam de conex\u00E3o."] }));
    }
    if (fila.ultimaFalha && fila.pendentes > 0 && estado === "online") {
        return (_jsxs("div", { role: "alert", className: "nao-imprimir mb-4 rounded-lg border-l-4 border-atencao-500 bg-atencao-50 px-4 py-3 text-sm text-atencao-700", children: [_jsxs("strong", { children: [fila.pendentes, " opera\u00E7\u00E3o(\u00F5es) aguardando envio."] }), " ", fila.ultimaFalha] }));
    }
    if (voltou) {
        return (_jsx("div", { role: "status", className: "nao-imprimir mb-4 rounded-lg border-l-4 border-ok-600 bg-ok-50 px-4 py-3 text-sm text-ok-700", children: "Conex\u00E3o com o servidor de volta. Pode continuar." }));
    }
    return null;
}
