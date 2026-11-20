import { baixarCsv, hojeArquivo } from "./csv";
import { fmtData, lerNumero, NOME_VALIDADE } from "./format";
import { UNIDADES } from "./types";
/* =====================================================================
   Planilha de produtos (CSV): exportar, modelo e leitura para importar.
   As colunas da exportação são as mesmas aceitas na importação.
   ===================================================================== */
export const COLUNAS_EXPORTACAO = [
    "Código", "Código de barras", "Descrição", "Categoria", "Unidade", "Modelo", "Fornecedor", "Custo", "Preço de venda",
    "Estoque", "Estoque mínimo", "Valor em estoque", "Validade", "Situação da validade", "Ativo",
];
export function exportarProdutosCsv(lista, nome = `loja-facil-produtos-${hojeArquivo()}.csv`) {
    baixarCsv(nome, COLUNAS_EXPORTACAO, lista.map((p) => [
        p.codigo, p.barras, p.nome, p.categoria, p.unidade, p.modelo, p.fornecedor, Number(p.custo), Number(p.preco),
        Number(p.estoque), Number(p.estoque_minimo), Number(p.valor_estoque), fmtData(p.validade), NOME_VALIDADE[p.situacao_validade], p.ativo ? "Sim" : "Não",
    ]));
}
export function baixarModeloPlanilha() {
    baixarCsv("modelo-planilha-produtos.csv", ["Código", "Código de barras", "Descrição", "Categoria", "Unidade", "Modelo", "Fornecedor", "Custo", "Preço de venda", "Estoque", "Estoque mínimo", "Validade", "Ativo"], [
        ["001", "7891000100103", "Arroz Tipo 1", "Mercearia", "UN", "5 kg", "Distribuidora Sul", 20, 27.9, 30, 10, "", "Sim"],
        ["002", "", "Banana Prata", "Hortifruti", "KG", "", "", 3, 5.99, 12.5, 5, "", "Sim"],
    ]);
}
/** Lê o arquivo escolhido. O Excel em português costuma salvar CSV em "ANSI" (windows-1252). */
export async function lerArquivoTexto(arquivo) {
    const bytes = await arquivo.arrayBuffer();
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    if (!utf8.includes("�"))
        return utf8.replace(/^﻿/, "");
    return new TextDecoder("windows-1252").decode(bytes);
}
/** Divide um CSV em linhas/colunas. Aceita separador ";" "," ou TAB e campos entre aspas. */
export function lerCsv(texto) {
    const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
    const contar = (c) => primeira.split(c).length - 1;
    const sep = [";", "\t", ","].sort((a, b) => contar(b) - contar(a))[0];
    const linhas = [];
    let campo = "", linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '"' && texto[i + 1] === '"') {
                campo += '"';
                i++;
            }
            else if (c === '"')
                aspas = false;
            else
                campo += c;
        }
        else if (c === '"')
            aspas = true;
        else if (c === sep) {
            linha.push(campo);
            campo = "";
        }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && texto[i + 1] === "\n")
                i++;
            linha.push(campo);
            campo = "";
            if (linha.some((x) => x.trim() !== ""))
                linhas.push(linha);
            linha = [];
        }
        else
            campo += c;
    }
    linha.push(campo);
    if (linha.some((x) => x.trim() !== ""))
        linhas.push(linha);
    return linhas;
}
const sem = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Nome da coluna na planilha → campo do produto. */
const CABECALHOS = {
    codigo: "codigo", codigointerno: "codigo", cod: "codigo",
    codigodebarras: "barras", barras: "barras", ean: "barras", gtin: "barras",
    descricao: "nome", nome: "nome", produto: "nome",
    categoria: "categoria", unidade: "unidade", un: "unidade", modelo: "modelo", apresentacao: "modelo",
    fornecedor: "fornecedor", custo: "custo", precodecusto: "custo",
    precodevenda: "preco", preco: "preco", venda: "preco", valor: "preco",
    estoque: "estoque", estoqueatual: "estoque", quantidade: "estoque",
    estoqueminimo: "estoque_minimo", minimo: "estoque_minimo",
    validade: "validade", ativo: "ativo", situacao: "ativo",
};
export function mapearCabecalho(cabecalho) {
    const usados = new Set();
    const ignoradas = [];
    const mapa = cabecalho.map((h) => {
        const campo = CABECALHOS[sem(h)];
        if (!campo || usados.has(campo)) {
            if (h.trim())
                ignoradas.push(h.trim());
            return null;
        }
        usados.add(campo);
        return campo;
    });
    return { mapa, ignoradas };
}
function lerData(t) {
    const v = t.trim();
    if (!v)
        return null;
    let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        const a = m[3].length === 2 ? `20${m[3]}` : m[3];
        const iso = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
    }
    m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}
