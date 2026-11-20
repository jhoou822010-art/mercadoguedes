import { useEffect, useMemo, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { movimentacoesLocal, produtosLocais } from "../lib/local/consultas";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { baixarCsv, hojeArquivo } from "../lib/csv";
import { exportarProdutosCsv } from "../lib/planilha";
import { fmtData, fmtDataHora, fmtMoeda, fmtQtd, NOME_TIPO, textoDias } from "../lib/format";
import type { Movimentacao, ProdutoView } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Aviso, Cabecalho, Carregando, SeloTipo, SeloValidade, Vazio } from "../components/Ui";
import { imprimir } from "../lib/imprimir";

type Rel = "produtos" | "estoque" | "minimo" | "validade" | "movimentacoes";
const RELATORIOS: { id: Rel; titulo: string; descricao: string }[] = [
  { id: "produtos", titulo: "Produtos cadastrados", descricao: "Cadastro completo de todos os produtos." },
  { id: "estoque", titulo: "Estoque atual", descricao: "Saldo e valor estimado pelo custo (produtos ativos)." },
  { id: "minimo", titulo: "Abaixo do mínimo", descricao: "Produtos ativos que precisam de reposição." },
  { id: "validade", titulo: "Próximos do vencimento", descricao: "Produtos ativos vencidos ou perto de vencer." },
  { id: "movimentacoes", titulo: "Movimentações recentes", descricao: "Entradas, saídas e ajustes do período escolhido." },
];

