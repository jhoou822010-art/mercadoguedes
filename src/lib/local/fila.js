/*
  FILA DE ENVIO ("subida") — operações feitas neste computador que ainda
  precisam chegar ao Supabase: abrir caixa, vendas, sangrias/suprimentos e
  fechamento.

  Regras de segurança:
  - Cada operação tem um código único (uuid) criado no computador. O servidor
    aceita o mesmo código UMA vez só (SQL 0010): mandar de novo não duplica.
  - A operação só vira "sincronizado" depois que o servidor CONFIRMA.
  - Ordem preservada: abrir caixa → vendas/sangrias → fechamento.
  - Sem internet: para e tenta de novo depois. Erro do servidor (regra):
    marca "erro", guarda a mensagem e segue com as outras; o administrador vê
    e pode mandar de novo.
  - Nada é apagado da fila: o histórico das operações enviadas fica guardado.
*/
import { createClient } from "@supabase/supabase-js";
import { supabase, ehErroDeRede } from "../supabase";
import { atualizarSessaoNoCofre, sessaoDoCofre } from "../cofreSessoes";
import { estadoConexaoAgora, verificarServidor } from "../conexao";
import { abrirBanco, gravarVarios, lerTodos, lerUm } from "./idb";
let ordemSeq = 0;
export function novaOperacao(dados) {
    return { ...dados, ordem: Date.now() * 1000 + (ordemSeq++ % 1000), criado_em: new Date().toISOString(), estado: "pendente", tentativas: 0, erro: null, enviado_em: null, servidor_id: null };
}
let resumo = { pendentes: 0, erros: 0, enviando: false, ultimaFalha: "" };
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());
export const resumoFila = () => resumo;
export function ouvirFila(f) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
export async function atualizarResumoFila() {
    try {
        const ops = await lerTodos("fila");
        resumo = { ...resumo, pendentes: ops.filter((o) => o.estado === "pendente" || o.estado === "sincronizando").length, erros: ops.filter((o) => o.estado === "erro").length };
        avisar();
    }
    catch { /* banco local indisponível */ }
}
export async function operacoesComErro() {
    return (await lerTodos("fila")).filter((o) => o.estado === "erro").sort((a, b) => a.ordem - b.ordem);
}
/** Marca de novo como pendente as operações com erro (botão "Tentar de novo"). */
export async function tentarDeNovo(ids) {
    const ops = (await lerTodos("fila")).filter((o) => o.estado === "erro" && (!ids || ids.includes(o.id)));
    await gravarVarios("fila", ops.map((o) => ({ ...o, estado: "pendente", erro: null })));
    await atualizarResumoFila();
    void processarFila();
}
/* ------------------------------ envio ------------------------------ */
/**
 * Cliente do Supabase com a sessão de OUTRO usuário (guardada neste computador),
 * para enviar as vendas que ele fez sem internet mesmo depois que saiu
 * (troca de turno). O servidor confere tudo pelas regras dele, como sempre.
 */
const clientes = new Map();
async function clienteDe(usuarioId, atual) {
    if (usuarioId === atual)
        return supabase;
    const s = sessaoDoCofre(usuarioId);
    if (!s)
        return null;
    let c = clientes.get(usuarioId);
    if (!c) {
        c = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } });
        const r = await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
        if (r.error || !r.data.session)
            return null;
        atualizarSessaoNoCofre(r.data.session); // o token antigo deixa de valer: guarda o novo
        clientes.set(usuarioId, c);
    }
    return c;
}
let rodando = false;
let pedidoDeNovo = false;
const depoisDoEnvio = new Set();
/** Chamado quando a fila termina de enviar algo (ex.: atualizar a cópia local). */
export function aoTerminarEnvio(f) { depoisDoEnvio.add(f); return () => { depoisDoEnvio.delete(f); }; }
async function marcarAlvo(op, estado, servidorId) {
    const atual = await lerUm(op.alvo.tabela, op.alvo.id);
    if (!atual)
        return;
    await gravarVarios(op.alvo.tabela, [{ ...atual, sync: estado, ...(estado === "sincronizado" ? { sincronizado_em: new Date().toISOString(), servidor_id: servidorId } : {}) }]);
}
/**
 * Envia as operações pendentes, em ordem. Seguro para chamar várias vezes
 * (só um envio por vez; se chamado durante um envio, roda de novo no fim).
 */
