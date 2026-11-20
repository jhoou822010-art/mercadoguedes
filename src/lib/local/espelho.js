/*
  CÓPIA DOS DADOS DO SERVIDOR PARA ESTE COMPUTADOR ("descida").

  Com internet, de tempos em tempos (e ao voltar a conexão) baixa do Supabase
  SÓ o que mudou desde a última vez (coluna atualizado_em, SQL 0009) e guarda
  no banco local. Sem internet, as telas leem dessa cópia.

  - Nunca envia nada ao servidor (isso é a "subida", na etapa do caixa offline).
  - Se a mesma linha vier duas vezes, só é regravada (sem duplicar).
  - Margem de 5 minutos para trás em cada busca, para não perder alterações
    gravadas no servidor quase ao mesmo tempo.
*/
import { supabase } from "../supabase";
import { COLUNAS_CAIXA, selecaoVenda } from "../consultas";
import { apagarVarios, gravarMeta, gravarVarios, lerMeta, lerTodos } from "./idb";
const PAGINA = 1000;
const MARGEM_MS = 5 * 60_000;
/** Na primeira cópia, vendas e movimentações dos últimos 180 dias (+ todo fiado/parcela em aberto). */
const JANELA_DIAS = 180;
let estado = { rodando: false, ultima: null, erro: "", temIncremental: null };
const ouvintes = new Set();
const mudar = (p) => { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); };
export const estadoEspelho = () => estado;
export function ouvirEspelho(f) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
void lerMeta("ultima_copia").then((u) => { if (u)
    mudar({ ultima: u }); }).catch(() => { });
/** Busca todas as páginas de uma consulta (o servidor devolve no máximo 1000 por vez). */
async function todasAsPaginas(montar) {
    const tudo = [];
    for (let de = 0;; de += PAGINA) {
        const { data, error } = await montar().range(de, de + PAGINA - 1);
        if (error)
            throw error;
        tudo.push(...(data ?? []));
        if (!data || data.length < PAGINA)
            return tudo;
    }
}
const recuar = (iso) => new Date(new Date(iso).getTime() - MARGEM_MS).toISOString();
const maiorData = (linhas, atual) => linhas.reduce((m, l) => (l.atualizado_em && (!m || l.atualizado_em > m) ? l.atualizado_em : m), atual);
async function temColunaAtualizado() {
    const { error } = await supabase.from("vendas").select("atualizado_em").limit(1);
    return !error;
}
/** Tabela pequena (produtos, clientes, perfis): incremental + remove o que foi apagado no servidor. */
async function copiarPequena(tabela, origem, incremental) {
    const cursor = await lerMeta(`cursor.${tabela}`);
    const linhas = await todasAsPaginas(() => {
        let q = supabase.from(origem).select("*").order("id");
        if (incremental && cursor)
            q = q.gte("atualizado_em", recuar(cursor));
        return q;
    });
    await gravarVarios(tabela, linhas);
    // Apagados no servidor (ex.: produto cadastrado por engano): confere a lista de códigos.
    const ids = new Set((await todasAsPaginas(() => supabase.from(origem).select("id").order("id"))).map((l) => l.id));
    const locais = await lerTodos(tabela);
    // Nunca apaga o que foi cadastrado aqui e ainda não foi enviado (número negativo).
    await apagarVarios(tabela, locais.filter((l) => !ids.has(l.id) && !(typeof l.id === "number" && l.id < 0)).map((l) => l.id));
    await tirarProvisorios(tabela, linhas);
    const novo = maiorData(linhas, cursor);
    if (novo)
        await gravarMeta(`cursor.${tabela}`, novo);
}
async function buscarVendasPorIds(ids, tem0006) {
    const { vendasRecebendo } = await pendentesLocais();
    const unicos = [...new Set(ids)].filter((id) => !vendasRecebendo.has(id));
    for (let i = 0; i < unicos.length; i += 200) {
        const pedaco = unicos.slice(i, i + 200);
        const { data, error } = await supabase.from("vendas").select(selecaoVenda(tem0006)).in("id", pedaco);
        if (error)
            throw error;
        await gravarVarios("vendas", data ?? []);
    }
}
/**
 * O servidor foi zerado (limpeza dos testes)? Então apaga da cópia o que veio
 * do servidor. NUNCA apaga o que foi feito neste computador e ainda não foi
 * enviado (números negativos).
 */
