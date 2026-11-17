/*
  CONSULTAS NA CÓPIA LOCAL — mesmas respostas (mesmo formato) que o servidor
  daria, calculadas a partir do banco deste computador. Usadas quando não há
  conexão com o servidor.
*/
import type { Cliente, Configuracoes, Movimentacao, Parcela, Perfil, Produto, ProdutoView, ResumoPainel, SituacaoValidade, VendaCompleta } from "../types";
import { lerConfigGuardada } from "../perfilLocal";
import { lerTodos } from "./idb";

const hojeLocal = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + "T00:00:00") - Date.parse(de + "T00:00:00")) / 86_400_000);
const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const contem = (valor: unknown, termo: string) => valor != null && sem(String(valor)).includes(termo);

/** Igual à visão vw_produtos do banco. */
export function comoProdutoView(p: Produto, cfg: Configuracoes | null): ProdutoView {
  const hoje = hojeLocal();
  const dias = p.validade ? diasEntre(hoje, p.validade.slice(0, 10)) : null;
  const alerta = Number(cfg?.dias_alerta_validade ?? 30);
  let situacao: SituacaoValidade = "sem_validade";
  if (dias !== null) situacao = dias < 0 ? "vencido" : dias <= 7 ? "critico" : dias <= alerta ? "proximo" : "ok";
  const estoque = Number(p.estoque), minimo = Number(p.estoque_minimo);
  return {
    ...p,
    valor_estoque: Math.round(Number(p.custo) * estoque * 100) / 100,
    abaixo_minimo: minimo > 0 && estoque < minimo,
    dias_para_vencer: dias,
    situacao_validade: situacao,
  };
}

