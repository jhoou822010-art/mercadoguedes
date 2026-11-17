import { useCallback, useEffect, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { fiadosLocal, movimentacoesLocal, parcelasLocal, produtosLocais, resumoPainelLocal, vendasLocal } from "../lib/local/consultas";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { fmtDataHora, fmtQtd, fmtData } from "../lib/format";
import type { Movimentacao, ProdutoView, ResumoPainel } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { Cabecalho, Carregando, SeloTipo, SeloValidade, Vazio, Aviso } from "../components/Ui";
import { OlhoValores } from "../components/OlhoValores";
import { useMoeda } from "../lib/privacidade";

function Indicador({ titulo, valor, detalhe, para, cor }: { titulo: string; valor: string; detalhe?: string; para: string; cor: string }) {
  return (
    <Link to={para} className={`cartao group block border-l-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md ${cor}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{valor}</p>
      <p className="mt-1 text-xs text-slate-500 group-hover:text-petroleo-700">{detalhe ?? "Ver detalhes →"}</p>
    </Link>
  );
}

export default function Painel() {
  const { perfil, ehAdmin, config, tem0006, valoresOcultos } = useAuth();
  const moeda = useMoeda();
  const [resumo, setResumo] = useState<ResumoPainel | null>(null);
  const [baixos, setBaixos] = useState<ProdutoView[]>([]);
  const [vencendo, setVencendo] = useState<ProdutoView[]>([]);
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [erro, setErro] = useState("");
  const [hoje, setHoje] = useState<{ qtd: number; total: number } | null>(null);
  const [receber, setReceber] = useState<{ fiado: number; crediario: number; atrasado: number; clientes: number } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const hojeTxt = new Date().toLocaleDateString("sv-SE");
      type Fiado = { valor: number; vendas: { cliente_nome: string | null } };
      type ParcelaResumo = { valor: number; vencimento: string; cliente_id: number };
      type Dados = { r: ResumoPainel; b: ProdutoView[]; v: ProdutoView[]; m: Movimentacao[]; vh: { total: number }[]; fi: Fiado[]; pa: ParcelaResumo[] };
      // Com servidor: dados ao vivo. Sem servidor: a cópia guardada neste computador.
      const { data, error } = await doServidorOuLocal<Dados>(
        async () => {
          const [r, b, v, m, vh, fi, pa] = await Promise.all([
            supabase.rpc("resumo_painel"),
            supabase.from("vw_produtos").select("*").eq("ativo", true).eq("abaixo_minimo", true).order("estoque").limit(6),
            supabase.from("vw_produtos").select("*").eq("ativo", true).in("situacao_validade", ["vencido", "critico", "proximo"]).order("validade").limit(6),
            supabase.from("movimentacoes").select("*").order("criado_em", { ascending: false }).limit(8),
            supabase.from("vendas").select("total").eq("status", "concluida").gte("criado_em", inicio.toISOString()).limit(5000),
            supabase.from("venda_pagamentos").select("valor, vendas!inner(status, cliente_nome)").eq("forma", "fiado").is("fiado_recebido_em", null).eq("vendas.status", "concluida").limit(10000),
            tem0006 ? supabase.from("parcelas").select("valor, vencimento, cliente_id").eq("status", "aberta").limit(10000) : Promise.resolve({ data: [] as ParcelaResumo[], error: null }),
          ]);
          const erro = [r, b, v, m, vh, fi, pa].find((x) => x.error)?.error ?? null;
          return {
            data: erro ? null : { r: r.data as ResumoPainel, b: b.data as ProdutoView[], v: v.data as ProdutoView[], m: m.data as Movimentacao[], vh: (vh.data ?? []) as { total: number }[], fi: (fi.data ?? []) as unknown as Fiado[], pa: (pa.data ?? []) as ParcelaResumo[] },
            error: erro,
          };
        },
        async () => {
          const produtos = (await produtosLocais()).filter((p) => p.ativo);
          return {
            r: await resumoPainelLocal(),
            b: produtos.filter((p) => p.abaixo_minimo).sort((a, b) => a.estoque - b.estoque).slice(0, 6),
            v: produtos.filter((p) => ["vencido", "critico", "proximo"].includes(p.situacao_validade)).sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? "")).slice(0, 6),
            m: (await movimentacoesLocal({ limite: 8 })).lista,
            vh: await vendasLocal({ desde: inicio.toISOString(), status: "concluida" }),
            fi: (await fiadosLocal(false)) as unknown as Fiado[],
            pa: tem0006 ? await parcelasLocal({ status: "aberta" }) : [],
          };
        },
      );
      if (error) throw error;
      setResumo(data.r);
      setBaixos(data.b);
      setVencendo(data.v);
      setMovs(data.m);
      setHoje({ qtd: data.vh.length, total: data.vh.reduce((s, v) => s + Number(v.total), 0) });
      setReceber({
        fiado: data.fi.reduce((s, f) => s + Number(f.valor), 0),
        crediario: data.pa.reduce((s, p) => s + Number(p.valor), 0),
        atrasado: data.pa.filter((p) => p.vencimento < hojeTxt).reduce((s, p) => s + Number(p.valor), 0),
        clientes: new Set([...data.fi.map((f) => `f:${f.vendas.cliente_nome}`), ...data.pa.map((p) => `c:${p.cliente_id}`)]).size,
      });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [tem0006]);

  useEffect(() => {
    void carregar();
    // Atualiza o painel quando outra pessoa movimenta o estoque (realtime opcional).
    const canal = supabase
      .channel("painel")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimentacoes" }, () => void carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () => void carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "vendas" }, () => void carregar())
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [carregar]);

  const primeiroNome = perfil?.nome.split(" ")[0] ?? "";

  return (
    <div>
      <Cabecalho
        titulo={`Olá, ${primeiroNome}`}
        descricao={config ? `${config.nome_loja} · resumo da loja agora` : "Resumo da loja agora"}
        acoes={
          <>
            <OlhoValores />
            <Link to="/caixa" className="btn-acao">🛒 Abrir o caixa</Link>
            {ehAdmin && <Link to="/produtos?novo=1" className="btn-secundario">+ Cadastrar produto</Link>}
            <Link to="/estoque" className="btn-primario">⇅ Movimentar estoque</Link>
            <Link to="/etiquetas" className="btn-secundario">🏷 Imprimir etiqueta</Link>
          </>
        }
      />

      {erro && <div className="mb-4"><Aviso cor="critico">Não foi possível carregar o painel: {erro}</Aviso></div>}
      {!resumo && !erro && <Carregando />}

      {resumo && (
        <>
          {!valoresOcultos && (hoje || receber) && (
            <div className="mb-3 grid gap-3 lg:grid-cols-2">
              {hoje && (
                <Link to="/vendas" className="cartao flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-acao-500 p-4 hover:shadow-md">
                  <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Vendas de hoje</span>
                  <span className="text-lg"><strong>{hoje.qtd}</strong> venda(s) · <strong className="text-2xl">{moeda(hoje.total)}</strong></span>
                </Link>
              )}
              {receber && (
                <Link to={receber.atrasado > 0 ? "/vendas?aba=crediario" : "/vendas?aba=fiado"} className={`cartao flex flex-wrap items-center justify-between gap-2 border-l-4 p-4 hover:shadow-md ${receber.atrasado > 0 ? "border-l-critico-600" : "border-l-petroleo-600"}`}>
                  <span>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-slate-500">A receber (fiado + crediário)</span>
                    <span className="text-xs text-slate-500">
                      Fiado {moeda(receber.fiado)} · Crediário {moeda(receber.crediario)} · {receber.clientes} cliente(s)
                      {receber.atrasado > 0 && <strong className="ml-1 text-critico-600">· atrasado {moeda(receber.atrasado)}</strong>}
                    </span>
                  </span>
                  <strong className="text-2xl">{moeda(receber.fiado + receber.crediario)}</strong>
                </Link>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador titulo="Produtos ativos" valor={String(resumo.total_produtos)} detalhe={resumo.total_inativos ? `${resumo.total_inativos} inativo(s) · ver lista →` : undefined} para="/produtos" cor="border-l-petroleo-600" />
            <Indicador titulo="Valor do estoque (custo)" valor={moeda(resumo.valor_estoque)} para="/relatorios?r=estoque" cor="border-l-petroleo-600" />
            <Indicador titulo="Abaixo do mínimo" valor={String(resumo.abaixo_minimo)} para="/produtos?alerta=minimo" cor={resumo.abaixo_minimo ? "border-l-atencao-500" : "border-l-ok-600"} />
            <Indicador
              titulo="Validade"
              valor={`${resumo.proximos_vencimento} próximo(s)`}
              detalhe={resumo.vencidos ? `${resumo.vencidos} vencido(s) →` : undefined}
              para="/produtos?alerta=validade"
              cor={resumo.vencidos ? "border-l-critico-600" : resumo.proximos_vencimento ? "border-l-atencao-500" : "border-l-ok-600"}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="cartao">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold">Abaixo do estoque mínimo</h2>
                <Link to="/produtos?alerta=minimo" className="text-xs font-semibold text-petroleo-700 hover:underline">Ver todos</Link>
              </div>
              {baixos.length === 0 ? <Vazio titulo="Tudo certo: nenhum produto abaixo do mínimo." /> : (
                <ul className="divide-y divide-slate-100">
                  {baixos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{p.nome}</span>
                      <span className="shrink-0 text-right">
                        <span className="font-semibold text-atencao-700">{fmtQtd(p.estoque, p.unidade)}</span>
                        <span className="text-slate-400"> / mín. {fmtQtd(p.estoque_minimo, p.unidade)} {p.unidade}</span>
                        <Link to={`/estoque?produto=${p.id}`} className="ml-3 text-xs font-semibold text-petroleo-700 hover:underline">Repor</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cartao">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold">Validade próxima ou vencida</h2>
                <Link to="/produtos?alerta=validade" className="text-xs font-semibold text-petroleo-700 hover:underline">Ver todos</Link>
              </div>
              {vencendo.length === 0 ? <Vazio titulo="Nenhum produto perto do vencimento." /> : (
                <ul className="divide-y divide-slate-100">
                  {vencendo.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{p.nome}</span>
                        <span className="text-xs text-slate-400">Validade {fmtData(p.validade)}</span>
                      </span>
                      <SeloValidade p={p} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="cartao mt-6">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold">Últimas movimentações</h2>
              <Link to="/estoque" className="text-xs font-semibold text-petroleo-700 hover:underline">Ver histórico</Link>
            </div>
            {movs.length === 0 ? <Vazio titulo="Nenhuma movimentação ainda." /> : (
              <div className="overflow-x-auto">
                <table className="tabela">
                  <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Saldo</th><th className="hidden md:table-cell">Usuário</th></tr></thead>
                  <tbody>
                    {movs.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap text-slate-500">{fmtDataHora(m.criado_em)}</td>
                        <td className="max-w-[14rem] truncate">{m.produto_nome}</td>
                        <td><SeloTipo tipo={m.tipo} /></td>
                        <td className="text-right">{fmtQtd(m.quantidade)}</td>
                        <td className="text-right font-semibold">{fmtQtd(m.saldo_apos)}</td>
                        <td className="hidden text-slate-500 md:table-cell">{m.usuario_nome ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
