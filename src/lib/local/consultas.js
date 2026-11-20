import { lerConfigGuardada } from "../perfilLocal";
import { lerMeta, lerTodos } from "./idb";
const hojeLocal = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD
const diasEntre = (de, ate) => Math.round((Date.parse(ate + "T00:00:00") - Date.parse(de + "T00:00:00")) / 86_400_000);
const sem = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const contem = (valor, termo) => valor != null && sem(String(valor)).includes(termo);
/** Igual à visão vw_produtos do banco. */
export function comoProdutoView(p, cfg) {
    const hoje = hojeLocal();
    const dias = p.validade ? diasEntre(hoje, p.validade.slice(0, 10)) : null;
    const alerta = Number(cfg?.dias_alerta_validade ?? 30);
    let situacao = "sem_validade";
    if (dias !== null)
        situacao = dias < 0 ? "vencido" : dias <= 7 ? "critico" : dias <= alerta ? "proximo" : "ok";
    const estoque = Number(p.estoque), minimo = Number(p.estoque_minimo);
    return {
        ...p,
        valor_estoque: Math.round(Number(p.custo) * estoque * 100) / 100,
        abaixo_minimo: minimo > 0 && estoque < minimo,
        dias_para_vencer: dias,
        situacao_validade: situacao,
    };
}
/**
 * Produtos da cópia, com o estoque já descontando as vendas feitas NESTE
 * computador que a cópia ainda não reflete (não enviadas, ou enviadas depois
 * da última cópia dos produtos).
 */