async function conferirZerado() {
    const { data } = await supabase.from("vendas").select("id").order("id", { ascending: false }).limit(1);
    const maiorServidor = data?.[0]?.id ?? 0;
    const locais = await lerTodos("vendas");
    const maiorLocal = locais.reduce((m, v) => (typeof v.id === "number" && v.id > m ? v.id : m), 0);
    if (maiorLocal > maiorServidor) {
        for (const t of ["vendas", "parcelas", "caixas", "movimentacoes", "caixa_movimentos"]) {
            const doServidor = (await lerTodos(t)).filter((l) => l.id > 0).map((l) => l.id);
            await apagarVarios(t, doServidor);
            await gravarMeta(`cursor.${t}`, null);
        }
    }
}
/**
 * Chegou do servidor a versão definitiva de algo feito aqui (mesmo uuid_local):
 * tira a versão provisória (número negativo) para não contar duas vezes.
 * Vendas: só depois que a cópia dos produtos já inclui a baixa de estoque dela.
 */
async function tirarProvisorios(tabela, chegaram, conferirEstoque = false) {
    const uuids = new Set(chegaram.map((l) => l.uuid_local).filter(Boolean));
    if (!uuids.size)
        return;
    const copiaProdutos = (await lerMeta("copia_produtos_em")) ?? "";
    const locais = await lerTodos(tabela);
    await apagarVarios(tabela, locais.filter((l) => l.id < 0 && l.uuid_local && uuids.has(l.uuid_local)
        && (!conferirEstoque || (l.sincronizado_em && l.sincronizado_em <= copiaProdutos))).map((l) => l.id));
}
/** Operações deste computador ainda não enviadas (a cópia não pode passar por cima delas). */
async function pendentesLocais() {
    const ops = (await lerTodos("fila")).filter((o) => o.estado !== "sincronizado");
    return {
        caixasFechando: new Set(ops.filter((o) => o.tipo === "fechar_caixa").flatMap((o) => [o.parametros.p_caixa_id, o.parametros.p_caixa_uuid]).filter(Boolean)),
        // Fiado/parcela recebidos aqui e ainda não enviados: a cópia não pode "desfazer" o recebimento.
        vendasRecebendo: new Set(ops.filter((o) => o.tipo === "receber_fiado" || o.tipo === "receber_parcela").map((o) => o.meta?.venda_id).filter(Boolean)),
        parcelasRecebendo: new Set(ops.filter((o) => o.tipo === "receber_parcela").map((o) => o.meta?.parcela_id).filter(Boolean)),
    };
}
async function copiarVendas(incremental, tem0006) {
    const cursor = incremental ? await lerMeta("cursor.vendas") : undefined;
    const inicioJanela = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();
    const vendas = await todasAsPaginas(() => {
        let q = supabase.from("vendas").select(selecaoVenda(tem0006)).order("id");
        q = cursor ? q.gte("atualizado_em", recuar(cursor)) : q.gte("criado_em", inicioJanela);
        return q;
    });
    const { vendasRecebendo } = await pendentesLocais();
    const vendasOk = vendas.filter((v) => !vendasRecebendo.has(v.id));
    await gravarVarios("vendas", vendasOk);
    await tirarProvisorios("vendas", vendasOk, true);
    // Vendas cujo pagamento mudou (fiado recebido) ou fiado em aberto mais antigo que a janela.
    const ids = [];
    const pg = await todasAsPaginas(() => {
        let q = supabase.from("venda_pagamentos").select("venda_id").order("id");
        q = cursor ? q.gte("atualizado_em", recuar(cursor)) : q.eq("forma", "fiado").is("fiado_recebido_em", null);
        return q;
    });
    ids.push(...pg.map((p) => p.venda_id));
    await buscarVendasPorIds(ids.filter((id) => !vendas.some((v) => v.id === id)), tem0006);
    const novo = maiorData(vendas, cursor);
    if (novo)
        await gravarMeta("cursor.vendas", novo);
}
async function copiarParcelas(incremental) {
    const cursor = incremental ? await lerMeta("cursor.parcelas") : undefined;
    const linhas = await todasAsPaginas(() => {
        let q = supabase.from("parcelas").select("*, clientes(nome, telefone), vendas!inner(id, criado_em, status, total)").order("id");
        if (cursor)
            q = q.gte("atualizado_em", recuar(cursor));
        return q;
    });
    const { parcelasRecebendo } = await pendentesLocais();
    await gravarVarios("parcelas", linhas.filter((l) => !parcelasRecebendo.has(l.id)));
    const novo = maiorData(linhas, cursor);
    if (novo)
        await gravarMeta("cursor.parcelas", novo);
}
/** Caixas: os mesmos dados da tela "Caixas" (listar_caixas respeita o fechamento cego). */
async function copiarCaixas() {
    const r = await supabase.rpc("listar_caixas", { p_limite: 1000 });
    let linhas;
    if (!r.error)
        linhas = r.data;
    else {
        const d = await supabase.from("caixas").select(COLUNAS_CAIXA).order("id", { ascending: false }).limit(1000);
        if (d.error)
            throw d.error;
        linhas = d.data.map((c) => ({ ...c, valor_esperado: null, diferenca: null, resumo: null }));
    }
    // Caixa que este computador está fechando (fechamento ainda não enviado): mantém a versão daqui.
    const { caixasFechando } = await pendentesLocais();
    const fora = (c) => caixasFechando.has(c.id) || (!!c.uuid_local && caixasFechando.has(c.uuid_local));
    const novos = linhas.filter((c) => !fora(c));
    await gravarVarios("caixas", novos);
    await tirarProvisorios("caixas", novos.filter((c) => !fora(c)));
}
/** Sangrias, suprimentos e recebimentos dos caixas (só chegam linhas novas). */
async function copiarCaixaMovimentos() {
    const ultimoId = (await lerMeta("cursor.caixa_movimentos")) ?? null;
    const inicioJanela = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();
    const linhas = await todasAsPaginas(() => {
        let q = supabase.from("caixa_movimentos").select("*").order("id");
        q = ultimoId ? q.gt("id", ultimoId) : q.gte("criado_em", inicioJanela);
        return q;
    });
    await gravarVarios("caixa_movimentos", linhas);
    await tirarProvisorios("caixa_movimentos", linhas);
    const maior = linhas.reduce((m, l) => Math.max(m, l.id), ultimoId ?? 0);
    if (maior)
        await gravarMeta("cursor.caixa_movimentos", maior);
}
async function copiarMovimentacoes() {
    const ultimoId = (await lerMeta("cursor.movimentacoes")) ?? null;
    const inicioJanela = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();
    const linhas = await todasAsPaginas(() => {
        let q = supabase.from("movimentacoes").select("*").order("id");
        q = ultimoId ? q.gt("id", ultimoId) : q.gte("criado_em", inicioJanela);
        return q;
    });
    await gravarVarios("movimentacoes", linhas);
    await tirarProvisorios("movimentacoes", linhas, true);
    const maior = linhas.reduce((m, l) => Math.max(m, l.id), ultimoId ?? 0);
    if (maior)
        await gravarMeta("cursor.movimentacoes", maior);
}
let emAndamento = null;
let deNovo = null;
/**
 * Atualiza a cópia local. Chamado ao entrar, a cada 2 minutos e quando a
 * internet volta. Duas chamadas ao mesmo tempo viram uma só.
 */
