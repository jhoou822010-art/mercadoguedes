import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { fmtDataHora, fmtQtd, lerNumero, NOME_TIPO } from "../lib/format";
import type { Movimentacao, ProdutoView, TipoMov } from "../lib/types";
import { useToast } from "../components/Toast";
import { Confirmar } from "../components/Modal";
import { ProdutoBusca } from "../components/ProdutoBusca";
import { Aviso, Cabecalho, Carregando, SeloEstoque, SeloTipo, Vazio } from "../components/Ui";

const TIPOS: { v: TipoMov; titulo: string; texto: string; cor: string }[] = [
  { v: "entrada", titulo: "Entrada", texto: "Chegou mercadoria (soma ao saldo)", cor: "peer-checked:border-ok-600 peer-checked:bg-ok-50" },
  { v: "saida", titulo: "Saída", texto: "Perda, consumo, venda (tira do saldo)", cor: "peer-checked:border-acao-500 peer-checked:bg-orange-50" },
  { v: "ajuste", titulo: "Ajuste", texto: "Contagem: define o saldo exato", cor: "peer-checked:border-petroleo-500 peer-checked:bg-petroleo-50" },
];

const POR_PAGINA = 30;

export default function Estoque() {
  const avisar = useToast();
  const [params, setParams] = useSearchParams();
  const [produto, setProduto] = useState<ProdutoView | null>(null);
  const [tipo, setTipo] = useState<TipoMov>("entrada");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [hist, setHist] = useState<Movimentacao[] | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoMov>("");
  const [filtroProduto, setFiltroProduto] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);

  // Abre já com o produto vindo de outra tela (?produto=ID).
  useEffect(() => {
    const id = params.get("produto");
    if (!id) return;
    supabase.from("vw_produtos").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) { setProduto(data as ProdutoView); setFiltroProduto(true); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarHist = useCallback(async () => {
    let q = supabase.from("movimentacoes").select("*", { count: "exact" }).order("criado_em", { ascending: false });
    if (filtroTipo) q = q.eq("tipo", filtroTipo);
    if (filtroProduto && produto) q = q.eq("produto_id", produto.id);
    const { data, count, error } = await q.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    if (error) return avisar("erro", mensagemErro(error));
    setHist(data as Movimentacao[]);
    setTotal(count ?? 0);
  }, [filtroTipo, filtroProduto, produto, pagina, avisar]);

  useEffect(() => { void carregarHist(); }, [carregarHist]);

  const quantidade = lerNumero(qtd);
  const atual = Number(produto?.estoque ?? 0);
  const novoSaldo = Number.isNaN(quantidade) ? null
    : tipo === "entrada" ? atual + quantidade
    : tipo === "saida" ? atual - quantidade
    : quantidade;

  function selecionar(p: ProdutoView) {
    setProduto(p);
    setErro("");
    setPagina(0);
    const np = new URLSearchParams(params);
    np.set("produto", String(p.id));
    setParams(np, { replace: true });
  }

  function revisar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!produto) return setErro("Escolha um produto.");
    if (Number.isNaN(quantidade)) return setErro("Digite uma quantidade válida (ex.: 10 ou 2,5).");
    if (quantidade < 0) return setErro("A quantidade não pode ser negativa.");
    if (tipo !== "ajuste" && quantidade === 0) return setErro("A quantidade precisa ser maior que zero.");
    if (["UN", "PCT", "CX"].includes(produto.unidade) && !Number.isInteger(quantidade))
      return setErro(`Para ${produto.unidade} use número inteiro.`);
    if (novoSaldo !== null && novoSaldo < 0)
      return setErro(`Estoque insuficiente: o saldo atual é ${fmtQtd(atual, produto.unidade)} ${produto.unidade}.`);
    if (tipo === "ajuste" && !motivo.trim()) return setErro("Informe o motivo do ajuste (ex.: contagem de inventário).");
    setConfirmando(true);
  }

  async function gravar() {
    if (!produto) return;
    setSalvando(true);
    const { data, error } = await supabase.rpc("movimentar_estoque", {
      p_produto_id: produto.id,
      p_tipo: tipo,
      p_quantidade: quantidade,
      p_observacao: motivo.trim() || null,
    });
    setSalvando(false);
    setConfirmando(false);
    if (error) return setErro(mensagemErro(error));
    const mov = data as Movimentacao;
    avisar("sucesso", `${NOME_TIPO[tipo]} registrada: ${produto.nome} agora tem ${fmtQtd(mov.saldo_apos, produto.unidade)} ${produto.unidade}.`);
    // Recarrega o produto para mostrar o novo saldo e indicadores.
    const { data: p } = await supabase.from("vw_produtos").select("*").eq("id", produto.id).maybeSingle();
    if (p) setProduto(p as ProdutoView);
    setQtd("");
    setMotivo("");
    setPagina(0);
    void carregarHist();
  }

  return (
    <div>
      <Cabecalho titulo="Estoque" descricao="Registre entradas, saídas e ajustes. Todo movimento fica no histórico." />

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={revisar} className="cartao space-y-5 p-5 lg:col-span-2" noValidate>
          <div>
            <span className="rotulo">1. Produto</span>
            <ProdutoBusca onSelecionar={selecionar} autoFocus={!produto} />
            {produto && (
              <div className="mt-3 rounded-lg border border-petroleo-200 bg-petroleo-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{produto.nome}</p>
                    <p className="text-xs text-slate-500">Cód. {produto.codigo}{produto.barras ? ` · ${produto.barras}` : ""}</p>
                  </div>
                  <button type="button" className="text-xs font-semibold text-petroleo-700 hover:underline" onClick={() => { setProduto(null); setFiltroProduto(false); setParams({}, { replace: true }); }}>Trocar</button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  Saldo atual: <strong>{fmtQtd(produto.estoque, produto.unidade)} {produto.unidade}</strong>
                  <SeloEstoque p={produto} />
                </div>
                {!produto.ativo && <p className="mt-1 text-xs text-atencao-700">Atenção: produto inativo.</p>}
              </div>
            )}
          </div>

          <fieldset>
            <legend className="rotulo">2. Tipo de movimentação</legend>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {TIPOS.map((t) => (
                <label key={t.v} className="cursor-pointer">
                  <input type="radio" name="tipo" value={t.v} checked={tipo === t.v} onChange={() => setTipo(t.v)} className="peer sr-only" />
                  <span className={`block h-full rounded-lg border-2 border-slate-200 p-3 transition ${t.cor}`}>
                    <span className="block text-sm font-semibold">{t.titulo}</span>
                    <span className="block text-xs text-slate-500">{t.texto}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="qtd">3. {tipo === "ajuste" ? "Novo saldo (contado)" : "Quantidade"} {produto && `(${produto.unidade})`}</label>
              <input id="qtd" className="campo text-lg font-semibold" inputMode="decimal" value={qtd} onChange={(e) => { setQtd(e.target.value); setErro(""); }} placeholder="0" />
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-xs text-slate-500">Resultado</p>
              {produto && novoSaldo !== null ? (
                <p className="mt-1">
                  {fmtQtd(atual, produto.unidade)} → <strong className={novoSaldo < 0 ? "text-critico-600" : "text-ok-700"}>{fmtQtd(novoSaldo, produto.unidade)}</strong> {produto.unidade}
                </p>
              ) : <p className="mt-1 text-slate-400">—</p>}
            </div>
          </div>

          <div>
            <label className="rotulo" htmlFor="motivo">4. Observação / motivo {tipo === "ajuste" && <span className="text-critico-600">*</span>}</label>
            <input id="motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "entrada" ? "Ex.: NF 1234 do fornecedor" : tipo === "saida" ? "Ex.: produto avariado" : "Ex.: inventário mensal"} maxLength={200} />
          </div>

          {erro && <Aviso cor="critico">{erro}</Aviso>}
          <button className="btn-acao w-full" disabled={!produto}>Revisar e confirmar</button>
        </form>

        <section className="cartao lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold">Histórico</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {produto && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-petroleo-700" checked={filtroProduto} onChange={(e) => { setFiltroProduto(e.target.checked); setPagina(0); }} />
                  Só este produto
                </label>
              )}
              <select className="campo w-auto py-1 text-sm" value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value as "" | TipoMov); setPagina(0); }} aria-label="Filtrar por tipo">
                <option value="">Todos os tipos</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saídas</option>
                <option value="ajuste">Ajustes</option>
              </select>
            </div>
          </div>
          {!hist ? <Carregando /> : hist.length === 0 ? <Vazio titulo="Nenhuma movimentação encontrada." /> : (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Saldo</th><th>Motivo / usuário</th></tr></thead>
                <tbody>
                  {hist.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(m.criado_em)}</td>
                      <td className="max-w-[12rem]"><span className="block truncate">{m.produto_nome}</span><span className="text-xs text-slate-400">{m.produto_codigo}{m.produto_id === null && " · removido"}</span></td>
                      <td><SeloTipo tipo={m.tipo} /></td>
                      <td className="text-right">{fmtQtd(m.quantidade)}</td>
                      <td className="whitespace-nowrap text-right"><span className="text-xs text-slate-400">{fmtQtd(m.saldo_anterior)} → </span><strong>{fmtQtd(m.saldo_apos)}</strong></td>
                      <td className="text-xs text-slate-500"><span className="block">{m.observacao ?? "—"}</span><span className="text-slate-400">{m.usuario_nome ?? ""}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > POR_PAGINA && (
            <div className="flex items-center justify-center gap-3 border-t border-slate-100 p-3 text-sm">
              <button className="btn-secundario btn-pequeno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>← Anterior</button>
              <span>Página {pagina + 1} de {Math.ceil(total / POR_PAGINA)}</span>
              <button className="btn-secundario btn-pequeno" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina(pagina + 1)}>Próxima →</button>
            </div>
          )}
        </section>
      </div>

      <Confirmar
        aberto={confirmando}
        titulo={`Confirmar ${NOME_TIPO[tipo].toLowerCase()}?`}
        processando={salvando}
        textoConfirmar={`Confirmar ${NOME_TIPO[tipo].toLowerCase()}`}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={gravar}
        mensagem={produto && novoSaldo !== null && (
          <div className="space-y-2">
            <p><strong>{produto.nome}</strong></p>
            <p>
              {tipo === "ajuste" ? "Novo saldo definido" : `${NOME_TIPO[tipo]} de`}{" "}
              <strong>{fmtQtd(quantidade, produto.unidade)} {produto.unidade}</strong>
            </p>
            <p className="rounded-lg bg-slate-50 p-2">
              Saldo: {fmtQtd(atual, produto.unidade)} → <strong>{fmtQtd(novoSaldo, produto.unidade)} {produto.unidade}</strong>
            </p>
            {motivo.trim() && <p className="text-slate-500">Motivo: {motivo.trim()}</p>}
          </div>
        )}
      />
    </div>
  );
}
