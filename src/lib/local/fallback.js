/*
  "Servidor primeiro, cópia local se não der."
  - Com conexão: pergunta ao servidor (dados mais novos). Se ele não responder
    em 8 segundos ou der erro de rede, usa a cópia local.
  - Sem conexão: usa a cópia local direto, sem esperar.
  Erros que NÃO são de rede (permissão, dado inválido) continuam aparecendo.
*/
import { ehErroDeRede } from "../supabase";
import { estadoConexaoAgora, verificarServidor } from "../conexao";
const ouvintes = new Set();
/** As telas avisam quando estão mostrando dados guardados (para o aviso no alto). */
export function ouvirOrigemDados(f) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
const avisar = (local) => ouvintes.forEach((f) => f(local));
export async function doServidorOuLocal(servidor, local, opcoes = {}) {
    const usarLocal = async () => {
        const d = await local();
        avisar(true);
        return { data: d, error: null, count: opcoes.contar ? opcoes.contar(d) : null, local: true };
    };
    const e = estadoConexaoAgora();
    if (e === "offline" || e === "servidor")
        return usarLocal();
    let tempo;
    const limite = new Promise((ok) => { tempo = setTimeout(() => ok("tempo"), opcoes.espera ?? 8000); });
    try {
        const r = await Promise.race([Promise.resolve(servidor()), limite]);
        if (r === "tempo") {
            void verificarServidor();
            return usarLocal();
        }
        if (r.error && ehErroDeRede(r.error)) {
            void verificarServidor();
            return usarLocal();
        }
        if (r.error)
            return { data: (r.data ?? null), error: r.error, count: r.count ?? null, local: false };
        avisar(false);
        return { data: r.data, error: null, count: r.count ?? null, local: false };
    }
    catch (erro) {
        if (ehErroDeRede(erro)) {
            void verificarServidor();
            return usarLocal();
        }
        throw erro;
    }
    finally {
        clearTimeout(tempo);
    }
}
