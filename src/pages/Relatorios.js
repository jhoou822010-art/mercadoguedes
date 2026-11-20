import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { movimentacoesLocal, produtosLocais } from "../lib/local/consultas";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { baixarCsv, hojeArquivo } from "../lib/csv";
import { exportarProdutosCsv } from "../lib/planilha";
import { fmtData, fmtDataHora, fmtMoeda, fmtQtd, NOME_TIPO, textoDias } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Aviso, Cabecalho, Carregando, SeloTipo, SeloValidade, Vazio } from "../components/Ui";
const RELATORIOS = [
    { id: "produtos", titulo: "Produtos cadastrados", descricao: "Cadastro completo de todos os produtos." },
    { id: "estoque", titulo: "Estoque atual", descricao: "Saldo e valor estimado pelo custo (produtos ativos)." },
    { id: "minimo", titulo: "Abaixo do mínimo", descricao: "Produtos ativos que precisam de reposição." },
    { id: "validade", titulo: "Próximos do vencimento", descricao: "Produtos ativos vencidos ou perto de vencer." },
    { id: "movimentacoes", titulo: "Movimentações recentes", descricao: "Entradas, saídas e ajustes do período escolhido." },
];
export default function Relatorios() {
    const { config } = useAuth();
    const avisar = useToast();
    const [params, setParams] = useSearchParams();
    const rel = (RELATORIOS.some((r) => r.id === params.get("r")) ? params.get("r") : "produtos");
    const [produtos, setProdutos] = useState(null);
    const [movs, setMovs] = useState(null);
    const [dias, setDias] = useState(30);
    const [erro, setErro] = useState("");
    useEffect(() => {
        doServidorOuLocal(async () => {
            try {
                return { data: await buscarTodos("vw_produtos", { coluna: "nome" }), error: null };
            }
            catch (e) {
                return { data: null, error: e };
            }
        }, async () => (await produtosLocais()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))).then(({ data, error }) => (error ? setErro(mensagemErro(error)) : setProdutos(data))).catch((e) => setErro(mensagemErro(e)));
    }, []);
    useEffect(() => {
        if (rel !== "movimentacoes")
            return;
        setMovs(null);
        const desde = new Date(Date.now() - dias * 86400000).toISOString();
        void doServidorOuLocal(() => supabase.from("movimentacoes").select("*").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(5000), async () => (await movimentacoesLocal({ desde, limite: 5000 })).lista).then(({ data, error }) => (error ? setErro(mensagemErro(error)) : setMovs(data)));
    }, [rel, dias]);
    const dados = useMemo(() => {
        if (!produtos)
            return null;
        const ativos = produtos.filter((p) => p.ativo);
        switch (rel) {
            case "estoque": return ativos;
            case "minimo": return ativos.filter((p) => p.abaixo_minimo).sort((a, b) => a.estoque / (a.estoque_minimo || 1) - b.estoque / (b.estoque_minimo || 1));
            case "validade": return ativos.filter((p) => ["vencido", "critico", "proximo"].includes(p.situacao_validade)).sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? ""));
            default: return produtos;
        }
    }, [produtos, rel]);
    const info = RELATORIOS.find((r) => r.id === rel);
    const valorTotal = (dados ?? []).reduce((s, p) => s + Number(p.valor_estoque), 0);
    function exportar() {
        const nome = `loja-facil-${rel}-${hojeArquivo()}.csv`;
        if (rel === "movimentacoes") {
            if (!movs)
                return;
            baixarCsv(nome, ["Data", "Código", "Produto", "Tipo", "Quantidade", "Saldo anterior", "Saldo após", "Observação", "Usuário"], movs.map((m) => [fmtDataHora(m.criado_em), m.produto_codigo, m.produto_nome, NOME_TIPO[m.tipo], Number(m.quantidade), Number(m.saldo_anterior), Number(m.saldo_apos), m.observacao, m.usuario_nome]));
            avisar("sucesso", `${movs.length} movimentação(ões) exportada(s) para ${nome}.`);
            return;
        }
        if (!dados)
            return;
        exportarProdutosCsv(dados, nome);
        avisar("sucesso", `${dados.length} produto(s) exportado(s) para ${nome}. Abra no Excel ou outro programa de planilhas.`);
    }
    const carregando = rel === "movimentacoes" ? !movs : !dados;
    // Aberto por "Imprimir lista" (tela Produtos): imprime assim que os dados chegam.
    const [impresso, setImpresso] = useState(false);
    useEffect(() => {
        if (params.get("imprimir") === "1" && !carregando && !impresso) {
            setImpresso(true);
            setTimeout(() => window.print(), 300);
        }
    }, [params, carregando, impresso]);
    const vazio = rel === "movimentacoes" ? movs?.length === 0 : dados?.length === 0;
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: "Relat\u00F3rios", descricao: "Consulte, imprima ou exporte em CSV para o Excel.", acoes: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", disabled: carregando || vazio, onClick: () => window.print(), children: "\uD83D\uDDA8 Imprimir" }), _jsx("button", { className: "btn-acao", disabled: carregando || vazio, onClick: exportar, children: "\u2913 Exportar CSV" })] }) }), _jsx("div", { className: "nao-imprimir mb-4 flex gap-2 overflow-x-auto pb-1", children: RELATORIOS.map((r) => (_jsx("button", { onClick: () => setParams({ r: r.id }, { replace: true }), className: `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${rel === r.id ? "bg-petroleo-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`, children: r.titulo }, r.id))) }), erro && _jsx("div", { className: "mb-4", children: _jsx(Aviso, { cor: "critico", children: erro }) }), _jsxs("section", { className: "cartao area-impressao", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3", children: [_jsxs("div", { children: [_jsxs("p", { className: "somente-impressao text-xs", children: [config?.nome_loja, " \u00B7 Gerenciador de Mercado \u00B7 emitido em ", fmtDataHora(new Date().toISOString())] }), _jsx("h2", { className: "font-semibold", children: info.titulo }), _jsx("p", { className: "text-xs text-slate-500", children: info.descricao })] }), rel === "movimentacoes" && (_jsxs("select", { className: "campo nao-imprimir w-auto py-1 text-sm", value: dias, onChange: (e) => setDias(Number(e.target.value)), "aria-label": "Per\u00EDodo", children: [_jsx("option", { value: 1, children: "\u00DAltimas 24 horas" }), _jsx("option", { value: 7, children: "\u00DAltimos 7 dias" }), _jsx("option", { value: 30, children: "\u00DAltimos 30 dias" }), _jsx("option", { value: 90, children: "\u00DAltimos 90 dias" })] })), rel === "estoque" && dados && _jsxs("p", { className: "text-sm", children: ["Valor total (custo): ", _jsx("strong", { children: fmtMoeda(valorTotal) })] })] }), carregando ? _jsx(Carregando, {}) : vazio ? _jsx(Vazio, { titulo: "Nada para mostrar neste relat\u00F3rio." }) : (_jsx("div", { className: "overflow-x-auto", children: rel === "movimentacoes" ? (_jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Produto" }), _jsx("th", { children: "Tipo" }), _jsx("th", { className: "text-right", children: "Qtd." }), _jsx("th", { className: "text-right", children: "Saldo ap\u00F3s" }), _jsx("th", { children: "Observa\u00E7\u00E3o" }), _jsx("th", { children: "Usu\u00E1rio" })] }) }), _jsx("tbody", { children: movs.map((m) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap text-xs", children: fmtDataHora(m.criado_em) }), _jsxs("td", { children: [m.produto_nome, " ", _jsxs("span", { className: "text-xs text-slate-400", children: ["(", m.produto_codigo, ")"] })] }), _jsx("td", { children: _jsx(SeloTipo, { tipo: m.tipo }) }), _jsx("td", { className: "text-right", children: fmtQtd(m.quantidade) }), _jsx("td", { className: "text-right font-semibold", children: fmtQtd(m.saldo_apos) }), _jsx("td", { className: "text-xs text-slate-500", children: m.observacao ?? "—" }), _jsx("td", { className: "text-xs text-slate-500", children: m.usuario_nome ?? "—" })] }, m.id))) })] })) : (_jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "C\u00F3digo" }), _jsx("th", { children: "Produto" }), rel === "produtos" && _jsxs(_Fragment, { children: [_jsx("th", { children: "Categoria" }), _jsx("th", { children: "Fornecedor" }), _jsx("th", { className: "text-right", children: "Custo" }), _jsx("th", { className: "text-right", children: "Pre\u00E7o" })] }), _jsx("th", { className: "text-right", children: "Estoque" }), (rel === "minimo" || rel === "produtos") && _jsx("th", { className: "text-right", children: "M\u00EDnimo" }), rel === "minimo" && _jsx("th", { className: "text-right", children: "Repor" }), rel === "estoque" && _jsxs(_Fragment, { children: [_jsx("th", { className: "text-right", children: "Custo" }), _jsx("th", { className: "text-right", children: "Valor" })] }), (rel === "validade" || rel === "produtos") && _jsx("th", { children: "Validade" }), rel === "validade" && _jsx("th", { children: "Situa\u00E7\u00E3o" }), rel === "produtos" && _jsx("th", { children: "Ativo" })] }) }), _jsx("tbody", { children: dados.map((p) => (_jsxs("tr", { children: [_jsx("td", { className: "font-mono text-xs", children: p.codigo }), _jsx("td", { children: p.nome }), rel === "produtos" && _jsxs(_Fragment, { children: [_jsx("td", { children: p.categoria ?? "—" }), _jsx("td", { children: p.fornecedor ?? "—" }), _jsx("td", { className: "text-right", children: fmtMoeda(p.custo) }), _jsx("td", { className: "text-right", children: fmtMoeda(p.preco) })] }), _jsxs("td", { className: "whitespace-nowrap text-right", children: [fmtQtd(p.estoque, p.unidade), " ", p.unidade] }), (rel === "minimo" || rel === "produtos") && _jsx("td", { className: "text-right", children: fmtQtd(p.estoque_minimo, p.unidade) }), rel === "minimo" && _jsx("td", { className: "text-right font-semibold text-atencao-700", children: fmtQtd(Math.max(0, p.estoque_minimo - p.estoque), p.unidade) }), rel === "estoque" && _jsxs(_Fragment, { children: [_jsx("td", { className: "text-right", children: fmtMoeda(p.custo) }), _jsx("td", { className: "text-right font-semibold", children: fmtMoeda(p.valor_estoque) })] }), (rel === "validade" || rel === "produtos") && _jsx("td", { className: "whitespace-nowrap", children: fmtData(p.validade) }), rel === "validade" && _jsxs("td", { children: [_jsx(SeloValidade, { p: p }), " ", _jsx("span", { className: "somente-impressao", children: textoDias(p.dias_para_vencer) })] }), rel === "produtos" && _jsx("td", { children: p.ativo ? "Sim" : "Não" })] }, p.id))) })] })) }))] })] }));
}
