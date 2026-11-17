import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quando o arquivo .env (ou as variáveis da hospedagem) foi preenchido. */
export const supabaseConfigurado = Boolean(url && chave && !url.includes("SEU-PROJETO"));

/** Onde o supabase-js guarda a sessão neste navegador (sb-<projeto>-auth-token). */
export const CHAVE_SESSAO = (() => {
  try { return `sb-${new URL(url || "https://exemplo.supabase.co").hostname.split(".")[0]}-auth-token`; } catch { return ""; }
})();

/** Erro de rede (sem internet / servidor fora do ar), e não erro de permissão ou de dados. */
export function ehErroDeRede(erro: unknown) {
  const e = erro as { message?: string; name?: string; status?: number } | null;
  const m = `${e?.name ?? ""} ${e?.message ?? String(erro ?? "")}`;
  return (typeof navigator !== "undefined" && navigator.onLine === false)
    || /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed|AuthRetryableFetchError|ERR_INTERNET|ERR_NAME|timeout|ECONN/i.test(m)
    || e?.status === 0 || (typeof e?.status === "number" && e.status >= 502 && e.status <= 504);
}

export const supabase = createClient(
  url || "https://exemplo.supabase.co",
  chave || "chave-ausente",
  // Sem repetições automáticas (1s + 2s + 4s): sem internet, o sistema passa
  // na hora para a cópia guardada no computador, em vez de esperar 7 segundos.
  { db: { retry: false } },
);

/** Converte erros do Supabase/Postgres em mensagens claras em português. */
export function mensagemErro(erro: unknown): string {
  const e = erro as { message?: string; code?: string; details?: string } | null;
  const msg = e?.message ?? String(erro);
  if (e?.code === "23505") {
    if (msg.includes("barras")) return "Já existe outro produto com este código de barras.";
    if (msg.includes("codigo")) return "Já existe outro produto com este código interno.";
    return "Já existe um registro com estes dados.";
  }
  if (e?.code === "23514") return "Algum valor está inválido (por exemplo, número negativo).";
  if (e?.code === "42501" || msg.includes("row-level security"))
    return "Seu usuário não tem permissão para esta ação.";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (msg.includes("User already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("Failed to fetch")) return "Sem conexão com o servidor. Verifique a internet.";
  return msg;
}
