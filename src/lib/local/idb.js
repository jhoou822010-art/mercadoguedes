/*
  BANCO LOCAL (IndexedDB) — a cópia dos dados que fica NESTE computador.

  - Fica separado do cache de arquivos do service worker: atualizar o sistema
    nunca apaga estes dados.
  - Tem número de versão; cada versão nova só ACRESCENTA tabelas/índices
    (migração segura, sem apagar nada).
*/
export const NOME_BANCO = "lojafacil";
export const VERSAO_BANCO = 2;
let aberto = null;
export function abrirBanco() {
    if (aberto)
        return aberto;
    aberto = new Promise((ok, falha) => {
        if (typeof indexedDB === "undefined")
            return falha(new Error("Este navegador não tem banco local (IndexedDB)."));
        const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
        req.onupgradeneeded = (ev) => {
            const db = req.result;
            const de = ev.oldVersion;
            // Versão 1: tabelas iniciais. Versões futuras: acrescentar "if (de < 2) {...}" sem apagar nada.
            if (de < 1) {
                db.createObjectStore("produtos", { keyPath: "id" });
                db.createObjectStore("clientes", { keyPath: "id" });
                db.createObjectStore("perfis", { keyPath: "id" });
                const vendas = db.createObjectStore("vendas", { keyPath: "id" });
                vendas.createIndex("criado_em", "criado_em");
                const parcelas = db.createObjectStore("parcelas", { keyPath: "id" });
                parcelas.createIndex("venda_id", "venda_id");
                db.createObjectStore("caixas", { keyPath: "id" });
                const movs = db.createObjectStore("movimentacoes", { keyPath: "id" });
                movs.createIndex("criado_em", "criado_em");
                db.createObjectStore("meta", { keyPath: "chave" });
            }
            // Versão 2 (caixa offline): fila de envio e sangrias/suprimentos/recebimentos do caixa.
            if (de < 2) {
                const fila = db.createObjectStore("fila", { keyPath: "id" });
                fila.createIndex("ordem", "ordem");
                db.createObjectStore("caixa_movimentos", { keyPath: "id" });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            // Outra aba abriu uma versão mais nova do banco: fecha esta conexão para não travar a atualização.
            db.onversionchange = () => { db.close(); aberto = null; };
            ok(db);
        };
        req.onerror = () => { aberto = null; falha(req.error ?? new Error("Não foi possível abrir o banco local.")); };
        req.onblocked = () => { };
    });
    return aberto;
}
function pedido(r) {
    return new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });
}
function transacaoConcluida(tx) {
    return new Promise((ok, falha) => {
        tx.oncomplete = () => ok();
        tx.onerror = () => falha(tx.error);
        tx.onabort = () => falha(tx.error ?? new Error("Gravação local cancelada."));
    });
}
export async function lerTodos(tabela) {
    const db = await abrirBanco();
    return pedido(db.transaction(tabela, "readonly").objectStore(tabela).getAll());
}
export async function lerUm(tabela, chave) {
    const db = await abrirBanco();
    return pedido(db.transaction(tabela, "readonly").objectStore(tabela).get(chave));
}
export async function lerPorIndice(tabela, indice, faixa) {
    const db = await abrirBanco();
    return pedido(db.transaction(tabela, "readonly").objectStore(tabela).index(indice).getAll(faixa));
}
/** Grava (inclui ou substitui) várias linhas numa transação só: ou grava todas, ou nenhuma. */
export async function gravarVarios(tabela, linhas) {
    if (!linhas.length)
        return;
    const db = await abrirBanco();
    const tx = db.transaction(tabela, "readwrite");
    const st = tx.objectStore(tabela);
    for (const l of linhas)
        st.put(l);
    await transacaoConcluida(tx);
}
export async function apagarVarios(tabela, chaves) {
    if (!chaves.length)
        return;
    const db = await abrirBanco();
    const tx = db.transaction(tabela, "readwrite");
    const st = tx.objectStore(tabela);
    for (const k of chaves)
        st.delete(k);
    await transacaoConcluida(tx);
}
export async function limparTabela(tabela) {
    const db = await abrirBanco();
    const tx = db.transaction(tabela, "readwrite");
    tx.objectStore(tabela).clear();
    await transacaoConcluida(tx);
}
export async function contar(tabela) {
    const db = await abrirBanco();
    return pedido(db.transaction(tabela, "readonly").objectStore(tabela).count());
}
export async function lerMeta(chave) {
    const r = await lerUm("meta", chave);
    return r?.valor;
}
export async function gravarMeta(chave, valor) {
    await gravarVarios("meta", [{ chave, valor }]);
}
/** Espaço usado e disponível no navegador (aproximado). */
export async function espacoUsado() {
    try {
        const e = await navigator.storage?.estimate?.();
        return e ? { usado: e.usage ?? 0, total: e.quota ?? 0 } : null;
    }
    catch {
        return null;
    }
}
/** Grava em várias tabelas numa transação só: ou grava tudo, ou nada (venda + fila + numeração). */
export async function gravarJunto(gravacoes) {
    const db = await abrirBanco();
    const tabelas = [...new Set(gravacoes.map((g) => g.tabela))];
    const tx = db.transaction(tabelas, "readwrite");
    for (const g of gravacoes)
        for (const l of g.linhas)
            tx.objectStore(g.tabela).put(l);
    await transacaoConcluida(tx);
}
