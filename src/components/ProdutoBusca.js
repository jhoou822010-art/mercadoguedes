import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { buscarProdutosLocal } from "../lib/local/consultas";
import { supabase } from "../lib/supabase";
import { termoBusca } from "../lib/data";
import { fmtMoeda, fmtQtd } from "../lib/format";
/**
 * Campo de busca de produto. Funciona com leitor de código de barras USB:
 * o leitor "digita" o código e envia Enter; se houver um produto com aquele
 * código interno ou de barras, ele é selecionado na hora.
 */
export function ProdutoBusca({ onSelecionar, placeholder = "Nome, código ou código de barras", autoFocus, somenteAtivos = true, campoRef }) {
    const [texto, setTexto] = useState("");
    const [resultados, setResultados] = useState([]);
    const [aberto, setAberto] = useState(false);
    const [destaque, setDestaque] = useState(0);
    const [buscando, setBuscando] = useState(false);
    const [semResultado, setSemResultado] = useState(false);
    const campoInterno = useRef(null);
    const campo = campoRef ?? campoInterno;
    const seq = useRef(0);
    async function buscar(t) {
        const termo = termoBusca(t);
        if (!termo) {
            setResultados([]);
            return [];
        }
        const minha = ++seq.current;
        setBuscando(true);
        const { data } = await doServidorOuLocal(() => {
            let q = supabase
                .from("vw_produtos")
                .select("*")
                .or(`nome.ilike.*${termo}*,codigo.ilike.*${termo}*,barras.ilike.*${termo}*`)
                .order("nome")
                .limit(12);
            if (somenteAtivos)
                q = q.eq("ativo", true);
            return q;
        }, () => buscarProdutosLocal(t, somenteAtivos), { espera: 4000 });
        if (minha !== seq.current)
            return [];
        const lista = (data ?? []);
        setResultados(lista);
        setDestaque(0);
        setBuscando(false);
        setSemResultado(lista.length === 0);
        return lista;
    }
    useEffect(() => {
        if (!texto.trim()) {
            setResultados([]);
            setSemResultado(false);
            return;
        }
        const t = setTimeout(() => void buscar(texto), 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [texto]);
    function escolher(p) {
        onSelecionar(p);
        setTexto("");
        setResultados([]);
        setAberto(false);
        setSemResultado(false);
    }
    async function aoTeclar(e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setDestaque((d) => Math.min(d + 1, resultados.length - 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setDestaque((d) => Math.max(d - 1, 0));
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            const t = texto.trim();
            if (!t)
                return;
            // Leitor de código de barras: procura correspondência exata primeiro.
            const lista = await buscar(t);
            const exato = lista.find((p) => p.barras === t || p.codigo.toLowerCase() === t.toLowerCase());
            if (exato)
                escolher(exato);
            else if (lista.length === 1)
                escolher(lista[0]);
            else if (resultados[destaque] && lista.some((p) => p.id === resultados[destaque].id))
                escolher(resultados[destaque]);
            else
                setAberto(true);
        }
        else if (e.key === "Escape") {
            setAberto(false);
        }
    }
    return (_jsxs("div", { className: "relative", children: [_jsxs("div", { className: "relative", children: [_jsx("span", { className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", children: "\u2315" }), _jsx("input", { ref: campo, className: "campo pl-9", value: texto, placeholder: placeholder, autoFocus: autoFocus, onChange: (e) => {
                            setTexto(e.target.value);
                            setAberto(true);
                        }, onFocus: () => setAberto(true), onBlur: () => setTimeout(() => setAberto(false), 150), onKeyDown: aoTeclar, "aria-label": "Buscar produto", autoComplete: "off" })] }), aberto && texto.trim() && (_jsxs("div", { className: "absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg", children: [buscando && resultados.length === 0 && _jsx("p", { className: "px-3 py-2 text-sm text-slate-500", children: "Buscando\u2026" }), semResultado && !buscando && _jsxs("p", { className: "px-3 py-2 text-sm text-slate-500", children: ["Nenhum produto encontrado para \u201C", texto, "\u201D."] }), resultados.map((p, i) => (_jsxs("button", { type: "button", onMouseDown: (e) => e.preventDefault(), onClick: () => escolher(p), className: `flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === destaque ? "bg-petroleo-50" : "hover:bg-slate-50"}`, children: [_jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate font-medium text-slate-800", children: p.nome }), _jsxs("span", { className: "block text-xs text-slate-500", children: ["C\u00F3d. ", p.codigo, p.barras ? ` · ${p.barras}` : ""] })] }), _jsxs("span", { className: "shrink-0 text-right text-xs text-slate-500", children: [_jsx("span", { className: "block font-semibold text-slate-700", children: fmtMoeda(p.preco) }), "Estoque: ", fmtQtd(p.estoque, p.unidade), " ", p.unidade] })] }, p.id)))] }))] }));
}
