/*
  "Servidor primeiro, cópia local se não der."
  - Com conexão: pergunta ao servidor (dados mais novos). Se ele não responder
    em 8 segundos ou der erro de rede, usa a cópia local.
  - Sem conexão: usa a cópia local direto, sem esperar.
  Erros que NÃO são de rede (permissão, dado inválido) continuam aparecendo.
*/
import { ehErroDeRede } from "../supabase";
import { estadoConexaoAgora, verificarServidor } from "../conexao";

type RespostaServidor<T> = { data: T | null; error: unknown; count?: number | null };
export interface Resultado<T> { data: T; error: unknown; count: number | null; local: boolean }

const ouvintes = new Set<(local: boolean) => void>();
/** As telas avisam quando estão mostrando dados guardados (para o aviso no alto). */
export function ouvirOrigemDados(f: (local: boolean) => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
const avisar = (local: boolean) => ouvintes.forEach((f) => f(local));

export async function doServidorOuLocal<T>(
  servidor: () => PromiseLike<RespostaServidor<T>>,
  local: () => Promise<T>,
  opcoes: { contar?: (d: T) => number; espera?: number } = {},
): Promise<Resultado<T>> {
  const usarLocal = async (): Promise<Resultado<T>> => {
    const d = await local();
    avisar(true);
    return { data: d, error: null, count: opcoes.contar ? opcoes.contar(d) : null, local: true };
  };
  const e = estadoConexaoAgora();
  if (e === "offline" || e === "servidor") return usarLocal();
  let tempo: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<"tempo">((ok) => { tempo = setTimeout(() => ok("tempo"), opcoes.espera ?? 8000); });
  try {
    const r = await Promise.race([Promise.resolve(servidor()), limite]);
    if (r === "tempo") { void verificarServidor(); return usarLocal(); }
    if (r.error && ehErroDeRede(r.error)) { void verificarServidor(); return usarLocal(); }
    if (r.error) return { data: (r.data ?? null) as T, error: r.error, count: r.count ?? null, local: false };
    avisar(false);
    return { data: r.data as T, error: null, count: r.count ?? null, local: false };
  } catch (erro) {
    if (ehErroDeRede(erro)) { void verificarServidor(); return usarLocal(); }
    throw erro;
  } finally {
    clearTimeout(tempo);
  }
}
