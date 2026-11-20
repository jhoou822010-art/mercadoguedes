import { supabase } from "./supabase";
/** Busca todas as linhas de uma tabela/visão em páginas de 1000 (limite do Supabase). */
export async function buscarTodos(tabela, ordem = { coluna: "id", asc: true }) {
    const tamanho = 1000;
    const todos = [];
    for (let inicio = 0;; inicio += tamanho) {
        const { data, error } = await supabase
            .from(tabela)
            .select("*")
            .order(ordem.coluna, { ascending: ordem.asc ?? true })
            .range(inicio, inicio + tamanho - 1);
        if (error)
            throw error;
        todos.push(...(data ?? []));
        if (!data || data.length < tamanho)
            break;
    }
    return todos;
}
/** Escapa texto digitado para uso no filtro .or() do Supabase. */
export function termoBusca(texto) {
    return texto.trim().replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ");
}
