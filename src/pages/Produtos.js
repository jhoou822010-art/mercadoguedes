import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { categoriasEFornecedoresLocal, listarProdutosLocal, movimentacoesLocal, porCodigo } from "../lib/local/consultas";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { buscarTodos, termoBusca } from "../lib/data";
import { exportarProdutosCsv } from "../lib/planilha";
import { ImportarPlanilha } from "./ImportarPlanilha";
import { fmtData, fmtDataHora, fmtMoeda, fmtQtd } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar, Modal } from "../components/Modal";
import { Aviso, Cabecalho, Carregando, Selo, SeloEstoque, SeloTipo, SeloValidade, Vazio } from "../components/Ui";
import { ProdutoForm } from "./ProdutoForm";
const POR_PAGINA = 50;
const CHAVE_ORDEM = "lojafacil.produtos.ordem";
function ordemSalva() {
    try {
        return localStorage.getItem(CHAVE_ORDEM) === "nome" ? "nome" : "codigo";
    }
    catch {
        return "codigo";
    }
}
export default function Produtos() {
    const { ehAdmin } = useAuth();
    const avisar = useToast();
    const [params, setParams] = useSearchParams();
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [situacao, setSituacao] = useState("ativos");
    const [categoria, setCategoria] = useState("");
    const [alerta, setAlerta] = useState(params.get("alerta") ?? "");
    const [pagina, setPagina] = useState(0);
    const [ordem, setOrdem] = useState(ordemSalva);
    const [lista, setLista] = useState(null);
    const [total, setTotal] = useState(0);
    const [erro, setErro] = useState("");
    const [categorias, setCategorias] = useState([]);
    const [fornecedores, setFornecedores] = useState([]);
    const [editando, setEditando] = useState(params.get("novo") ? "novo" : null);
    const [importando, setImportando] = useState(false);
    const navegar = useNavigate();
    async function exportarTodos() {
        try {
            const todos = await buscarTodos("vw_produtos", { coluna: "nome" });
            exportarProdutosCsv(todos);
            avisar("sucesso", `${todos.length} produto(s) exportado(s). Abra o arquivo no Excel.`);
        }
        catch (e) {
            avisar("erro", mensagemErro(e));
        }
    }
    const [detalhe, setDetalhe] = useState(null);
    const [removendo, setRemovendo] = useState(null);
    const [processando, setProcessando] = useState(false);
    // Aplica a busca 300 ms depois de parar de digitar.
    useEffect(() => {
        const t = setTimeout(() => { setBuscaAplicada(busca); setPagina(0); }, 300);
        return () => clearTimeout(t);
    }, [busca]);
    const totalLocal = useRef(0);
    const carregarListas = useCallback(async () => {
        const { data } = await doServidorOuLocal(async () => {
            const r = await supabase.from("produtos").select("categoria, fornecedor").limit(5000);
            const unicos = (k) => [...new Set((r.data ?? []).map((d) => d[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
            return { data: r.error ? null : { categorias: unicos("categoria"), fornecedores: unicos("fornecedor") }, error: r.error };
        }, categoriasEFornecedoresLocal);
        setCategorias(data?.categorias ?? []);
        setFornecedores(data?.fornecedores ?? []);
    }, []);
    const carregar = useCallback(async () => {
        setErro("");
        const t = termoBusca(buscaAplicada);
        const { data, error, count } = await doServidorOuLocal(async () => {
            const montar = (colunaOrdem) => {
                let q = supabase.from("vw_produtos").select("*", { count: "exact" });
                if (situacao !== "todos")
                    q = q.eq("ativo", situacao === "ativos");
                if (categoria)
                    q = q.eq("categoria", categoria);
                if (alerta === "minimo")
                    q = q.eq("abaixo_minimo", true);
                if (alerta === "validade")
                    q = q.in("situacao_validade", ["vencido", "critico", "proximo"]);
                if (alerta === "vencidos")
                    q = q.eq("situacao_validade", "vencido");
                if (t)
                    q = q.or(`nome.ilike.*${t}*,codigo.ilike.*${t}*,barras.ilike.*${t}*,categoria.ilike.*${t}*,fornecedor.ilike.*${t}*`);
                q = alerta === "validade" || alerta === "vencidos" ? q.order("validade") : q.order(colunaOrdem).order("nome");
                return q.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
            };
            if (ordem === "nome")
                return montar("nome");
            // "codigo_ordem" (SQL 0011) ordena 1, 2, 10, 100. Sem o SQL, usa o código como texto
            // e arruma a ordem dentro da página.
            const r = await montar("codigo_ordem");
            if (!r.error || !JSON.stringify(r.error).includes("codigo_ordem"))
                return r;
            const r2 = await montar("codigo");
            return { ...r2, data: r2.data ? [...r2.data].sort(porCodigo) : r2.data };
        }, async () => {
            const r = await listarProdutosLocal({ situacao, categoria, alerta: alerta ?? "", busca: buscaAplicada, pagina, porPagina: POR_PAGINA, ordem });
            totalLocal.current = r.total;
            return r.lista;
        }, { contar: () => totalLocal.current });
        if (error) {
            setErro(mensagemErro(error));
            setLista([]);
            return;
        }
        setLista(data);
        setTotal(count ?? 0);
    }, [situacao, categoria, alerta, buscaAplicada, pagina, ordem]);
    useEffect(() => { void carregar(); }, [carregar]);
    useEffect(() => { void carregarListas(); }, [carregarListas]);
    function trocarAlerta(a) {
        setAlerta(a);
        setPagina(0);
        const p = new URLSearchParams(params);
        if (a)
            p.set("alerta", a);
        else
            p.delete("alerta");
        setParams(p, { replace: true });
    }
    function fecharForm() {
        setEditando(null);
        if (params.get("novo")) {
            const p = new URLSearchParams(params);
            p.delete("novo");
            setParams(p, { replace: true });
        }
    }
    async function remover() {
        if (!removendo)
            return;
        setProcessando(true);
        const { error } = await supabase.from("produtos").delete().eq("id", removendo.id);
        setProcessando(false);
        if (error)
            return avisar("erro", mensagemErro(error));
        avisar("sucesso", `Produto “${removendo.nome}” removido.`);
        setRemovendo(null);
        setDetalhe(null);
        void carregar();
    }
    const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const filtrosAtivos = Boolean(buscaAplicada || categoria || alerta || situacao !== "ativos");
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: "Produtos", descricao: "Pesquise por nome, c\u00F3digo, c\u00F3digo de barras, categoria ou fornecedor.", acoes: _jsxs(_Fragment, { children: [ehAdmin && _jsx("button", { className: "btn-secundario", onClick: () => setImportando(true), children: "\u2912 Importar planilha" }), _jsx("button", { className: "btn-secundario", onClick: exportarTodos, children: "\u2913 Exportar planilha" }), _jsx("button", { className: "btn-secundario", onClick: () => navegar("/relatorios?r=produtos&imprimir=1"), children: "\uD83D\uDDA8 Imprimir lista" }), ehAdmin && _jsx("button", { className: "btn-acao", onClick: () => setEditando("novo"), children: "+ Cadastrar produto" })] }) }), _jsxs("div", { className: "cartao mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6", children: [_jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "rotulo", htmlFor: "busca", children: "Pesquisar" }), _jsx("input", { id: "busca", className: "campo", placeholder: "Digite ou passe o leitor\u2026", value: busca, onChange: (e) => setBusca(e.target.value), autoComplete: "off" })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "f-cat", children: "Categoria" }), _jsxs("select", { id: "f-cat", className: "campo", value: categoria, onChange: (e) => { setCategoria(e.target.value); setPagina(0); }, children: [_jsx("option", { value: "", children: "Todas" }), categorias.map((x) => _jsx("option", { children: x }, x))] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "f-alerta", children: "Alertas" }), _jsxs("select", { id: "f-alerta", className: "campo", value: alerta, onChange: (e) => trocarAlerta(e.target.value), children: [_jsx("option", { value: "", children: "Sem filtro" }), _jsx("option", { value: "minimo", children: "Abaixo do m\u00EDnimo" }), _jsx("option", { value: "validade", children: "Validade pr\u00F3xima ou vencida" }), _jsx("option", { value: "vencidos", children: "Somente vencidos" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "f-sit", children: "Situa\u00E7\u00E3o" }), _jsxs("select", { id: "f-sit", className: "campo", value: situacao, onChange: (e) => { setSituacao(e.target.value); setPagina(0); }, children: [_jsx("option", { value: "ativos", children: "Ativos" }), _jsx("option", { value: "inativos", children: "Inativos" }), _jsx("option", { value: "todos", children: "Todos" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "f-ordem", children: "Ordenar por" }), _jsxs("select", { id: "f-ordem", className: "campo", value: ordem, onChange: (e) => {
                                    const o = e.target.value;
                                    setOrdem(o);
                                    setPagina(0);
                                    try {
                                        localStorage.setItem(CHAVE_ORDEM, o);
                                    }
                                    catch { /* sem armazenamento: vale só agora */ }
                                }, children: [_jsx("option", { value: "codigo", children: "C\u00F3digo (1, 2, 3\u2026)" }), _jsx("option", { value: "nome", children: "Nome (A a Z)" })] })] })] }), erro && _jsx("div", { className: "mb-4", children: _jsx(Aviso, { cor: "critico", children: erro }) }), _jsxs("div", { className: "mb-2 flex items-center justify-between text-sm text-slate-500", children: [_jsx("span", { children: lista ? `${total} produto(s) encontrado(s)` : "" }), filtrosAtivos && (_jsx("button", { className: "font-semibold text-petroleo-700 hover:underline", onClick: () => { setBusca(""); setCategoria(""); trocarAlerta(""); setSituacao("ativos"); }, children: "Limpar filtros" }))] }), _jsx("div", { className: "cartao overflow-hidden", children: !lista ? _jsx(Carregando, {}) : lista.length === 0 ? (_jsx(Vazio, { titulo: filtrosAtivos ? "Nenhum produto com esses filtros." : "Nenhum produto cadastrado ainda.", children: ehAdmin && !filtrosAtivos && _jsx("button", { className: "btn-acao mt-2", onClick: () => setEditando("novo"), children: "Cadastrar o primeiro produto" }) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "hidden overflow-x-auto md:block", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "C\u00F3digo" }), _jsx("th", { children: "Produto" }), _jsx("th", { children: "Categoria" }), _jsx("th", { className: "text-right", children: "Pre\u00E7o" }), _jsx("th", { className: "text-right", children: "Estoque" }), _jsx("th", { children: "Validade" }), _jsx("th", { className: "text-right", children: "A\u00E7\u00F5es" })] }) }), _jsx("tbody", { children: lista.map((p) => (_jsxs("tr", { className: !p.ativo ? "opacity-60" : "", children: [_jsx("td", { className: "whitespace-nowrap font-mono text-xs text-slate-500", children: p.codigo }), _jsxs("td", { children: [_jsx("button", { className: "text-left font-medium text-slate-800 hover:text-petroleo-700 hover:underline", onClick: () => setDetalhe(p), children: p.nome }), _jsxs("div", { className: "text-xs text-slate-400", children: [[p.modelo, p.fornecedor].filter(Boolean).join(" · "), !p.ativo && " · inativo"] })] }), _jsx("td", { className: "text-slate-500", children: p.categoria ?? "—" }), _jsx("td", { className: "whitespace-nowrap text-right font-semibold", children: fmtMoeda(p.preco) }), _jsxs("td", { className: "whitespace-nowrap text-right", children: [_jsx("span", { className: p.abaixo_minimo || Number(p.estoque) === 0 ? "font-semibold text-atencao-700" : "", children: fmtQtd(p.estoque, p.unidade) }), _jsxs("span", { className: "text-xs text-slate-400", children: [" ", p.unidade] })] }), _jsx("td", { children: p.validade ? _jsxs("div", { className: "flex flex-col items-start gap-0.5", children: [_jsx("span", { className: "text-xs", children: fmtData(p.validade) }), p.situacao_validade !== "ok" && _jsx(SeloValidade, { p: p })] }) : _jsx("span", { className: "text-slate-300", children: "\u2014" }) }), _jsx("td", { className: "whitespace-nowrap text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => setDetalhe(p), children: "Ver" }), _jsx(Link, { className: "btn-secundario btn-pequeno", to: `/estoque?produto=${p.id}`, children: "Movimentar" }), ehAdmin && _jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => setEditando(p), children: "Editar" })] }) })] }, p.id))) })] }) }), _jsx("ul", { className: "divide-y divide-slate-100 md:hidden", children: lista.map((p) => (_jsx("li", { className: `p-4 ${!p.ativo ? "opacity-60" : ""}`, children: _jsxs("button", { className: "w-full text-left", onClick: () => setDetalhe(p), children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-medium text-slate-800", children: p.nome }), _jsxs("p", { className: "text-xs text-slate-400", children: ["C\u00F3d. ", p.codigo, p.categoria ? ` · ${p.categoria}` : ""] })] }), _jsx("p", { className: "shrink-0 font-semibold", children: fmtMoeda(p.preco) })] }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-2 text-xs", children: [_jsxs("span", { children: ["Estoque: ", _jsxs("strong", { children: [fmtQtd(p.estoque, p.unidade), " ", p.unidade] })] }), (p.abaixo_minimo || Number(p.estoque) === 0) && _jsx(SeloEstoque, { p: p }), ["vencido", "critico", "proximo"].includes(p.situacao_validade) && _jsx(SeloValidade, { p: p }), !p.ativo && _jsx(Selo, { children: "Inativo" })] })] }) }, p.id))) })] })) }), totalPaginas > 1 && (_jsxs("div", { className: "mt-4 flex items-center justify-center gap-3 text-sm", children: [_jsx("button", { className: "btn-secundario btn-pequeno", disabled: pagina === 0, onClick: () => setPagina(pagina - 1), children: "\u2190 Anterior" }), _jsxs("span", { children: ["P\u00E1gina ", pagina + 1, " de ", totalPaginas] }), _jsx("button", { className: "btn-secundario btn-pequeno", disabled: pagina + 1 >= totalPaginas, onClick: () => setPagina(pagina + 1), children: "Pr\u00F3xima \u2192" })] })), editando && (_jsx(ProdutoForm, { produto: editando === "novo" ? null : editando, categorias: categorias, fornecedores: fornecedores, onFechar: fecharForm, onSalvo: () => { fecharForm(); setDetalhe(null); void carregar(); void carregarListas(); } })), detalhe && (_jsx(DetalheProduto, { p: detalhe, ehAdmin: ehAdmin, onFechar: () => setDetalhe(null), onEditar: () => { setEditando(detalhe); setDetalhe(null); }, onRemover: () => setRemovendo(detalhe) })), importando && _jsx(ImportarPlanilha, { onFechar: () => setImportando(false), onConcluido: () => { void carregar(); void carregarListas(); } }), _jsx(Confirmar, { aberto: Boolean(removendo), titulo: "Remover produto?", perigo: true, processando: processando, textoConfirmar: "Sim, remover", onCancelar: () => setRemovendo(null), onConfirmar: remover, mensagem: _jsxs(_Fragment, { children: [_jsxs("p", { children: ["Voc\u00EA vai remover ", _jsx("strong", { children: removendo?.nome }), " (c\u00F3d. ", removendo?.codigo, ") do cadastro."] }), _jsxs("p", { className: "mt-2", children: ["S\u00F3 d\u00E1 para remover produto que ", _jsx("strong", { children: "nunca foi vendido nem movimentado" }), " (ex.: cadastrado por engano). Produto com hist\u00F3rico \u00E9 protegido: nesse caso, edite e desmarque \u201CProduto ativo\u201D para tir\u00E1-lo da lista."] })] }) })] }));
}
function DetalheProduto({ p, ehAdmin, onFechar, onEditar, onRemover }) {
    const [movs, setMovs] = useState(null);
    useEffect(() => {
        void doServidorOuLocal(() => supabase.from("movimentacoes").select("*").eq("produto_id", p.id).order("criado_em", { ascending: false }).limit(20), async () => (await movimentacoesLocal({ produtoId: p.id, limite: 20 })).lista).then(({ data }) => setMovs(data ?? []));
    }, [p.id]);
    const linha = (rotulo, valor) => (_jsxs("div", { className: "flex justify-between gap-4 border-b border-slate-100 py-2 text-sm", children: [_jsx("dt", { className: "text-slate-500", children: rotulo }), _jsx("dd", { className: "text-right font-medium text-slate-800", children: valor })] }));
    return (_jsxs(Modal, { aberto: true, largura: "lg", titulo: p.nome, onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [ehAdmin && _jsx("button", { className: "btn-perigo mr-auto", onClick: onRemover, children: "Remover" }), _jsx(Link, { className: "btn-secundario", to: `/etiquetas?produto=${p.id}`, children: "\uD83C\uDFF7 Etiqueta" }), _jsx(Link, { className: "btn-primario", to: `/estoque?produto=${p.id}`, children: "\u21C5 Movimentar" }), ehAdmin && _jsx("button", { className: "btn-acao", onClick: onEditar, children: "Editar" })] }), children: [_jsxs("div", { className: "mb-4 flex flex-wrap gap-2", children: [p.ativo ? _jsx(Selo, { cor: "ok", children: "Ativo" }) : _jsx(Selo, { children: "Inativo" }), _jsx(SeloEstoque, { p: p }), _jsx(SeloValidade, { p: p })] }), _jsxs("div", { className: "grid gap-x-8 sm:grid-cols-2", children: [_jsxs("dl", { children: [linha("Código interno", _jsx("span", { className: "font-mono", children: p.codigo })), linha("Código de barras", p.barras ? _jsx("span", { className: "font-mono", children: p.barras }) : "—"), linha("Categoria", p.categoria ?? "—"), linha("Unidade", p.unidade), linha("Modelo / apresentação", p.modelo ?? "—"), linha("Fornecedor", p.fornecedor ?? "—")] }), _jsxs("dl", { children: [linha("Custo", fmtMoeda(p.custo)), linha("Preço de venda", fmtMoeda(p.preco)), linha("Estoque atual", `${fmtQtd(p.estoque, p.unidade)} ${p.unidade}`), linha("Estoque mínimo", `${fmtQtd(p.estoque_minimo, p.unidade)} ${p.unidade}`), linha("Valor em estoque (custo)", fmtMoeda(p.valor_estoque)), linha("Validade", fmtData(p.validade))] })] }), _jsxs("p", { className: "mt-3 text-xs text-slate-400", children: ["Criado em ", fmtDataHora(p.criado_em), " \u00B7 atualizado em ", fmtDataHora(p.atualizado_em)] }), _jsx("h3", { className: "mb-2 mt-6 font-semibold", children: "\u00DAltimas movimenta\u00E7\u00F5es" }), !movs ? _jsx(Carregando, {}) : movs.length === 0 ? _jsx("p", { className: "text-sm text-slate-500", children: "Nenhuma movimenta\u00E7\u00E3o." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Tipo" }), _jsx("th", { className: "text-right", children: "Qtd." }), _jsx("th", { className: "text-right", children: "Saldo" }), _jsx("th", { children: "Motivo" })] }) }), _jsx("tbody", { children: movs.map((m) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap text-xs text-slate-500", children: fmtDataHora(m.criado_em) }), _jsx("td", { children: _jsx(SeloTipo, { tipo: m.tipo }) }), _jsx("td", { className: "text-right", children: fmtQtd(m.quantidade, p.unidade) }), _jsx("td", { className: "text-right font-semibold", children: fmtQtd(m.saldo_apos, p.unidade) }), _jsx("td", { className: "text-xs text-slate-500", children: m.observacao ?? "—" })] }, m.id))) })] }) }))] }));
}
