import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { produtoLocal, produtosLocais } from "../lib/local/consultas";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fmtMoeda } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { ProdutoBusca } from "../components/ProdutoBusca";
import { CodigoBarras } from "../components/CodigoBarras";
import { Aviso, Cabecalho, Vazio } from "../components/Ui";
const TAMANHOS = {
    pequena: { rotulo: "Pequena (50 × 30 mm)", largura: "50mm", altura: "30mm", preco: "text-[20px]", nome: "text-[9px]" },
    media: { rotulo: "Média (70 × 40 mm)", largura: "70mm", altura: "40mm", preco: "text-[28px]", nome: "text-[11px]" },
    grande: { rotulo: "Grande (100 × 50 mm)", largura: "100mm", altura: "50mm", preco: "text-[38px]", nome: "text-[13px]" },
};
export default function Etiquetas() {
    const { config } = useAuth();
    const avisar = useToast();
    const [params] = useSearchParams();
    const [itens, setItens] = useState([]);
    const [tamanho, setTamanho] = useState("media");
    const [mostrarBarras, setMostrarBarras] = useState(true);
    useEffect(() => {
        const id = params.get("produto");
        if (!id)
            return;
        void doServidorOuLocal(() => supabase.from("vw_produtos").select("*").eq("id", id).maybeSingle(), () => produtoLocal(Number(id))).then(({ data }) => {
            if (data)
                setItens([{ p: data, copias: 1 }]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    function adicionar(p) {
        setItens((lista) => {
            const existe = lista.find((i) => i.p.id === p.id);
            if (existe)
                return lista.map((i) => (i.p.id === p.id ? { ...i, copias: i.copias + 1 } : i));
            return [...lista, { p, copias: 1 }];
        });
        avisar("info", `“${p.nome}” adicionado às etiquetas.`);
    }
    async function adicionarTodos() {
        const { data } = await doServidorOuLocal(() => supabase.from("vw_produtos").select("*").eq("ativo", true).order("nome").limit(500), async () => (await produtosLocais()).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 500));
        const lista = (data ?? []);
        setItens(lista.map((p) => ({ p, copias: 1 })));
        avisar("info", `${lista.length} produto(s) ativos adicionados.`);
    }
    const totalEtiquetas = itens.reduce((s, i) => s + i.copias, 0);
    const t = TAMANHOS[tamanho];
    const etiquetas = itens.flatMap((i) => Array.from({ length: i.copias }, (_, n) => ({ ...i, chave: `${i.p.id}-${n}` })));
    return (_jsxs("div", { children: [_jsxs("div", { className: "nao-imprimir", children: [_jsx(Cabecalho, { titulo: "Etiquetas de g\u00F4ndola", descricao: "Escolha os produtos, confira a pr\u00E9via e imprima pela janela de impress\u00E3o do navegador.", acoes: _jsxs("button", { className: "btn-acao", disabled: totalEtiquetas === 0, onClick: () => window.print(), children: ["\uD83D\uDDA8 Imprimir ", totalEtiquetas > 0 && `(${totalEtiquetas})`] }) }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsxs("div", { className: "cartao space-y-4 p-5", children: [_jsxs("div", { children: [_jsx("span", { className: "rotulo", children: "Adicionar produto" }), _jsx(ProdutoBusca, { onSelecionar: adicionar }), _jsx("button", { className: "mt-2 text-xs font-semibold text-petroleo-700 hover:underline", onClick: adicionarTodos, children: "Adicionar todos os produtos ativos" })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "tam", children: "Tamanho" }), _jsx("select", { id: "tam", className: "campo", value: tamanho, onChange: (e) => setTamanho(e.target.value), children: Object.keys(TAMANHOS).map((k) => _jsx("option", { value: k, children: TAMANHOS[k].rotulo }, k)) })] }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-petroleo-700", checked: mostrarBarras, onChange: (e) => setMostrarBarras(e.target.checked) }), "Mostrar c\u00F3digo de barras (quando houver)"] }), _jsxs(Aviso, { cor: "petroleo", children: ["Na janela de impress\u00E3o, escolha a impressora, ajuste a ", _jsx("strong", { children: "margem" }), " se precisar e deixe a escala em ", _jsx("strong", { children: "100%" }), ". Para impressora de etiquetas, selecione o tamanho do papel dela."] })] }), _jsxs("div", { className: "cartao lg:col-span-2", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "Selecionados" }), itens.length > 0 && _jsx("button", { className: "text-xs font-semibold text-critico-600 hover:underline", onClick: () => setItens([]), children: "Limpar lista" })] }), itens.length === 0 ? _jsx(Vazio, { titulo: "Nenhum produto selecionado.", children: "Use a busca ao lado ou o leitor de c\u00F3digo de barras." }) : (_jsx("ul", { className: "max-h-72 divide-y divide-slate-100 overflow-y-auto", children: itens.map((i) => (_jsxs("li", { className: "flex items-center justify-between gap-3 px-4 py-2 text-sm", children: [_jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate font-medium", children: i.p.nome }), _jsxs("span", { className: "text-xs text-slate-400", children: [fmtMoeda(i.p.preco), " / ", i.p.unidade] })] }), _jsxs("span", { className: "flex shrink-0 items-center gap-2", children: [_jsx("label", { className: "sr-only", htmlFor: `c-${i.p.id}`, children: "C\u00F3pias" }), _jsx("input", { id: `c-${i.p.id}`, type: "number", min: 1, max: 100, className: "campo w-20 py-1", value: i.copias, onChange: (e) => {
                                                                const n = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                                                setItens((l) => l.map((x) => (x.p.id === i.p.id ? { ...x, copias: n } : x)));
                                                            } }), _jsx("button", { className: "rounded p-1 text-slate-400 hover:bg-critico-50 hover:text-critico-600", onClick: () => setItens((l) => l.filter((x) => x.p.id !== i.p.id)), "aria-label": `Remover ${i.p.nome}`, children: "\u2715" })] })] }, i.p.id))) }))] })] }), etiquetas.length > 0 && _jsx("h2", { className: "mb-3 mt-8 font-semibold", children: "Pr\u00E9via da impress\u00E3o" })] }), _jsx("div", { className: "area-impressao flex flex-wrap gap-[3mm]", children: etiquetas.map(({ p, chave }) => (_jsxs("div", { className: "etiqueta flex flex-col overflow-hidden rounded-[2mm] border border-slate-400 bg-white text-black", style: { width: t.largura, height: t.altura }, children: [_jsx("div", { className: "flex items-center justify-between bg-petroleo-700 px-[2mm] py-[0.6mm] text-[7px] font-semibold uppercase tracking-wide text-white", style: { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }, children: _jsx("span", { className: "truncate", children: config?.nome_loja ?? "Gerenciador de Mercado" }) }), _jsxs("div", { className: "flex flex-1 flex-col justify-between px-[2mm] py-[1mm]", children: [_jsxs("p", { className: `${t.nome} line-clamp-2 font-semibold uppercase leading-tight`, children: [p.nome, p.modelo ? ` ${p.modelo}` : ""] }), _jsxs("div", { className: "flex items-end justify-between gap-1", children: [_jsxs("p", { className: `${t.preco} font-extrabold leading-none`, children: [fmtMoeda(p.preco), _jsxs("span", { className: "ml-0.5 text-[9px] font-semibold", children: ["/", p.unidade] })] }), _jsxs("p", { className: "text-[7px] text-slate-600", children: ["C\u00F3d. ", p.codigo] })] }), mostrarBarras && p.barras && (_jsx("div", { className: "mt-[0.5mm] h-[9mm]", children: _jsx(CodigoBarras, { valor: p.barras, altura: 28 }) }))] })] }, chave))) })] }));
}
