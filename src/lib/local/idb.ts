/*
  BANCO LOCAL (IndexedDB) — a cópia dos dados que fica NESTE computador.

  - Fica separado do cache de arquivos do service worker: atualizar o sistema
    nunca apaga estes dados.
  - Tem número de versão; cada versão nova só ACRESCENTA tabelas/índices
    (migração segura, sem apagar nada).
*/
export const NOME_BANCO = "lojafacil";
export const VERSAO_BANCO = 2;

export type Tabela = "produtos" | "clientes" | "perfis" | "vendas" | "parcelas" | "caixas" | "movimentacoes" | "caixa_movimentos" | "fila" | "meta";

let aberto: Promise<IDBDatabase> | null = null;

export function abrirBanco(): Promise<IDBDatabase> {
  if (aberto) return aberto;
  aberto = new Promise((ok, falha) => {
    if (typeof indexedDB === "undefined") return falha(new Error("Este navegador não tem banco local (IndexedDB)."));
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
    req.onblocked = () => { /* outra aba antiga aberta; a abertura continua quando ela fechar */ };
  });
  return aberto;
}

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });
}

function transacaoConcluida(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, falha) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error ?? new Error("Gravação local cancelada."));
  });
}

export async function lerTodos<T>(tabela: Tabela): Promise<T[]> {
  const db = await abrirBanco();
  return pedido(db.transaction(tabela, "readonly").objectStore(tabela).getAll()) as Promise<T[]>;
}

export async function lerUm<T>(tabela: Tabela, chave: IDBValidKey): Promise<T | undefined> {
  const db = await abrirBanco();
  return pedido(db.transaction(tabela, "readonly").objectStore(tabela).get(chave)) as Promise<T | undefined>;
}

export async function lerPorIndice<T>(tabela: Tabela, indice: string, faixa: IDBKeyRange | IDBValidKey): Promise<T[]> {
  const db = await abrirBanco();
  return pedido(db.transaction(tabela, "readonly").objectStore(tabela).index(indice).getAll(faixa)) as Promise<T[]>;
}

/** Grava (inclui ou substitui) várias linhas numa transação só: ou grava todas, ou nenhuma. */
export async function gravarVarios(tabela: Tabela, linhas: unknown[]) {
  if (!linhas.length) return;
  const db = await abrirBanco();
  const tx = db.transaction(tabela, "readwrite");
  const st = tx.objectStore(tabela);
  for (const l of linhas) st.put(l);
  await transacaoConcluida(tx);
}

export async function apagarVarios(tabela: Tabela, chaves: IDBValidKey[]) {
  if (!chaves.length) return;
  const db = await abrirBanco();
  const tx = db.transaction(tabela, "readwrite");
  const st = tx.objectStore(tabela);
  for (const k of chaves) st.delete(k);
  await transacaoConcluida(tx);
}

export async function limparTabela(tabela: Tabela) {
  const db = await abrirBanco();
  const tx = db.transaction(tabela, "readwrite");
  tx.objectStore(tabela).clear();
  await transacaoConcluida(tx);
}

export async function contar(tabela: Tabela): Promise<number> {
  const db = await abrirBanco();
  return pedido(db.transaction(tabela, "readonly").objectStore(tabela).count());
}

export async function lerMeta<T>(chave: string): Promise<T | undefined> {
  const r = await lerUm<{ chave: string; valor: T }>("meta", chave);
  return r?.valor;
}

export async function gravarMeta(chave: string, valor: unknown) {
  await gravarVarios("meta", [{ chave, valor }]);
}

/** Espaço usado e disponível no navegador (aproximado). */
export async function espacoUsado(): Promise<{ usado: number; total: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usado: e.usage ?? 0, total: e.quota ?? 0 } : null;
  } catch { return null; }
}

/** Grava em várias tabelas numa transação só: ou grava tudo, ou nada (venda + fila + numeração). */
export async function gravarJunto(gravacoes: { tabela: Tabela; linhas: unknown[] }[]) {
  const db = await abrirBanco();
  const tabelas = [...new Set(gravacoes.map((g) => g.tabela))];
  const tx = db.transaction(tabelas, "readwrite");
  for (const g of gravacoes) for (const l of g.linhas) tx.objectStore(g.tabela).put(l);
  await transacaoConcluida(tx);
}
