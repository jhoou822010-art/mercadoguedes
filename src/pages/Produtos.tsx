import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { buscarTodos, termoBusca } from "../lib/data";
import { exportarProdutosCsv } from "../lib/planilha";
import { ImportarPlanilha } from "./ImportarPlanilha";
import { fmtData, fmtDataHora, fmtMoeda, fmtQtd } from "../lib/format";
import type { Movimentacao, ProdutoView } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar, Modal } from "../components/Modal";
import { Aviso, Cabecalho, Carregando, Selo, SeloEstoque, SeloTipo, SeloValidade, Vazio } from "../components/Ui";
import { ProdutoForm } from "./ProdutoForm";

const POR_PAGINA = 50;
type Situacao = "ativos" | "inativos" | "todos";
type Alerta = "" | "minimo" | "validade" | "vencidos";

export default function Produtos() {
  const { ehAdmin } = useAuth();
  const avisar = useToast();
  const [params, setParams] = useSearchParams();

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  const [categoria, setCategoria] = useState("");
  const [alerta, setAlerta] = useState<Alerta>((params.get("alerta") as Alerta) ?? "");
  const [pagina, setPagina] = useState(0);

  const [lista, setLista] = useState<ProdutoView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [fornecedores, setFornecedores] = useState<string[]>([]);

  const [editando, setEditando] = useState<ProdutoView | null | "novo">(params.get("novo") ? "novo" : null);
  const [importando, setImportando] = useState(false);
  const navegar = useNavigate();

  async function exportarTodos() {
    try {
      const todos = await buscarTodos<ProdutoView>("vw_produtos", { coluna: "nome" });
      exportarProdutosCsv(todos);
      avisar("sucesso", `${todos.length} produto(s) exportado(s). Abra o arquivo no Excel.`);
    } catch (e) {
      avisar("erro", mensagemErro(e));
    }
  }
  const [detalhe, setDetalhe] = useState<ProdutoView | null>(null);
  const [removendo, setRemovendo] = useState<ProdutoView | null>(null);
  const [processando, setProcessando] = useState(false);

  // Aplica a busca 300 ms depois de parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca); setPagina(0); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const carregarListas = useCallback(async () => {
    const { data } = await supabase.from("produtos").select("categoria, fornecedor").limit(5000);
    const unicos = (k: "categoria" | "fornecedor") =>
      [...new Set((data ?? []).map((d) => d[k]).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    setCategorias(unicos("categoria"));
    setFornecedores(unicos("fornecedor"));
  }, []);

  const carregar = useCallback(async () => {
    setErro("");
    let q = supabase.from("vw_produtos").select("*", { count: "exact" });
    if (situacao !== "todos") q = q.eq("ativo", situacao === "ativos");
    if (categoria) q = q.eq("categoria", categoria);
    if (alerta === "minimo") q = q.eq("abaixo_minimo", true);
    if (alerta === "validade") q = q.in("situacao_validade", ["vencido", "critico", "proximo"]);
    if (alerta === "vencidos") q = q.eq("situacao_validade", "vencido");
    const t = termoBusca(buscaAplicada);
    if (t) q = q.or(`nome.ilike.*${t}*,codigo.ilike.*${t}*,barras.ilike.*${t}*,categoria.ilike.*${t}*,fornecedor.ilike.*${t}*`);
    q = alerta === "validade" || alerta === "vencidos" ? q.order("validade") : q.order("nome");
    const { data, error, count } = await q.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    if (error) {
      setErro(mensagemErro(error));
      setLista([]);
      return;
    }
    setLista(data as ProdutoView[]);
    setTotal(count ?? 0);
  }, [situacao, categoria, alerta, buscaAplicada, pagina]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarListas(); }, [carregarListas]);

  function trocarAlerta(a: Alerta) {
    setAlerta(a);
    setPagina(0);
    const p = new URLSearchParams(params);
    if (a) p.set("alerta", a); else p.delete("alerta");
    setParams(p, { replace: true });
  }

  function fecharForm() {
    setEditando(null);
    if (params.get("novo")) {
      const p = new URLSearchParams(params);
      p.delete("novo");
      setParams(p, { replace: true });
    }
  }

  async function remover() {
    if (!removendo) return;
    setProcessando(true);
    const { error } = await supabase.from("produtos").delete().eq("id", removendo.id);
    setProcessando(false);
    if (error) return avisar("erro", mensagemErro(error));
    avisar("sucesso", `Produto “${removendo.nome}” removido. O histórico de movimentações foi mantido.`);
    setRemovendo(null);
    setDetalhe(null);
    void carregar();
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrosAtivos = Boolean(buscaAplicada || categoria || alerta || situacao !== "ativos");

  return (
    <div>
      <Cabecalho
        titulo="Produtos"
        descricao="Pesquise por nome, código, código de barras, categoria ou fornecedor."
        acoes={
          <>
            {ehAdmin && <button className="btn-secundario" onClick={() => setImportando(true)}>⤒ Importar planilha</button>}
            <button className="btn-secundario" onClick={exportarTodos}>⤓ Exportar planilha</button>
            <button className="btn-secundario" onClick={() => navegar("/relatorios?r=produtos&imprimir=1")}>🖨 Imprimir lista</button>
            {ehAdmin && <button className="btn-acao" onClick={() => setEditando("novo")}>+ Cadastrar produto</button>}
          </>
        }
      />

      <div className="cartao mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="busca">Pesquisar</label>
          <input id="busca" className="campo" placeholder="Digite ou passe o leitor…" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className="rotulo" htmlFor="f-cat">Categoria</label>
          <select id="f-cat" className="campo" value={categoria} onChange={(e) => { setCategoria(e.target.value); setPagina(0); }}>
            <option value="">Todas</option>
            {categorias.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="f-alerta">Alertas</label>
          <select id="f-alerta" className="campo" value={alerta} onChange={(e) => trocarAlerta(e.target.value as Alerta)}>
            <option value="">Sem filtro</option>
            <option value="minimo">Abaixo do mínimo</option>
            <option value="validade">Validade próxima ou vencida</option>
            <option value="vencidos">Somente vencidos</option>
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="f-sit">Situação</label>
          <select id="f-sit" className="campo" value={situacao} onChange={(e) => { setSituacao(e.target.value as Situacao); setPagina(0); }}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      {erro && <div className="mb-4"><Aviso cor="critico">{erro}</Aviso></div>}

      <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
        <span>{lista ? `${total} produto(s) encontrado(s)` : ""}</span>
        {filtrosAtivos && (
          <button className="font-semibold text-petroleo-700 hover:underline" onClick={() => { setBusca(""); setCategoria(""); trocarAlerta(""); setSituacao("ativos"); }}>
            Limpar filtros
          </button>
        )}
      </div>

      <div className="cartao overflow-hidden">
        {!lista ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo={filtrosAtivos ? "Nenhum produto com esses filtros." : "Nenhum produto cadastrado ainda."}>
            {ehAdmin && !filtrosAtivos && <button className="btn-acao mt-2" onClick={() => setEditando("novo")}>Cadastrar o primeiro produto</button>}
          </Vazio>
        ) : (
          <>
            {/* Tabela (computador) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Código</th><th>Produto</th><th>Categoria</th><th className="text-right">Preço</th>
                    <th className="text-right">Estoque</th><th>Validade</th><th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id} className={!p.ativo ? "opacity-60" : ""}>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-500">{p.codigo}</td>
                      <td>
                        <button className="text-left font-medium text-slate-800 hover:text-petroleo-700 hover:underline" onClick={() => setDetalhe(p)}>{p.nome}</button>
                        <div className="text-xs text-slate-400">{[p.modelo, p.fornecedor].filter(Boolean).join(" · ")}{!p.ativo && " · inativo"}</div>
                      </td>
                      <td className="text-slate-500">{p.categoria ?? "—"}</td>
                      <td className="whitespace-nowrap text-right font-semibold">{fmtMoeda(p.preco)}</td>
                      <td className="whitespace-nowrap text-right">
                        <span className={p.abaixo_minimo || Number(p.estoque) === 0 ? "font-semibold text-atencao-700" : ""}>{fmtQtd(p.estoque, p.unidade)}</span>
                        <span className="text-xs text-slate-400"> {p.unidade}</span>
                      </td>
                      <td>{p.validade ? <div className="flex flex-col items-start gap-0.5"><span className="text-xs">{fmtData(p.validade)}</span>{p.situacao_validade !== "ok" && <SeloValidade p={p} />}</div> : <span className="text-slate-300">—</span>}</td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-secundario btn-pequeno" onClick={() => setDetalhe(p)}>Ver</button>
                          <Link className="btn-secundario btn-pequeno" to={`/estoque?produto=${p.id}`}>Movimentar</Link>
                          {ehAdmin && <button className="btn-secundario btn-pequeno" onClick={() => setEditando(p)}>Editar</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartões (celular) */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {lista.map((p) => (
                <li key={p.id} className={`p-4 ${!p.ativo ? "opacity-60" : ""}`}>
                  <button className="w-full text-left" onClick={() => setDetalhe(p)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{p.nome}</p>
                        <p className="text-xs text-slate-400">Cód. {p.codigo}{p.categoria ? ` · ${p.categoria}` : ""}</p>
                      </div>
                      <p className="shrink-0 font-semibold">{fmtMoeda(p.preco)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span>Estoque: <strong>{fmtQtd(p.estoque, p.unidade)} {p.unidade}</strong></span>
                      {(p.abaixo_minimo || Number(p.estoque) === 0) && <SeloEstoque p={p} />}
                      {["vencido", "critico", "proximo"].includes(p.situacao_validade) && <SeloValidade p={p} />}
                      {!p.ativo && <Selo>Inativo</Selo>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-secundario btn-pequeno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>← Anterior</button>
          <span>Página {pagina + 1} de {totalPaginas}</span>
          <button className="btn-secundario btn-pequeno" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima →</button>
        </div>
      )}

      {editando && (
        <ProdutoForm
          produto={editando === "novo" ? null : editando}
          categorias={categorias}
          fornecedores={fornecedores}
          onFechar={fecharForm}
          onSalvo={() => { fecharForm(); setDetalhe(null); void carregar(); void carregarListas(); }}
        />
      )}

      {detalhe && (
        <DetalheProduto
          p={detalhe}
          ehAdmin={ehAdmin}
          onFechar={() => setDetalhe(null)}
          onEditar={() => { setEditando(detalhe); setDetalhe(null); }}
          onRemover={() => setRemovendo(detalhe)}
        />
      )}

      {importando && <ImportarPlanilha onFechar={() => setImportando(false)} onConcluido={() => { void carregar(); void carregarListas(); }} />}

      <Confirmar
        aberto={Boolean(removendo)}
        titulo="Remover produto?"
        perigo
        processando={processando}
        textoConfirmar="Sim, remover"
        onCancelar={() => setRemovendo(null)}
        onConfirmar={remover}
        mensagem={
          <>
            <p>Você vai remover <strong>{removendo?.nome}</strong> (cód. {removendo?.codigo}) do cadastro.</p>
            <p className="mt-2">O histórico de movimentações continua guardado. Esta ação não pode ser desfeita.</p>
            <p className="mt-2 text-slate-500">Dica: se quiser apenas esconder o produto, edite e desmarque “Produto ativo”.</p>
          </>
        }
      />
    </div>
  );
}

function DetalheProduto({ p, ehAdmin, onFechar, onEditar, onRemover }: { p: ProdutoView; ehAdmin: boolean; onFechar: () => void; onEditar: () => void; onRemover: () => void }) {
  const [movs, setMovs] = useState<Movimentacao[] | null>(null);
  useEffect(() => {
    supabase.from("movimentacoes").select("*").eq("produto_id", p.id).order("criado_em", { ascending: false }).limit(20)
      .then(({ data }) => setMovs((data ?? []) as Movimentacao[]));
  }, [p.id]);

  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="text-right font-medium text-slate-800">{valor}</dd>
    </div>
  );

  return (
    <Modal
      aberto
      largura="lg"
      titulo={p.nome}
      onFechar={onFechar}
      rodape={
        <>
          {ehAdmin && <button className="btn-perigo mr-auto" onClick={onRemover}>Remover</button>}
          <Link className="btn-secundario" to={`/etiquetas?produto=${p.id}`}>🏷 Etiqueta</Link>
          <Link className="btn-primario" to={`/estoque?produto=${p.id}`}>⇅ Movimentar</Link>
          {ehAdmin && <button className="btn-acao" onClick={onEditar}>Editar</button>}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {p.ativo ? <Selo cor="ok">Ativo</Selo> : <Selo>Inativo</Selo>}
        <SeloEstoque p={p} />
        <SeloValidade p={p} />
      </div>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <dl>
          {linha("Código interno", <span className="font-mono">{p.codigo}</span>)}
          {linha("Código de barras", p.barras ? <span className="font-mono">{p.barras}</span> : "—")}
          {linha("Categoria", p.categoria ?? "—")}
          {linha("Unidade", p.unidade)}
          {linha("Modelo / apresentação", p.modelo ?? "—")}
          {linha("Fornecedor", p.fornecedor ?? "—")}
        </dl>
        <dl>
          {linha("Custo", fmtMoeda(p.custo))}
          {linha("Preço de venda", fmtMoeda(p.preco))}
          {linha("Estoque atual", `${fmtQtd(p.estoque, p.unidade)} ${p.unidade}`)}
          {linha("Estoque mínimo", `${fmtQtd(p.estoque_minimo, p.unidade)} ${p.unidade}`)}
          {linha("Valor em estoque (custo)", fmtMoeda(p.valor_estoque))}
          {linha("Validade", fmtData(p.validade))}
        </dl>
      </div>
      <p className="mt-3 text-xs text-slate-400">Criado em {fmtDataHora(p.criado_em)} · atualizado em {fmtDataHora(p.atualizado_em)}</p>

      <h3 className="mb-2 mt-6 font-semibold">Últimas movimentações</h3>
      {!movs ? <Carregando /> : movs.length === 0 ? <p className="text-sm text-slate-500">Nenhuma movimentação.</p> : (
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Saldo</th><th>Motivo</th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(m.criado_em)}</td>
                  <td><SeloTipo tipo={m.tipo} /></td>
                  <td className="text-right">{fmtQtd(m.quantidade, p.unidade)}</td>
                  <td className="text-right font-semibold">{fmtQtd(m.saldo_apos, p.unidade)}</td>
                  <td className="text-xs text-slate-500">{m.observacao ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