export function atualizarCopiaLocal(opcoes) {
    // Pedido no meio de outra cópia (ex.: as configurações acabaram de chegar): roda de novo no fim.
    if (emAndamento) {
        deNovo = opcoes;
        return emAndamento;
    }
    emAndamento = (async () => {
        mudar({ rodando: true, erro: "" });
        try {
            const incremental = await temColunaAtualizado();
            mudar({ temIncremental: incremental });
            await conferirZerado();
            const inicioProdutos = new Date().toISOString();
            await copiarPequena("produtos", "produtos", true);
            await gravarMeta("copia_produtos_em", inicioProdutos);
            if (opcoes.tem0006)
                await copiarPequena("clientes", "clientes", incremental);
            if (opcoes.ehAdmin)
                await copiarPequena("perfis", "perfis", incremental);
            // Vendas, parcelas e caixas mudam (cancelamento, recebimento, fechamento):
            // só dá para copiar só o que mudou com o SQL 0009. Sem ele, ficam só online.
            if (incremental) {
                await copiarVendas(true, opcoes.tem0006);
                if (opcoes.tem0006)
                    await copiarParcelas(true);
            }
            await copiarCaixas();
            await copiarCaixaMovimentos();
            await copiarMovimentacoes();
            const agora = new Date().toISOString();
            await gravarMeta("ultima_copia", agora);
            mudar({ ultima: agora });
        }
        catch (e) {
            mudar({ erro: e?.message ?? String(e) });
        }
        finally {
            mudar({ rodando: false });
            emAndamento = null;
            if (deNovo) {
                const o = deNovo;
                deNovo = null;
                void atualizarCopiaLocal(o);
            }
        }
    })();
    return emAndamento;
}
