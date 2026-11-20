/*
  BACKUP LOCAL E RECUPERAÇÃO (o que foi feito neste computador e ainda não
  chegou ao servidor é o mais precioso: protegemos em três camadas).

  1) RESERVA AUTOMÁTICA: uma segunda base no navegador ("lojafacil-reserva")
     guarda uma cópia de cada operação ainda não enviada. Se a base principal
     for danificada ou perder a fila (falha do navegador, atualização), na
     próxima abertura o sistema RECOLOCA o que faltar. O envio é idempotente
     (uuid): recolocar algo já enviado não duplica nada no servidor.
  2) CÓPIA DE EMERGÊNCIA EM ARQUIVO: botão "Salvar cópia de emergência"
     baixa um arquivo com toda a fila + registros locais, com código de
     conferência SHA-256 (detecta arquivo corrompido ou alterado).
  3) RESTAURAÇÃO CONTROLADA: abrir esse arquivo (no mesmo ou em outro
     computador) mostra o que será recolocado e só grava depois de confirmar.

  Nada disto é "cache": o service worker nunca mexe nestas bases.
*/
import { abrirBanco, espacoUsado, gravarJunto, lerTodos } from "./idb";
import { atualizarResumoFila, processarFila } from "./fila";
import { meuDispositivo } from "./caixaLocal";
const NOME = "lojafacil-reserva";
let base = null;
function abrirReserva() {
    if (base)
        return base;
    base = new Promise((ok, falha) => {
        const r = indexedDB.open(NOME, 1);
        r.onupgradeneeded = () => { r.result.createObjectStore("ops", { keyPath: "id" }); r.result.createObjectStore("registros", { keyPath: "chave" }); };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => { base = null; falha(r.error); };
    });
    return base;
}
function tx(db, lojas, modo) {
    const t = db.transaction(lojas, modo);
    const fim = new Promise((ok, falha) => { t.oncomplete = () => ok(); t.onerror = () => falha(t.error); t.onabort = () => falha(t.error); });
    return { t, fim };
}
/** Tabelas com registros feitos aqui (número negativo) que acompanham as operações. */
const TABELAS_LOCAIS = ["vendas", "caixas", "caixa_movimentos", "clientes", "movimentacoes"];
async function registrosLocais() {
    const out = [];
    for (const t of TABELAS_LOCAIS)
        for (const l of await lerTodos(t))
            if (typeof l.id === "number" && l.id < 0)
                out.push({ tabela: t, linha: l });
    return out;
}
/** Copia para a reserva tudo o que ainda não foi enviado (chamado após cada operação e periodicamente). */
export async function atualizarReserva() {
    try {
        const ops = await lerTodos("fila");
        const regs = await registrosLocais();
        const db = await abrirReserva();
        const { t, fim } = tx(db, ["ops", "registros"], "readwrite");
        for (const o of ops)
            t.objectStore("ops").put(o);
        for (const r of regs)
            t.objectStore("registros").put({ chave: `${r.tabela}:${r.linha.id}`, tabela: r.tabela, linha: r.linha });
        await fim;
    }
    catch { /* reserva indisponível: a base principal continua sendo a referência */ }
}
/**
 * Ao abrir: se a base principal perdeu operações não enviadas que estão na
 * reserva, recoloca. Retorna quantas foram recolocadas.
 */
