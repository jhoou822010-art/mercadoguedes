import { CHAVE_SESSAO } from "./supabase";
const CHAVE = "lojafacil.cofre";
const CHAVE_TENTATIVAS = "lojafacil.cofre.tentativas";
const RODADAS = 150_000;
function ler() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE) || "{}");
    }
    catch {
        return {};
    }
}
function gravar(c) {
    try {
        localStorage.setItem(CHAVE, JSON.stringify(c));
    }
    catch { /* sem espaço */ }
}
const paraHex = (b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (h) => new Uint8Array((h.match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)));
async function impressao(senha, salHex) {
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deHex(salHex), iterations: RODADAS }, chave, 256);
    return paraHex(bits);
}
/** Chamado depois de um login COM internet que deu certo. */
export async function guardarNoCofre(email, senha, sessao) {
    if (!crypto?.subtle)
        return;
    const sal = paraHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await impressao(senha, sal);
    const c = ler();
    c[email.toLowerCase()] = { email: email.toLowerCase(), usuario_id: sessao.user.id, sal, hash, sessao, salvo_em: new Date().toISOString() };
    gravar(c);
}
/** Sessão renovada pelo Supabase: atualiza a cópia do cofre (o token antigo deixa de valer). */
export function atualizarSessaoNoCofre(sessao) {
    const c = ler();
    let mudou = false;
    for (const e of Object.values(c)) {
        if (e.usuario_id === sessao.user.id) {
            e.sessao = sessao;
            mudou = true;
        }
    }
    if (mudou)
        gravar(c);
}
/** Usuário bloqueado ou removido: tira deste computador. */
export function tirarDoCofre(usuarioId) {
    const c = ler();
    for (const k of Object.keys(c))
        if (c[k].usuario_id === usuarioId)
            delete c[k];
    gravar(c);
}
export function temNoCofre(email) {
    return Boolean(ler()[email.toLowerCase()]);
}
/** Retorna mensagem de erro, ou "" e coloca a sessão de volta para o sistema abrir. */
export async function entrarSemInternet(email, senha) {
    const e = ler()[email.toLowerCase()];
    if (!e)
        return "Sem internet. Este usuário ainda não entrou neste computador com internet, por isso não pode entrar offline aqui.";
    let t = { n: 0, ate: 0 };
    try {
        t = JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) || '{"n":0,"ate":0}');
    }
    catch { /* zera */ }
    if (Date.now() < t.ate)
        return "Muitas senhas erradas. Espere 1 minuto e tente de novo.";
    if (!crypto?.subtle)
        return "Este navegador não permite entrar sem internet.";
    const ok = (await impressao(senha, e.sal)) === e.hash;
    if (!ok) {
        t.n += 1;
        if (t.n >= 5) {
            t = { n: 0, ate: Date.now() + 60_000 };
        }
        try {
            localStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify(t));
        }
        catch { /* ignora */ }
        return "Usuário ou senha incorretos.";
    }
    try {
        localStorage.removeItem(CHAVE_TENTATIVAS);
        // Coloca a sessão onde o supabase-js procura ao abrir.
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify(e.sessao));
    }
    catch {
        return "Não foi possível abrir a sessão neste computador (espaço cheio).";
    }
    return "";
}
/** Sessão guardada de um usuário (para enviar as vendas dele mesmo depois que ele saiu). */
export function sessaoDoCofre(usuarioId) {
    return Object.values(ler()).find((e) => e.usuario_id === usuarioId)?.sessao ?? null;
}