export default function Relatorios() {
  const { config } = useAuth();
  const avisar = useToast();
  const [params, setParams] = useSearchParams();
  const rel = (RELATORIOS.some((r) => r.id === params.get("r")) ? params.get("r") : "produtos") as Rel;
  const [produtos, setProdutos] = useState<ProdutoView[] | null>(null);
  const [movs, setMovs] = useState<Movimentacao[] | null>(null);
  const [dias, setDias] = useState(30);
  const [erro, setErro] = useState("");

  useEffect(() => {
    doServidorOuLocal<ProdutoView[]>(
      async () => {
        try { return { data: await buscarTodos<ProdutoView>("vw_produtos", { coluna: "nome" }), error: null }; }
        catch (e) { return { data: null, error: e }; }
      },
      async () => (await produtosLocais()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    ).then(({ data, error }) => (error ? setErro(mensagemErro(error)) : setProdutos(data))).catch((e) => setErro(mensagemErro(e)));
  }, []);

  useEffect(() => {
    if (rel !== "movimentacoes") return;
    setMovs(null);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    void doServidorOuLocal<Movimentacao[]>(
      () => supabase.from("movimentacoes").select("*").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(5000),
      async () => (await movimentacoesLocal({ desde, limite: 5000 })).lista,
    ).then(({ data, error }) => (error ? setErro(mensagemErro(error)) : setMovs(data)));
  }, [rel, dias]);

  const dados = useMemo(() => {
    if (!produtos) return null;
    const ativos = produtos.filter((p) => p.ativo);
    switch (rel) {
      case "estoque": return ativos;
      case "minimo": return ativos.filter((p) => p.abaixo_minimo).sort((a, b) => a.estoque / (a.estoque_minimo || 1) - b.estoque / (b.estoque_minimo || 1));
      case "validade": return ativos.filter((p) => ["vencido", "critico", "proximo"].includes(p.situacao_validade)).sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? ""));
      default: return produtos;
    }
  }, [produtos, rel]);

  const info = RELATORIOS.find((r) => r.id === rel)!;
  const valorTotal = (dados ?? []).reduce((s, p) => s + Number(p.valor_estoque), 0);

  function exportar() {
    const nome = `loja-facil-${rel}-${hojeArquivo()}.csv`;
    if (rel === "movimentacoes") {
      if (!movs) return;
      baixarCsv(nome, ["Data", "Código", "Produto", "Tipo", "Quantidade", "Saldo anterior", "Saldo após", "Observação", "Usuário"],
        movs.map((m) => [fmtDataHora(m.criado_em), m.produto_codigo, m.produto_nome, NOME_TIPO[m.tipo], Number(m.quantidade), Number(m.saldo_anterior), Number(m.saldo_apos), m.observacao, m.usuario_nome]));
      avisar("sucesso", `${movs.length} movimentação(ões) exportada(s) para ${nome}.`);
      return;
    }
    if (!dados) return;
    exportarProdutosCsv(dados, nome);
    avisar("sucesso", `${dados.length} produto(s) exportado(s) para ${nome}. Abra no Excel ou outro programa de planilhas.`);
  }

  const carregando = rel === "movimentacoes" ? !movs : !dados;

  // Aberto por "Imprimir lista" (tela Produtos): imprime assim que os dados chegam.
  const [impresso, setImpresso] = useState(false);
  useEffect(() => {
    if (params.get("imprimir") === "1" && !carregando && !impresso) {
      setImpresso(true);
      setTimeout(() => void imprimir("folha", `relatorio-${rel}`), 300);
    }
  }, [params, carregando, impresso]);
  const vazio = rel === "movimentacoes" ? movs?.length === 0 : dados?.length === 0;

  return (
    <div>
      <Cabecalho
        titulo="Relatórios"
        descricao="Consulte, imprima ou exporte em CSV para o Excel."
        acoes={
          <>
            <button className="btn-secundario" disabled={carregando || vazio} onClick={() => void imprimir("folha", `relatorio-${rel}`)}>🖨 Imprimir</button>
            <button className="btn-acao" disabled={carregando || vazio} onClick={exportar}>⤓ Exportar CSV</button>
          </>
        }
      />

      <div className="nao-imprimir mb-4 flex gap-2 overflow-x-auto pb-1">
        {RELATORIOS.map((r) => (
          <button
            key={r.id}
            onClick={() => setParams({ r: r.id }, { replace: true })}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${rel === r.id ? "bg-petroleo-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}
          >
            {r.titulo}
          </button>
        ))}
      </div>

      {erro && <div className="mb-4"><Aviso cor="critico">{erro}</Aviso></div>}

      <section className="cartao area-impressao">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <p className="somente-impressao text-xs">{config?.nome_loja} · Gerenciador de Mercado · emitido em {fmtDataHora(new Date().toISOString())}</p>
            <h2 className="font-semibold">{info.titulo}</h2>
            <p className="text-xs text-slate-500">{info.descricao}</p>
          </div>
          {rel === "movimentacoes" && (
            <select className="campo nao-imprimir w-auto py-1 text-sm" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período">
              <option value={1}>Últimas 24 horas</option>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          )}
          {rel === "estoque" && dados && <p className="text-sm">Valor total (custo): <strong>{fmtMoeda(valorTotal)}</strong></p>}
        </div>

        {carregando ? <Carregando /> : vazio ? <Vazio titulo="Nada para mostrar neste relatório." /> : (
          <div className="overflow-x-auto">
            {rel === "movimentacoes" ? (
              <table className="tabela">
                <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Saldo após</th><th>Observação</th><th>Usuário</th></tr></thead>
                <tbody>
                  {movs!.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-xs">{fmtDataHora(m.criado_em)}</td>
                      <td>{m.produto_nome} <span className="text-xs text-slate-400">({m.produto_codigo})</span></td>
                      <td><SeloTipo tipo={m.tipo} /></td>
                      <td className="text-right">{fmtQtd(m.quantidade)}</td>
                      <td className="text-right font-semibold">{fmtQtd(m.saldo_apos)}</td>
                      <td className="text-xs text-slate-500">{m.observacao ?? "—"}</td>
                      <td className="text-xs text-slate-500">{m.usuario_nome ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Código</th><th>Produto</th>
                    {rel === "produtos" && <><th>Categoria</th><th>Fornecedor</th><th className="text-right">Custo</th><th className="text-right">Preço</th></>}
                    <th className="text-right">Estoque</th>
                    {(rel === "minimo" || rel === "produtos") && <th className="text-right">Mínimo</th>}
                    {rel === "minimo" && <th className="text-right">Repor</th>}
                    {rel === "estoque" && <><th className="text-right">Custo</th><th className="text-right">Valor</th></>}
                    {(rel === "validade" || rel === "produtos") && <th>Validade</th>}
                    {rel === "validade" && <th>Situação</th>}
                    {rel === "produtos" && <th>Ativo</th>}
                  </tr>
                </thead>
                <tbody>
                  {dados!.map((p) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs">{p.codigo}</td>
                      <td>{p.nome}</td>
                      {rel === "produtos" && <><td>{p.categoria ?? "—"}</td><td>{p.fornecedor ?? "—"}</td><td className="text-right">{fmtMoeda(p.custo)}</td><td className="text-right">{fmtMoeda(p.preco)}</td></>}
                      <td className="whitespace-nowrap text-right">{fmtQtd(p.estoque, p.unidade)} {p.unidade}</td>
                      {(rel === "minimo" || rel === "produtos") && <td className="text-right">{fmtQtd(p.estoque_minimo, p.unidade)}</td>}
                      {rel === "minimo" && <td className="text-right font-semibold text-atencao-700">{fmtQtd(Math.max(0, p.estoque_minimo - p.estoque), p.unidade)}</td>}
                      {rel === "estoque" && <><td className="text-right">{fmtMoeda(p.custo)}</td><td className="text-right font-semibold">{fmtMoeda(p.valor_estoque)}</td></>}
                      {(rel === "validade" || rel === "produtos") && <td className="whitespace-nowrap">{fmtData(p.validade)}</td>}
                      {rel === "validade" && <td><SeloValidade p={p} /> <span className="somente-impressao">{textoDias(p.dias_para_vencer)}</span></td>}
                      {rel === "produtos" && <td>{p.ativo ? "Sim" : "Não"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
