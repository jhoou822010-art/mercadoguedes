import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { supabase } from "../lib/supabase";
import { baixarArquivo } from "../lib/csv";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Aviso, Cabecalho } from "../components/Ui";
import { fmtDataHora, fmtMoeda } from "../lib/format";
export const VERSAO_BACKUP = 3;
export default function Backup() {
    const { perfil, tem0006, config, recarregar } = useAuth();
    const avisar = useToast();
    const [etapa, setEtapa] = useState("");
    const [ultimo, setUltimo] = useState(null);
    async function exportar() {
        try {
            setEtapa("Lendo produtos…");
            const produtos = await buscarTodos("produtos");
            setEtapa("Lendo movimentações…");
            const movimentacoes = await buscarTodos("movimentacoes");
            setEtapa("Lendo vendas e caixas…");
            const vendas = await buscarTodos("vendas");
            const venda_itens = await buscarTodos("venda_itens");
            const venda_pagamentos = await buscarTodos("venda_pagamentos");
            // Caixas completos (com esperado/diferença) vêm por listar_caixas (SQL 0006); antes dele, leitura direta.
            const rc = await supabase.rpc("listar_caixas", { p_limite: 5000 });
            const caixas = rc.error ? await buscarTodos("caixas") : rc.data;
            const caixa_movimentos = await buscarTodos("caixa_movimentos");
            const clientes = tem0006 ? await buscarTodos("clientes") : [];
            const parcelas = tem0006 ? await buscarTodos("parcelas") : [];
            // Histórico de alterações (SQL 0007): se ainda não existir, segue sem ele.
            const auditoria = await buscarTodos("auditoria").catch(() => []);
            setEtapa("Lendo configurações…");
            const [configuracoes] = await buscarTodos("configuracoes");
            const agora = new Date();
            const backup = {
                formato: "loja-facil-backup",
                versao_formato: VERSAO_BACKUP,
                exportado_em: agora.toISOString(),
                exportado_por: perfil?.email ?? null,
                totais: { produtos: produtos.length, movimentacoes: movimentacoes.length, vendas: vendas.length, caixas: caixas.length },
                configuracoes,
                produtos,
                movimentacoes,
                vendas,
                venda_itens,
                venda_pagamentos,
                caixas,
                caixa_movimentos,
                clientes,
                parcelas,
                auditoria,
            };
            const carimbo = agora.toLocaleString("sv-SE").replace(/[: ]/g, "-");
            const arquivo = `loja-facil-backup-${carimbo}.json`;
            baixarArquivo(arquivo, JSON.stringify(backup, null, 2), "application/json");
            setUltimo({ arquivo, produtos: produtos.length, movimentacoes: movimentacoes.length });
            // Anota no banco a data do backup (SQL 0007) para o aviso diário. Sem o 0007, só ignora.
            const rb = await supabase.rpc("registrar_backup");
            if (!rb.error)
                void recarregar();
            avisar("sucesso", "Backup gerado. Guarde o arquivo em local seguro.");
        }
        catch (e) {
            avisar("erro", `Não foi possível gerar o backup: ${mensagemErro(e)}`);
        }
        finally {
            setEtapa("");
        }
    }
    return (_jsxs("div", { className: "max-w-4xl", children: [_jsx(Cabecalho, { titulo: "Backup", descricao: "Gere uma c\u00F3pia dos dados da loja em um arquivo JSON." }), _jsxs("div", { className: "cartao space-y-4 p-5", children: [_jsx("p", { className: "text-sm text-slate-600", children: "O arquivo cont\u00E9m:" }), _jsxs("ul", { className: "list-disc space-y-1 pl-5 text-sm text-slate-600", children: [_jsx("li", { children: "todos os produtos (ativos e inativos);" }), _jsx("li", { children: "todo o hist\u00F3rico de movimenta\u00E7\u00F5es de estoque;" }), _jsx("li", { children: "vendas (itens e pagamentos), fiados, caixas, sangrias e suprimentos;" }), _jsx("li", { children: "clientes e parcelas do credi\u00E1rio;" }), _jsx("li", { children: "as configura\u00E7\u00F5es da loja;" }), _jsxs("li", { children: ["a data da exporta\u00E7\u00E3o e a vers\u00E3o do formato do backup (vers\u00E3o ", VERSAO_BACKUP, ")."] })] }), _jsxs(Aviso, { cor: "atencao", children: [_jsx("strong", { children: "Guarde o arquivo em local seguro" }), " (pen drive, nuvem ou outro computador). Ele tem custos e pre\u00E7os da loja: n\u00E3o envie para pessoas desconhecidas."] }), _jsxs(Aviso, { cor: "petroleo", children: ["Esta vers\u00E3o ", _jsx("strong", { children: "s\u00F3 exporta" }), ". A restaura\u00E7\u00E3o autom\u00E1tica a partir do arquivo ainda n\u00E3o existe; se precisar recuperar dados, o arquivo pode ser importado manualmente por um t\u00E9cnico."] }), config?.ultimo_backup_em !== undefined && (_jsxs("p", { className: "text-sm", children: ["\u00DAltimo backup registrado:", " ", config.ultimo_backup_em ? _jsxs("strong", { children: [fmtDataHora(config.ultimo_backup_em), config.ultimo_backup_por ? ` por ${config.ultimo_backup_por}` : ""] }) : _jsx("strong", { className: "text-critico-600", children: "nenhum ainda" })] })), _jsx("button", { className: "btn-acao", onClick: exportar, disabled: Boolean(etapa), children: etapa || "⤓ Gerar backup agora" }), ultimo && (_jsxs(Aviso, { cor: "ok", children: ["\u00DAltimo backup: ", _jsx("strong", { children: ultimo.arquivo }), " \u2014 ", ultimo.produtos, " produto(s) e ", ultimo.movimentacoes, " movimenta\u00E7\u00E3o(\u00F5es). Verifique a pasta de downloads."] }))] }), _jsx(Historico, {})] }));
}
const NOME_TABELA = {
    produtos: "Produto", clientes: "Cliente", configuracoes: "Dados da loja", vendas: "Venda",
    venda_pagamentos: "Pagamento / fiado", parcelas: "Parcela do crediário", caixas: "Caixa", perfis: "Usuário",
};
const CAMPO = {
    preco: "preço", custo: "custo", nome: "nome", ativo: "ativo", codigo: "código", barras: "código de barras",
    estoque_minimo: "estoque mínimo", validade: "validade", categoria: "categoria", unidade: "unidade",
    limite_credito: "limite de crédito", telefone: "telefone", cpf: "CPF/CNPJ", endereco: "endereço",
    status: "situação", papel: "acesso", fiado_recebido_em: "fiado recebido", pago_em: "pago em", pago_forma: "forma de pagamento",
    motivo_cancelamento: "motivo", nome_loja: "nome da loja", cnpj: "CNPJ", desconto_maximo_percentual: "desconto máximo",
    ocultar_valores_operador: "ocultar valores", pix_chave: "chave Pix", valor_contado: "valor contado",
};
const MOEDA = new Set(["preco", "custo", "limite_credito", "valor_contado"]);
const IGNORAR = new Set(["atualizado_em", "criado_em", "estoque", "ultimo_backup_em", "ultimo_backup_por", "resumo", "atalhos"]);
function mostrar(campo, v) {
    if (v === null || v === undefined || v === "")
        return "vazio";
    if (MOEDA.has(campo))
        return fmtMoeda(Number(v));
    if (typeof v === "boolean")
        return v ? "sim" : "não";
    return String(v);
}
function descrever(r) {
    if (r.operacao === "DELETE")
        return `apagado: ${String(r.antes?.nome ?? r.antes?.codigo ?? r.registro_id ?? "")}`;
    const a = r.antes ?? {}, d = r.depois ?? {};
    const mudou = Object.keys(d).filter((k) => !IGNORAR.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
    const quem = String(d.nome ?? d.cliente_nome ?? "");
    const partes = mudou.slice(0, 4).map((k) => `${CAMPO[k] ?? k}: ${mostrar(k, a[k])} → ${mostrar(k, d[k])}`);
    return `${quem ? quem + " · " : ""}${partes.join(" · ") || "alterado"}${mudou.length > 4 ? " …" : ""}`;
}
function Historico() {
    const [lista, setLista] = useState(null);
    const [existe, setExiste] = useState(true);
    const [filtro, setFiltro] = useState("");
    const carregar = useCallback(async () => {
        let q = supabase.from("auditoria").select("*").order("id", { ascending: false }).limit(300);
        if (filtro)
            q = q.eq("tabela", filtro);
        const { data, error } = await q;
        if (error) {
            setExiste(false);
            return;
        }
        setLista(data);
    }, [filtro]);
    useEffect(() => { void carregar(); }, [carregar]);
    if (!existe) {
        return (_jsxs("div", { className: "cartao mt-6 p-5", children: [_jsx("h2", { className: "font-semibold", children: "Hist\u00F3rico de altera\u00E7\u00F5es" }), _jsxs("p", { className: "mt-1 text-sm text-slate-600", children: ["Rode o SQL ", _jsx("code", { children: "0007_protecao_dados.sql" }), " no Supabase para ligar a prote\u00E7\u00E3o contra apagar e o hist\u00F3rico de altera\u00E7\u00F5es."] })] }));
    }
    return (_jsxs("div", { className: "cartao mt-6 p-5", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-end justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Hist\u00F3rico de altera\u00E7\u00F5es" }), _jsx("p", { className: "text-xs text-slate-500", children: "Quem mudou pre\u00E7o, cadastro, limite, cancelou venda ou recebeu fiado/parcela. Ningu\u00E9m consegue apagar este hist\u00F3rico." })] }), _jsxs("select", { className: "campo w-auto py-1.5 text-sm", value: filtro, onChange: (e) => setFiltro(e.target.value), "aria-label": "Filtrar hist\u00F3rico", children: [_jsx("option", { value: "", children: "Tudo" }), Object.entries(NOME_TABELA).map(([k, v]) => _jsx("option", { value: k, children: v }, k))] })] }), !lista ? _jsx("p", { className: "text-sm text-slate-500", children: "Carregando\u2026" }) : lista.length === 0 ? _jsx("p", { className: "text-sm text-slate-500", children: "Nenhuma altera\u00E7\u00E3o registrada ainda." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "tabela text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Quando" }), _jsx("th", { children: "Quem" }), _jsx("th", { children: "O qu\u00EA" }), _jsx("th", { children: "Mudan\u00E7a" })] }) }), _jsx("tbody", { children: lista.map((r) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap", children: fmtDataHora(r.em) }), _jsx("td", { children: r.usuario_nome ?? "—" }), _jsxs("td", { className: "whitespace-nowrap", children: [NOME_TABELA[r.tabela] ?? r.tabela, r.registro_id ? ` nº ${r.registro_id}` : ""] }), _jsx("td", { children: descrever(r) })] }, r.id))) })] }) }))] }));
}