export async function produtosLocais(): Promise<ProdutoView[]> {
  const cfg = lerConfigGuardada();
  return (await lerTodos<Produto>("produtos")).map((p) => comoProdutoView(p, cfg));
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

export async function buscarProdutosLocal(termo: string, somenteAtivos: boolean, limite = 12) {
  const t = sem(termo.trim());
  return (await produtosLocais())
    .filter((p) => (!somenteAtivos || p.ativo) && (contem(p.nome, t) || contem(p.codigo, t) || contem(p.barras, t)))
    .sort(porNome).slice(0, limite);
}

export async function produtoLocal(id: number) {
  return (await produtosLocais()).find((p) => p.id === id) ?? null;
}

export async function produtosPorIds(ids: number[]) {
  const s = new Set(ids);
  return (await produtosLocais()).filter((p) => s.has(p.id));
}

export interface FiltroProdutos {
  situacao: "ativos" | "inativos" | "todos";
  categoria: string;
  alerta: string;
  busca: string;
  pagina: number;
  porPagina: number;
}

export async function listarProdutosLocal(f: FiltroProdutos) {
  const t = sem(f.busca.trim());
  let l = (await produtosLocais()).filter((p) =>
    (f.situacao === "todos" || p.ativo === (f.situacao === "ativos")) &&
    (!f.categoria || p.categoria === f.categoria) &&
    (f.alerta !== "minimo" || p.abaixo_minimo) &&
    (f.alerta !== "validade" || ["vencido", "critico", "proximo"].includes(p.situacao_validade)) &&
    (f.alerta !== "vencidos" || p.situacao_validade === "vencido") &&
    (!t || contem(p.nome, t) || contem(p.codigo, t) || contem(p.barras, t) || contem(p.categoria, t) || contem(p.fornecedor, t)));
  l = f.alerta === "validade" || f.alerta === "vencidos" ? l.sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999")) : l.sort(porNome);
  return { lista: l.slice(f.pagina * f.porPagina, f.pagina * f.porPagina + f.porPagina), total: l.length };
}

export async function categoriasEFornecedoresLocal() {
  const l = await lerTodos<Produto>("produtos");
  const unicos = (k: "categoria" | "fornecedor") => [...new Set(l.map((p) => p[k]).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { categorias: unicos("categoria"), fornecedores: unicos("fornecedor") };
}

export async function resumoPainelLocal(): Promise<ResumoPainel> {
  const l = await produtosLocais();
  const at = l.filter((p) => p.ativo);
  return {
    total_produtos: at.length,
    total_inativos: l.length - at.length,
    valor_estoque: Math.round(at.reduce((s, p) => s + p.valor_estoque, 0) * 100) / 100,
    abaixo_minimo: at.filter((p) => p.abaixo_minimo).length,
    proximos_vencimento: at.filter((p) => p.situacao_validade === "proximo" || p.situacao_validade === "critico").length,
    vencidos: at.filter((p) => p.situacao_validade === "vencido").length,
  } as ResumoPainel;
}

export async function movimentacoesLocal(f: { tipo?: string; produtoId?: number; desde?: string; pagina?: number; porPagina?: number; limite?: number }) {
  let l = (await lerTodos<Movimentacao>("movimentacoes"))
    .filter((m) => (!f.tipo || m.tipo === f.tipo) && (!f.produtoId || m.produto_id === f.produtoId) && (!f.desde || m.criado_em >= f.desde))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const total = l.length;
  if (f.porPagina !== undefined) l = l.slice((f.pagina ?? 0) * f.porPagina, (f.pagina ?? 0) * f.porPagina + f.porPagina);
  else if (f.limite) l = l.slice(0, f.limite);
  return { lista: l, total };
}

export async function vendasLocal(f: { desde?: string; status?: string; limite?: number } = {}) {
  return (await lerTodos<VendaCompleta>("vendas"))
    .filter((v) => (!f.desde || v.criado_em >= f.desde) && (!f.status || v.status === f.status))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, f.limite ?? 100_000);
}

/** Igual à consulta de fiado da tela Vendas: pagamento + dados da venda. */
export async function fiadosLocal(recebidos: boolean) {
  const vendas = await lerTodos<VendaCompleta>("vendas");
  return vendas.filter((v) => v.status === "concluida").flatMap((v) => v.venda_pagamentos
    .filter((p) => p.forma === "fiado" && Boolean(p.fiado_recebido_em) === recebidos)
    .map((p) => ({ ...p, vendas: { id: v.id, cliente_nome: v.cliente_nome, cliente_telefone: v.cliente_telefone, criado_em: v.criado_em, status: v.status, usuario_nome: v.usuario_nome } })))
    .sort((a, b) => b.id - a.id);
}

type ParcelaComJuncao = Parcela & { clientes: { nome: string; telefone: string | null } | null; vendas: { id: number; criado_em: string; status: string; total: number } };

export async function parcelasLocal(f: { status?: "aberta" | "paga"; atrasadas?: boolean; vendaId?: number; clienteId?: number } = {}) {
  const hoje = hojeLocal();
  let l = (await lerTodos<ParcelaComJuncao>("parcelas")).filter((p) =>
    (!f.status || p.status === f.status) && (!f.atrasadas || p.vencimento < hoje) &&
    (!f.vendaId || p.venda_id === f.vendaId) && (!f.clienteId || p.cliente_id === f.clienteId));
  l = f.status === "paga" ? l.sort((a, b) => String(b.pago_em ?? "").localeCompare(String(a.pago_em ?? ""))) :
    f.vendaId ? l.sort((a, b) => a.numero - b.numero) : l.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return l;
}

export async function clientesLocal(f: { termo?: string; somenteAtivos?: boolean; limite?: number } = {}) {
  const t = sem(f.termo?.trim() ?? "");
  return (await lerTodos<Cliente>("clientes"))
    .filter((c) => (!f.somenteAtivos || c.ativo) && (!t || contem(c.nome, t) || contem(c.telefone, t) || contem(c.cpf, t)))
    .sort(porNome).slice(0, f.limite ?? 100_000);
}

export async function caixasLocal(usuarioId: string | null) {
  return (await lerTodos<{ id: number; usuario_id: string; aberto_em: string }>("caixas"))
    .filter((c) => !usuarioId || c.usuario_id === usuarioId)
    .sort((a, b) => b.aberto_em.localeCompare(a.aberto_em));
}

export async function perfisLocal() {
  return (await lerTodos<Perfil>("perfis")).sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}
