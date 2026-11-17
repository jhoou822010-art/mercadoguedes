import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { produtosPorIds } from "../lib/local/consultas";
import { useNavigate } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { centavos, dividirParcelas, fmtData, fmtDataHora, fmtMoeda, fmtQtd, hojeISO, lerNumero, NOME_FORMA, somarMeses } from "../lib/format";
import { FORMAS, type Cliente, type Caixa as TCaixa, type FormaPagamento, type ProdutoView, type ResumoCaixa, type VendaCompleta } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar, Modal } from "../components/Modal";
import { ProdutoBusca } from "../components/ProdutoBusca";
import { CupomFechamento, CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { Aviso, Cabecalho, Carregando } from "../components/Ui";
import { ativarCalculadora, Calculadora } from "../components/Calculadora";
import { abrirCaixaEmJanela, chaveCarrinho, ehJanelaDoCaixa, fixarCaixaNaPrincipal, gravarCarrinho, lerCarrinhoGuardado } from "../lib/carrinho";
import { ClienteSeletor } from "../components/ClienteSeletor";
import { COLUNAS_CAIXA } from "../lib/consultas";
import { estadoConexaoAgora } from "../lib/conexao";
import { ehErroDeRede } from "../lib/supabase";
import { abrirCaixaLocal, caixaAbertoLocal, fecharCaixaLocal, finalizarVendaLocal, guardarCaixaDoServidor, movimentarCaixaLocal, resumoCaixaLocal, type ItemVenda } from "../lib/local/caixaLocal";

/** Número do caixa para mostrar: o do servidor, ou "deste computador" enquanto não foi enviado. */
const nomeCaixa = (c: TCaixa) => (c.id > 0 ? `Caixa nº ${c.id}` : "Caixa (aguardando número do servidor)");

/** Fechamento cego: o operador não vê os valores (igual ao servidor). */
function mascarar(r: ResumoCaixa): ResumoCaixa {
  return { caixa_id: r.caixa_id, status: r.status, usuario_nome: r.usuario_nome, aberto_em: r.aberto_em, fechado_em: r.fechado_em, qtd_vendas: r.qtd_vendas, qtd_canceladas: r.qtd_canceladas, oculto: true } as unknown as ResumoCaixa;
}
import { pixDaLoja } from "../lib/pix";
import { PixNaTela } from "../components/QrPix";
import { ACOES, mapaAtalhos, nomeTecla, rotulo, useAtalhos, type MapaAtalhos } from "../lib/atalhos";

/* ======================================================================
   Tela do Caixa: abre o caixa, vende e fecha o caixa.
   ====================================================================== */

export default function Caixa() {
  const { sessao } = useAuth();
  const [caixa, setCaixa] = useState<TCaixa | null | undefined>(undefined);

  const carregar = useCallback(async () => {
    // Com servidor: guarda no computador o caixa aberto que o servidor conhece (ex.: aberto antes).
    if (estadoConexaoAgora() !== "offline") {
      let r = await supabase.from("caixas").select(`${COLUNAS_CAIXA}, uuid_local, dispositivo`).eq("usuario_id", sessao!.user.id).eq("status", "aberto");
      if (r.error && !ehErroDeRede(r.error)) r = await supabase.from("caixas").select(COLUNAS_CAIXA).eq("usuario_id", sessao!.user.id).eq("status", "aberto") as typeof r;
      for (const c of (r.data ?? []) as unknown as TCaixa[]) await guardarCaixaDoServidor({ ...c, valor_esperado: null, diferenca: null, resumo: null });
    }
    // O caixa da tela é sempre o deste computador (funciona sem internet).
    setCaixa(await caixaAbertoLocal(sessao!.user.id));
  }, [sessao]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (caixa === undefined) return <Carregando />;
  if (caixa === null) return <AbrirCaixa onAberto={setCaixa} />;
  return <PontoDeVenda caixa={caixa} onFechado={() => setCaixa(null)} />;
}

/* ---------------------------- Abertura ---------------------------- */

function AbrirCaixa({ onAberto }: { onAberto: (c: TCaixa) => void }) {
  const { perfil } = useAuth();
  const avisar = useToast();
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const [abrindo, setAbrindo] = useState(false);

  async function abrir(e: FormEvent) {
    e.preventDefault();
    const n = valor.trim() ? lerNumero(valor) : 0;
    if (Number.isNaN(n) || n < 0) return setErro("Digite um valor válido (ex.: 100 ou 150,50).");
    setAbrindo(true);
    try {
      const c = await abrirCaixaLocal(perfil!, n);
      avisar("sucesso", `Caixa aberto com ${fmtMoeda(n)} de troco.`);
      onAberto(c);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Cabecalho titulo="Caixa" descricao={`Olá, ${perfil?.nome.split(" ")[0] ?? ""}. Abra o caixa para começar a vender.`} />
      <form onSubmit={abrir} className="cartao space-y-4 p-6">
        <h2 className="text-lg font-semibold">Abertura de caixa</h2>
        <div>
          <label className="rotulo" htmlFor="abertura">Dinheiro na gaveta para troco (R$)</label>
          <input id="abertura" className="campo text-2xl font-bold" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} autoFocus />
          <p className="mt-1 text-xs text-slate-500">Conte o dinheiro que está na gaveta agora. Ele será conferido no fechamento.</p>
        </div>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
        <button className="btn-acao w-full py-3 text-base" disabled={abrindo}>{abrindo ? "Abrindo…" : "Abrir caixa"}</button>
      </form>
    </div>
  );
}

/* ------------------------- Ponto de venda ------------------------- */

interface ItemCarrinho { p: ProdutoView; qtd: string; avulso?: boolean }

/** Monta um "produto" de mentira para um item avulso (sem cadastro). Id negativo = nunca existe no banco. */
function produtoAvulso(descricao: string, preco: number): ProdutoView {
  const agora = new Date().toISOString();
  return {
    id: -Date.now() - Math.floor(Math.random() * 1000), codigo: "AVULSO", barras: null, nome: descricao, categoria: null,
    unidade: "UN", modelo: null, fornecedor: null, custo: 0, preco, estoque: 1e9, estoque_minimo: 0, validade: null,
    ativo: true, criado_em: agora, atualizado_em: agora, valor_estoque: 0, abaixo_minimo: false,
    dias_para_vencer: null, situacao_validade: "sem_validade",
  };
}
type Desconto = { tipo: "valor" | "percentual"; valor: string };

function lerCarrinho(caixaId: number): { itens: ItemCarrinho[]; desconto: Desconto } {
  const c = lerCarrinhoGuardado<ItemCarrinho, Desconto>(caixaId);
  return { itens: c?.itens ?? [], desconto: c?.desconto ?? { tipo: "valor", valor: "" } };
}

const INTEIRAS = ["UN", "PCT", "CX"];

function PontoDeVenda({ caixa, onFechado }: { caixa: TCaixa; onFechado: () => void }) {
  const { ehAdmin, config } = useAuth();
  const avisar = useToast();
  const inicial = useMemo(() => lerCarrinho(caixa.id), [caixa.id]);
  const [itens, setItens] = useState<ItemCarrinho[]>(inicial.itens);
  const [desconto, setDesconto] = useState<Desconto>(inicial.desconto);
  const [janela, setJanela] = useState<"" | "pagamento" | "desconto" | "limpar" | "sangria" | "suprimento" | "fechar" | "calculadora" | "atalhos" | "avulso">("");
  const [calcAberta, setCalcAberta] = useState(false);
  const teclas = useMemo(() => mapaAtalhos(config?.atalhos), [config?.atalhos]);
  const [comprovante, setComprovante] = useState<VendaCompleta | null>(null);
  const busca = useRef<HTMLInputElement>(null);
  const qtdRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Guarda a compra no navegador: trocar de menu, recarregar ou faltar energia não perde nada.
  const { perfil } = useAuth();
  const navegar = useNavigate();
  useEffect(() => {
    gravarCarrinho(caixa.id, { itens, desconto, usuario_id: perfil?.id });
  }, [itens, desconto, caixa.id, perfil?.id]);
  // Caixa aberto em duas janelas (principal e separada): as duas mostram a mesma compra.
  useEffect(() => {
    const k = chaveCarrinho(caixa.id);
    const ouvir = (e: StorageEvent) => {
      if (e.key !== k) return;
      const c = lerCarrinho(caixa.id);
      setItens(c.itens);
      setDesconto(c.desconto);
    };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, [caixa.id]);

  const focarBusca = () => setTimeout(() => busca.current?.focus(), 50);

  const linhas = itens.map((i) => {
    const q = lerNumero(i.qtd);
    const invalida = Number.isNaN(q) || q <= 0 || (!i.avulso && INTEIRAS.includes(i.p.unidade) && !Number.isInteger(q));
    const total = invalida ? 0 : centavos(Number(i.p.preco) * q);
    return { ...i, q, invalida, total, semEstoque: !i.avulso && !invalida && q > Number(i.p.estoque) };
  });
  const subtotal = centavos(linhas.reduce((s, l) => s + l.total, 0));
  const descNum = desconto.valor.trim() ? lerNumero(desconto.valor) : 0;
  const descontoValor = Number.isNaN(descNum) ? 0 : centavos(desconto.tipo === "percentual" ? subtotal * descNum / 100 : descNum);
  const total = centavos(Math.max(0, subtotal - descontoValor));
  const limite = Number(config?.desconto_maximo_percentual ?? 100);
  const erroDesconto =
    Number.isNaN(descNum) || descNum < 0 ? "Desconto inválido."
    : descontoValor > subtotal ? "O desconto é maior que a compra."
    : !ehAdmin && subtotal > 0 && descontoValor > centavos(subtotal * limite / 100) ? `Desconto acima do permitido (máx. ${limite}%).`
    : "";
  // Estoque do sistema menor que a venda: a venda é PERMITIDA (o produto está na mão do cliente) e fica anotada.
  const problemas = linhas.filter((l) => l.invalida);
  const podePagar = itens.length > 0 && problemas.length === 0 && !erroDesconto;

  function adicionar(p: ProdutoView) {
    setItens((lista) => {
      const i = lista.findIndex((x) => x.p.id === p.id);
      if (i >= 0 && INTEIRAS.includes(p.unidade)) {
        const n = [...lista];
        const atual = lerNumero(n[i].qtd);
        n[i] = { ...n[i], qtd: String((Number.isNaN(atual) ? 0 : atual) + 1) };
        return n;
      }
      if (i >= 0) return lista;
      return [...lista, { p, qtd: INTEIRAS.includes(p.unidade) ? "1" : "" }];
    });
    // Produto por peso/volume: pede a quantidade; os demais voltam direto para o leitor.
    if (!INTEIRAS.includes(p.unidade)) setTimeout(() => qtdRefs.current[p.id]?.focus(), 60);
    else focarBusca();
  }

  async function abrirPagamento() {
    if (!itens.length) return avisar("info", "Passe pelo menos um produto.");
    if (!podePagar) return avisar("erro", erroDesconto || "Confira os itens marcados em vermelho.");
    // Confere preço e estoque atuais antes de cobrar.
    const ids = itens.filter((i) => !i.avulso).map((i) => i.p.id);
    const { data } = ids.length
      ? await doServidorOuLocal<ProdutoView[]>(() => supabase.from("vw_produtos").select("*").in("id", ids), () => produtosPorIds(ids), { espera: 4000 })
      : { data: [] as ProdutoView[] };
    const atuais = new Map(((data ?? []) as ProdutoView[]).map((p) => [p.id, p]));
    const mudou = itens.some((i) => {
      const a = atuais.get(i.p.id);
      return !i.avulso && a && (Number(a.preco) !== Number(i.p.preco) || Number(a.estoque) !== Number(i.p.estoque));
    });
    if (mudou) {
      setItens((x) => x.map((i) => (i.avulso ? i : { ...i, p: atuais.get(i.p.id) ?? i.p })));
      return avisar("info", "Preço ou estoque de algum item mudou. Confira os valores e aperte F2 de novo.");
    }
    setJanela("pagamento");
  }

  // Item avulso: produto sem cadastro, com descrição, preço e quantidade digitados.
  const avulsoLiberado = ehAdmin || config?.permitir_item_avulso !== false;
  function abrirAvulso() {
    if (config && config.permitir_item_avulso === undefined) {
      return avisar("erro", "Para usar “Digite o produto”, o administrador precisa rodar o SQL 0005_item_avulso.sql no Supabase.");
    }
    if (!avulsoLiberado) return avisar("erro", "“Digite o produto” não está liberado para operador. Peça ao administrador.");
    setJanela("avulso");
  }
  function adicionarAvulso(descricao: string, preco: number, quantidade: number) {
    setItens((x) => [...x, { p: produtoAvulso(descricao, preco), qtd: String(quantidade).replace(".", ","), avulso: true }]);
    setJanela("");
    avisar("info", `“${descricao}” adicionado (item sem cadastro).`);
    focarBusca();
  }

  // Mexe na quantidade do último produto passado.
  function mudarUltimo(delta: number) {
    const ultimo = itens[itens.length - 1];
    if (!ultimo) return;
    if (!INTEIRAS.includes(ultimo.p.unidade)) {
      setTimeout(() => { qtdRefs.current[ultimo.p.id]?.focus(); qtdRefs.current[ultimo.p.id]?.select(); }, 30);
      return;
    }
    const atual = lerNumero(ultimo.qtd);
    const novo = (Number.isNaN(atual) ? 0 : atual) + delta;
    if (novo < 1) return avisar("info", "Para tirar o produto, use “Remover último item”.");
    setItens((x) => x.map((i) => (i.p.id === ultimo.p.id ? { ...i, qtd: String(novo) } : i)));
  }

  // Atalhos de teclado (definidos pelo administrador em "Teclado do caixa").
  useAtalhos(teclas, {
    pagamento: () => void abrirPagamento(),
    buscar_produto: focarBusca,
    desconto: () => itens.length && setJanela("desconto"),
    calculadora: () => (calcAberta ? ativarCalculadora() : setCalcAberta(true)),
    item_avulso: () => abrirAvulso(),
    cancelar_compra: () => itens.length && setJanela("limpar"),
    quantidade_ultimo: () => {
      const u = itens[itens.length - 1];
      if (u) setTimeout(() => { qtdRefs.current[u.p.id]?.focus(); qtdRefs.current[u.p.id]?.select(); }, 30);
    },
    mais_um: () => mudarUltimo(1),
    menos_um: () => mudarUltimo(-1),
    remover_ultimo: () => {
      const u = itens[itens.length - 1];
      if (!u) return;
      setItens((x) => x.slice(0, -1));
      avisar("info", `“${u.p.nome}” retirado da compra.`);
      focarBusca();
    },
    suprimento: () => setJanela("suprimento"),
    sangria: () => setJanela("sangria"),
    fechar_caixa: () => (itens.length ? avisar("info", "Finalize ou cancele a compra atual antes de fechar o caixa.") : setJanela("fechar")),
    ajuda_atalhos: () => setJanela("atalhos"),
  }, !janela && !comprovante);

  function limpar() {
    setItens([]);
    setDesconto({ tipo: "valor", valor: "" });
    setJanela("");
    focarBusca();
  }

  function vendaConcluida(v: VendaCompleta) {
    limpar();
    setComprovante(v);
    avisar("sucesso", `Venda ${v.codigo_local ?? `nº ${v.id}`} registrada.${Number(v.troco) > 0 ? ` Troco: ${fmtMoeda(v.troco)}.` : ""}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{nomeCaixa(caixa)}</h1>
          <p className="text-sm text-slate-500">Aberto em {fmtDataHora(caixa.aberto_em)} · {caixa.usuario_nome}</p>
          <div className="nao-imprimir mt-2">
            {ehJanelaDoCaixa() ? (
              <button type="button" className="btn-secundario btn-pequeno border-petroleo-300 text-petroleo-800" onClick={fixarCaixaNaPrincipal} title="Fecha esta janela e o caixa volta para a janela principal, com o menu. A compra continua a mesma.">
                📌 Fixar na janela principal
              </button>
            ) : (
              <button
                type="button"
                className="btn-secundario btn-pequeno border-petroleo-300 text-petroleo-800"
                onClick={() => {
                  if (!abrirCaixaEmJanela()) return avisar("erro", "O navegador bloqueou a janela. Clique no aviso de pop-up do navegador e escolha “Sempre permitir” para este site.");
                  navegar("/");
                }}
                title="Solta o caixa numa janela própria, que pode ser movida e mudar de tamanho. A compra continua a mesma."
              >
                ⧉ Soltar em janela separada
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secundario btn-pequeno" onClick={() => setJanela("atalhos")}>⌨ Atalhos{rotulo(teclas, "ajuda_atalhos")}</button>
          <button className="btn-secundario btn-pequeno" onClick={() => setJanela("suprimento")}>+ Suprimento{rotulo(teclas, "suprimento")}</button>
          <button className="btn-secundario btn-pequeno" onClick={() => setJanela("sangria")}>− Sangria{rotulo(teclas, "sangria")}</button>
          <button className="btn-perigo btn-pequeno" onClick={() => setJanela("fechar")} disabled={itens.length > 0} title={itens.length ? "Finalize ou cancele a compra atual antes" : ""}>
            Fechar caixa{rotulo(teclas, "fechar_caixa")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Itens */}
        <section className="cartao flex min-h-[12rem] flex-col md:col-span-2 md:min-h-[24rem]">
          <div className="border-b border-slate-100 p-4">
            <ProdutoBusca onSelecionar={adicionar} autoFocus campoRef={busca} placeholder="Passe o leitor ou digite nome / código" />
          </div>
          {itens.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400">
              <p className="text-4xl">🛒</p>
              <p className="mt-2 font-medium">Caixa livre</p>
              <p className="text-sm">Passe o primeiro produto no leitor.</p>
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {linhas.map((l, n) => (
                <li key={l.p.id} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex ${l.invalida ? "bg-critico-50" : l.semEstoque ? "bg-atencao-50" : ""}`}>
                  <span className="hidden w-6 text-xs text-slate-400 sm:order-1 sm:block">{n + 1}</span>
                  <div className="order-1 min-w-0 sm:order-2 sm:flex-1">
                    <p className="truncate font-medium">{l.p.nome}</p>
                    <p className="text-xs text-slate-500">
                      {fmtMoeda(l.p.preco)} / {l.p.unidade} · {l.avulso ? <span className="font-semibold text-acao-700">sem cadastro</span> : <>cód. {l.p.codigo}</>}
                      {l.semEstoque && <span className="ml-1 font-semibold text-atencao-700" title="A venda é permitida e fica anotada para o administrador conferir o estoque.">· estoque do sistema: {fmtQtd(l.p.estoque, l.p.unidade)} (será anotado)</span>}
                      {l.invalida && l.qtd !== "" && <span className="ml-1 font-semibold text-critico-700">· quantidade inválida</span>}
                    </p>
                  </div>
                  <div className="order-3 flex items-center gap-1">
                    {INTEIRAS.includes(l.p.unidade) && (
                      <button className="h-9 w-9 rounded-lg border border-slate-300 text-lg hover:bg-slate-100" aria-label="Diminuir" onClick={() => setItens((x) => x.map((i) => i.p.id === l.p.id ? { ...i, qtd: String(Math.max(1, (Number.isNaN(l.q) ? 1 : l.q) - 1)) } : i))}>−</button>
                    )}
                    <input
                      ref={(el) => { qtdRefs.current[l.p.id] = el; }}
                      className={`campo w-20 text-center ${l.invalida && l.qtd !== "" ? "campo-erro" : ""}`}
                      inputMode="decimal"
                      value={l.qtd}
                      placeholder={l.p.unidade === "KG" ? "kg" : "qtd"}
                      aria-label={`Quantidade de ${l.p.nome}`}
                      onChange={(e) => setItens((x) => x.map((i) => (i.p.id === l.p.id ? { ...i, qtd: e.target.value } : i)))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focarBusca(); } }}
                    />
                    {INTEIRAS.includes(l.p.unidade) && (
                      <button className="h-9 w-9 rounded-lg border border-slate-300 text-lg hover:bg-slate-100" aria-label="Aumentar" onClick={() => setItens((x) => x.map((i) => i.p.id === l.p.id ? { ...i, qtd: String((Number.isNaN(l.q) ? 0 : l.q) + 1) } : i))}>+</button>
                    )}
                  </div>
                  <span className="order-4 text-right font-semibold sm:w-24">{fmtMoeda(l.total)}</span>
                  <button className="order-2 justify-self-end rounded p-1 text-slate-400 hover:bg-critico-100 hover:text-critico-600 sm:order-5" aria-label={`Remover ${l.p.nome}`} onClick={() => { setItens((x) => x.filter((i) => i.p.id !== l.p.id)); focarBusca(); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Totais */}
        <aside className="cartao flex flex-col gap-3 p-5 md:sticky md:top-6 md:self-start">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Itens</span><span>{itens.length}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{fmtMoeda(subtotal)}</span></div>
          <div className="flex items-center justify-between text-sm">
            <button className="font-semibold text-petroleo-700 hover:underline disabled:text-slate-400 disabled:no-underline" disabled={!itens.length} onClick={() => setJanela("desconto")}>
              Desconto{rotulo(teclas, "desconto")}
            </button>
            <span className={descontoValor > 0 ? "font-semibold text-acao-700" : ""}>{descontoValor > 0 ? `− ${fmtMoeda(descontoValor)}` : "—"}</span>
          </div>
          {erroDesconto && <p className="text-xs font-semibold text-critico-600">{erroDesconto}</p>}
          <div className="rounded-xl bg-petroleo-800 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-petroleo-200">Total a pagar</p>
            <p className="text-4xl font-extrabold">{fmtMoeda(total)}</p>
          </div>
          <button className="btn-acao py-4 text-lg" disabled={!podePagar} onClick={abrirPagamento}>Pagamento{rotulo(teclas, "pagamento")}</button>
          <div className="grid grid-cols-2 gap-2">
            {avulsoLiberado && (
              <button className="btn-secundario btn-pequeno col-span-2 border-acao-500 text-acao-700 hover:bg-orange-50" onClick={abrirAvulso}>
                ✚ Digite o produto{rotulo(teclas, "item_avulso")}
              </button>
            )}
            <button className="btn-secundario btn-pequeno" onClick={() => (calcAberta ? ativarCalculadora() : setCalcAberta(true))}>🧮 Calculadora{rotulo(teclas, "calculadora")}</button>
            <button className="btn-secundario btn-pequeno" disabled={!itens.length} onClick={() => setJanela("limpar")}>Cancelar compra{rotulo(teclas, "cancelar_compra")}</button>
            <button className="btn-secundario btn-pequeno" disabled={!itens.length} onClick={() => mudarUltimo(1)}>+1 no último{rotulo(teclas, "mais_um")}</button>
            <button className="btn-secundario btn-pequeno" disabled={!itens.length} onClick={() => mudarUltimo(-1)}>−1 no último{rotulo(teclas, "menos_um")}</button>
          </div>
          <button className="text-center text-xs text-slate-400 hover:text-petroleo-700 hover:underline" onClick={() => setJanela("atalhos")}>Ver todas as teclas de atalho</button>
        </aside>
      </div>

      {janela === "desconto" && (
        <JanelaDesconto
          subtotal={subtotal}
          atual={desconto}
          limite={ehAdmin ? 100 : limite}
          onAplicar={(d) => { setDesconto(d); setJanela(""); focarBusca(); }}
          onFechar={() => { setJanela(""); focarBusca(); }}
        />
      )}

      {janela === "pagamento" && (
        <JanelaPagamento
          teclas={teclas}
          total={total}
          caixa={caixa}
          itens={linhas.map((l) => ({ p: l.p, quantidade: l.q, avulso: l.avulso }))}
          desconto={descontoValor}
          onConcluida={vendaConcluida}
          onFechar={() => { setJanela(""); focarBusca(); }}
        />
      )}

      <Confirmar
        aberto={janela === "limpar"}
        titulo="Cancelar esta compra?"
        perigo
        textoConfirmar="Sim, limpar o caixa"
        mensagem={<p>Os {itens.length} item(ns) da compra atual serão retirados. Nada foi gravado ainda, o estoque não muda.</p>}
        onCancelar={() => setJanela("")}
        onConfirmar={limpar}
      />

      {(janela === "sangria" || janela === "suprimento") && (
        <JanelaSangria tipo={janela} caixa={caixa} onFechar={() => { setJanela(""); focarBusca(); }} />
      )}

      {calcAberta && <Calculadora onFechar={() => { setCalcAberta(false); if (!janela) focarBusca(); }} />}
      {janela === "avulso" && <JanelaAvulso onAdicionar={adicionarAvulso} onFechar={() => { setJanela(""); focarBusca(); }} />}
      {janela === "atalhos" && <JanelaAtalhos teclas={teclas} onFechar={() => { setJanela(""); focarBusca(); }} />}

      {janela === "fechar" && <JanelaFechamento caixa={caixa} onCancelar={() => setJanela("")} onFechado={onFechado} />}

      {comprovante && (
        <JanelaComprovante
          titulo={comprovante.id > 0 ? `Venda nº ${comprovante.id} concluída` : `Venda ${comprovante.codigo_local ?? ""} concluída`}
          onFechar={() => { setComprovante(null); focarBusca(); }}
          acaoExtra={<button className="btn-secundario" onClick={() => { setComprovante(null); focarBusca(); }}>Nova venda</button>}
        >
          {(largura) => (
            <>
              {Number(comprovante.troco) > 0 && (
                <div className="cupom-fora mb-3 rounded-lg bg-ok-100 p-3 text-center text-ok-700">
                  <p className="text-xs uppercase">Troco</p>
                  <p className="text-3xl font-extrabold">{fmtMoeda(comprovante.troco)}</p>
                </div>
              )}
              <CupomVenda venda={comprovante} config={config} largura={largura} />
            </>
          )}
        </JanelaComprovante>
      )}
    </div>
  );
}

/* ---------------------------- Desconto ---------------------------- */

function JanelaDesconto({ subtotal, atual, limite, onAplicar, onFechar }: {
  subtotal: number; atual: Desconto; limite: number; onAplicar: (d: Desconto) => void; onFechar: () => void;
}) {
  const [tipo, setTipo] = useState<Desconto["tipo"]>(atual.tipo);
  const [valor, setValor] = useState(atual.valor);
  const n = valor.trim() ? lerNumero(valor) : 0;
  const reais = Number.isNaN(n) ? NaN : centavos(tipo === "percentual" ? subtotal * n / 100 : n);
  const maximo = centavos(subtotal * limite / 100);
  const erro = Number.isNaN(reais) || n < 0 ? "Digite um número válido." : reais > subtotal ? "Maior que o valor da compra." : reais > maximo ? `O máximo permitido é ${fmtMoeda(maximo)} (${limite}%).` : "";

  return (
    <Modal
      aberto
      titulo="Desconto na compra"
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          {atual.valor && <button className="btn-secundario mr-auto" onClick={() => onAplicar({ tipo: "valor", valor: "" })}>Remover desconto</button>}
          <button className="btn-secundario" onClick={onFechar}>Cancelar</button>
          <button className="btn-acao" form="form-desconto" disabled={Boolean(erro)}>Aplicar</button>
        </>
      }
    >
      <form id="form-desconto" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!erro) onAplicar({ tipo, valor }); }}>
        <div className="grid grid-cols-2 gap-2">
          {(["valor", "percentual"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded-lg border-2 p-2 text-sm font-semibold ${tipo === t ? "border-petroleo-500 bg-petroleo-50 text-petroleo-800" : "border-slate-200"}`}>
              {t === "valor" ? "Em reais (R$)" : "Em porcentagem (%)"}
            </button>
          ))}
        </div>
        <div>
          <label className="rotulo" htmlFor="desc">{tipo === "valor" ? "Valor do desconto (R$)" : "Porcentagem (%)"}</label>
          <input id="desc" className="campo text-xl font-bold" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus placeholder="0" />
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{fmtMoeda(subtotal)}</span></div>
          <div className="flex justify-between"><span>Desconto</span><span>− {fmtMoeda(Number.isNaN(reais) ? 0 : reais)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{fmtMoeda(Math.max(0, subtotal - (Number.isNaN(reais) ? 0 : reais)))}</span></div>
        </div>
        {limite < 100 && <p className="text-xs text-slate-500">Limite para operador: {limite}% da compra.</p>}
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </form>
    </Modal>
  );
}

/* ---------------------------- Pagamento ---------------------------- */

interface Pag { forma: FormaPagamento; valor: number; cliente_id?: number; cliente_nome?: string; parcelas?: number; primeiro_vencimento?: string; juros_percentual?: number; total_com_juros?: number }

function JanelaPagamento({ teclas, caixa, total, itens, desconto, onConcluida, onFechar }: {
  teclas: MapaAtalhos; caixa: TCaixa;
  total: number; itens: ItemVenda[]; desconto: number; onConcluida: (v: VendaCompleta) => void; onFechar: () => void;
}) {
  const [pags, setPags] = useState<Pag[]>([]);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  // Pix e crediário mostram mais coisas embaixo: rola a janela para elas ficarem à vista.
  useEffect(() => {
    if (forma !== "pix" && forma !== "crediario") return;
    const t = setTimeout(() => document.getElementById("pag-extra")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    return () => clearTimeout(t);
  }, [forma]);
  const [valor, setValor] = useState(String(total).replace(".", ","));
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campoValor = useRef<HTMLInputElement>(null);
  const [calc, setCalc] = useState(false);
  const { tem0006, config: cfgLoja, ehAdmin: admin, perfil: eu } = useAuth();
  const [credCliente, setCredCliente] = useState<Cliente | null>(null);
  const [credParcelas, setCredParcelas] = useState(1);
  const [credPrimeiro, setCredPrimeiro] = useState(hojeISO(30));
  const [credJuros, setCredJuros] = useState("");
  // Juros opcionais: vazio = sem juros. Aplicados uma vez sobre o valor parcelado.
  const jurosNum = credJuros.trim() ? lerNumero(credJuros) : 0;
  const jurosValido = !Number.isNaN(jurosNum) && jurosNum >= 0 && jurosNum <= 100;

  const pago = centavos(pags.reduce((s, p) => s + p.valor, 0));
  const falta = centavos(Math.max(0, total - pago));
  const troco = centavos(Math.max(0, pago - total));
  const dinheiro = centavos(pags.filter((p) => p.forma === "dinheiro").reduce((s, p) => s + p.valor, 0));
  const temFiado = pags.some((p) => p.forma === "fiado") || forma === "fiado";

  useEffect(() => { setValor(falta > 0 ? String(falta).replace(".", ",") : ""); }, [falta]);

  function escolherForma(f: FormaPagamento) {
    if (f === "crediario" && !tem0006) {
      setErro("O crediário precisa do SQL 0006 no Supabase. Peça ao administrador.");
      return;
    }
    setForma(f);
    setErro("");
    setTimeout(() => campoValor.current?.select(), 30);
  }

  useAtalhos(teclas, {
    ...Object.fromEntries(FORMAS.map((f) => [`pag_${f}`, () => escolherForma(f)])),
    pag_exato: () => { setValor(falta > 0 ? String(falta).replace(".", ",") : ""); setTimeout(() => campoValor.current?.select(), 30); },
    pag_calculadora: () => (calc ? ativarCalculadora() : setCalc(true)),
  }, !enviando);

  function validarNovo(f: FormaPagamento, v: number): string {
    if (Number.isNaN(v) || v <= 0) return "Digite um valor maior que zero.";
    if (f !== "dinheiro" && centavos(pago - dinheiro + v) > total)
      return `${NOME_FORMA[f]} não pode passar do valor que falta (${fmtMoeda(falta)}). Troco só em dinheiro.`;
    return "";
  }

  function adicionar(): Pag[] | null {
    const v = centavos(lerNumero(valor));
    const e = validarNovo(forma, v);
    if (e) { setErro(e); return null; }
    let novo: Pag = { forma, valor: v };
    if (forma === "crediario") {
      if (pags.some((p) => p.forma === "crediario")) { setErro("Use apenas um pagamento em crediário por venda."); return null; }
      if (!credCliente) { setErro("Escolha ou cadastre o cliente do crediário."); return null; }
      if (credPrimeiro < hojeISO()) { setErro("O primeiro vencimento não pode ser uma data passada."); return null; }
      if (!jurosValido) { setErro("Juros inválido: use um número de 0 a 100 (ex.: 5 ou 2,5)."); return null; }
      novo = { forma, valor: v, cliente_id: credCliente.id, cliente_nome: credCliente.nome, parcelas: credParcelas, primeiro_vencimento: credPrimeiro,
        juros_percentual: centavos(jurosNum), total_com_juros: centavos(v * (1 + jurosNum / 100)) };
    }
    const novos = [...pags, novo];
    setPags(novos);
    setErro("");
    return novos;
  }

  async function finalizar(lista: Pag[]) {
    const p = centavos(lista.reduce((s, x) => s + x.valor, 0));
    if (p < total) return setErro(`Ainda falta ${fmtMoeda(total - p)}.`);
    if (lista.some((x) => x.forma === "fiado") && !cliente.trim()) return setErro("Para vender fiado, informe o nome do cliente.");
    setEnviando(true);
    setErro("");
    try {
      // Grava PRIMEIRO neste computador (funciona sem internet); a fila envia ao servidor.
      const venda = await finalizarVendaLocal({
        caixa, perfil: eu!, ehAdmin: admin, config: cfgLoja, itens, desconto,
        pagamentos: lista.map(({ cliente_nome: _n, total_com_juros: _t, ...p }) => ({ ...p, cliente: p.forma === "crediario" ? credCliente : null })),
        clienteNome: cliente.trim() || null, clienteTelefone: telefone.trim() || null,
      });
      onConcluida(venda);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  async function aoConfirmar(e: FormEvent) {
    e.preventDefault();
    if (total === 0) return finalizar([]);
    // Enter com valor digitado: adiciona o pagamento; se já cobre o total, finaliza.
    if (falta > 0 && valor.trim()) {
      const novos = adicionar();
      if (novos && centavos(novos.reduce((s, x) => s + x.valor, 0)) >= total && !(novos.some((x) => x.forma === "fiado") && !cliente.trim())) {
        await finalizar(novos);
      }
      return;
    }
    await finalizar(pags);
  }

  return (
    <Modal
      aberto
      titulo="Pagamento"
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn-secundario" onClick={onFechar} disabled={enviando}>Voltar</button>
          <button className="btn-acao px-6" form="form-pag" disabled={enviando}>
            {enviando ? "Finalizando…" : falta > 0 && total > 0 ? "Adicionar pagamento (Enter)" : "Finalizar venda (Enter)"}
          </button>
        </>
      }
    >
      <form id="form-pag" onSubmit={aoConfirmar} className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-100 p-3"><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold">{fmtMoeda(total)}</p></div>
          <div className="rounded-lg bg-slate-100 p-3"><p className="text-xs text-slate-500">Pago</p><p className="text-xl font-bold">{fmtMoeda(pago)}</p></div>
          {troco > 0
            ? <div className="rounded-lg bg-ok-100 p-3 text-ok-700"><p className="text-xs">TROCO</p><p className="text-2xl font-extrabold">{fmtMoeda(troco)}</p></div>
            : <div className={`rounded-lg p-3 ${falta > 0 ? "bg-atencao-100 text-atencao-700" : "bg-ok-100 text-ok-700"}`}><p className="text-xs">Falta</p><p className="text-xl font-bold">{fmtMoeda(falta)}</p></div>}
        </div>

        {total > 0 && falta > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FORMAS.map((f) => (
                <button key={f} type="button" onClick={() => escolherForma(f)} title={f === "crediario" && !tem0006 ? "Precisa do SQL 0006" : undefined}
                  className={`rounded-lg border-2 px-2 py-2.5 text-sm font-semibold transition ${forma === f ? "border-acao-500 bg-orange-50 text-acao-700" : "border-slate-200 hover:bg-slate-50"} ${f === "crediario" && !tem0006 ? "opacity-40" : ""}`}>
                  {NOME_FORMA[f]}
                  {teclas[`pag_${f}`] && <span className="block text-[11px] font-normal text-slate-400">{nomeTecla(teclas[`pag_${f}`])}</span>}
                </button>
              ))}
            </div>
            <div>
              <label className="rotulo" htmlFor="valor-pag">Valor em {NOME_FORMA[forma].toLowerCase()} {forma === "dinheiro" && "(valor recebido do cliente)"}</label>
              <div className="flex gap-2">
                <input id="valor-pag" ref={campoValor} className="campo text-2xl font-bold" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} autoFocus onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-secundario shrink-0" onClick={() => (calc ? ativarCalculadora() : setCalc(true))} title={`Calculadora${rotulo(teclas, "pag_calculadora")}`}>🧮</button>
              </div>
              {forma === "dinheiro" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[falta, 10, 20, 50, 100, 200].filter((v, i, a) => (i === 0 || v > falta) && a.indexOf(v) === i).map((v, i) => (
                    <button key={v} type="button" className="btn-secundario btn-pequeno" onClick={() => setValor(String(v).replace(".", ","))}>
                      {i === 0 ? `Exato ${fmtMoeda(v)}${rotulo(teclas, "pag_exato")}` : fmtMoeda(v)}
                    </button>
                  ))}
                </div>
              )}
              {forma === "dinheiro" && valor.trim() && !Number.isNaN(lerNumero(valor)) && lerNumero(valor) > falta && (
                <p className="mt-2 text-sm font-semibold text-ok-700">Troco previsto: {fmtMoeda(centavos(lerNumero(valor) - falta))}</p>
              )}
              {(forma === "debito" || forma === "credito") && <p className="mt-2 text-xs text-slate-500">Passe o cartão na maquininha e confirme aqui depois de aprovado.</p>}
            </div>
            <div id="pag-extra" className="space-y-3">
            {forma === "pix" && (() => {
              const v = centavos(lerNumero(valor));
              const codigo = !Number.isNaN(v) && v > 0 ? pixDaLoja(cfgLoja, v) : null;
              if (!pixDaLoja(cfgLoja)) {
                return <Aviso cor="atencao">{admin ? "Configure a chave Pix em Usuários e loja → Pix para recebimento para gerar o QR Code." : "O QR Code Pix ainda não foi configurado. Peça ao administrador."}</Aviso>;
              }
              if (!codigo) return null;
              return (
                <div className="space-y-2">
                  <PixNaTela codigo={codigo} valor={v} recebedor={cfgLoja?.pix_nome} banco={cfgLoja?.pix_banco} />
                  <p className="text-xs font-semibold text-atencao-700">⚠ Confira no app do banco que o Pix de {fmtMoeda(v)} caiu antes de confirmar. Não aceite só “print” de comprovante.</p>
                </div>
              );
            })()}
            {forma === "crediario" && (
              <div className="space-y-3 rounded-lg border border-petroleo-200 bg-white p-3">
                <p className="text-sm font-semibold text-petroleo-800">Crediário (parcelado)</p>
                <ClienteSeletor escolhido={credCliente} onEscolher={setCredCliente} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="rotulo" htmlFor="cred-n">Parcelas</label>
                    <select id="cred-n" className="campo" value={credParcelas} onChange={(e) => setCredParcelas(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => <option key={n} value={n}>{n}x</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="rotulo" htmlFor="cred-d">1º vencimento</label>
                    <input id="cred-d" type="date" className="campo" value={credPrimeiro} min={hojeISO()} onChange={(e) => setCredPrimeiro(e.target.value)} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="rotulo" htmlFor="cred-j">Juros (%) <span className="font-normal text-slate-400">— opcional</span></label>
                    <input id="cred-j" className={`campo ${jurosValido ? "" : "campo-erro"}`} inputMode="decimal" placeholder="0 = sem juros" value={credJuros} onChange={(e) => { setCredJuros(e.target.value); setErro(""); }} />
                  </div>
                </div>
                {(() => {
                  const v = centavos(lerNumero(valor));
                  if (Number.isNaN(v) || v <= 0) return null;
                  const j = jurosValido ? jurosNum : 0;
                  const comJuros = centavos(v * (1 + j / 100));
                  return (
                    <>
                    {j > 0 && (
                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-atencao-50 p-2 text-center text-xs">
                        <div><p className="text-slate-500">Valor parcelado</p><p className="font-semibold">{fmtMoeda(v)}</p></div>
                        <div><p className="text-slate-500">Juros ({String(j).replace(".", ",")}%)</p><p className="font-semibold text-acao-700">+ {fmtMoeda(comJuros - v)}</p></div>
                        <div><p className="text-slate-500">Total a pagar</p><p className="text-base font-bold">{fmtMoeda(comJuros)}</p></div>
                      </div>
                    )}
                    <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                      {dividirParcelas(comJuros, credParcelas).map((x, i) => (
                        <li key={i} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                          <span>{i + 1}/{credParcelas} · {fmtData(somarMeses(credPrimeiro, i))}</span><strong>{fmtMoeda(x)}</strong>
                        </li>
                      ))}
                    </ul>
                    </>
                  );
                })()}
              </div>
            )}
            </div>
          </>
        )}

        {pags.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {pags.map((p, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{NOME_FORMA[p.forma]}{p.forma === "crediario" && <span className="text-xs text-slate-500"> · {p.parcelas}x · {p.cliente_nome}{p.juros_percentual ? ` · juros ${String(p.juros_percentual).replace(".", ",")}% = ${fmtMoeda(p.total_com_juros ?? p.valor)}` : ""}</span>}</span>
                <span className="flex items-center gap-3">
                  <strong>{fmtMoeda(p.valor)}</strong>
                  <button type="button" className="text-slate-400 hover:text-critico-600" aria-label="Remover pagamento" onClick={() => setPags(pags.filter((_, n) => n !== i))}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {temFiado && (
          <div className="grid gap-3 rounded-lg border border-atencao-500 bg-atencao-50 p-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="cli">Nome do cliente (fiado) <span className="text-critico-600">*</span></label>
              <input id="cli" className="campo" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            </div>
            <div>
              <label className="rotulo" htmlFor="tel">Telefone</label>
              <input id="tel" className="campo" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          </div>
        )}

        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </form>
      {calc && (
        <Calculadora
          onFechar={() => { setCalc(false); setTimeout(() => campoValor.current?.select(), 30); }}
          onUsar={(v) => { setValor(String(v).replace(".", ",")); setCalc(false); setErro(""); setTimeout(() => campoValor.current?.select(), 30); }}
          textoUsar="Usar como valor"
        />
      )}
    </Modal>
  );
}

/* ----------------------- Sangria / Suprimento ----------------------- */

function JanelaSangria({ tipo, caixa, onFechar }: { tipo: "sangria" | "suprimento"; caixa: TCaixa; onFechar: () => void }) {
  const { perfil } = useAuth();
  const avisar = useToast();
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const titulo = tipo === "sangria" ? "Sangria (retirar dinheiro do caixa)" : "Suprimento (colocar dinheiro para troco)";

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const n = lerNumero(valor);
    if (Number.isNaN(n) || n <= 0) return setErro("Digite um valor maior que zero.");
    setEnviando(true);
    let error: unknown = null;
    try { await movimentarCaixaLocal({ caixa, perfil: perfil!, tipo, valor: n, observacao: obs.trim() || null }); } catch (e) { error = e; }
    setEnviando(false);
    if (error) return setErro(mensagemErro(error));
    avisar("sucesso", `${tipo === "sangria" ? "Sangria" : "Suprimento"} de ${fmtMoeda(n)} registrado.`);
    onFechar();
  }

  return (
    <Modal aberto titulo={titulo} largura="sm" onFechar={onFechar}
      rodape={<><button className="btn-secundario" onClick={onFechar}>Cancelar</button><button className="btn-primario" form="form-sangria" disabled={enviando}>{enviando ? "Salvando…" : "Confirmar"}</button></>}>
      <form id="form-sangria" onSubmit={salvar} className="space-y-4">
        <div>
          <label className="rotulo" htmlFor="v-sang">Valor (R$)</label>
          <input id="v-sang" className="campo text-xl font-bold" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="rotulo" htmlFor="o-sang">Motivo</label>
          <input id="o-sang" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} placeholder={tipo === "sangria" ? "Ex.: depósito no banco" : "Ex.: moedas para troco"} />
        </div>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </form>
    </Modal>
  );
}

/* ---------------------------- Fechamento ---------------------------- */

function JanelaFechamento({ caixa, onCancelar, onFechado }: { caixa: TCaixa; onCancelar: () => void; onFechado: () => void }) {
  const { config, perfil, valoresOcultos } = useAuth();
  const avisar = useToast();
  const [resumo, setResumo] = useState<ResumoCaixa | null>(null);
  const [contado, setContado] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fechado, setFechado] = useState<TCaixa | null>(null);
  const [parcial, setParcial] = useState(false);

  useEffect(() => {
    // Resumo calculado neste computador (funciona sem internet).
    resumoCaixaLocal(caixa).then((r) => setResumo(valoresOcultos ? mascarar(r) : r)).catch((e) => setErro(mensagemErro(e)));
  }, [caixa, valoresOcultos]);

  const n = lerNumero(contado);
  const cego = Boolean(resumo?.oculto);
  const diferenca = resumo && !cego && !Number.isNaN(n) ? centavos(n - resumo.dinheiro_esperado) : null;

  async function fechar() {
    setEnviando(true);
    let data: TCaixa;
    try {
      data = await fecharCaixaLocal({ caixa, perfil: perfil!, valorContado: n, observacao: obs.trim() || null });
    } catch (e) {
      setEnviando(false);
      setConfirmando(false);
      return setErro(mensagemErro(e));
    }
    setEnviando(false);
    setConfirmando(false);
    try { sessionStorage.removeItem(chaveCarrinho(caixa.id)); localStorage.removeItem(chaveCarrinho(caixa.id)); } catch { /* ignora */ }
    avisar("sucesso", `${nomeCaixa(caixa)} fechado.`);
    setFechado(valoresOcultos && data.resumo ? { ...data, valor_esperado: null, diferenca: null, resumo: mascarar(data.resumo) } : data);
  }

  if (fechado?.resumo) {
    return (
      <JanelaComprovante titulo={`${nomeCaixa(fechado)} fechado`} onFechar={onFechado}>
        {(l) => <CupomFechamento r={fechado.resumo!} config={config} largura={l} contado={fechado.valor_contado} diferenca={fechado.diferenca} observacao={fechado.observacao_fechamento} />}
      </JanelaComprovante>
    );
  }
  if (parcial && resumo) {
    return (
      <JanelaComprovante titulo="Resumo parcial" onFechar={() => setParcial(false)}>
        {(l) => <CupomFechamento r={resumo} config={config} largura={l} />}
      </JanelaComprovante>
    );
  }

  const linha = (r: string, v: number, forte = false) => (
    <div className={`flex justify-between py-1 text-sm ${forte ? "font-bold" : ""}`}><span>{r}</span><span>{fmtMoeda(v)}</span></div>
  );

  return (
    <Modal aberto titulo={`Fechar caixa nº ${caixa.id}`} largura="lg" onFechar={onCancelar}
      rodape={
        <>
          {!cego && <button className="btn-secundario mr-auto" disabled={!resumo} onClick={() => setParcial(true)}>🖨 Resumo parcial</button>}
          <button className="btn-secundario" onClick={onCancelar}>Voltar</button>
          <button className="btn-perigo" disabled={!resumo || Number.isNaN(n) || n < 0}
            onClick={() => { setErro(""); setConfirmando(true); }}>Fechar caixa</button>
        </>
      }>
      {!resumo ? (erro ? <Aviso cor="critico">{erro}</Aviso> : <Carregando />) : cego ? (
        <div className="mx-auto max-w-sm space-y-4">
          <Aviso cor="petroleo">
            <strong>Fechamento cego:</strong> conte todo o dinheiro da gaveta e digite o valor. A conferência com o sistema é feita pelo administrador.
          </Aviso>
          <p className="text-sm text-slate-500">{resumo.qtd_vendas} venda(s) neste caixa{resumo.qtd_canceladas > 0 && ` · ${resumo.qtd_canceladas} cancelada(s)`}.</p>
          <div>
            <label className="rotulo" htmlFor="contado">Dinheiro contado na gaveta (R$) <span className="text-critico-600">*</span></label>
            <input id="contado" className="campo text-xl font-bold" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="rotulo" htmlFor="obs-f">Observação</label>
            <input id="obs-f" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: moedas separadas em saquinho" />
          </div>
          {erro && <Aviso cor="critico">{erro}</Aviso>}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Vendas</h3>
            <p className="text-sm text-slate-500">{resumo.qtd_vendas} venda(s){resumo.qtd_canceladas > 0 && ` · ${resumo.qtd_canceladas} cancelada(s)`}</p>
            {linha("Descontos dados", resumo.descontos)}
            {linha("Total vendido", resumo.total_vendas, true)}
            <h3 className="mb-1 mt-3 font-semibold">Por forma de pagamento</h3>
            {Object.keys(resumo.por_forma).length === 0 ? <p className="text-sm text-slate-400">Nenhuma venda.</p>
              : Object.entries(resumo.por_forma).map(([f, v]) => <div key={f}>{linha(NOME_FORMA[f as FormaPagamento] ?? f, Number(v))}</div>)}
            {resumo.recebimentos_fiado > 0 && linha("Fiados recebidos", resumo.recebimentos_fiado)}
            {Number(resumo.recebimentos_crediario ?? 0) > 0 && linha("Parcelas recebidas", Number(resumo.recebimentos_crediario))}
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Dinheiro na gaveta</h3>
            {linha("Abertura", resumo.valor_abertura)}
            {linha("+ Vendas em dinheiro", Number(resumo.por_forma.dinheiro ?? 0))}
            {linha("− Trocos dados", resumo.trocos)}
            {linha("+ Suprimentos", resumo.suprimentos)}
            {resumo.recebimentos_fiado_dinheiro > 0 && linha("+ Fiado recebido", resumo.recebimentos_fiado_dinheiro)}
            {Number(resumo.recebimentos_crediario_dinheiro ?? 0) > 0 && linha("+ Parcelas recebidas", Number(resumo.recebimentos_crediario_dinheiro))}
            {linha("− Sangrias", resumo.sangrias)}
            <div className="mt-1 border-t border-slate-200 pt-1">{linha("= Esperado na gaveta", resumo.dinheiro_esperado, true)}</div>
            <div className="mt-4">
              <label className="rotulo" htmlFor="contado">Dinheiro contado na gaveta (R$) <span className="text-critico-600">*</span></label>
              <input id="contado" className="campo text-xl font-bold" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus />
            </div>
            {diferenca !== null && contado.trim() && (
              <p className={`mt-2 rounded-lg p-2 text-sm font-semibold ${diferenca === 0 ? "bg-ok-100 text-ok-700" : "bg-atencao-100 text-atencao-700"}`}>
                {diferenca === 0 ? "Caixa conferido: sem diferença." : diferenca > 0 ? `Sobra de ${fmtMoeda(diferenca)}` : `Falta de ${fmtMoeda(-diferenca)}`}
              </p>
            )}
            <div className="mt-3">
              <label className="rotulo" htmlFor="obs-f">Observação</label>
              <input id="obs-f" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: falta de R$ 2 em moedas" />
            </div>
          </div>
          {erro && <div className="sm:col-span-2"><Aviso cor="critico">{erro}</Aviso></div>}
        </div>
      )}
      <Confirmar
        aberto={confirmando}
        titulo="Confirmar fechamento?"
        processando={enviando}
        textoConfirmar="Fechar caixa"
        perigo
        onCancelar={() => setConfirmando(false)}
        onConfirmar={fechar}
        mensagem={<p>Depois de fechado, o caixa nº {caixa.id} não recebe mais vendas. Contado: <strong>{fmtMoeda(Number.isNaN(n) ? 0 : n)}</strong>.</p>}
      />
    </Modal>
  );
}

/* ------------------------ Lista de atalhos ------------------------ */

function JanelaAtalhos({ teclas, onFechar }: { teclas: MapaAtalhos; onFechar: () => void }) {
  const grupo = (ctx: "caixa" | "pagamento", titulo: string) => (
    <div>
      <h3 className="mb-2 font-semibold">{titulo}</h3>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {ACOES.filter((a) => a.contexto === ctx && teclas[a.id]).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{a.nome}</span>
            <kbd className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold shadow-sm">{nomeTecla(teclas[a.id])}</kbd>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-500"><span>Confirmar</span><kbd className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs">Enter</kbd></li>
        <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-500"><span>Fechar janela / voltar</span><kbd className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs">Esc</kbd></li>
      </ul>
    </div>
  );
  return (
    <Modal aberto titulo="Teclas de atalho" largura="lg" onFechar={onFechar} rodape={<button className="btn-primario" onClick={onFechar}>Entendi</button>}>
      <div className="grid gap-5 sm:grid-cols-2">
        {grupo("caixa", "Na tela do caixa")}
        {grupo("pagamento", "Na janela de pagamento")}
      </div>
      <p className="mt-4 text-xs text-slate-500">O administrador muda essas teclas em <strong>Teclado do caixa</strong>.</p>
    </Modal>
  );
}

/* ------------------------ Item avulso (sem cadastro) ------------------------ */

function JanelaAvulso({ onAdicionar, onFechar }: { onAdicionar: (descricao: string, preco: number, quantidade: number) => void; onFechar: () => void }) {
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [qtd, setQtd] = useState("1");
  const [erro, setErro] = useState("");
  const [calc, setCalc] = useState(false);
  const campoPreco = useRef<HTMLInputElement>(null);

  const p = lerNumero(preco);
  const q = lerNumero(qtd);
  const total = !Number.isNaN(p) && !Number.isNaN(q) ? centavos(p * q) : null;

  function confirmar(e: FormEvent) {
    e.preventDefault();
    if (Number.isNaN(p) || p <= 0) return setErro("Digite o preço (maior que zero). Ex.: 12,50");
    if (p > 100000) return setErro("Preço muito alto. Confira o valor.");
    if (Number.isNaN(q) || q <= 0) return setErro("Digite a quantidade (maior que zero). Ex.: 1 ou 0,350");
    onAdicionar(descricao.trim() || "Item avulso", centavos(p), Math.round(q * 1000) / 1000);
  }

  return (
    <Modal
      aberto
      titulo="Digite o produto (sem cadastro)"
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn-secundario" onClick={onFechar}>Cancelar</button>
          <button className="btn-acao" form="form-avulso">Adicionar à compra (Enter)</button>
        </>
      }
    >
      <form id="form-avulso" onSubmit={confirmar} className="space-y-4">
        <p className="text-sm text-slate-500">Para produto que não está cadastrado ou está sem código. Entra na venda e no comprovante, mas não mexe no estoque.</p>
        <div>
          <label className="rotulo" htmlFor="av-desc">Descrição</label>
          <input id="av-desc" className="campo" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} autoFocus placeholder="Ex.: Bolo caseiro, verdura, saco de gelo" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rotulo" htmlFor="av-preco">Preço unitário (R$)</label>
            <div className="flex gap-1">
              <input id="av-preco" ref={campoPreco} className="campo min-w-0 text-lg font-bold" inputMode="decimal" value={preco} onChange={(e) => { setPreco(e.target.value); setErro(""); }} placeholder="0,00" />
              <button type="button" className="btn-secundario shrink-0 px-3" title="Calculadora" onClick={() => (calc ? ativarCalculadora() : setCalc(true))}>🧮</button>
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="av-qtd">Quantidade</label>
            <input id="av-qtd" className="campo text-lg font-bold" inputMode="decimal" value={qtd} onChange={(e) => { setQtd(e.target.value); setErro(""); }} />
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Total do item: <strong className="text-lg">{total !== null && total > 0 ? fmtMoeda(total) : "—"}</strong>
          <span className="block text-xs text-slate-400">Peso: use vírgula, ex.: 0,350 kg × preço do kg.</span>
        </div>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </form>
      {calc && (
        <Calculadora
          onFechar={() => { setCalc(false); setTimeout(() => campoPreco.current?.select(), 30); }}
          onUsar={(v) => { setPreco(String(v).replace(".", ",")); setCalc(false); setErro(""); setTimeout(() => campoPreco.current?.select(), 30); }}
          textoUsar="Usar como preço"
        />
      )}
    </Modal>
  );
}