export async function recuperarDaReserva() {
    try {
        const db = await abrirReserva();
        const lerLoja = (loja) => new Promise((ok, falha) => { const r = db.transaction(loja).objectStore(loja).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });
        const reservaOps = await lerLoja("ops");
        const atuais = new Set((await lerTodos("fila")).map((o) => o.id));
        const faltando = reservaOps.filter((o) => !atuais.has(o.id) && o.estado !== "sincronizado");
        if (!faltando.length)
            return 0;
        const regs = await lerLoja("registros");
        const porTabela = new Map();
        for (const r of regs)
            porTabela.set(r.tabela, [...(porTabela.get(r.tabela) ?? []), r.linha]);
        await gravarJunto([...[...porTabela].map(([tabela, linhas]) => ({ tabela, linhas })), { tabela: "fila", linhas: faltando.map((o) => ({ ...o, estado: "pendente" })) }]);
        await atualizarResumoFila();
        void processarFila();
        return faltando.length;
    }
    catch {
        return 0;
    }
}
/* ------------------------ cópia de emergência (arquivo) ------------------------ */
async function sha256(texto) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Monta o arquivo com a fila inteira e os registros feitos aqui (+ código SHA-256). */
export async function gerarCopiaEmergencia() {
    const ops = await lerTodos("fila");
    const regs = await registrosLocais();
    const conteudo = JSON.stringify({ ops, registros: regs });
    const copia = { formato: "loja-facil-emergencia", versao: 1, dispositivo: meuDispositivo(), criado_em: new Date().toISOString(), conteudo, conferencia: await sha256(conteudo) };
    const carimbo = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
    return { nome: `loja-facil-emergencia-${meuDispositivo()}-${carimbo}.json`, texto: JSON.stringify(copia), ops: ops.length, pendentes: ops.filter((o) => o.estado !== "sincronizado").length };
}
/** Confere o arquivo (formato + SHA-256) e mostra o que seria recolocado. Não grava nada. */
export async function conferirCopiaEmergencia(texto) {
    const vazio = { dispositivo: "", criado_em: "", recolocar: [], registros: [] };
    let c;
    try {
        c = JSON.parse(texto);
    }
    catch {
        return { valida: false, motivo: "O arquivo não é uma cópia de emergência do Gerenciador de Mercado.", ...vazio };
    }
    if (c?.formato !== "loja-facil-emergencia" || typeof c.conteudo !== "string")
        return { valida: false, motivo: "O arquivo não é uma cópia de emergência do Gerenciador de Mercado.", ...vazio };
    if ((await sha256(c.conteudo)) !== c.conferencia)
        return { valida: false, motivo: "O arquivo está corrompido ou foi alterado (o código de conferência não bate). Nada foi gravado.", ...vazio, dispositivo: c.dispositivo, criado_em: c.criado_em };
    const { ops, registros } = JSON.parse(c.conteudo);
    const atuais = new Set((await lerTodos("fila")).map((o) => o.id));
    const recolocar = ops.filter((o) => o.estado !== "sincronizado" && !atuais.has(o.id));
    return { valida: true, motivo: "", dispositivo: c.dispositivo, criado_em: c.criado_em, recolocar, registros };
}
/** Grava o que a prévia mostrou (só operações que faltam; o servidor ignora repetidas). */
export async function restaurarCopiaEmergencia(p) {
    if (!p.valida || !p.recolocar.length)
        return 0;
    const porTabela = new Map();
    for (const r of p.registros)
        porTabela.set(r.tabela, [...(porTabela.get(r.tabela) ?? []), r.linha]);
    await gravarJunto([...[...porTabela].map(([tabela, linhas]) => ({ tabela, linhas })), { tabela: "fila", linhas: p.recolocar.map((o) => ({ ...o, estado: "pendente", erro: null })) }]);
    await atualizarResumoFila();
    await atualizarReserva();
    void processarFila();
    return p.recolocar.length;
}
/* ------------------------------ espaço ------------------------------ */
export async function situacaoArmazenamento() {
    const e = await espacoUsado();
    let persistente = null;
    try {
        persistente = (await navigator.storage?.persisted?.()) ?? null;
    }
    catch { /* sem suporte */ }
    let ok = true;
    try {
        await abrirBanco();
    }
    catch {
        ok = false;
    }
    return { usado: e?.usado ?? 0, total: e?.total ?? 0, persistente, bancoOk: ok, percentual: e && e.total ? Math.round((e.usado / e.total) * 1000) / 10 : 0 };
}
