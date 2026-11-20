import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { fmtMoeda } from "../lib/format";
import { baixarModeloPlanilha, lerArquivoTexto, lerCsv, validarLinhas } from "../lib/planilha";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { Aviso } from "../components/Ui";
/**
 * Importar planilha (CSV do Excel): cria produtos com código novo e atualiza
 * os que já existem (só as colunas presentes na planilha). O estoque de
 * produto existente não muda por aqui — só pela tela Estoque.
 */
export function ImportarPlanilha({ onFechar, onConcluido }) {
    const avisar = useToast();
    const [arquivo, setArquivo] = useState("");
    const [previa, setPrevia] = useState(null);
    const [ignoradas, setIgnoradas] = useState([]);
    const [erro, setErro] = useState("");
    const [lendo, setLendo] = useState(false);
    const [gravando, setGravando] = useState(null);
    const [resultado, setResultado] = useState(null);
    async function escolher(f) {
        if (!f)
            return;
        setErro("");
        setPrevia(null);
        setResultado(null);
        setLendo(true);
        setArquivo(f.name);
        try {
            const texto = await lerArquivoTexto(f);
            const { linhas, ignoradas, erroGeral } = validarLinhas(lerCsv(texto));
            if (erroGeral) {
                setErro(erroGeral);
                return;
            }
            if (linhas.length > 5000) {
                setErro("A planilha tem mais de 5.000 linhas. Divida em arquivos menores.");
                return;
            }
            const existentes = await buscarTodos("produtos");
            const porCodigo = new Map(existentes.map((p) => [p.codigo, p]));
            const barrasDeOutro = new Map(existentes.filter((p) => p.barras).map((p) => [p.barras, p.codigo]));
            setIgnoradas(ignoradas);
            setPrevia(linhas.map((l) => {
                const atual = porCodigo.get(l.codigo);
                const erros = [...l.erros];
                const barras = String(l.dados.barras ?? "");
                if (barras && barrasDeOutro.has(barras) && barrasDeOutro.get(barras) !== l.codigo)
                    erros.push(`código de barras já usado no produto ${barrasDeOutro.get(barras)}`);
                if (!atual) {
                    if (!l.dados.nome)
                        erros.push("produto novo precisa de “Descrição”");
                    if (l.dados.preco === undefined || l.dados.preco === null)
                        erros.push("produto novo precisa de “Preço de venda”");
                }
                else if ("nome" in l.dados && !l.dados.nome)
                    erros.push("“Descrição” vazia");
                return { ...l, erros, acao: erros.length ? "erro" : atual ? "atualizar" : "criar", id: atual?.id };
            }));
        }
        catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLendo(false);
        }
    }
    async function importar() {
        if (!previa)
            return;
        const criar = previa.filter((p) => p.acao === "criar");
        const atualizar = previa.filter((p) => p.acao === "atualizar");
        const total = criar.length + atualizar.length;
        const falhas = [];
        let criados = 0, atualizados = 0, feito = 0;
        setGravando({ feito: 0, total });
        // Novos: em blocos (com estoque inicial, que gera a entrada no histórico).
        for (let i = 0; i < criar.length; i += 200) {
            const bloco = criar.slice(i, i + 200);
            const linhas = bloco.map((p) => ({
                codigo: p.codigo, barras: p.dados.barras ?? null, nome: p.dados.nome, categoria: p.dados.categoria ?? null,
                unidade: p.dados.unidade ?? "UN", modelo: p.dados.modelo ?? null, fornecedor: p.dados.fornecedor ?? null,
                custo: p.dados.custo ?? 0, preco: p.dados.preco ?? 0, estoque: p.dados.estoque ?? 0,
                estoque_minimo: p.dados.estoque_minimo ?? 0, validade: p.dados.validade ?? null, ativo: p.dados.ativo ?? true,
            }));
            const { error } = await supabase.from("produtos").insert(linhas);
            if (!error)
                criados += bloco.length;
            else {
                // Bloco falhou: tenta um a um para dizer exatamente qual linha tem problema.
                for (let k = 0; k < bloco.length; k++) {
                    const r = await supabase.from("produtos").insert(linhas[k]);
                    if (r.error)
                        falhas.push({ linha: bloco[k].linha, codigo: bloco[k].codigo, motivo: mensagemErro(r.error) });
                    else
                        criados++;
                }
            }
            feito += bloco.length;
            setGravando({ feito, total });
        }
        // Existentes: só as colunas presentes na planilha (estoque nunca).
        const fila = [...atualizar];
        async function trabalhador() {
            for (let p = fila.shift(); p; p = fila.shift()) {
                const campos = {};
                for (const [k, v] of Object.entries(p.dados)) {
                    if (k === "codigo" || k === "estoque")
                        continue;
                    if (v === null || v === "")
                        continue; // célula vazia: mantém o que já está cadastrado
                    campos[k] = v;
                }
                if (Object.keys(campos).length) {
                    const { error } = await supabase.from("produtos").update(campos).eq("id", p.id);
                    if (error)
                        falhas.push({ linha: p.linha, codigo: p.codigo, motivo: mensagemErro(error) });
                    else
                        atualizados++;
                }
                else
                    atualizados++;
                feito++;
                setGravando({ feito, total });
            }
        }
        await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
        setGravando(null);
        setResultado({ criados, atualizados, falhas: falhas.sort((a, b) => a.linha - b.linha) });
        avisar(falhas.length ? "info" : "sucesso", `Importação concluída: ${criados} criado(s), ${atualizados} atualizado(s)${falhas.length ? `, ${falhas.length} com erro` : ""}.`);
        onConcluido();
    }
    const nCriar = previa?.filter((p) => p.acao === "criar").length ?? 0;
    const nAtualizar = previa?.filter((p) => p.acao === "atualizar").length ?? 0;
    const nErro = previa?.filter((p) => p.acao === "erro").length ?? 0;
    return (_jsx(Modal, { aberto: true, titulo: "Importar planilha de produtos", largura: "xl", onFechar: gravando ? () => { } : onFechar, rodape: resultado ? _jsx("button", { className: "btn-primario", onClick: onFechar, children: "Fechar" }) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario mr-auto", onClick: baixarModeloPlanilha, children: "\u2913 Baixar modelo de planilha" }), _jsx("button", { className: "btn-secundario", onClick: onFechar, disabled: Boolean(gravando), children: "Cancelar" }), _jsx("button", { className: "btn-acao", disabled: !previa || nCriar + nAtualizar === 0 || Boolean(gravando), onClick: importar, children: gravando ? `Gravando ${gravando.feito}/${gravando.total}…` : `Importar ${nCriar + nAtualizar} produto(s)` })] })), children: _jsxs("div", { className: "space-y-4 text-sm", children: [!resultado && (_jsxs(_Fragment, { children: [_jsxs(Aviso, { cor: "petroleo", children: ["Use um arquivo ", _jsx("strong", { children: "CSV" }), " (no Excel: Arquivo \u2192 Salvar como \u2192 \u201CCSV (separado por v\u00EDrgulas)\u201D). A primeira linha deve ter os nomes das colunas, como no modelo. ", _jsx("strong", { children: "C\u00F3digo" }), " \u00E9 obrigat\u00F3rio. Produto com c\u00F3digo novo \u00E9 ", _jsx("strong", { children: "criado" }), "; c\u00F3digo que j\u00E1 existe \u00E9 ", _jsx("strong", { children: "atualizado" }), "(s\u00F3 as colunas que estiverem na planilha \u2014 d\u00E1 para atualizar s\u00F3 os pre\u00E7os). ", _jsx("strong", { children: "C\u00E9lula vazia n\u00E3o apaga nada" }), " e o estoque de produto existente ", _jsx("strong", { children: "n\u00E3o muda" }), " por aqui."] }), _jsxs("label", { className: "btn-secundario cursor-pointer", children: [lendo ? "Lendo…" : arquivo ? `Trocar arquivo (${arquivo})` : "Escolher planilha (.csv)", _jsx("input", { type: "file", accept: ".csv,.txt,text/csv", className: "sr-only", onChange: (e) => { void escolher(e.target.files?.[0]); e.target.value = ""; } })] })] })), erro && _jsx(Aviso, { cor: "critico", children: erro }), ignoradas.length > 0 && !resultado && _jsxs("p", { className: "text-xs text-slate-500", children: ["Colunas ignoradas: ", ignoradas.join(", "), "."] }), previa && !resultado && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("span", { className: "rounded-full bg-ok-100 px-3 py-1 font-semibold text-ok-700", children: [nCriar, " para criar"] }), _jsxs("span", { className: "rounded-full bg-petroleo-100 px-3 py-1 font-semibold text-petroleo-700", children: [nAtualizar, " para atualizar"] }), _jsxs("span", { className: `rounded-full px-3 py-1 font-semibold ${nErro ? "bg-critico-100 text-critico-700" : "bg-slate-100 text-slate-500"}`, children: [nErro, " com erro (n\u00E3o ser\u00E3o importados)"] })] }), _jsx("div", { className: "max-h-[45vh] overflow-auto rounded-lg border border-slate-200", children: _jsxs("table", { className: "tabela", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Linha" }), _jsx("th", { children: "C\u00F3digo" }), _jsx("th", { children: "Descri\u00E7\u00E3o" }), _jsx("th", { className: "text-right", children: "Pre\u00E7o" }), _jsx("th", { children: "A\u00E7\u00E3o" }), _jsx("th", { children: "Observa\u00E7\u00E3o" })] }) }), _jsx("tbody", { children: previa.map((p) => (_jsxs("tr", { className: p.acao === "erro" ? "bg-critico-50" : "", children: [_jsx("td", { className: "text-xs text-slate-400", children: p.linha }), _jsx("td", { className: "font-mono text-xs", children: p.codigo || "—" }), _jsx("td", { children: String(p.dados.nome ?? "") || _jsx("span", { className: "text-slate-400", children: "(sem altera\u00E7\u00E3o)" }) }), _jsx("td", { className: "whitespace-nowrap text-right", children: typeof p.dados.preco === "number" ? fmtMoeda(p.dados.preco) : "—" }), _jsx("td", { children: p.acao === "criar" ? _jsx("span", { className: "font-semibold text-ok-700", children: "Criar" }) : p.acao === "atualizar" ? _jsx("span", { className: "font-semibold text-petroleo-700", children: "Atualizar" }) : _jsx("span", { className: "font-semibold text-critico-600", children: "Erro" }) }), _jsx("td", { className: "text-xs text-critico-700", children: p.erros.join("; ") })] }, p.linha))) })] }) })] })), resultado && (_jsxs("div", { className: "space-y-3", children: [_jsxs(Aviso, { cor: resultado.falhas.length ? "atencao" : "ok", children: [_jsx("strong", { children: resultado.criados }), " produto(s) criado(s) e ", _jsx("strong", { children: resultado.atualizados }), " atualizado(s).", resultado.falhas.length > 0 && _jsxs(_Fragment, { children: [" ", _jsx("strong", { children: resultado.falhas.length }), " n\u00E3o foram gravados (veja abaixo)."] })] }), resultado.falhas.length > 0 && (_jsx("ul", { className: "max-h-60 space-y-1 overflow-y-auto text-xs", children: resultado.falhas.map((f) => _jsxs("li", { children: ["Linha ", f.linha, " (c\u00F3digo ", f.codigo, "): ", f.motivo] }, f.linha)) }))] }))] }) }));
}
