import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { movimentarEstoqueLocal } from "../lib/local/caixaLocal";
import { estadoConexaoAgora } from "../lib/conexao";
import { ehErroDeRede } from "../lib/supabase";
import { doServidorOuLocal } from "../lib/local/fallback";
import { movimentacoesLocal, produtoLocal } from "../lib/local/consultas";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { fmtDataHora, fmtQtd, lerNumero, NOME_TIPO } from "../lib/format";
import { useToast } from "../components/Toast";
import { Confirmar } from "../components/Modal";
import { ProdutoBusca } from "../components/ProdutoBusca";
import { Aviso, Cabecalho, Carregando, SeloEstoque, SeloTipo, Vazio } from "../components/Ui";
const TIPOS = [
    { v: "entrada", titulo: "Entrada", texto: "Chegou mercadoria (soma ao saldo)", cor: "peer-checked:border-ok-600 peer-checked:bg-ok-50" },
    { v: "saida", titulo: "Saída", texto: "Perda, consumo, venda (tira do saldo)", cor: "peer-checked:border-acao-500 peer-checked:bg-orange-50" },
    { v: "ajuste", titulo: "Ajuste", texto: "Contagem: define o saldo exato", cor: "peer-checked:border-petroleo-500 peer-checked:bg-petroleo-50" },
];
const POR_PAGINA = 30;
export default function Estoque() {
    const avisar = useToast();
    const { perfil } = useAuth();
    const [params, setParams] = useSearchParams();
    const [produto, setProduto] = useState(null);
    const [tipo, setTipo] = useState("entrada");
    const [qtd, setQtd] = useState("");
    const [motivo, setMotivo] = useState("");
    const [erro, setErro] = useState("");
    const [confirmando, setConfirmando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [hist, setHist] = useState(null);
    const [filtroTipo, setFiltroTipo] = useState("");
    const [filtroProduto, setFiltroProduto] = useState(false);
    const [pagina, setPagina] = useState(0);
    const [total, setTotal] = useState(0);
    // Abre já com o produto vindo de outra tela (?produto=ID).
    useEffect(() => {
        const id = params.get("produto");
        if (!id)
            return;
        void doServidorOuLocal(() => supabase.from("vw_produtos").select("*").eq("id", id).maybeSingle(), () => produtoLocal(Number(id))).then(({ data }) => {
            if (data) {
                setProduto(data);
                setFiltroProduto(true);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const carregarHist = useCallback(async () => {
        const totalL = { n: 0 };
        const { data, count, error } = await doServidorOuLocal(() => {
            let q = supabase.from("movimentacoes").select("*", { count: "exact" }).order("criado_em", { ascending: false });
            if (filtroTipo)
                q = q.eq("tipo", filtroTipo);
            if (filtroProduto && produto)
                q = q.eq("produto_id", produto.id);
            return q.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
        }, async () => {
            const r = await movimentacoesLocal({ tipo: filtroTipo || undefined, produtoId: filtroProduto && produto ? produto.id : undefined, pagina, porPagina: POR_PAGINA });
            totalL.n = r.total;
            return r.lista;
        }, { contar: () => totalL.n });
        if (error)
            return avisar("erro", mensagemErro(error));
        setHist(data);
        setTotal(count ?? 0);
    }, [filtroTipo, filtroProduto, produto, pagina, avisar]);
    useEffect(() => { void carregarHist(); }, [carregarHist]);
    const quantidade = lerNumero(qtd);
    const atual = Number(produto?.estoque ?? 0);
    const novoSaldo = Number.isNaN(quantidade) ? null
        : tipo === "entrada" ? atual + quantidade
            : tipo === "saida" ? atual - quantidade
                : quantidade;
    function selecionar(p) {
        setProduto(p);
        setErro("");
        setPagina(0);
        const np = new URLSearchParams(params);
        np.set("produto", String(p.id));
        setParams(np, { replace: true });
    }
    function revisar(e) {
        e.preventDefault();
        setErro("");
        if (!produto)
            return setErro("Escolha um produto.");
        if (Number.isNaN(quantidade))
            return setErro("Digite uma quantidade válida (ex.: 10 ou 2,5).");
        if (quantidade < 0)
            return setErro("A quantidade não pode ser negativa.");
        if (tipo !== "ajuste" && quantidade === 0)
            return setErro("A quantidade precisa ser maior que zero.");
        if (["UN", "PCT", "CX"].includes(produto.unidade) && !Number.isInteger(quantidade))
            return setErro(`Para ${produto.unidade} use número inteiro.`);
        if (novoSaldo !== null && novoSaldo < 0)
            return setErro(`Estoque insuficiente: o saldo atual é ${fmtQtd(atual, produto.unidade)} ${produto.unidade}.`);
        if (tipo === "ajuste" && !motivo.trim())
            return setErro("Informe o motivo do ajuste (ex.: contagem de inventário).");
        setConfirmando(true);
    }
    async function gravar() {
        if (!produto)
            return;
        setSalvando(true);
        // Com servidor: grava direto. Sem servidor: grava neste computador e envia depois.
        const offline = ["offline", "servidor"].includes(estadoConexaoAgora());
        let mov = null;
        let erroGrav = null;
        if (!offline) {
            const r = await supabase.rpc("movimentar_estoque", { p_produto_id: produto.id, p_tipo: tipo, p_quantidade: quantidade, p_observacao: motivo.trim() || null });
            if (r.error && !ehErroDeRede(r.error))
                erroGrav = r.error;
            else if (!r.error)
                mov = r.data;
        }
        if (!mov && !erroGrav) {
            try {
                mov = await movimentarEstoqueLocal({ perfil: perfil, produto, tipo, quantidade, observacao: motivo.trim() || null });
            }
            catch (e) {
                erroGrav = e;
            }
        }
        setSalvando(false);
        setConfirmando(false);
        if (erroGrav || !mov)
            return setErro(mensagemErro(erroGrav));
        avisar("sucesso", `${NOME_TIPO[tipo]} registrada: ${produto.nome} agora tem ${fmtQtd(mov.saldo_apos, produto.unidade)} ${produto.unidade}.${mov && "uuid_local" in mov ? " (sem internet: será enviada sozinha)" : ""}`);
        // Recarrega o produto para mostrar o novo saldo e indicadores.
        const { data: p } = await doServidorOuLocal(() => supabase.from("vw_produtos").select("*").eq("id", produto.id).maybeSingle(), () => produtoLocal(produto.id));
        if (p)
            setProduto(p);
        setQtd("");
        setMotivo("");
        setPagina(0);
        void carregarHist();
    }
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: "Estoque", descricao: "Registre entradas, sa\u00EDdas e ajustes. Todo movimento fica no hist\u00F3rico." }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-5", children: [_jsxs("form", { onSubmit: revisar, className: "cartao space-y-5 p-5 lg:col-span-2", noValidate: true, children: [_jsxs("div", { children: [_jsx("span", { className: "rotulo", children: "1. Produto" }), _jsx(ProdutoBusca, { onSelecionar: selecionar, autoFocus: !produto }), produto && (_jsxs("div", { className: "mt-3 rounded-lg border border-petroleo-200 bg-petroleo-50 p-3", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-semibold text-slate-800", children: produto.nome }), _jsxs("p", { className: "text-xs text-slate-500", children: ["C\u00F3d. ", produto.codigo, produto.barras ? ` · ${produto.barras}` : ""] })] }), _jsx("button", { type: "button", className: "text-xs font-semibold text-petroleo-700 hover:underline", onClick: () => { setProduto(null); setFiltroProduto(false); setParams({}, { replace: true }); }, children: "Trocar" })] }), _jsxs("div", { className: "mt-2 flex items-center gap-2 text-sm", children: ["Saldo atual: ", _jsxs("strong", { children: [fmtQtd(produto.estoque, produto.unidade), " ", produto.unidade] }), _jsx(SeloEstoque, { p: produto })] }), !produto.ativo && _jsx("p", { className: "mt-1 text-xs text-atencao-700", children: "Aten\u00E7\u00E3o: produto inativo." })] }))] }), _jsxs("fieldset", { children: [_jsx("legend", { className: "rotulo", children: "2. Tipo de movimenta\u00E7\u00E3o" }), _jsx("div", { className: "grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3", children: TIPOS.map((t) => (_jsxs("label", { className: "cursor-pointer", children: [_jsx("input", { type: "radio", name: "tipo", value: t.v, checked: tipo === t.v, onChange: () => setTipo(t.v), className: "peer sr-only" }), _jsxs("span", { className: `block h-full rounded-lg border-2 border-slate-200 p-3 transition ${t.cor}`, children: [_jsx("span", { className: "block text-sm font-semibold", children: t.titulo }), _jsx("span", { className: "block text-xs text-slate-500", children: t.texto })] })] }, t.v))) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2", children: [_jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "qtd", children: ["3. ", tipo === "ajuste" ? "Novo saldo (contado)" : "Quantidade", " ", produto && `(${produto.unidade})`] }), _jsx("input", { id: "qtd", className: "campo text-lg font-semibold", inputMode: "decimal", value: qtd, onChange: (e) => { setQtd(e.target.value); setErro(""); }, placeholder: "0" })] }), _jsxs("div", { className: "rounded-lg bg-slate-50 p-3 text-sm", children: [_jsx("p", { className: "text-xs text-slate-500", children: "Resultado" }), produto && novoSaldo !== null ? (_jsxs("p", { className: "mt-1", children: [fmtQtd(atual, produto.unidade), " \u2192 ", _jsx("strong", { className: novoSaldo < 0 ? "text-critico-600" : "text-ok-700", children: fmtQtd(novoSaldo, produto.unidade) }), " ", produto.unidade] })) : _jsx("p", { className: "mt-1 text-slate-400", children: "\u2014" })] })] }), _jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "motivo", children: ["4. Observa\u00E7\u00E3o / motivo ", tipo === "ajuste" && _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("input", { id: "motivo", className: "campo", value: motivo, onChange: (e) => setMotivo(e.target.value), placeholder: tipo === "entrada" ? "Ex.: NF 1234 do fornecedor" : tipo === "saida" ? "Ex.: produto avariado" : "Ex.: inventário mensal", maxLength: 200 })] }), erro && _jsx(Aviso, { cor: "critico", children: erro }), _jsx("button", { className: "btn-acao w-full", disabled: !produto, children: "Revisar e confirmar" })] }), _jsxs("section", { className: "cartao lg:col-span-3", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "Hist\u00F3rico" }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 text-sm", children: [produto && (_jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", className: "accent-petroleo-700", checked: filtroProduto, onChange: (e) => { setFiltroProduto(e.target.checked); setPagina(0); } }), "S\u00F3 este produto"] })), _jsxs("select", { className: "campo w-auto py-1 text-sm", value: filtroTipo, onChange: (e) => { setFiltroTipo(e.target.value); setPagina(0); }, "aria-label": "Filtrar por tipo", children: [_jsx("option", { value: "", children: "Todos os tipos" }), _jsx("option", { value: "entrada", children: "Entradas" }), _jsx("option", { value: "saida", children: "Sa\u00EDdas" }), _jsx("option", { value: "ajuste", children: "Ajustes" })] })] })] }), !hist ? _jsx(Carregando, {}) : hist.length === 0 ? _jsx(Vazio, { titulo: "Nenhuma movimenta\u00E7\u00E3o encontrada." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Produto" }), _jsx("th", { children: "Tipo" }), _jsx("th", { className: "text-right", children: "Qtd." }), _jsx("th", { className: "text-right", children: "Saldo" }), _jsx("th", { children: "Motivo / usu\u00E1rio" })] }) }), _jsx("tbody", { children: hist.map((m) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap text-xs text-slate-500", children: fmtDataHora(m.criado_em) }), _jsxs("td", { className: "max-w-[12rem]", children: [_jsx("span", { className: "block truncate", children: m.produto_nome }), _jsxs("span", { className: "text-xs text-slate-400", children: [m.produto_codigo, m.produto_id === null && " · removido"] })] }), _jsx("td", { children: _jsx(SeloTipo, { tipo: m.tipo }) }), _jsx("td", { className: "text-right", children: fmtQtd(m.quantidade) }), _jsxs("td", { className: "whitespace-nowrap text-right", children: [_jsxs("span", { className: "text-xs text-slate-400", children: [fmtQtd(m.saldo_anterior), " \u2192 "] }), _jsx("strong", { children: fmtQtd(m.saldo_apos) })] }), _jsxs("td", { className: "text-xs text-slate-500", children: [_jsx("span", { className: "block", children: m.observacao ?? "—" }), _jsx("span", { className: "text-slate-400", children: m.usuario_nome ?? "" })] })] }, m.id))) })] }) })), total > POR_PAGINA && (_jsxs("div", { className: "flex items-center justify-center gap-3 border-t border-slate-100 p-3 text-sm", children: [_jsx("button", { className: "btn-secundario btn-pequeno", disabled: pagina === 0, onClick: () => setPagina(pagina - 1), children: "\u2190 Anterior" }), _jsxs("span", { children: ["P\u00E1gina ", pagina + 1, " de ", Math.ceil(total / POR_PAGINA)] }), _jsx("button", { className: "btn-secundario btn-pequeno", disabled: (pagina + 1) * POR_PAGINA >= total, onClick: () => setPagina(pagina + 1), children: "Pr\u00F3xima \u2192" })] }))] })] }), _jsx(Confirmar, { aberto: confirmando, titulo: `Confirmar ${NOME_TIPO[tipo].toLowerCase()}?`, processando: salvando, textoConfirmar: `Confirmar ${NOME_TIPO[tipo].toLowerCase()}`, onCancelar: () => setConfirmando(false), onConfirmar: gravar, mensagem: produto && novoSaldo !== null && (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { children: _jsx("strong", { children: produto.nome }) }), _jsxs("p", { children: [tipo === "ajuste" ? "Novo saldo definido" : `${NOME_TIPO[tipo]} de`, " ", _jsxs("strong", { children: [fmtQtd(quantidade, produto.unidade), " ", produto.unidade] })] }), _jsxs("p", { className: "rounded-lg bg-slate-50 p-2", children: ["Saldo: ", fmtQtd(atual, produto.unidade), " \u2192 ", _jsxs("strong", { children: [fmtQtd(novoSaldo, produto.unidade), " ", produto.unidade] })] }), motivo.trim() && _jsxs("p", { className: "text-slate-500", children: ["Motivo: ", motivo.trim()] })] })) })] }));
}
