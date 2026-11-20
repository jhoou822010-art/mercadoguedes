import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { lerNumero, numParaCampo } from "../lib/format";
import { UNIDADES } from "../lib/types";
import { Modal } from "../components/Modal";
import { Aviso } from "../components/Ui";
import { useToast } from "../components/Toast";
export function ProdutoForm({ produto, categorias, fornecedores, onFechar, onSalvo }) {
    const avisar = useToast();
    const novo = !produto;
    const [c, setC] = useState({
        codigo: produto?.codigo ?? "",
        barras: produto?.barras ?? "",
        nome: produto?.nome ?? "",
        categoria: produto?.categoria ?? "",
        unidade: produto?.unidade ?? "UN",
        modelo: produto?.modelo ?? "",
        fornecedor: produto?.fornecedor ?? "",
        custo: numParaCampo(produto?.custo ?? null),
        preco: numParaCampo(produto?.preco ?? null),
        estoque: numParaCampo(produto?.estoque ?? null),
        estoque_minimo: numParaCampo(produto?.estoque_minimo ?? null),
        validade: produto?.validade ?? "",
        ativo: produto?.ativo ?? true,
    });
    const [erros, setErros] = useState({});
    const [salvando, setSalvando] = useState(false);
    const [erroGeral, setErroGeral] = useState("");
    // Avisos (não impedem salvar): código com letras/símbolos, código de barras fora do padrão.
    const [confirmouAviso, setConfirmouAviso] = useState(false);
    const avisos = avisosDosCodigos(c.codigo, c.barras);
    const muda = (k, v) => {
        setC((x) => ({ ...x, [k]: v }));
        setErros((e) => ({ ...e, [k]: undefined }));
        if (k === "codigo" || k === "barras")
            setConfirmouAviso(false);
    };
    function validar() {
        const e = {};
        if (!c.codigo.trim())
            e.codigo = "Informe o código interno.";
        if (!c.nome.trim())
            e.nome = "Informe a descrição do produto.";
        const num = (k, obrigatorio, rotulo) => {
            if (!c[k].trim()) {
                if (obrigatorio)
                    e[k] = `Informe ${rotulo}.`;
                return;
            }
            const n = lerNumero(c[k]);
            if (Number.isNaN(n))
                e[k] = "Digite apenas números (ex.: 12,50).";
            else if (n < 0)
                e[k] = "O valor não pode ser negativo.";
        };
        num("custo", false, "o custo");
        num("preco", true, "o preço de venda");
        if (novo)
            num("estoque", false, "o estoque");
        num("estoque_minimo", false, "o estoque mínimo");
        if (c.barras.trim() && !/^[\x20-\x7e]+$/.test(c.barras.trim()))
            e.barras = "Use apenas letras e números.";
        setErros(e);
        return Object.keys(e).length === 0;
    }
    async function salvar(ev) {
        ev.preventDefault();
        setErroGeral("");
        if (!validar())
            return;
        // Primeiro clique com aviso: mostra e pede confirmação. Segundo clique: salva assim mesmo.
        if ((avisos.codigo || avisos.barras) && !confirmouAviso) {
            setConfirmouAviso(true);
            setErroGeral("");
            document.getElementById("aviso-codigos")?.scrollIntoView({ block: "nearest" });
            return;
        }
        setSalvando(true);
        const n = (v) => (v.trim() ? lerNumero(v) : 0);
        const texto = (v) => v.trim() || null;
        const dados = {
            codigo: c.codigo.trim(),
            barras: texto(c.barras),
            nome: c.nome.trim(),
            categoria: texto(c.categoria),
            unidade: c.unidade,
            modelo: texto(c.modelo),
            fornecedor: texto(c.fornecedor),
            custo: n(c.custo),
            preco: n(c.preco),
            estoque_minimo: n(c.estoque_minimo),
            validade: c.validade || null,
            ativo: c.ativo,
        };
        const { error } = novo
            ? await supabase.from("produtos").insert({ ...dados, estoque: n(c.estoque) })
            : await supabase.from("produtos").update(dados).eq("id", produto.id);
        setSalvando(false);
        if (error) {
            const msg = mensagemErro(error);
            if (msg.includes("código interno"))
                setErros((e) => ({ ...e, codigo: msg }));
            else if (msg.includes("código de barras"))
                setErros((e) => ({ ...e, barras: msg }));
            setErroGeral(msg);
            return;
        }
        avisar("sucesso", novo ? `Produto “${dados.nome}” cadastrado.` : `Produto “${dados.nome}” atualizado.`);
        onSalvo();
    }
    const Campo = ({ k, rotulo, obrig, tipo = "text", modo, lista, dica }) => (_jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: `f-${k}`, children: [rotulo, " ", obrig && _jsx("span", { className: "text-critico-600", title: "Obrigat\u00F3rio", children: "*" })] }), _jsx("input", { id: `f-${k}`, type: tipo, inputMode: modo, list: lista, className: `campo ${erros[k] ? "campo-erro" : ""}`, value: c[k], onChange: (e) => muda(k, e.target.value), "aria-invalid": Boolean(erros[k]) }), erros[k] ? _jsx("p", { className: "mt-1 text-xs text-critico-600", children: erros[k] })
                : (k === "codigo" || k === "barras") && avisos[k] ? _jsxs("p", { className: "mt-1 text-xs font-semibold text-atencao-700", children: ["\u26A0 ", avisos[k]] })
                    : dica && _jsx("p", { className: "mt-1 text-xs text-slate-400", children: dica })] }));
    return (_jsx(Modal, { aberto: true, largura: "lg", titulo: novo ? "Cadastrar produto" : `Editar produto`, onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, disabled: salvando, children: "Cancelar" }), _jsx("button", { className: "btn-acao", form: "form-produto", disabled: salvando, children: salvando ? "Salvando…" : confirmouAviso ? "Salvar assim mesmo" : novo ? "Cadastrar" : "Salvar alterações" })] }), children: _jsxs("form", { id: "form-produto", onSubmit: salvar, className: "space-y-5", noValidate: true, children: [erroGeral && _jsx(Aviso, { cor: "critico", children: erroGeral }), confirmouAviso && (avisos.codigo || avisos.barras) && (_jsx("div", { id: "aviso-codigos", children: _jsxs(Aviso, { cor: "atencao", children: [_jsx("strong", { children: "Confira o c\u00F3digo antes de salvar." }), avisos.codigo && _jsxs("span", { className: "block", children: ["C\u00F3digo interno: ", avisos.codigo] }), avisos.barras && _jsxs("span", { className: "block", children: ["C\u00F3digo de barras: ", avisos.barras] }), _jsxs("span", { className: "block", children: ["Se estiver errado, corrija o campo. Se estiver certo, clique em ", _jsx("strong", { children: "Salvar assim mesmo" }), "."] })] }) })), _jsxs("p", { className: "text-xs text-slate-500", children: ["Campos com ", _jsx("span", { className: "text-critico-600", children: "*" }), " s\u00E3o obrigat\u00F3rios."] }), _jsxs("fieldset", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx("legend", { className: "mb-2 text-sm font-semibold text-petroleo-700", children: "Identifica\u00E7\u00E3o" }), Campo({ k: "codigo", rotulo: "Código interno", obrig: true }), Campo({ k: "barras", rotulo: "Código de barras", modo: "numeric", dica: "Pode usar o leitor: clique aqui e passe o produto." }), _jsx("div", { className: "sm:col-span-2", children: Campo({ k: "nome", rotulo: "Descrição / nome", obrig: true }) }), Campo({ k: "categoria", rotulo: "Categoria", lista: "lista-categorias" }), Campo({ k: "fornecedor", rotulo: "Fornecedor", lista: "lista-fornecedores" }), _jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "f-unidade", children: ["Unidade de venda ", _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("select", { id: "f-unidade", className: "campo", value: c.unidade, onChange: (e) => muda("unidade", e.target.value), children: UNIDADES.map((u) => _jsx("option", { value: u, children: u }, u)) })] }), Campo({ k: "modelo", rotulo: "Modelo / apresentação", dica: "Ex.: 500 g, pacote com 6, garrafa 2 L" })] }), _jsxs("fieldset", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx("legend", { className: "mb-2 text-sm font-semibold text-petroleo-700", children: "Pre\u00E7os" }), Campo({ k: "custo", rotulo: "Custo (R$)", modo: "decimal" }), Campo({ k: "preco", rotulo: "Preço de venda (R$)", obrig: true, modo: "decimal" })] }), _jsxs("fieldset", { className: "grid gap-4 sm:grid-cols-3", children: [_jsx("legend", { className: "mb-2 text-sm font-semibold text-petroleo-700", children: "Estoque e validade" }), novo
                            ? Campo({ k: "estoque", rotulo: "Estoque inicial", modo: "decimal", dica: "Gera uma entrada no histórico." })
                            : (_jsxs("div", { children: [_jsx("span", { className: "rotulo", children: "Estoque atual" }), _jsxs("p", { className: "campo bg-slate-100 text-slate-500", children: [c.estoque || "0", " ", c.unidade] }), _jsx("p", { className: "mt-1 text-xs text-slate-400", children: "Altere pela tela Estoque." })] })), Campo({ k: "estoque_minimo", rotulo: "Estoque mínimo", modo: "decimal" }), Campo({ k: "validade", rotulo: "Validade", tipo: "date" })] }), _jsxs("label", { className: "flex items-center gap-3 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-5 w-5 accent-petroleo-700", checked: c.ativo, onChange: (e) => muda("ativo", e.target.checked) }), "Produto ativo (desmarque para esconder sem apagar)"] }), _jsx("datalist", { id: "lista-categorias", children: categorias.map((x) => _jsx("option", { value: x }, x)) }), _jsx("datalist", { id: "lista-fornecedores", children: fornecedores.map((x) => _jsx("option", { value: x }, x)) })] }) }));
}
/** Confere os códigos e devolve avisos em português (vazio = tudo certo). */
export function avisosDosCodigos(codigo, barras) {
    const r = {};
    const cod = codigo.trim();
    if (cod && !/^\d+$/.test(cod)) {
        const estranhos = [...new Set(cod.replace(/\d/g, "").split(""))].map((x) => (x === " " ? "espaço" : `“${x}”`)).join(", ");
        r.codigo = `o código interno costuma ter só números, mas este tem ${estranhos}.`;
    }
    const bar = barras.trim();
    if (bar) {
        if (!/^\d+$/.test(bar)) {
            const estranhos = [...new Set(bar.replace(/\d/g, "").split(""))].map((x) => (x === " " ? "espaço" : `“${x}”`)).join(", ");
            r.barras = `o código de barras tem só números, mas este tem ${estranhos}.`;
        }
        else if (![8, 12, 13, 14].includes(bar.length)) {
            r.barras = `o código de barras costuma ter 8 ou 13 números, mas este tem ${bar.length}.`;
        }
        else if (!digitoVerificadorOk(bar)) {
            r.barras = "o último número não confere com os outros. Pode ter sido digitado errado; o melhor é passar o leitor.";
        }
    }
    return r;
}
/** Dígito verificador dos códigos EAN-8, UPC-A (12), EAN-13 e GTIN-14. */
function digitoVerificadorOk(n) {
    const d = n.split("").map(Number);
    const dv = d.pop();
    let soma = 0;
    d.reverse().forEach((x, i) => { soma += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - (soma % 10)) % 10 === dv;
}
