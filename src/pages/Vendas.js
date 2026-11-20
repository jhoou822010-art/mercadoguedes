import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { caixasLocal, clientesLocal, fiadosLocal, parcelasLocal, vendasLocal } from "../lib/local/consultas";
import { cadastrarClienteLocal, receberFiadoLocal, receberParcelaLocal, vendasLocaisNaoEnviadas } from "../lib/local/caixaLocal";
import { processarFila } from "../lib/local/fila";
import { estadoConexaoAgora } from "../lib/conexao";
import { ehErroDeRede } from "../lib/supabase";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { baixarCsv, hojeArquivo } from "../lib/csv";
import { COLUNAS_CAIXA, selecaoVenda } from "../lib/consultas";
import { diasAte, fmtData, fmtDataHora, fmtMoeda, hojeISO, lerNumero, mascaraDocumento, NOME_FORMA, numParaCampo } from "../lib/format";
import { FORMAS_RECEBIMENTO } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { CupomCarne, CupomExtrato, CupomFechamento, CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { Aviso, Cabecalho, Carregando, Selo, Vazio } from "../components/Ui";
import { CampoDocumento, erroDocumento } from "../components/CampoDocumento";
import { OlhoValores } from "../components/OlhoValores";
import { useMoeda } from "../lib/privacidade";
const ABAS = [
    { id: "vendas", rotulo: "Vendas" },
    { id: "fiado", rotulo: "Fiado" },
    { id: "crediario", rotulo: "Crediário" },
    { id: "clientes", rotulo: "Clientes" },
    { id: "caixas", rotulo: "Caixas" },
];
export default function Vendas() {
    const [params, setParams] = useSearchParams();
    const aba = (ABAS.some((a) => a.id === params.get("aba")) ? params.get("aba") : "vendas");
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: "Vendas, fiado e credi\u00E1rio", descricao: "Consulte vendas, receba fiados e parcelas, cadastre clientes e confira os caixas.", acoes: _jsx(OlhoValores, {}) }), _jsx("div", { className: "nao-imprimir mb-4 flex gap-2 overflow-x-auto pb-1", children: ABAS.map((a) => (_jsx("button", { onClick: () => setParams({ aba: a.id }, { replace: true }), className: `shrink-0 rounded-full px-4 py-2 text-sm font-medium ${aba === a.id ? "bg-petroleo-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`, children: a.rotulo }, a.id))) }), aba === "vendas" && _jsx(ListaVendas, {}), aba === "fiado" && _jsx(ListaFiado, {}), aba === "crediario" && _jsx(PrecisaDo0006, { children: _jsx(ListaCrediario, {}) }), aba === "clientes" && _jsx(PrecisaDo0006, { children: _jsx(ListaClientes, {}) }), aba === "caixas" && _jsx(ListaCaixas, {})] }));
}
function PrecisaDo0006({ children }) {
    const { tem0006 } = useAuth();
    if (tem0006)
        return _jsx(_Fragment, { children: children });
    return (_jsxs(Aviso, { cor: "atencao", children: ["Esta parte precisa do SQL ", _jsx("code", { children: "0006_crediario_clientes_ocultar.sql" }), ". O administrador deve rod\u00E1-lo no SQL Editor do Supabase e depois recarregar a p\u00E1gina."] }));
}
/** Cabeçalho que só aparece no papel ao imprimir uma lista. */
function TituloImpressao({ titulo }) {
    const { config } = useAuth();
    return (_jsxs("div", { className: "somente-impressao mb-2", children: [_jsxs("p", { className: "text-lg font-bold", children: [config?.nome_loja ?? "Loja", " \u2014 ", titulo] }), _jsxs("p", { className: "text-xs", children: ["Emitido em ", fmtDataHora(new Date().toISOString()), " \u00B7 Gerenciador de Mercado"] })] }));
}
const LIMITE_VENDAS = 5000;
const NOME_PERIODO = { 0: "de todo o período", 1: "de hoje", 7: "dos últimos 7 dias", 30: "dos últimos 30 dias", 90: "dos últimos 90 dias", 365: "dos últimos 12 meses" };
function inicioPeriodo(dias) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (dias - 1));
    return d.toISOString();
}
/** Número da venda para mostrar: o do servidor, ou o código do computador enquanto não foi enviada. */
function numeroDaVenda(id, vendas) {
    return id > 0 ? String(id) : (vendas?.codigo_local ?? "aguardando envio");
}
/** Janela genérica para receber um valor (fiado ou parcela) em alguma forma. */
function JanelaReceber({ titulo, descricao, valor, onConfirmar, onFechar }) {
    const [forma, setForma] = useState("dinheiro");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    async function receber() {
        setEnviando(true);
        const e = await onConfirmar(forma);
        setEnviando(false);
        if (e)
            setErro(e);
    }
    return (_jsx(Modal, { aberto: true, titulo: titulo, largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Cancelar" }), _jsx("button", { className: "btn-acao", onClick: receber, disabled: enviando, children: enviando ? "Registrando…" : `Receber ${fmtMoeda(valor)}` })] }), children: _jsxs("div", { className: "space-y-3 text-sm", children: [_jsx("div", { children: descricao }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: FORMAS_RECEBIMENTO.map((x) => (_jsx("button", { type: "button", onClick: () => setForma(x), className: `rounded-lg border-2 p-2 text-sm font-semibold ${forma === x ? "border-acao-500 bg-orange-50 text-acao-700" : "border-slate-200"}`, children: NOME_FORMA[x] }, x))) }), _jsxs("p", { className: "text-xs text-slate-500", children: ["O valor entra no ", _jsx("strong", { children: "seu caixa aberto" }), " e aparece no fechamento."] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }) }));
}
/* ------------------------------ Vendas ------------------------------ */
function ListaVendas() {
    const moeda = useMoeda();
    const { config, ehAdmin, tem0006, valoresOcultos } = useAuth();
    const avisar = useToast();
    // Padrão: últimos 30 dias (antes era só "Hoje", e as vendas dos dias anteriores pareciam ter sumido).
    const [dias, setDias] = useState(() => {
        try {
            const v = Number(localStorage.getItem("lojafacil.vendas.periodo"));
            return [0, 1, 7, 30, 90, 365].includes(v) && localStorage.getItem("lojafacil.vendas.periodo") !== null ? v : 30;
        }
        catch {
            return 30;
        }
    });
    useEffect(() => { try {
        localStorage.setItem("lojafacil.vendas.periodo", String(dias));
    }
    catch { /* sem memória */ } }, [dias]);
    const [status, setStatus] = useState("");
    const [busca, setBusca] = useState("");
    const [vendas, setVendas] = useState(null);
    const [aberta, setAberta] = useState(null);
    const [cancelando, setCancelando] = useState(null);
    const carregar = useCallback(async () => {
        setVendas(null);
        const { data, error } = await doServidorOuLocal(() => {
            let q = supabase.from("vendas").select(selecaoVenda(tem0006)).order("criado_em", { ascending: false }).limit(LIMITE_VENDAS);
            if (dias > 0)
                q = q.gte("criado_em", inicioPeriodo(dias));
            if (status)
                q = q.eq("status", status);
            return q;
        }, () => vendasLocal({ desde: dias > 0 ? inicioPeriodo(dias) : undefined, status: status || undefined, limite: LIMITE_VENDAS }));
        // Com servidor: soma as vendas feitas neste computador que ainda não chegaram lá.
        if (!error && data) {
            const desde = dias > 0 ? inicioPeriodo(dias) : "";
            const ja = new Set(data.map((v) => v.uuid_local).filter(Boolean));
            const pend = (await vendasLocaisNaoEnviadas()).filter((v) => v.sync !== "sincronizado" && !ja.has(v.uuid_local) && v.criado_em >= desde && (!status || v.status === status));
            if (pend.length && !data.some((v) => v.id < 0))
                data.unshift(...pend);
        }
        if (error) {
            avisar("erro", mensagemErro(error));
            setVendas([]);
            return;
        }
        setVendas(data);
    }, [dias, status, avisar, tem0006]);
    useEffect(() => { void carregar(); }, [carregar]);
    const t = busca.trim().toLowerCase();
    const lista = (vendas ?? []).filter((v) => !t || String(v.id) === t || (v.codigo_local ?? "").toLowerCase() === t || (v.cliente_nome ?? "").toLowerCase().includes(t) || (v.usuario_nome ?? "").toLowerCase().includes(t));
    const concluidas = lista.filter((v) => v.status === "concluida");
    const totalVendido = concluidas.reduce((s, v) => s + Number(v.total), 0);
    const porForma = concluidas.flatMap((v) => v.venda_pagamentos).reduce((acc, p) => {
        acc[p.forma] = (acc[p.forma] ?? 0) + Number(p.valor);
        return acc;
    }, {});
    function exportar() {
        baixarCsv(`loja-facil-vendas-${hojeArquivo()}.csv`, ["Venda", "Data", "Operador", "Situação", "Subtotal", "Desconto", "Total", "Pagamentos", "Troco", "Cliente", "Itens"], lista.map((v) => [v.id, fmtDataHora(v.criado_em), v.usuario_nome, v.status === "concluida" ? "Concluída" : "Cancelada",
            Number(v.subtotal), Number(v.desconto), Number(v.total),
            v.venda_pagamentos.map((p) => `${NOME_FORMA[p.forma]} ${fmtMoeda(p.valor)}`).join(" + "), Number(v.troco), v.cliente_nome,
            v.venda_itens.map((i) => `${i.quantidade} ${i.unidade} ${i.produto_nome}`).join(" | ")]));
        avisar("sucesso", `${lista.length} venda(s) exportada(s).`);
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "nao-imprimir cartao mb-4 grid gap-3 p-4 sm:grid-cols-4", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "per", children: "Per\u00EDodo" }), _jsxs("select", { id: "per", className: "campo", value: dias, onChange: (e) => setDias(Number(e.target.value)), children: [_jsx("option", { value: 1, children: "Hoje" }), _jsx("option", { value: 7, children: "\u00DAltimos 7 dias" }), _jsx("option", { value: 30, children: "\u00DAltimos 30 dias" }), _jsx("option", { value: 90, children: "\u00DAltimos 90 dias" }), _jsx("option", { value: 365, children: "\u00DAltimos 12 meses" }), _jsx("option", { value: 0, children: "Todo o per\u00EDodo" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "st", children: "Situa\u00E7\u00E3o" }), _jsxs("select", { id: "st", className: "campo", value: status, onChange: (e) => setStatus(e.target.value), children: [_jsx("option", { value: "", children: "Todas" }), _jsx("option", { value: "concluida", children: "Conclu\u00EDdas" }), _jsx("option", { value: "cancelada", children: "Canceladas" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "bv", children: "Buscar" }), _jsx("input", { id: "bv", className: "campo", placeholder: "N\u00BA da venda, cliente ou operador", value: busca, onChange: (e) => setBusca(e.target.value) })] }), _jsxs("div", { className: "flex items-end gap-2", children: [_jsx("button", { className: "btn-secundario flex-1", disabled: !lista.length, onClick: exportar, children: "\u2913 Planilha" }), _jsx("button", { className: "btn-secundario flex-1", disabled: !lista.length, onClick: () => window.print(), children: "\uD83D\uDDA8 Imprimir" })] })] }), vendas && (_jsxs("p", { className: "mb-3 text-sm text-slate-600", children: ["Mostrando ", _jsx("strong", { children: lista.length }), " venda(s) ", _jsx("strong", { children: NOME_PERIODO[dias] ?? `dos últimos ${dias} dias` }), ".", dias !== 0 && _jsxs(_Fragment, { children: [" N\u00E3o achou uma venda? Escolha ", _jsx("button", { type: "button", className: "font-semibold text-petroleo-700 underline", onClick: () => setDias(0), children: "todo o per\u00EDodo" }), "."] }), vendas.length >= LIMITE_VENDAS && _jsxs(_Fragment, { children: [" Mostrando as ", LIMITE_VENDAS, " mais recentes; use a busca ou um per\u00EDodo menor."] })] })), vendas && !valoresOcultos && (_jsxs("div", { className: "mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4", children: [_jsxs("div", { className: "cartao p-4", children: [_jsx("p", { className: "text-xs uppercase text-slate-500", children: "Vendas conclu\u00EDdas" }), _jsx("p", { className: "text-2xl font-bold", children: concluidas.length })] }), _jsxs("div", { className: "cartao p-4", children: [_jsx("p", { className: "text-xs uppercase text-slate-500", children: "Total vendido" }), _jsx("p", { className: "text-2xl font-bold", children: moeda(totalVendido) })] }), _jsxs("div", { className: "cartao col-span-2 p-4 text-sm", children: [_jsx("p", { className: "mb-1 text-xs uppercase text-slate-500", children: "Por forma de pagamento" }), Object.keys(porForma).length === 0 ? _jsx("p", { className: "text-slate-400", children: "\u2014" }) : (_jsx("div", { className: "flex flex-wrap gap-x-4 gap-y-1", children: Object.entries(porForma).map(([f, v]) => _jsxs("span", { children: [NOME_FORMA[f], ": ", _jsx("strong", { children: moeda(v) })] }, f)) }))] })] })), _jsxs("div", { className: "cartao area-impressao overflow-hidden", children: [_jsx(TituloImpressao, { titulo: "Vendas" }), !vendas ? _jsx(Carregando, {}) : lista.length === 0 ? _jsx(Vazio, { titulo: "Nenhuma venda neste per\u00EDodo." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "N\u00BA" }), _jsx("th", { children: "Data" }), _jsx("th", { children: "Operador" }), _jsx("th", { children: "Pagamento" }), _jsx("th", { className: "text-right", children: "Total" }), _jsx("th", { children: "Situa\u00E7\u00E3o" }), _jsx("th", { className: "nao-imprimir" })] }) }), _jsx("tbody", { children: lista.map((v) => (_jsxs("tr", { className: v.status === "cancelada" ? "opacity-60" : "", children: [_jsxs("td", { className: "font-mono", children: [v.id > 0 ? v.id : v.codigo_local, v.id < 0 && _jsx("span", { className: "ml-1 rounded bg-atencao-100 px-1 font-sans text-[11px] text-atencao-700", title: "Feita neste computador; \u00E9 enviada sozinha quando houver conex\u00E3o.", children: v.sync === "erro" ? "erro no envio" : "aguardando envio" }), v.divergencias && _jsx("span", { className: "ml-1 rounded bg-critico-50 px-1 font-sans text-[11px] text-critico-700", title: v.divergencias, children: "anota\u00E7\u00E3o" })] }), _jsx("td", { className: "whitespace-nowrap text-xs text-slate-500", children: fmtDataHora(v.criado_em) }), _jsx("td", { children: v.usuario_nome }), _jsxs("td", { className: "text-xs", children: [v.venda_pagamentos.map((p) => NOME_FORMA[p.forma]).join(" + "), v.cliente_nome && _jsx("span", { className: "block text-slate-400", children: v.cliente_nome })] }), _jsxs("td", { className: "whitespace-nowrap text-right font-semibold", children: [moeda(v.total), Number(v.desconto) > 0 && _jsxs("span", { className: "block text-xs font-normal text-acao-700", children: ["desc. ", moeda(v.desconto)] })] }), _jsx("td", { children: v.status === "concluida" ? _jsx(Selo, { cor: "ok", children: "Conclu\u00EDda" }) : _jsx(Selo, { cor: "critico", children: "Cancelada" }) }), _jsx("td", { className: "nao-imprimir text-right", children: _jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => setAberta(v), children: "Ver / imprimir" }) })] }, v.id))) })] }) }))] }), aberta && (_jsx(JanelaComprovante, { titulo: aberta.id > 0 ? `Venda nº ${aberta.id}` : `Venda ${aberta.codigo_local ?? ""} (aguardando envio)`, onFechar: () => setAberta(null), acaoExtra: ehAdmin && aberta.status === "concluida" && aberta.id > 0 && _jsx("button", { className: "btn-perigo", onClick: () => { setCancelando(aberta); setAberta(null); }, children: "Cancelar venda" }), children: (l) => (_jsxs(_Fragment, { children: [aberta.status === "cancelada" && (_jsxs("div", { className: "cupom-fora mb-3 rounded-lg bg-critico-50 p-2 text-xs text-critico-700", children: ["Cancelada em ", fmtDataHora(aberta.cancelada_em), " por ", aberta.cancelada_por_nome, ". Motivo: ", aberta.motivo_cancelamento] })), _jsx(CupomVenda, { venda: aberta, config: config, largura: l })] })) })), cancelando && _jsx(JanelaCancelar, { venda: cancelando, onFechar: () => setCancelando(null), onCancelada: () => { setCancelando(null); void carregar(); } })] }));
}
function JanelaCancelar({ venda, onFechar, onCancelada }) {
    const avisar = useToast();
    const [motivo, setMotivo] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    async function cancelar() {
        if (!motivo.trim())
            return setErro("Informe o motivo do cancelamento.");
        setEnviando(true);
        const { error } = await supabase.rpc("cancelar_venda", { p_venda_id: venda.id, p_motivo: motivo.trim() });
        setEnviando(false);
        if (error)
            return setErro(mensagemErro(error));
        avisar("sucesso", `Venda nº ${venda.id} cancelada. Os produtos voltaram ao estoque.`);
        onCancelada();
    }
    const temCrediario = venda.venda_pagamentos.some((p) => p.forma === "crediario");
    return (_jsx(Modal, { aberto: true, titulo: `Cancelar venda nº ${venda.id}?`, largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Voltar" }), _jsx("button", { className: "btn-perigo", onClick: cancelar, disabled: enviando, children: enviando ? "Cancelando…" : "Confirmar cancelamento" })] }), children: _jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("p", { children: ["Total de ", _jsx("strong", { children: fmtMoeda(venda.total) }), ". Os ", venda.venda_itens.length, " item(ns) voltar\u00E3o ao estoque e a venda sai do total do caixa."] }), temCrediario && _jsx("p", { children: "As parcelas do credi\u00E1rio em aberto tamb\u00E9m ser\u00E3o canceladas." }), _jsx(Aviso, { cor: "atencao", children: "Devolva o dinheiro ao cliente (ou estorne o cart\u00E3o/Pix na maquininha ou no banco). O sistema n\u00E3o faz estorno autom\u00E1tico." }), _jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "mot", children: ["Motivo ", _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("input", { id: "mot", className: "campo", value: motivo, onChange: (e) => setMotivo(e.target.value), autoFocus: true, placeholder: "Ex.: cliente desistiu, valor errado" })] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }) }));
}
function ListaFiado() {
    const moeda = useMoeda();
    const { config, valoresOcultos, perfil } = useAuth();
    const avisar = useToast();
    const [mostrarRecebidos, setMostrarRecebidos] = useState(false);
    const [lista, setLista] = useState(null);
    const [recebendo, setRecebendo] = useState(null);
    const [extrato, setExtrato] = useState(null);
    const carregar = useCallback(async () => {
        setLista(null);
        const { data, error } = await doServidorOuLocal(() => {
            let q = supabase.from("venda_pagamentos")
                .select("*, vendas!inner(id, cliente_nome, cliente_telefone, criado_em, status, usuario_nome)")
                .eq("forma", "fiado").eq("vendas.status", "concluida").order("id", { ascending: false }).limit(2000);
            q = mostrarRecebidos ? q.not("fiado_recebido_em", "is", null) : q.is("fiado_recebido_em", null);
            return q;
        }, async () => (await fiadosLocal(mostrarRecebidos)).slice(0, 2000));
        if (error) {
            avisar("erro", mensagemErro(error));
            setLista([]);
            return;
        }
        setLista(data);
    }, [mostrarRecebidos, avisar]);
    useEffect(() => { void carregar(); }, [carregar]);
    const porCliente = (lista ?? []).reduce((acc, f) => {
        const c = f.vendas.cliente_nome ?? "—";
        acc[c] = (acc[c] ?? 0) + Number(f.valor);
        return acc;
    }, {});
    const total = Object.values(porCliente).reduce((s, v) => s + v, 0);
    const linhasExtrato = (lista ?? []).filter((f) => (f.vendas.cliente_nome ?? "—") === extrato);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: `btn-pequeno btn ${!mostrarRecebidos ? "bg-petroleo-700 text-white" : "btn-secundario"}`, onClick: () => setMostrarRecebidos(false), children: "A receber" }), _jsx("button", { className: `btn-pequeno btn ${mostrarRecebidos ? "bg-petroleo-700 text-white" : "btn-secundario"}`, onClick: () => setMostrarRecebidos(true), children: "J\u00E1 recebidos" }), _jsx("button", { className: "btn-secundario btn-pequeno", disabled: !lista?.length, onClick: () => window.print(), children: "\uD83D\uDDA8 Imprimir lista" })] }), lista && !mostrarRecebidos && !valoresOcultos && _jsxs("p", { className: "text-sm", children: ["Total a receber: ", _jsx("strong", { className: "text-lg", children: moeda(total) })] })] }), !mostrarRecebidos && Object.keys(porCliente).length > 0 && (_jsxs("div", { className: "nao-imprimir cartao mb-4 p-4 text-sm", children: [_jsx("p", { className: "mb-2 text-xs uppercase text-slate-500", children: "Por cliente \u2014 clique para imprimir o extrato" }), _jsx("div", { className: "flex flex-wrap gap-2", children: Object.entries(porCliente).sort((a, b) => b[1] - a[1]).map(([c, v]) => (_jsxs("button", { className: "rounded-full bg-slate-100 px-3 py-1 hover:bg-petroleo-50", onClick: () => setExtrato(c), children: [c, !valoresOcultos && _jsxs(_Fragment, { children: [": ", _jsx("strong", { children: moeda(v) })] }), " \uD83E\uDDFE"] }, c))) })] })), _jsxs("div", { className: "cartao area-impressao overflow-hidden", children: [_jsx(TituloImpressao, { titulo: mostrarRecebidos ? "Fiados recebidos" : "Fiado a receber" }), !lista ? _jsx(Carregando, {}) : lista.length === 0 ? _jsx(Vazio, { titulo: mostrarRecebidos ? "Nenhum fiado recebido ainda." : "Nenhum fiado pendente. 🎉" }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Venda" }), _jsx("th", { children: "Data" }), _jsx("th", { className: "text-right", children: "Valor" }), _jsx("th", { className: mostrarRecebidos ? "" : "nao-imprimir", children: mostrarRecebidos ? "Recebido" : "" })] }) }), _jsx("tbody", { children: lista.map((f) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("span", { className: "font-medium", children: f.vendas.cliente_nome }), f.vendas.cliente_telefone && _jsx("span", { className: "block text-xs text-slate-400", children: f.vendas.cliente_telefone })] }), _jsx("td", { className: "font-mono", children: numeroDaVenda(f.venda_id, f.vendas) }), _jsx("td", { className: "whitespace-nowrap text-xs text-slate-500", children: fmtDataHora(f.vendas.criado_em) }), _jsx("td", { className: "text-right font-semibold", children: moeda(f.valor) }), _jsx("td", { className: `text-right ${mostrarRecebidos ? "" : "nao-imprimir"}`, children: mostrarRecebidos
                                                    ? _jsxs("span", { className: "text-xs text-slate-500", children: [fmtDataHora(f.fiado_recebido_em), " \u00B7 ", f.fiado_recebido_forma && NOME_FORMA[f.fiado_recebido_forma], " \u00B7 ", f.fiado_recebido_por] })
                                                    : _jsx("button", { className: "btn-acao btn-pequeno", onClick: () => setRecebendo(f), children: "Receber" }) })] }, f.id))) }), !mostrarRecebidos && !valoresOcultos && (_jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: 3, className: "font-semibold", children: "Total a receber" }), _jsx("td", { className: "text-right font-bold", children: moeda(total) }), _jsx("td", { className: "nao-imprimir" })] }) }))] }) }))] }), recebendo && (_jsx(JanelaReceber, { titulo: "Receber fiado", valor: Number(recebendo.valor), descricao: _jsxs("p", { children: [_jsx("strong", { children: recebendo.vendas.cliente_nome }), " \u00B7 venda ", numeroDaVenda(recebendo.venda_id, recebendo.vendas), " de ", fmtDataHora(recebendo.vendas.criado_em)] }), onFechar: () => setRecebendo(null), onConfirmar: async (forma) => {
                    // Grava neste computador (funciona sem internet) e envia ao servidor (na hora, se houver conexão).
                    try {
                        await receberFiadoLocal({ perfil: perfil, pagamentoId: recebendo.id, vendaId: recebendo.venda_id, vendaUuid: recebendo.vendas.uuid_local ?? null, valor: Number(recebendo.valor), forma });
                    }
                    catch (e) {
                        return mensagemErro(e);
                    }
                    await processarFila();
                    avisar("sucesso", `Fiado de ${recebendo.vendas.cliente_nome} (${moeda(recebendo.valor)}) recebido em ${NOME_FORMA[forma].toLowerCase()}.`);
                    setRecebendo(null);
                    void carregar();
                    return null;
                } })), extrato && (_jsx(JanelaComprovante, { titulo: `Extrato de fiado — ${extrato}`, onFechar: () => setExtrato(null), children: (l) => (_jsx(CupomExtrato, { titulo: "EXTRATO DE FIADO", cliente: extrato, telefone: linhasExtrato.find((f) => f.vendas.cliente_telefone)?.vendas.cliente_telefone, config: config, largura: l, linhas: linhasExtrato.map((f) => ({ descricao: `Venda ${numeroDaVenda(f.venda_id, f.vendas)}`, detalhe: fmtDataHora(f.vendas.criado_em), valor: Number(f.valor) })), total: linhasExtrato.reduce((s, f) => s + Number(f.valor), 0) })) }))] }));
}
function ListaCrediario() {
    const moeda = useMoeda();
    const { config, valoresOcultos, perfil } = useAuth();
    const avisar = useToast();
    const [filtro, setFiltro] = useState("abertas");
    const [busca, setBusca] = useState("");
    const [lista, setLista] = useState(null);
    const [recebendo, setRecebendo] = useState(null);
    const [carne, setCarne] = useState(null);
    const carregar = useCallback(async () => {
        setLista(null);
        const { data, error } = await doServidorOuLocal(() => {
            let q = supabase.from("parcelas").select("*, clientes(nome, telefone), vendas!inner(id, criado_em, status, total)").limit(3000);
            if (filtro === "pagas")
                q = q.eq("status", "paga").order("pago_em", { ascending: false });
            else {
                q = q.eq("status", "aberta").order("vencimento");
                if (filtro === "atrasadas")
                    q = q.lt("vencimento", hojeISO());
            }
            return q;
        }, async () => (await parcelasLocal({ status: filtro === "pagas" ? "paga" : "aberta", atrasadas: filtro === "atrasadas" })).slice(0, 3000));
        if (error) {
            avisar("erro", mensagemErro(error));
            setLista([]);
            return;
        }
        setLista(data);
    }, [filtro, avisar]);
    useEffect(() => { void carregar(); }, [carregar]);
    const t = busca.trim().toLowerCase();
    const visiveis = (lista ?? []).filter((p) => !t || (p.clientes?.nome ?? "").toLowerCase().includes(t) || String(p.venda_id) === t);
    const total = visiveis.reduce((s, p) => s + Number(p.valor), 0);
    const atrasado = visiveis.filter((p) => p.status === "aberta" && diasAte(p.vencimento) < 0).reduce((s, p) => s + Number(p.valor), 0);
    async function abrirCarne(p) {
        const { data, error } = await doServidorOuLocal(() => supabase.from("parcelas").select("*").eq("venda_id", p.venda_id).order("numero"), () => parcelasLocal({ vendaId: p.venda_id }));
        if (error)
            return avisar("erro", mensagemErro(error));
        setCarne({ venda: p.vendas, cliente: p.clientes?.nome ?? "—", parcelas: data });
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [["abertas", "atrasadas", "pagas"].map((f) => (_jsx("button", { className: `btn-pequeno btn ${filtro === f ? "bg-petroleo-700 text-white" : "btn-secundario"}`, onClick: () => setFiltro(f), children: f === "abertas" ? "Em aberto" : f === "atrasadas" ? "Atrasadas" : "Pagas" }, f))), _jsx("input", { className: "campo w-56 py-1.5 text-sm", placeholder: "Cliente ou n\u00BA da venda", value: busca, onChange: (e) => setBusca(e.target.value), "aria-label": "Buscar parcela" }), _jsx("button", { className: "btn-secundario btn-pequeno", disabled: !visiveis.length, onClick: () => window.print(), children: "\uD83D\uDDA8 Imprimir lista" })] }), lista && filtro !== "pagas" && !valoresOcultos && (_jsxs("p", { className: "text-sm", children: [filtro === "abertas" ? "Em aberto" : "Atrasado", ": ", _jsx("strong", { className: "text-lg", children: moeda(total) }), filtro === "abertas" && atrasado > 0 && _jsxs("span", { className: "ml-2 font-semibold text-critico-600", children: ["\u00B7 atrasado ", moeda(atrasado)] })] }))] }), _jsxs("div", { className: "cartao area-impressao overflow-hidden", children: [_jsx(TituloImpressao, { titulo: filtro === "pagas" ? "Parcelas pagas" : filtro === "atrasadas" ? "Parcelas atrasadas" : "Crediário em aberto" }), !lista ? _jsx(Carregando, {}) : visiveis.length === 0 ? _jsx(Vazio, { titulo: filtro === "atrasadas" ? "Nenhuma parcela atrasada. 🎉" : "Nenhuma parcela aqui." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Venda" }), _jsx("th", { children: "Parcela" }), _jsx("th", { children: "Vencimento" }), _jsx("th", { className: "text-right", children: "Valor" }), _jsx("th", { className: "nao-imprimir" })] }) }), _jsx("tbody", { children: visiveis.map((p) => {
                                        const d = diasAte(p.vencimento);
                                        const atrasada = p.status === "aberta" && d < 0;
                                        return (_jsxs("tr", { className: atrasada ? "bg-critico-50" : "", children: [_jsxs("td", { children: [_jsx("span", { className: "font-medium", children: p.clientes?.nome }), p.clientes?.telefone && _jsx("span", { className: "block text-xs text-slate-400", children: p.clientes.telefone })] }), _jsx("td", { className: "font-mono", children: numeroDaVenda(p.venda_id, p.vendas) }), _jsxs("td", { children: [p.numero, "/", p.total_parcelas] }), _jsxs("td", { className: "whitespace-nowrap", children: [fmtData(p.vencimento), p.status === "aberta" && _jsx("span", { className: `block text-xs ${atrasada ? "font-semibold text-critico-600" : d <= 7 ? "text-atencao-700" : "text-slate-400"}`, children: atrasada ? `atrasada ${-d} dia(s)` : d === 0 ? "vence hoje" : `em ${d} dia(s)` }), p.status === "paga" && _jsxs("span", { className: "block text-xs text-ok-700", children: ["paga ", fmtDataHora(p.pago_em), " \u00B7 ", p.pago_forma && NOME_FORMA[p.pago_forma]] })] }), _jsx("td", { className: "text-right font-semibold", children: moeda(p.valor) }), _jsx("td", { className: "nao-imprimir whitespace-nowrap text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => abrirCarne(p), children: "Carn\u00EA" }), p.status === "aberta" && _jsx("button", { className: "btn-acao btn-pequeno", onClick: () => setRecebendo(p), children: "Receber" })] }) })] }, p.id));
                                    }) })] }) }))] }), recebendo && (_jsx(JanelaReceber, { titulo: "Receber parcela", valor: Number(recebendo.valor), descricao: _jsxs("p", { children: [_jsx("strong", { children: recebendo.clientes?.nome }), " \u00B7 parcela ", recebendo.numero, "/", recebendo.total_parcelas, " da venda ", numeroDaVenda(recebendo.venda_id, recebendo.vendas), " \u00B7 vence ", fmtData(recebendo.vencimento)] }), onFechar: () => setRecebendo(null), onConfirmar: async (forma) => {
                    try {
                        await receberParcelaLocal({ perfil: perfil, parcela: recebendo, vendaUuid: recebendo.vendas?.uuid_local ?? null, forma });
                    }
                    catch (e) {
                        return mensagemErro(e);
                    }
                    await processarFila();
                    avisar("sucesso", `Parcela ${recebendo.numero}/${recebendo.total_parcelas} de ${recebendo.clientes?.nome} recebida (${moeda(recebendo.valor)}).`);
                    setRecebendo(null);
                    void carregar();
                    return null;
                } })), carne && (_jsx(JanelaComprovante, { titulo: `Carnê — venda nº ${carne.venda.id}`, onFechar: () => setCarne(null), children: (l) => _jsx(CupomCarne, { venda: carne.venda, cliente: carne.cliente, parcelas: carne.parcelas, config: config, largura: l }) }))] }));
}
/* ------------------------------ Clientes ------------------------------ */
function ListaClientes() {
    const moeda = useMoeda();
    const { config, ehAdmin, valoresOcultos } = useAuth();
    const avisar = useToast();
    const [clientes, setClientes] = useState(null);
    const [abertoPorCliente, setAbertoPorCliente] = useState({});
    const [busca, setBusca] = useState("");
    const [mostrarInativos, setMostrarInativos] = useState(false);
    const [editando, setEditando] = useState(null);
    const [extrato, setExtrato] = useState(null);
    const carregar = useCallback(async () => {
        const r = await doServidorOuLocal(async () => {
            const [c, p] = await Promise.all([
                supabase.from("clientes").select("*").order("nome").limit(5000),
                supabase.from("parcelas").select("cliente_id, valor").eq("status", "aberta").limit(10000),
            ]);
            return { data: c.error ? null : { c: c.data, p: (p.data ?? []) }, error: c.error };
        }, async () => ({ c: await clientesLocal(), p: await parcelasLocal({ status: "aberta" }) }));
        if (r.error) {
            avisar("erro", mensagemErro(r.error));
            setClientes([]);
            return;
        }
        setClientes(r.data.c);
        const m = {};
        for (const x of r.data.p)
            m[x.cliente_id] = (m[x.cliente_id] ?? 0) + Number(x.valor);
        setAbertoPorCliente(m);
    }, [avisar]);
    useEffect(() => { void carregar(); }, [carregar]);
    const t = busca.trim().toLowerCase();
    const visiveis = (clientes ?? []).filter((c) => (mostrarInativos || c.ativo) && (!t || c.nome.toLowerCase().includes(t) || (c.telefone ?? "").includes(t) || (c.cpf ?? "").includes(t)));
    async function verExtrato(c) {
        const { data, error } = await doServidorOuLocal(() => supabase.from("parcelas").select("*").eq("cliente_id", c.id).eq("status", "aberta").order("vencimento"), () => parcelasLocal({ clienteId: c.id, status: "aberta" }));
        if (error)
            return avisar("erro", mensagemErro(error));
        setExtrato({ c, parcelas: data });
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "nao-imprimir mb-4 flex flex-wrap items-center gap-2", children: [_jsx("input", { className: "campo w-64 py-1.5 text-sm", placeholder: "Buscar por nome, telefone, CPF ou CNPJ", value: busca, onChange: (e) => setBusca(e.target.value), "aria-label": "Buscar cliente" }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "accent-petroleo-700", checked: mostrarInativos, onChange: (e) => setMostrarInativos(e.target.checked) }), " Mostrar inativos"] }), _jsx("span", { className: "flex-1" }), _jsx("button", { className: "btn-secundario btn-pequeno", disabled: !visiveis.length, onClick: () => window.print(), children: "\uD83D\uDDA8 Imprimir lista" }), _jsx("button", { className: "btn-acao btn-pequeno", onClick: () => setEditando("novo"), children: "+ Novo cliente" })] }), _jsxs("div", { className: "cartao area-impressao overflow-hidden", children: [_jsx(TituloImpressao, { titulo: "Clientes" }), !clientes ? _jsx(Carregando, {}) : visiveis.length === 0 ? _jsx(Vazio, { titulo: "Nenhum cliente cadastrado ainda." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nome" }), _jsx("th", { children: "Telefone" }), _jsx("th", { children: "CPF/CNPJ" }), _jsx("th", { className: "text-right", children: "Limite" }), _jsx("th", { className: "text-right", children: "Em aberto" }), _jsx("th", { className: "nao-imprimir" })] }) }), _jsx("tbody", { children: visiveis.map((c) => {
                                        const aberto = abertoPorCliente[c.id] ?? 0;
                                        const passou = c.limite_credito !== null && aberto > Number(c.limite_credito);
                                        return (_jsxs("tr", { className: !c.ativo ? "opacity-60" : "", children: [_jsxs("td", { children: [_jsx("span", { className: "font-medium", children: c.nome }), !c.ativo && _jsx(Selo, { children: "Inativo" }), c.endereco && _jsx("span", { className: "block text-xs text-slate-400", children: c.endereco })] }), _jsx("td", { className: "whitespace-nowrap", children: c.telefone ?? "—" }), _jsx("td", { className: "whitespace-nowrap", children: c.cpf ?? "—" }), _jsx("td", { className: "text-right", children: c.limite_credito === null ? _jsx("span", { className: "text-xs text-slate-400", children: "sem limite" }) : moeda(c.limite_credito) }), _jsx("td", { className: `text-right font-semibold ${passou ? "text-critico-600" : ""}`, children: valoresOcultos ? "—" : moeda(aberto) }), _jsx("td", { className: "nao-imprimir whitespace-nowrap text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => verExtrato(c), children: "Extrato" }), _jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => setEditando(c), children: "Editar" })] }) })] }, c.id));
                                    }) })] }) }))] }), editando && _jsx(JanelaCliente, { cliente: editando === "novo" ? null : editando, ehAdmin: ehAdmin, onFechar: () => setEditando(null), onSalvo: () => { setEditando(null); void carregar(); } }), extrato && (_jsx(JanelaComprovante, { titulo: `Extrato — ${extrato.c.nome}`, onFechar: () => setExtrato(null), children: (l) => (_jsx(CupomExtrato, { titulo: "EXTRATO DE CREDI\u00C1RIO", cliente: extrato.c.nome, telefone: extrato.c.telefone, config: config, largura: l, linhas: extrato.parcelas.map((p) => ({
                        descricao: `Venda nº ${p.venda_id} · ${p.numero}/${p.total_parcelas}`,
                        detalhe: `vence ${fmtData(p.vencimento)}${diasAte(p.vencimento) < 0 ? " (ATRASADA)" : ""}`,
                        valor: Number(p.valor),
                    })), total: extrato.parcelas.reduce((s, p) => s + Number(p.valor), 0), rodape: extrato.c.limite_credito !== null ? `Limite de crédito: ${moeda(extrato.c.limite_credito)}` : undefined })) }))] }));
}
function JanelaCliente({ cliente, ehAdmin, onFechar, onSalvo }) {
    const avisar = useToast();
    const { perfil } = useAuth();
    const [nome, setNome] = useState(cliente?.nome ?? "");
    const [telefone, setTelefone] = useState(cliente?.telefone ?? "");
    const [cpf, setCpf] = useState(cliente?.cpf ? mascaraDocumento(cliente.cpf) : "");
    const [endereco, setEndereco] = useState(cliente?.endereco ?? "");
    const [limite, setLimite] = useState(cliente?.limite_credito != null ? numParaCampo(cliente.limite_credito) : "");
    const [obs, setObs] = useState(cliente?.observacao ?? "");
    const [ativo, setAtivo] = useState(cliente?.ativo ?? true);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    async function salvar(e) {
        e.preventDefault();
        setErro("");
        if (nome.trim().length < 2)
            return setErro("Informe o nome do cliente.");
        const errDoc = erroDocumento(cpf);
        if (errDoc)
            return setErro(errDoc);
        let lim = null;
        if (limite.trim()) {
            lim = lerNumero(limite);
            if (Number.isNaN(lim) || lim < 0)
                return setErro("Limite de crédito inválido.");
        }
        const dados = {
            nome: nome.trim(), telefone: telefone.trim() || null, cpf: cpf.trim() || null,
            endereco: endereco.trim() || null, observacao: obs.trim() || null, ativo,
        };
        if (ehAdmin)
            dados.limite_credito = lim;
        setSalvando(true);
        const offline = ["offline", "servidor"].includes(estadoConexaoAgora());
        let { error } = offline ? { error: { message: "Failed to fetch" } } : cliente
            ? await supabase.from("clientes").update(dados).eq("id", cliente.id)
            : await supabase.from("clientes").insert(dados);
        let semInternet = false;
        if (error && ehErroDeRede(error)) {
            if (cliente) {
                setSalvando(false);
                return setErro("Editar um cliente já cadastrado precisa de conexão. Tente quando a internet voltar.");
            }
            // Cliente NOVO sem internet: cadastra neste computador e envia depois.
            try {
                await cadastrarClienteLocal({ perfil: perfil, nome, telefone: telefone.trim() || null, cpf: cpf.trim() || null, endereco: endereco.trim() || null, observacao: obs.trim() || null });
                error = null;
                semInternet = true;
            }
            catch (e) {
                error = { message: mensagemErro(e) };
            }
        }
        setSalvando(false);
        if (error)
            return setErro(error.code === "23505" ? "Já existe um cliente com este CPF/CNPJ." : mensagemErro(error));
        avisar("sucesso", cliente ? "Cliente atualizado." : semInternet ? `Cliente cadastrado neste computador (será enviado quando a internet voltar).${ehAdmin && lim !== null ? " Defina o limite de crédito depois, com internet." : ""}` : "Cliente cadastrado.");
        onSalvo();
    }
    return (_jsx(Modal, { aberto: true, titulo: cliente ? "Editar cliente" : "Novo cliente", largura: "md", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Cancelar" }), _jsx("button", { className: "btn-acao", form: "form-cliente", disabled: salvando, children: salvando ? "Salvando…" : "Salvar" })] }), children: _jsxs("form", { id: "form-cliente", onSubmit: salvar, className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("div", { className: "sm:col-span-2", children: [_jsxs("label", { className: "rotulo", htmlFor: "c-nome", children: ["Nome ", _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("input", { id: "c-nome", className: "campo", value: nome, onChange: (e) => setNome(e.target.value), autoFocus: true, maxLength: 120 })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "c-tel", children: "Telefone" }), _jsx("input", { id: "c-tel", className: "campo", inputMode: "tel", value: telefone, onChange: (e) => setTelefone(e.target.value), maxLength: 30 })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "c-cpf", children: "CPF ou CNPJ" }), _jsx(CampoDocumento, { id: "c-cpf", valor: cpf, onMudar: (v) => { setCpf(v); setErro(""); } })] }), _jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "rotulo", htmlFor: "c-end", children: "Endere\u00E7o" }), _jsx("input", { id: "c-end", className: "campo", value: endereco, onChange: (e) => setEndereco(e.target.value), maxLength: 160 })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "c-lim", children: "Limite de cr\u00E9dito (R$)" }), _jsx("input", { id: "c-lim", className: "campo", inputMode: "decimal", value: limite, onChange: (e) => setLimite(e.target.value), disabled: !ehAdmin, placeholder: "vazio = sem limite" }), !ehAdmin && _jsx("p", { className: "mt-1 text-xs text-slate-400", children: "S\u00F3 o administrador altera o limite." })] }), _jsxs("label", { className: "flex items-center gap-2 self-end pb-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-petroleo-700", checked: ativo, onChange: (e) => setAtivo(e.target.checked) }), " Cliente ativo"] }), _jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "rotulo", htmlFor: "c-obs", children: "Observa\u00E7\u00E3o" }), _jsx("input", { id: "c-obs", className: "campo", value: obs, onChange: (e) => setObs(e.target.value), maxLength: 200 })] }), erro && _jsx("div", { className: "sm:col-span-2", children: _jsx(Aviso, { cor: "critico", children: erro }) })] }) }));
}
/* ------------------------------ Caixas ------------------------------ */
function ListaCaixas() {
    const moeda = useMoeda();
    const { config, ehAdmin, valoresOcultos, perfil } = useAuth();
    const avisar = useToast();
    const [caixas, setCaixas] = useState(null);
    const [resumo, setResumo] = useState(null);
    useEffect(() => {
        (async () => {
            // Sem servidor: os caixas guardados neste computador.
            if (["offline", "servidor"].includes(estadoConexaoAgora())) {
                setCaixas((await caixasLocal(ehAdmin ? null : perfil?.id ?? null)).slice(0, 300));
                return;
            }
            // SQL 0006: listar_caixas (respeita o fechamento cego). Antes dele: leitura direta.
            const r = await supabase.rpc("listar_caixas", { p_limite: 300 });
            if (!r.error)
                return setCaixas(r.data);
            const completo = await supabase.from("caixas").select("*").order("aberto_em", { ascending: false }).limit(300);
            if (!completo.error)
                return setCaixas(completo.data);
            const d = await supabase.from("caixas").select(COLUNAS_CAIXA).order("aberto_em", { ascending: false }).limit(300);
            if (d.error) {
                avisar("erro", mensagemErro(d.error));
                setCaixas([]);
                return;
            }
            setCaixas(d.data.map((c) => ({ ...c, valor_esperado: null, diferenca: null, resumo: null })));
        })();
    }, [avisar]);
    async function ver(c) {
        if (c.status === "fechado" && c.resumo)
            return setResumo({ c, r: c.resumo });
        const { data, error } = await supabase.rpc("resumo_caixa", { p_caixa_id: c.id });
        if (error)
            return avisar("erro", ehErroDeRede(error) ? "O resumo de um caixa aberto precisa de conexão com o servidor." : mensagemErro(error));
        setResumo({ c, r: data });
    }
    const colunasValores = !valoresOcultos;
    const caixasOrdenados = useMemo(() => caixas ?? [], [caixas]);
    return (_jsxs(_Fragment, { children: [!ehAdmin && _jsx("p", { className: "nao-imprimir mb-3 text-sm text-slate-500", children: "Voc\u00EA v\u00EA apenas os seus caixas. O administrador v\u00EA todos." }), _jsxs("div", { className: "cartao area-impressao overflow-hidden", children: [_jsx(TituloImpressao, { titulo: "Caixas" }), !caixas ? _jsx(Carregando, {}) : caixasOrdenados.length === 0 ? _jsx(Vazio, { titulo: "Nenhum caixa aberto ainda." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "N\u00BA" }), _jsx("th", { children: "Operador" }), _jsx("th", { children: "Abertura" }), _jsx("th", { children: "Fechamento" }), colunasValores && _jsx("th", { className: "text-right", children: "Esperado" }), _jsx("th", { className: "text-right", children: "Contado" }), colunasValores && _jsx("th", { className: "text-right", children: "Diferen\u00E7a" }), _jsx("th", { className: "nao-imprimir" })] }) }), _jsx("tbody", { children: caixasOrdenados.map((c) => (_jsxs("tr", { children: [_jsx("td", { className: "font-mono", children: c.id }), _jsx("td", { children: c.usuario_nome }), _jsx("td", { className: "whitespace-nowrap text-xs", children: fmtDataHora(c.aberto_em) }), _jsx("td", { className: "whitespace-nowrap text-xs", children: c.status === "aberto" ? _jsx(Selo, { cor: "ok", children: "Aberto" }) : fmtDataHora(c.fechado_em) }), colunasValores && _jsx("td", { className: "text-right", children: c.valor_esperado !== null ? moeda(c.valor_esperado) : "—" }), _jsx("td", { className: "text-right", children: c.valor_contado !== null ? moeda(c.valor_contado) : "—" }), colunasValores && (_jsx("td", { className: `text-right font-semibold ${c.diferenca === null || Number(c.diferenca) === 0 ? "" : Number(c.diferenca) > 0 ? "text-petroleo-700" : "text-critico-600"}`, children: c.diferenca === null ? "—" : Number(c.diferenca) === 0 ? "OK" : moeda(c.diferenca) })), _jsx("td", { className: "nao-imprimir text-right", children: _jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => ver(c), children: "Ver / imprimir" }) })] }, c.id))) })] }) }))] }), resumo && (_jsx(JanelaComprovante, { titulo: `Caixa nº ${resumo.c.id}`, onFechar: () => setResumo(null), children: (l) => _jsx(CupomFechamento, { r: resumo.r, config: config, largura: l, contado: resumo.c.valor_contado, diferenca: resumo.c.diferenca === null ? null : Number(resumo.c.diferenca), observacao: resumo.c.observacao_fechamento }) }))] }));
}