/** Converte as linhas da planilha em produtos validados (sem gravar nada). */
export function validarLinhas(tabela) {
    if (tabela.length < 2)
        return { linhas: [], ignoradas: [], erroGeral: "A planilha está vazia ou só tem o cabeçalho." };
    const { mapa, ignoradas } = mapearCabecalho(tabela[0]);
    if (!mapa.includes("codigo"))
        return { linhas: [], ignoradas, erroGeral: "Não encontrei a coluna “Código”. Baixe o modelo de planilha e use os mesmos nomes de coluna." };
    const vistosCodigo = new Map();
    const vistosBarras = new Map();
    const linhas = tabela.slice(1).map((cols, i) => {
        const nLinha = i + 2;
        const erros = [];
        const dados = {};
        mapa.forEach((campo, idx) => {
            if (!campo)
                return;
            const bruto = (cols[idx] ?? "").trim();
            switch (campo) {
                case "custo":
                case "preco":
                case "estoque":
                case "estoque_minimo": {
                    if (!bruto) {
                        dados[campo] = null;
                        break;
                    }
                    const n = lerNumero(bruto.replace(/^R\$\s*/i, ""));
                    if (Number.isNaN(n))
                        erros.push(`valor inválido em “${campo === "preco" ? "Preço de venda" : campo}”: ${bruto}`);
                    else if (n < 0)
                        erros.push(`valor negativo em “${campo}”`);
                    else
                        dados[campo] = n;
                    break;
                }
                case "unidade": {
                    if (!bruto) {
                        dados.unidade = null;
                        break;
                    }
                    const u = bruto.toUpperCase();
                    if (!UNIDADES.includes(u))
                        erros.push(`unidade “${bruto}” inválida (use ${UNIDADES.join(", ")})`);
                    else
                        dados.unidade = u;
                    break;
                }
                case "validade": {
                    const d = lerData(bruto);
                    if (d === undefined)
                        erros.push(`data de validade inválida: ${bruto} (use dd/mm/aaaa)`);
                    else
                        dados.validade = d;
                    break;
                }
                case "ativo": {
                    const a = sem(bruto);
                    if (!a) {
                        dados.ativo = null;
                        break;
                    }
                    if (["sim", "s", "1", "true", "ativo", "yes"].includes(a))
                        dados.ativo = true;
                    else if (["nao", "n", "0", "false", "inativo", "no"].includes(a))
                        dados.ativo = false;
                    else
                        erros.push(`“Ativo” deve ser Sim ou Não (veio “${bruto}”)`);
                    break;
                }
                default:
                    dados[campo] = bruto || null;
            }
        });
        const codigo = String(dados.codigo ?? "").trim();
        if (!codigo)
            erros.push("sem código");
        else if (vistosCodigo.has(codigo))
            erros.push(`código repetido na planilha (linha ${vistosCodigo.get(codigo)})`);
        else
            vistosCodigo.set(codigo, nLinha);
        const barras = String(dados.barras ?? "").trim();
        if (barras) {
            if (vistosBarras.has(barras))
                erros.push(`código de barras repetido na planilha (linha ${vistosBarras.get(barras)})`);
            else
                vistosBarras.set(barras, nLinha);
        }
        return { linha: nLinha, codigo, dados, erros };
    });
    return { linhas, ignoradas, erroGeral: "" };
}
