/*
  ENTRAR SEM INTERNET (troca de turno offline).

  Quando alguém entra COM internet neste computador, guardamos:
   - uma "impressão digital" da senha (PBKDF2-SHA256, 150 mil rodadas, com sal
     aleatório). A senha em si NUNCA é guardada e não dá para recuperá-la daqui;
   - a sessão do Supabase dessa pessoa (a mesma que o navegador já guarda
     para quem está logado).
  Sem internet, a pessoa digita usuário e senha; conferimos a impressão digital
  e reabrimos a sessão dela. Quando a internet volta, a sessão é renovada no
  Supabase e o acesso é conferido de novo (quem foi bloqueado sai na hora).

  Proteções: só funciona para quem já entrou antes NESTE computador; 5 senhas
  erradas seguidas bloqueiam a entrada offline por 1 minuto; quem for bloqueado
  pelo administrador é retirado daqui na próxima conexão.
*/
import type { Session } from "@supabase/supabase-js";
import { CHAVE_SESSAO } from "./supabase";

const CHAVE = "lojafacil.cofre";
const CHAVE_TENTATIVAS = "lojafacil.cofre.tentativas";
const RODADAS = 150_000;

interface Entrada {
  email: string;
  usuario_id: string;
  sal: string;
  hash: string;
  sessao: Session;
  salvo_em: string;
}
type Cofre = Record<string, Entrada>; // chave = e-mail de login

function ler(): Cofre {
  try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { return {}; }
}
function gravar(c: Cofre) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem espaço */ }
}

const paraHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (h: string) => new Uint8Array((h.match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)));

async function impressao(senha: string, salHex: string) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deHex(salHex), iterations: RODADAS }, chave, 256);
  return paraHex(bits);
}

/** Chamado depois de um login COM internet que deu certo. */
export async function guardarNoCofre(email: string, senha: string, sessao: Session) {
  if (!crypto?.subtle) return;
  const sal = paraHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await impressao(senha, sal);
  const c = ler();
  c[email.toLowerCase()] = { email: email.toLowerCase(), usuario_id: sessao.user.id, sal, hash, sessao, salvo_em: new Date().toISOString() };
  gravar(c);
}

/** Sessão renovada pelo Supabase: atualiza a cópia do cofre (o token antigo deixa de valer). */
export function atualizarSessaoNoCofre(sessao: Session) {
  const c = ler();
  let mudou = false;
  for (const e of Object.values(c)) {
    if (e.usuario_id === sessao.user.id) { e.sessao = sessao; mudou = true; }
  }
  if (mudou) gravar(c);
}

/** Usuário bloqueado ou removido: tira deste computador. */
export function tirarDoCofre(usuarioId: string) {
  const c = ler();
  for (const k of Object.keys(c)) if (c[k].usuario_id === usuarioId) delete c[k];
  gravar(c);
}

export function temNoCofre(email: string) {
  return Boolean(ler()[email.toLowerCase()]);
}

/** Retorna mensagem de erro, ou "" e coloca a sessão de volta para o sistema abrir. */
export async function entrarSemInternet(email: string, senha: string): Promise<string> {
  const e = ler()[email.toLowerCase()];
  if (!e) return "Sem internet. Este usuário ainda não entrou neste computador com internet, por isso não pode entrar offline aqui.";
  let t = { n: 0, ate: 0 };
  try { t = JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) || '{"n":0,"ate":0}'); } catch { /* zera */ }
  if (Date.now() < t.ate) return "Muitas senhas erradas. Espere 1 minuto e tente de novo.";
  if (!crypto?.subtle) return "Este navegador não permite entrar sem internet.";
  const ok = (await impressao(senha, e.sal)) === e.hash;
  if (!ok) {
    t.n += 1;
    if (t.n >= 5) { t = { n: 0, ate: Date.now() + 60_000 }; }
    try { localStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify(t)); } catch { /* ignora */ }
    return "Usuário ou senha incorretos.";
  }
  try {
    localStorage.removeItem(CHAVE_TENTATIVAS);
    // Coloca a sessão onde o supabase-js procura ao abrir.
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(e.sessao));
  } catch { return "Não foi possível abrir a sessão neste computador (espaço cheio)."; }
  return "";
}

/** Sessão guardada de um usuário (para enviar as vendas dele mesmo depois que ele saiu). */
export function sessaoDoCofre(usuarioId: string): Session | null {
  return Object.values(ler()).find((e) => e.usuario_id === usuarioId)?.sessao ?? null;
}