export async function produtosLocais() {
    const cfg = lerConfigGuardada();
    const copia = (await lerMeta("copia_produtos_em")) ?? "";
    const vendidos = new Map();
    for (const v of await lerTodos("vendas")) {
        if (v.id >= 0 || v.status !== "concluida" || (v.sincronizado_em && v.sincronizado_em <= copia))
            continue;
        for (const i of v.venda_itens)
            if (i.produto_id && !i.avulso)
                vendidos.set(i.produto_id, (vendidos.get(i.produto_id) ?? 0) + Number(i.quantidade));
    }
    // Entradas/saídas/ajustes feitos aqui que a cópia ainda não reflete (delta < 0 tira, > 0 soma).
    for (const m of await lerTodos("movimentacoes")) {
        if (m.id >= 0 || m.delta === undefined || (m.sincronizado_em && m.sincronizado_em <= copia))
            continue;
        vendidos.set(m.produto_id, (vendidos.get(m.produto_id) ?? 0) - Number(m.delta));
    }
    return (await lerTodos("produtos")).map((p) => comoProdutoView(vendidos.has(p.id) ? { ...p, estoque: Math.round((Number(p.estoque) - vendidos.get(p.id)) * 1000) / 1000 } : p, cfg));
}
const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR");
/** Ordem pelo código: 1, 2, 10, 100 (como número); códigos com letras vão para o fim. */
export const porCodigo = (a, b) => {
    const na = /^\d+$/.test(a.codigo.trim()), nb = /^\d+$/.test(b.codigo.trim());
    if (na !== nb)
        return na ? -1 : 1;
    return a.codigo.trim().localeCompare(b.codigo.trim(), "pt-BR", { numeric: true, sensitivity: "base" }) || porNome(a, b);
};
export async function buscarProdutosLocal(termo, somenteAtivos, limite = 12) {
    const t = sem(termo.trim());
    return (await produtosLocais())
        .filter((p) => (!somenteAtivos || p.ativo) && (contem(p.nome, t) || contem(p.codigo, t) || contem(p.barras, t)))
        .sort(porNome).slice(0, limite);
}
export async function produtoLocal(id) {
    return (await produtosLocais()).find((p) => p.id === id) ?? null;
}
export async function produtosPorIds(ids) {
    const s = new Set(ids);
    return (await produtosLocais()).filter((p) => s.has(p.id));
}
export async function listarProdutosLocal(f) {
    const t = sem(f.busca.trim());
    let l = (await produtosLocais()).filter((p) => (f.situacao === "todos" || p.ativo === (f.situacao === "ativos")) &&
        (!f.categoria || p.categoria === f.categoria) &&
        (f.alerta !== "minimo" || p.abaixo_minimo) &&
        (f.alerta !== "validade" || ["vencido", "critico", "proximo"].includes(p.situacao_validade)) &&
        (f.alerta !== "vencidos" || p.situacao_validade === "vencido") &&
        (!t || contem(p.nome, t) || contem(p.codigo, t) || contem(p.barras, t) || contem(p.categoria, t) || contem(p.fornecedor, t)));
    l = f.alerta === "validade" || f.alerta === "vencidos" ? l.sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999")) : l.sort(f.ordem === "nome" ? porNome : porCodigo);
    return { lista: l.slice(f.pagina * f.porPagina, f.pagina * f.porPagina + f.porPagina), total: l.length };
}
export async function categoriasEFornecedoresLocal() {
    const l = await lerTodos("produtos");
    const unicos = (k) => [...new Set(l.map((p) => p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { categorias: unicos("categoria"), fornecedores: unicos("fornecedor") };
}
export async function resumoPainelLocal() {
    const l = await produtosLocais();
    const at = l.filter((p) => p.ativo);
    return {
        total_produtos: at.length,
        total_inativos: l.length - at.length,
        valor_estoque: Math.round(at.reduce((s, p) => s + p.valor_estoque, 0) * 100) / 100,
        abaixo_minimo: at.filter((p) => p.abaixo_minimo).length,
        proximos_vencimento: at.filter((p) => p.situacao_validade === "proximo" || p.situacao_validade === "critico").length,
        vencidos: at.filter((p) => p.situacao_validade === "vencido").length,
    };
}
export async function movimentacoesLocal(f) {
    let l = (await lerTodos("movimentacoes"))
        .filter((m) => (!f.tipo || m.tipo === f.tipo) && (!f.produtoId || m.produto_id === f.produtoId) && (!f.desde || m.criado_em >= f.desde))
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const total = l.length;
    if (f.porPagina !== undefined)
        l = l.slice((f.pagina ?? 0) * f.porPagina, (f.pagina ?? 0) * f.porPagina + f.porPagina);
    else if (f.limite)
        l = l.slice(0, f.limite);
    return { lista: l, total };
}
/** Vendas da cópia; se a mesma venda estiver em duas versões (provisória e do servidor), fica a do servidor. */
async function vendasSemRepetir() {
    const todas = await lerTodos("vendas");
    const doServidor = new Set(todas.filter((v) => v.id > 0 && v.uuid_local).map((v) => v.uuid_local));
    return todas.filter((v) => v.id > 0 || !doServidor.has(v.uuid_local ?? ""));
}
export async function vendasLocal(f = {}) {
    return (await vendasSemRepetir())
        .filter((v) => (!f.desde || v.criado_em >= f.desde) && (!f.status || v.status === f.status))
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
        .slice(0, f.limite ?? 100_000);
}
/** Igual à consulta de fiado da tela Vendas: pagamento + dados da venda. */
export async function fiadosLocal(recebidos) {
    const vendas = await vendasSemRepetir();
    return vendas.filter((v) => v.status === "concluida").flatMap((v) => v.venda_pagamentos
        .filter((p) => p.forma === "fiado" && Boolean(p.fiado_recebido_em) === recebidos)
        .map((p) => ({ ...p, vendas: { id: v.id, uuid_local: v.uuid_local ?? null, codigo_local: v.codigo_local ?? null, cliente_nome: v.cliente_nome, cliente_telefone: v.cliente_telefone, criado_em: v.criado_em, status: v.status, usuario_nome: v.usuario_nome } })))
        .sort((a, b) => b.id - a.id);
}
export async function parcelasLocal(f = {}) {
    const hoje = hojeLocal();
    // Parcelas do servidor + as das vendas no crediário feitas aqui e ainda não enviadas.
    const clientes = new Map((await lerTodos("clientes")).map((c) => [c.id, c]));
    const doServidor = await lerTodos("parcelas");
    const locais = (await vendasSemRepetir()).filter((v) => v.id < 0).flatMap((v) => (v.parcelas ?? []).map((p) => {
        const c = clientes.get(p.cliente_id);
        return { ...p, clientes: c ? { nome: c.nome, telefone: c.telefone } : null, vendas: { id: v.id, criado_em: v.criado_em, status: v.status, total: v.total, uuid_local: v.uuid_local ?? null, codigo_local: v.codigo_local ?? null } };
    }));
    let l = [...doServidor, ...locais].filter((p) => (!f.status || p.status === f.status) && (!f.atrasadas || p.vencimento < hoje) &&
        (!f.vendaId || p.venda_id === f.vendaId) && (!f.clienteId || p.cliente_id === f.clienteId));
    l = f.status === "paga" ? l.sort((a, b) => String(b.pago_em ?? "").localeCompare(String(a.pago_em ?? ""))) :
        f.vendaId ? l.sort((a, b) => a.numero - b.numero) : l.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    return l;
}
export async function clientesLocal(f = {}) {
    const t = sem(f.termo?.trim() ?? "");
    const todos = await lerTodos("clientes");
    const doServidor = new Set(todos.filter((c) => c.id > 0 && c.uuid_local).map((c) => c.uuid_local));
    return todos.filter((c) => c.id > 0 || !doServidor.has(c.uuid_local ?? ""))
        .filter((c) => (!f.somenteAtivos || c.ativo) && (!t || contem(c.nome, t) || contem(c.telefone, t) || contem(c.cpf, t)))
        .sort(porNome).slice(0, f.limite ?? 100_000);
}
export async function caixasLocal(usuarioId) {
    return (await lerTodos("caixas"))
        .filter((c) => !usuarioId || c.usuario_id === usuarioId)
        .sort((a, b) => b.aberto_em.localeCompare(a.aberto_em));
}
export async function perfisLocal() {
    return (await lerTodos("perfis")).sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}
