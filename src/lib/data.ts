import { supabase } from "./supabase";

/** Busca todas as linhas de uma tabela/visão em páginas de 1000 (limite do Supabase). */
export async function buscarTodos<T>(
  tabela: string,
  ordem: { coluna: string; asc?: boolean } = { coluna: "id", asc: true },
): Promise<T[]> {
  const tamanho = 1000;
  const todos: T[] = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .order(ordem.coluna, { ascending: ordem.asc ?? true })
      .range(inicio, inicio + tamanho - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as T[]));
    if (!data || data.length < tamanho) break;
  }
  return todos;
}

/** Escapa texto digitado para uso no filtro .or() do Supabase. */
export function termoBusca(texto: string) {
  return texto.trim().replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ");
}