export async function processarFila() {
    if (rodando) {
        pedidoDeNovo = true;
        return;
    }
    if (estadoConexaoAgora() === "offline")
        return;
    rodando = true;
    resumo = { ...resumo, enviando: true };
    avisar();
    let enviouAlgo = false;
    try {
        // Só um computador/aba envia por vez (o servidor também protege contra repetição).
        const executar = async () => {
            const ops = (await lerTodos("fila")).filter((o) => o.estado === "pendente" || o.estado === "sincronizando").sort((a, b) => a.ordem - b.ordem);
            const { data: s } = await supabase.auth.getSession();
            const atual = s.session?.user.id ?? null;
            const semSessao = new Set();
            for (const op of ops) {
                if (semSessao.has(op.usuario_id))
                    continue;
                const cliente = await clienteDe(op.usuario_id, atual).catch(() => null);
                if (!cliente) {
                    semSessao.add(op.usuario_id);
                    continue;
                } // envia quando essa pessoa entrar com internet
                await gravarVarios("fila", [{ ...op, estado: "sincronizando", tentativas: op.tentativas + 1 }]);
                const { data, error } = await cliente.rpc(op.funcao, op.parametros);
                if (error && ehErroDeRede(error)) {
                    await gravarVarios("fila", [{ ...op, estado: "pendente", tentativas: op.tentativas + 1 }]);
                    resumo = { ...resumo, ultimaFalha: "Sem conexão com o servidor; tentando de novo em instantes." };
                    void verificarServidor();
                    return; // para tudo: sem internet não adianta seguir
                }
                // Função de sincronização ainda não existe no servidor (SQL 0010 não rodado):
                // NÃO é erro da venda — ela continua guardada e é enviada quando o SQL for rodado.
                const msg = error?.message ?? "";
                if (error && (error.code === "PGRST202" || /Could not find the function|does not exist/i.test(msg))) {
                    await gravarVarios("fila", [{ ...op, estado: "pendente", tentativas: op.tentativas + 1 }]);
                    resumo = { ...resumo, ultimaFalha: "O servidor ainda não tem o SQL 0010 (caixa offline). As vendas estão guardadas neste computador e serão enviadas assim que o administrador rodar o SQL 0010 no Supabase." };
                    return;
                }
                if (error) {
                    await gravarVarios("fila", [{ ...op, estado: "erro", tentativas: op.tentativas + 1, erro: error.message ?? String(error) }]);
                    await marcarAlvo(op, "erro", null);
                    continue;
                }
                const servidorId = data?.id ?? null;
                await gravarVarios("fila", [{ ...op, estado: "sincronizado", tentativas: op.tentativas + 1, erro: null, enviado_em: new Date().toISOString(), servidor_id: servidorId }]);
                await marcarAlvo(op, "sincronizado", servidorId);
                enviouAlgo = true;
            }
            resumo = { ...resumo, ultimaFalha: "" };
        };
        resumo = { ...resumo, ultimaFalha: "" };
        const locks = navigator.locks;
        if (locks)
            await locks.request("lojafacil-fila", executar);
        else
            await executar();
    }
    catch (e) {
        resumo = { ...resumo, ultimaFalha: e?.message ?? String(e) };
    }
    finally {
        rodando = false;
        resumo = { ...resumo, enviando: false };
        await atualizarResumoFila();
        if (enviouAlgo)
            depoisDoEnvio.forEach((f) => f());
        if (pedidoDeNovo) {
            pedidoDeNovo = false;
            void processarFila();
        }
    }
}
/** Banco local disponível? (para a tela avisar se o navegador bloquear) */
export async function bancoLocalOk() {
    try {
        await abrirBanco();
        return true;
    }
    catch {
        return false;
    }
}
