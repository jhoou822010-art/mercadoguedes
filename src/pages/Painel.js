import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { vendasLocaisNaoEnviadas } from "../lib/local/caixaLocal";
import { fiadosLocal, movimentacoesLocal, parcelasLocal, produtosLocais, resumoPainelLocal, vendasLocal } from "../lib/local/consultas";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { fmtDataHora, fmtQtd, fmtData } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Cabecalho, Carregando, SeloTipo, SeloValidade, Vazio, Aviso } from "../components/Ui";
import { OlhoValores } from "../components/OlhoValores";
import { useMoeda } from "../lib/privacidade";
function Indicador({ titulo, valor, detalhe, para, cor }) {
    return (_jsxs(Link, { to: para, className: `cartao group block border-l-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md ${cor}`, children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: titulo }), _jsx("p", { className: "mt-1 text-2xl font-bold text-slate-800", children: valor }), _jsx("p", { className: "mt-1 text-xs text-slate-500 group-hover:text-petroleo-700", children: detalhe ?? "Ver detalhes →" })] }));
}
export default function Painel() {
    const { perfil, ehAdmin, config, tem0006, valoresOcultos } = useAuth();
    const moeda = useMoeda();
    const [resumo, setResumo] = useState(null);
    const [baixos, setBaixos] = useState([]);
    const [vencendo, setVencendo] = useState([]);
    const [movs, setMovs] = useState([]);
    const [erro, setErro] = useState("");
    const [hoje, setHoje] = useState(null);
    const [receber, setReceber] = useState(null);
    const carregar = useCallback(async () => {
        try {
            const inicio = new Date();
            inicio.setHours(0, 0, 0, 0);
            const hojeTxt = new Date().toLocaleDateString("sv-SE");
            // Com servidor: dados ao vivo. Sem servidor: a cópia guardada neste computador.
            const { data, error } = await doServidorOuLocal(async () => {
                const [r, b, v, m, vh, fi, pa] = await Promise.all([
                    supabase.rpc("resumo_painel"),
                    supabase.from("vw_produtos").select("*").eq("ativo", true).eq("abaixo_minimo", true).order("estoque").limit(6),
                    supabase.from("vw_produtos").select("*").eq("ativo", true).in("situacao_validade", ["vencido", "critico", "proximo"]).order("validade").limit(6),
                    supabase.from("movimentacoes").select("*").order("criado_em", { ascending: false }).limit(8),
                    supabase.from("vendas").select("id, total").eq("status", "concluida").gte("criado_em", inicio.toISOString()).limit(5000),
                    supabase.from("venda_pagamentos").select("valor, vendas!inner(status, cliente_nome)").eq("forma", "fiado").is("fiado_recebido_em", null).eq("vendas.status", "concluida").limit(10000),
                    tem0006 ? supabase.from("parcelas").select("valor, vencimento, cliente_id").eq("status", "aberta").limit(10000) : Promise.resolve({ data: [], error: null }),
                ]);
                const erro = [r, b, v, m, vh, fi, pa].find((x) => x.error)?.error ?? null;
                return {
                    data: erro ? null : { r: r.data, b: b.data, v: v.data, m: m.data, vh: (vh.data ?? []), fi: (fi.data ?? []), pa: (pa.data ?? []) },
                    error: erro,
                };
            }, async () => {
                const produtos = (await produtosLocais()).filter((p) => p.ativo);
                return {
                    r: await resumoPainelLocal(),
                    b: produtos.filter((p) => p.abaixo_minimo).sort((a, b) => a.estoque - b.estoque).slice(0, 6),
                    v: produtos.filter((p) => ["vencido", "critico", "proximo"].includes(p.situacao_validade)).sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? "")).slice(0, 6),
                    m: (await movimentacoesLocal({ limite: 8 })).lista,
                    vh: await vendasLocal({ desde: inicio.toISOString(), status: "concluida" }),
                    fi: (await fiadosLocal(false)),
                    pa: tem0006 ? await parcelasLocal({ status: "aberta" }) : [],
                };
            });
            if (error)
                throw error;
            // Vendas de hoje feitas neste computador que o servidor ainda não tem.
            // (as já enviadas o servidor já contou)
            const pendHoje = (await vendasLocaisNaoEnviadas()).filter((v) => v.status === "concluida" && v.sync !== "sincronizado" && v.criado_em >= inicio.toISOString());
            if (pendHoje.length && !data.vh.some((v) => (v.id ?? 0) < 0))
                data.vh = [...data.vh, ...pendHoje];
            setResumo(data.r);
            setBaixos(data.b);
            setVencendo(data.v);
            setMovs(data.m);
            setHoje({ qtd: data.vh.length, total: data.vh.reduce((s, v) => s + Number(v.total), 0) });
            setReceber({
                fiado: data.fi.reduce((s, f) => s + Number(f.valor), 0),
                crediario: data.pa.reduce((s, p) => s + Number(p.valor), 0),
                atrasado: data.pa.filter((p) => p.vencimento < hojeTxt).reduce((s, p) => s + Number(p.valor), 0),
                clientes: new Set([...data.fi.map((f) => `f:${f.vendas.cliente_nome}`), ...data.pa.map((p) => `c:${p.cliente_id}`)]).size,
            });
        }
        catch (e) {
            setErro(mensagemErro(e));
        }
    }, [tem0006]);
    useEffect(() => {
        void carregar();
        // Atualiza o painel quando outra pessoa movimenta o estoque (realtime opcional).
        const canal = supabase
            .channel("painel")
            .on("postgres_changes", { event: "*", schema: "public", table: "movimentacoes" }, () => void carregar())
            .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () => void carregar())
            .on("postgres_changes", { event: "*", schema: "public", table: "vendas" }, () => void carregar())
            .subscribe();
        return () => void supabase.removeChannel(canal);
    }, [carregar]);
    const primeiroNome = perfil?.nome.split(" ")[0] ?? "";
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: `Olá, ${primeiroNome}`, descricao: config ? `${config.nome_loja} · resumo da loja agora` : "Resumo da loja agora", acoes: _jsxs(_Fragment, { children: [_jsx(OlhoValores, {}), _jsx(Link, { to: "/caixa", className: "btn-acao", children: "\uD83D\uDED2 Abrir o caixa" }), ehAdmin && _jsx(Link, { to: "/produtos?novo=1", className: "btn-secundario", children: "+ Cadastrar produto" }), _jsx(Link, { to: "/estoque", className: "btn-primario", children: "\u21C5 Movimentar estoque" }), _jsx(Link, { to: "/etiquetas", className: "btn-secundario", children: "\uD83C\uDFF7 Imprimir etiqueta" })] }) }), erro && _jsx("div", { className: "mb-4", children: _jsxs(Aviso, { cor: "critico", children: ["N\u00E3o foi poss\u00EDvel carregar o painel: ", erro] }) }), !resumo && !erro && _jsx(Carregando, {}), resumo && (_jsxs(_Fragment, { children: [!valoresOcultos && (hoje || receber) && (_jsxs("div", { className: "mb-3 grid gap-3 lg:grid-cols-2", children: [hoje && (_jsxs(Link, { to: "/vendas", className: "cartao flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-acao-500 p-4 hover:shadow-md", children: [_jsx("span", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "Vendas de hoje" }), _jsxs("span", { className: "text-lg", children: [_jsx("strong", { children: hoje.qtd }), " venda(s) \u00B7 ", _jsx("strong", { className: "text-2xl", children: moeda(hoje.total) })] })] })), receber && (_jsxs(Link, { to: receber.atrasado > 0 ? "/vendas?aba=crediario" : "/vendas?aba=fiado", className: `cartao flex flex-wrap items-center justify-between gap-2 border-l-4 p-4 hover:shadow-md ${receber.atrasado > 0 ? "border-l-critico-600" : "border-l-petroleo-600"}`, children: [_jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold uppercase tracking-wide text-slate-500", children: "A receber (fiado + credi\u00E1rio)" }), _jsxs("span", { className: "text-xs text-slate-500", children: ["Fiado ", moeda(receber.fiado), " \u00B7 Credi\u00E1rio ", moeda(receber.crediario), " \u00B7 ", receber.clientes, " cliente(s)", receber.atrasado > 0 && _jsxs("strong", { className: "ml-1 text-critico-600", children: ["\u00B7 atrasado ", moeda(receber.atrasado)] })] })] }), _jsx("strong", { className: "text-2xl", children: moeda(receber.fiado + receber.crediario) })] }))] })), _jsxs("div", { className: "grid grid-cols-2 gap-3 lg:grid-cols-4", children: [_jsx(Indicador, { titulo: "Produtos ativos", valor: String(resumo.total_produtos), detalhe: resumo.total_inativos ? `${resumo.total_inativos} inativo(s) · ver lista →` : undefined, para: "/produtos", cor: "border-l-petroleo-600" }), _jsx(Indicador, { titulo: "Valor do estoque (custo)", valor: moeda(resumo.valor_estoque), para: "/relatorios?r=estoque", cor: "border-l-petroleo-600" }), _jsx(Indicador, { titulo: "Abaixo do m\u00EDnimo", valor: String(resumo.abaixo_minimo), para: "/produtos?alerta=minimo", cor: resumo.abaixo_minimo ? "border-l-atencao-500" : "border-l-ok-600" }), _jsx(Indicador, { titulo: "Validade", valor: `${resumo.proximos_vencimento} próximo(s)`, detalhe: resumo.vencidos ? `${resumo.vencidos} vencido(s) →` : undefined, para: "/produtos?alerta=validade", cor: resumo.vencidos ? "border-l-critico-600" : resumo.proximos_vencimento ? "border-l-atencao-500" : "border-l-ok-600" })] }), _jsxs("div", { className: "mt-6 grid gap-6 lg:grid-cols-2", children: [_jsxs("section", { className: "cartao", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "Abaixo do estoque m\u00EDnimo" }), _jsx(Link, { to: "/produtos?alerta=minimo", className: "text-xs font-semibold text-petroleo-700 hover:underline", children: "Ver todos" })] }), baixos.length === 0 ? _jsx(Vazio, { titulo: "Tudo certo: nenhum produto abaixo do m\u00EDnimo." }) : (_jsx("ul", { className: "divide-y divide-slate-100", children: baixos.map((p) => (_jsxs("li", { className: "flex items-center justify-between gap-3 px-4 py-2.5 text-sm", children: [_jsx("span", { className: "min-w-0 truncate", children: p.nome }), _jsxs("span", { className: "shrink-0 text-right", children: [_jsx("span", { className: "font-semibold text-atencao-700", children: fmtQtd(p.estoque, p.unidade) }), _jsxs("span", { className: "text-slate-400", children: [" / m\u00EDn. ", fmtQtd(p.estoque_minimo, p.unidade), " ", p.unidade] }), _jsx(Link, { to: `/estoque?produto=${p.id}`, className: "ml-3 text-xs font-semibold text-petroleo-700 hover:underline", children: "Repor" })] })] }, p.id))) }))] }), _jsxs("section", { className: "cartao", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "Validade pr\u00F3xima ou vencida" }), _jsx(Link, { to: "/produtos?alerta=validade", className: "text-xs font-semibold text-petroleo-700 hover:underline", children: "Ver todos" })] }), vencendo.length === 0 ? _jsx(Vazio, { titulo: "Nenhum produto perto do vencimento." }) : (_jsx("ul", { className: "divide-y divide-slate-100", children: vencendo.map((p) => (_jsxs("li", { className: "flex items-center justify-between gap-3 px-4 py-2.5 text-sm", children: [_jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate", children: p.nome }), _jsxs("span", { className: "text-xs text-slate-400", children: ["Validade ", fmtData(p.validade)] })] }), _jsx(SeloValidade, { p: p })] }, p.id))) }))] })] }), _jsxs("section", { className: "cartao mt-6", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "\u00DAltimas movimenta\u00E7\u00F5es" }), _jsx(Link, { to: "/estoque", className: "text-xs font-semibold text-petroleo-700 hover:underline", children: "Ver hist\u00F3rico" })] }), movs.length === 0 ? _jsx(Vazio, { titulo: "Nenhuma movimenta\u00E7\u00E3o ainda." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Produto" }), _jsx("th", { children: "Tipo" }), _jsx("th", { className: "text-right", children: "Qtd." }), _jsx("th", { className: "text-right", children: "Saldo" }), _jsx("th", { className: "hidden md:table-cell", children: "Usu\u00E1rio" })] }) }), _jsx("tbody", { children: movs.map((m) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap text-slate-500", children: fmtDataHora(m.criado_em) }), _jsx("td", { className: "max-w-[14rem] truncate", children: m.produto_nome }), _jsx("td", { children: _jsx(SeloTipo, { tipo: m.tipo }) }), _jsx("td", { className: "text-right", children: fmtQtd(m.quantidade) }), _jsx("td", { className: "text-right font-semibold", children: fmtQtd(m.saldo_apos) }), _jsx("td", { className: "hidden text-slate-500 md:table-cell", children: m.usuario_nome ?? "—" })] }, m.id))) })] }) }))] })] }))] }));
}
