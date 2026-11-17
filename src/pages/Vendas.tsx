import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { baixarCsv, hojeArquivo } from "../lib/csv";
import { COLUNAS_CAIXA, selecaoVenda } from "../lib/consultas";
import { diasAte, fmtData, fmtDataHora, fmtMoeda, hojeISO, lerNumero, mascaraDocumento, NOME_FORMA, numParaCampo } from "../lib/format";
import { FORMAS_RECEBIMENTO, type Caixa, type Cliente, type FormaPagamento, type Parcela, type ResumoCaixa, type VendaCompleta, type VendaPagamento } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { CupomCarne, CupomExtrato, CupomFechamento, CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { Aviso, Cabecalho, Carregando, Selo, Vazio } from "../components/Ui";
import { CampoDocumento, erroDocumento } from "../components/CampoDocumento";
import { OlhoValores } from "../components/OlhoValores";
import { useMoeda } from "../lib/privacidade";

type Aba = "vendas" | "fiado" | "crediario" | "clientes" | "caixas";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "vendas", rotulo: "Vendas" },
  { id: "fiado", rotulo: "Fiado" },
  { id: "crediario", rotulo: "Crediário" },
  { id: "clientes", rotulo: "Clientes" },
  { id: "caixas", rotulo: "Caixas" },
];

export default function Vendas() {
  const [params, setParams] = useSearchParams();
  const aba = (ABAS.some((a) => a.id === params.get("aba")) ? params.get("aba") : "vendas") as Aba;
  return (
    <div>
      <Cabecalho titulo="Vendas, fiado e crediário" descricao="Consulte vendas, receba fiados e parcelas, cadastre clientes e confira os caixas." acoes={<OlhoValores />} />
      <div className="nao-imprimir mb-4 flex gap-2 overflow-x-auto pb-1">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setParams({ aba: a.id }, { replace: true })}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${aba === a.id ? "bg-petroleo-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === "vendas" && <ListaVendas />}
      {aba === "fiado" && <ListaFiado />}
      {aba === "crediario" && <PrecisaDo0006><ListaCrediario /></PrecisaDo0006>}
      {aba === "clientes" && <PrecisaDo0006><ListaClientes /></PrecisaDo0006>}
      {aba === "caixas" && <ListaCaixas />}
    </div>
  );
}

function PrecisaDo0006({ children }: { children: ReactNode }) {
  const { tem0006 } = useAuth();
  if (tem0006) return <>{children}</>;
  return (
    <Aviso cor="atencao">
      Esta parte precisa do SQL <code>0006_crediario_clientes_ocultar.sql</code>. O administrador deve rodá-lo no SQL Editor do Supabase e depois recarregar a página.
    </Aviso>
  );
}

/** Cabeçalho que só aparece no papel ao imprimir uma lista. */
function TituloImpressao({ titulo }: { titulo: string }) {
  const { config } = useAuth();
  return (
    <div className="somente-impressao mb-2">
      <p className="text-lg font-bold">{config?.nome_loja ?? "Loja"} — {titulo}</p>
      <p className="text-xs">Emitido em {fmtDataHora(new Date().toISOString())} · Loja Fácil</p>
    </div>
  );
}

const LIMITE_VENDAS = 5000;
const NOME_PERIODO: Record<number, string> = { 0: "de todo o período", 1: "de hoje", 7: "dos últimos 7 dias", 30: "dos últimos 30 dias", 90: "dos últimos 90 dias", 365: "dos últimos 12 meses" };

function inicioPeriodo(dias: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString();
}

/** Janela genérica para receber um valor (fiado ou parcela) em alguma forma. */
function JanelaReceber({ titulo, descricao, valor, onConfirmar, onFechar }: {
  titulo: string; descricao: ReactNode; valor: number; onConfirmar: (forma: FormaPagamento) => Promise<string | null>; onFechar: () => void;
}) {
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function receber() {
    setEnviando(true);
    const e = await onConfirmar(forma);
    setEnviando(false);
    if (e) setErro(e);
  }
  return (
    <Modal aberto titulo={titulo} largura="sm" onFechar={onFechar}
      rodape={<><button className="btn-secundario" onClick={onFechar}>Cancelar</button><button className="btn-acao" onClick={receber} disabled={enviando}>{enviando ? "Registrando…" : `Receber ${fmtMoeda(valor)}`}</button></>}>
      <div className="space-y-3 text-sm">
        <div>{descricao}</div>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_RECEBIMENTO.map((x) => (
            <button key={x} type="button" onClick={() => setForma(x)} className={`rounded-lg border-2 p-2 text-sm font-semibold ${forma === x ? "border-acao-500 bg-orange-50 text-acao-700" : "border-slate-200"}`}>{NOME_FORMA[x]}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">O valor entra no <strong>seu caixa aberto</strong> e aparece no fechamento.</p>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

/* ------------------------------ Vendas ------------------------------ */

function ListaVendas() {
  const moeda = useMoeda();
  const { config, ehAdmin, tem0006, valoresOcultos } = useAuth();
  const avisar = useToast();
  // Padrão: últimos 30 dias (antes era só "Hoje", e as vendas dos dias anteriores pareciam ter sumido).
  const [dias, setDias] = useState(() => {
    try { const v = Number(localStorage.getItem("lojafacil.vendas.periodo")); return [0, 1, 7, 30, 90, 365].includes(v) && localStorage.getItem("lojafacil.vendas.periodo") !== null ? v : 30; } catch { return 30; }
  });
  useEffect(() => { try { localStorage.setItem("lojafacil.vendas.periodo", String(dias)); } catch { /* sem memória */ } }, [dias]);
  const [status, setStatus] = useState<"" | "concluida" | "cancelada">("");
  const [busca, setBusca] = useState("");
  const [vendas, setVendas] = useState<VendaCompleta[] | null>(null);
  const [aberta, setAberta] = useState<VendaCompleta | null>(null);
  const [cancelando, setCancelando] = useState<VendaCompleta | null>(null);

  const carregar = useCallback(async () => {
    setVendas(null);
    let q = supabase.from("vendas").select(selecaoVenda(tem0006)).order("criado_em", { ascending: false }).limit(LIMITE_VENDAS);
    if (dias > 0) q = q.gte("criado_em", inicioPeriodo(dias));
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) { avisar("erro", mensagemErro(error)); setVendas([]); return; }
    setVendas(data as unknown as VendaCompleta[]);
  }, [dias, status, avisar, tem0006]);
  useEffect(() => { void carregar(); }, [carregar]);

  const t = busca.trim().toLowerCase();
  const lista = (vendas ?? []).filter((v) => !t || String(v.id) === t || (v.cliente_nome ?? "").toLowerCase().includes(t) || (v.usuario_nome ?? "").toLowerCase().includes(t));
  const concluidas = lista.filter((v) => v.status === "concluida");
  const totalVendido = concluidas.reduce((s, v) => s + Number(v.total), 0);
  const porForma = concluidas.flatMap((v) => v.venda_pagamentos).reduce<Record<string, number>>((acc, p) => {
    acc[p.forma] = (acc[p.forma] ?? 0) + Number(p.valor);
    return acc;
  }, {});

  function exportar() {
    baixarCsv(`loja-facil-vendas-${hojeArquivo()}.csv`,
      ["Venda", "Data", "Operador", "Situação", "Subtotal", "Desconto", "Total", "Pagamentos", "Troco", "Cliente", "Itens"],
      lista.map((v) => [v.id, fmtDataHora(v.criado_em), v.usuario_nome, v.status === "concluida" ? "Concluída" : "Cancelada",
        Number(v.subtotal), Number(v.desconto), Number(v.total),
        v.venda_pagamentos.map((p) => `${NOME_FORMA[p.forma]} ${fmtMoeda(p.valor)}`).join(" + "), Number(v.troco), v.cliente_nome,
        v.venda_itens.map((i) => `${i.quantidade} ${i.unidade} ${i.produto_nome}`).join(" | ")]));
    avisar("sucesso", `${lista.length} venda(s) exportada(s).`);
  }

  return (
    <>
      <div className="nao-imprimir cartao mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="rotulo" htmlFor="per">Período</label>
          <select id="per" className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>Hoje</option><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Últimos 12 meses</option><option value={0}>Todo o período</option>
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="st">Situação</label>
          <select id="st" className="campo" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todas</option><option value="concluida">Concluídas</option><option value="cancelada">Canceladas</option>
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="bv">Buscar</label>
          <input id="bv" className="campo" placeholder="Nº da venda, cliente ou operador" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-secundario flex-1" disabled={!lista.length} onClick={exportar}>⤓ Planilha</button>
          <button className="btn-secundario flex-1" disabled={!lista.length} onClick={() => window.print()}>🖨 Imprimir</button>
        </div>
      </div>

      {vendas && (
        <p className="mb-3 text-sm text-slate-600">
          Mostrando <strong>{lista.length}</strong> venda(s) <strong>{NOME_PERIODO[dias] ?? `dos últimos ${dias} dias`}</strong>.
          {dias !== 0 && <> Não achou uma venda? Escolha <button type="button" className="font-semibold text-petroleo-700 underline" onClick={() => setDias(0)}>todo o período</button>.</>}
          {vendas.length >= LIMITE_VENDAS && <> Mostrando as {LIMITE_VENDAS} mais recentes; use a busca ou um período menor.</>}
        </p>
      )}
      {vendas && !valoresOcultos && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="cartao p-4"><p className="text-xs uppercase text-slate-500">Vendas concluídas</p><p className="text-2xl font-bold">{concluidas.length}</p></div>
          <div className="cartao p-4"><p className="text-xs uppercase text-slate-500">Total vendido</p><p className="text-2xl font-bold">{moeda(totalVendido)}</p></div>
          <div className="cartao col-span-2 p-4 text-sm">
            <p className="mb-1 text-xs uppercase text-slate-500">Por forma de pagamento</p>
            {Object.keys(porForma).length === 0 ? <p className="text-slate-400">—</p> : (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(porForma).map(([f, v]) => <span key={f}>{NOME_FORMA[f as FormaPagamento]}: <strong>{moeda(v)}</strong></span>)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cartao area-impressao overflow-hidden">
        <TituloImpressao titulo="Vendas" />
        {!vendas ? <Carregando /> : lista.length === 0 ? <Vazio titulo="Nenhuma venda neste período." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Data</th><th>Operador</th><th>Pagamento</th><th className="text-right">Total</th><th>Situação</th><th className="nao-imprimir"></th></tr></thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.id} className={v.status === "cancelada" ? "opacity-60" : ""}>
                    <td className="font-mono">{v.id}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(v.criado_em)}</td>
                    <td>{v.usuario_nome}</td>
                    <td className="text-xs">{v.venda_pagamentos.map((p) => NOME_FORMA[p.forma]).join(" + ")}{v.cliente_nome && <span className="block text-slate-400">{v.cliente_nome}</span>}</td>
                    <td className="whitespace-nowrap text-right font-semibold">{moeda(v.total)}{Number(v.desconto) > 0 && <span className="block text-xs font-normal text-acao-700">desc. {moeda(v.desconto)}</span>}</td>
                    <td>{v.status === "concluida" ? <Selo cor="ok">Concluída</Selo> : <Selo cor="critico">Cancelada</Selo>}</td>
                    <td className="nao-imprimir text-right"><button className="btn-secundario btn-pequeno" onClick={() => setAberta(v)}>Ver / imprimir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberta && (
        <JanelaComprovante
          titulo={`Venda nº ${aberta.id}`}
          onFechar={() => setAberta(null)}
          acaoExtra={ehAdmin && aberta.status === "concluida" && <button className="btn-perigo" onClick={() => { setCancelando(aberta); setAberta(null); }}>Cancelar venda</button>}
        >
          {(l) => (
            <>
              {aberta.status === "cancelada" && (
                <div className="cupom-fora mb-3 rounded-lg bg-critico-50 p-2 text-xs text-critico-700">
                  Cancelada em {fmtDataHora(aberta.cancelada_em)} por {aberta.cancelada_por_nome}. Motivo: {aberta.motivo_cancelamento}
                </div>
              )}
              <CupomVenda venda={aberta} config={config} largura={l} />
            </>
          )}
        </JanelaComprovante>
      )}

      {cancelando && <JanelaCancelar venda={cancelando} onFechar={() => setCancelando(null)} onCancelada={() => { setCancelando(null); void carregar(); }} />}
    </>
  );
}

function JanelaCancelar({ venda, onFechar, onCancelada }: { venda: VendaCompleta; onFechar: () => void; onCancelada: () => void }) {
  const avisar = useToast();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    if (!motivo.trim()) return setErro("Informe o motivo do cancelamento.");
    setEnviando(true);
    const { error } = await supabase.rpc("cancelar_venda", { p_venda_id: venda.id, p_motivo: motivo.trim() });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error));
    avisar("sucesso", `Venda nº ${venda.id} cancelada. Os produtos voltaram ao estoque.`);
    onCancelada();
  }

  const temCrediario = venda.venda_pagamentos.some((p) => p.forma === "crediario");
  return (
    <Modal aberto titulo={`Cancelar venda nº ${venda.id}?`} largura="sm" onFechar={onFechar}
      rodape={<><button className="btn-secundario" onClick={onFechar}>Voltar</button><button className="btn-perigo" onClick={cancelar} disabled={enviando}>{enviando ? "Cancelando…" : "Confirmar cancelamento"}</button></>}>
      <div className="space-y-3 text-sm">
        <p>Total de <strong>{fmtMoeda(venda.total)}</strong>. Os {venda.venda_itens.length} item(ns) voltarão ao estoque e a venda sai do total do caixa.</p>
        {temCrediario && <p>As parcelas do crediário em aberto também serão canceladas.</p>}
        <Aviso cor="atencao">Devolva o dinheiro ao cliente (ou estorne o cartão/Pix na maquininha ou no banco). O sistema não faz estorno automático.</Aviso>
        <div>
          <label className="rotulo" htmlFor="mot">Motivo <span className="text-critico-600">*</span></label>
          <input id="mot" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Ex.: cliente desistiu, valor errado" />
        </div>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

/* ------------------------------ Fiado ------------------------------ */

type FiadoLinha = VendaPagamento & { vendas: { id: number; cliente_nome: string | null; cliente_telefone: string | null; criado_em: string; status: string; usuario_nome: string | null } };

function ListaFiado() {
  const moeda = useMoeda();
  const { config, valoresOcultos } = useAuth();
  const avisar = useToast();
  const [mostrarRecebidos, setMostrarRecebidos] = useState(false);
  const [lista, setLista] = useState<FiadoLinha[] | null>(null);
  const [recebendo, setRecebendo] = useState<FiadoLinha | null>(null);
  const [extrato, setExtrato] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLista(null);
    let q = supabase.from("venda_pagamentos")
      .select("*, vendas!inner(id, cliente_nome, cliente_telefone, criado_em, status, usuario_nome)")
      .eq("forma", "fiado").eq("vendas.status", "concluida").order("id", { ascending: false }).limit(2000);
    q = mostrarRecebidos ? q.not("fiado_recebido_em", "is", null) : q.is("fiado_recebido_em", null);
    const { data, error } = await q;
    if (error) { avisar("erro", mensagemErro(error)); setLista([]); return; }
    setLista(data as unknown as FiadoLinha[]);
  }, [mostrarRecebidos, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  const porCliente = (lista ?? []).reduce<Record<string, number>>((acc, f) => {
    const c = f.vendas.cliente_nome ?? "—";
    acc[c] = (acc[c] ?? 0) + Number(f.valor);
    return acc;
  }, {});
  const total = Object.values(porCliente).reduce((s, v) => s + v, 0);
  const linhasExtrato = (lista ?? []).filter((f) => (f.vendas.cliente_nome ?? "—") === extrato);

  return (
    <>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button className={`btn-pequeno btn ${!mostrarRecebidos ? "bg-petroleo-700 text-white" : "btn-secundario"}`} onClick={() => setMostrarRecebidos(false)}>A receber</button>
          <button className={`btn-pequeno btn ${mostrarRecebidos ? "bg-petroleo-700 text-white" : "btn-secundario"}`} onClick={() => setMostrarRecebidos(true)}>Já recebidos</button>
          <button className="btn-secundario btn-pequeno" disabled={!lista?.length} onClick={() => window.print()}>🖨 Imprimir lista</button>
        </div>
        {lista && !mostrarRecebidos && !valoresOcultos && <p className="text-sm">Total a receber: <strong className="text-lg">{moeda(total)}</strong></p>}
      </div>

      {!mostrarRecebidos && Object.keys(porCliente).length > 0 && (
        <div className="nao-imprimir cartao mb-4 p-4 text-sm">
          <p className="mb-2 text-xs uppercase text-slate-500">Por cliente — clique para imprimir o extrato</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(porCliente).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <button key={c} className="rounded-full bg-slate-100 px-3 py-1 hover:bg-petroleo-50" onClick={() => setExtrato(c)}>
                {c}{!valoresOcultos && <>: <strong>{moeda(v)}</strong></>} 🧾
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cartao area-impressao overflow-hidden">
        <TituloImpressao titulo={mostrarRecebidos ? "Fiados recebidos" : "Fiado a receber"} />
        {!lista ? <Carregando /> : lista.length === 0 ? <Vazio titulo={mostrarRecebidos ? "Nenhum fiado recebido ainda." : "Nenhum fiado pendente. 🎉"} /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Venda</th><th>Data</th><th className="text-right">Valor</th><th className={mostrarRecebidos ? "" : "nao-imprimir"}>{mostrarRecebidos ? "Recebido" : ""}</th></tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td><span className="font-medium">{f.vendas.cliente_nome}</span>{f.vendas.cliente_telefone && <span className="block text-xs text-slate-400">{f.vendas.cliente_telefone}</span>}</td>
                    <td className="font-mono">{f.venda_id}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(f.vendas.criado_em)}</td>
                    <td className="text-right font-semibold">{moeda(f.valor)}</td>
                    <td className={`text-right ${mostrarRecebidos ? "" : "nao-imprimir"}`}>
                      {mostrarRecebidos
                        ? <span className="text-xs text-slate-500">{fmtDataHora(f.fiado_recebido_em)} · {f.fiado_recebido_forma && NOME_FORMA[f.fiado_recebido_forma]} · {f.fiado_recebido_por}</span>
                        : <button className="btn-acao btn-pequeno" onClick={() => setRecebendo(f)}>Receber</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {!mostrarRecebidos && !valoresOcultos && (
                <tfoot><tr><td colSpan={3} className="font-semibold">Total a receber</td><td className="text-right font-bold">{moeda(total)}</td><td className="nao-imprimir"></td></tr></tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {recebendo && (
        <JanelaReceber
          titulo="Receber fiado"
          valor={Number(recebendo.valor)}
          descricao={<p><strong>{recebendo.vendas.cliente_nome}</strong> · venda nº {recebendo.venda_id} de {fmtDataHora(recebendo.vendas.criado_em)}</p>}
          onFechar={() => setRecebendo(null)}
          onConfirmar={async (forma) => {
            const { error } = await supabase.rpc("receber_fiado", { p_pagamento_id: recebendo.id, p_forma: forma });
            if (error) return mensagemErro(error);
            avisar("sucesso", `Fiado de ${recebendo.vendas.cliente_nome} (${moeda(recebendo.valor)}) recebido em ${NOME_FORMA[forma].toLowerCase()}.`);
            setRecebendo(null);
            void carregar();
            return null;
          }}
        />
      )}

      {extrato && (
        <JanelaComprovante titulo={`Extrato de fiado — ${extrato}`} onFechar={() => setExtrato(null)}>
          {(l) => (
            <CupomExtrato
              titulo="EXTRATO DE FIADO"
              cliente={extrato}
              telefone={linhasExtrato.find((f) => f.vendas.cliente_telefone)?.vendas.cliente_telefone}
              config={config}
              largura={l}
              linhas={linhasExtrato.map((f) => ({ descricao: `Venda nº ${f.venda_id}`, detalhe: fmtDataHora(f.vendas.criado_em), valor: Number(f.valor) }))}
              total={linhasExtrato.reduce((s, f) => s + Number(f.valor), 0)}
            />
          )}
        </JanelaComprovante>
      )}
    </>
  );
}

/* ------------------------------ Crediário ------------------------------ */

type ParcelaLinha = Parcela & { clientes: { nome: string; telefone: string | null } | null; vendas: { id: number; criado_em: string; status: string; total: number } };
type FiltroParcela = "abertas" | "atrasadas" | "pagas";

function ListaCrediario() {
  const moeda = useMoeda();
  const { config, valoresOcultos } = useAuth();
  const avisar = useToast();
  const [filtro, setFiltro] = useState<FiltroParcela>("abertas");
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ParcelaLinha[] | null>(null);
  const [recebendo, setRecebendo] = useState<ParcelaLinha | null>(null);
  const [carne, setCarne] = useState<{ venda: ParcelaLinha["vendas"]; cliente: string; parcelas: Parcela[] } | null>(null);

  const carregar = useCallback(async () => {
    setLista(null);
    let q = supabase.from("parcelas").select("*, clientes(nome, telefone), vendas!inner(id, criado_em, status, total)").limit(3000);
    if (filtro === "pagas") q = q.eq("status", "paga").order("pago_em", { ascending: false });
    else {
      q = q.eq("status", "aberta").order("vencimento");
      if (filtro === "atrasadas") q = q.lt("vencimento", hojeISO());
    }
    const { data, error } = await q;
    if (error) { avisar("erro", mensagemErro(error)); setLista([]); return; }
    setLista(data as unknown as ParcelaLinha[]);
  }, [filtro, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  const t = busca.trim().toLowerCase();
  const visiveis = (lista ?? []).filter((p) => !t || (p.clientes?.nome ?? "").toLowerCase().includes(t) || String(p.venda_id) === t);
  const total = visiveis.reduce((s, p) => s + Number(p.valor), 0);
  const atrasado = visiveis.filter((p) => p.status === "aberta" && diasAte(p.vencimento) < 0).reduce((s, p) => s + Number(p.valor), 0);

  async function abrirCarne(p: ParcelaLinha) {
    const { data, error } = await supabase.from("parcelas").select("*").eq("venda_id", p.venda_id).order("numero");
    if (error) return avisar("erro", mensagemErro(error));
    setCarne({ venda: p.vendas, cliente: p.clientes?.nome ?? "—", parcelas: data as Parcela[] });
  }

  return (
    <>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["abertas", "atrasadas", "pagas"] as const).map((f) => (
            <button key={f} className={`btn-pequeno btn ${filtro === f ? "bg-petroleo-700 text-white" : "btn-secundario"}`} onClick={() => setFiltro(f)}>
              {f === "abertas" ? "Em aberto" : f === "atrasadas" ? "Atrasadas" : "Pagas"}
            </button>
          ))}
          <input className="campo w-56 py-1.5 text-sm" placeholder="Cliente ou nº da venda" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar parcela" />
          <button className="btn-secundario btn-pequeno" disabled={!visiveis.length} onClick={() => window.print()}>🖨 Imprimir lista</button>
        </div>
        {lista && filtro !== "pagas" && !valoresOcultos && (
          <p className="text-sm">
            {filtro === "abertas" ? "Em aberto" : "Atrasado"}: <strong className="text-lg">{moeda(total)}</strong>
            {filtro === "abertas" && atrasado > 0 && <span className="ml-2 font-semibold text-critico-600">· atrasado {moeda(atrasado)}</span>}
          </p>
        )}
      </div>

      <div className="cartao area-impressao overflow-hidden">
        <TituloImpressao titulo={filtro === "pagas" ? "Parcelas pagas" : filtro === "atrasadas" ? "Parcelas atrasadas" : "Crediário em aberto"} />
        {!lista ? <Carregando /> : visiveis.length === 0 ? <Vazio titulo={filtro === "atrasadas" ? "Nenhuma parcela atrasada. 🎉" : "Nenhuma parcela aqui."} /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Venda</th><th>Parcela</th><th>Vencimento</th><th className="text-right">Valor</th><th className="nao-imprimir"></th></tr></thead>
              <tbody>
                {visiveis.map((p) => {
                  const d = diasAte(p.vencimento);
                  const atrasada = p.status === "aberta" && d < 0;
                  return (
                    <tr key={p.id} className={atrasada ? "bg-critico-50" : ""}>
                      <td><span className="font-medium">{p.clientes?.nome}</span>{p.clientes?.telefone && <span className="block text-xs text-slate-400">{p.clientes.telefone}</span>}</td>
                      <td className="font-mono">{p.venda_id}</td>
                      <td>{p.numero}/{p.total_parcelas}</td>
                      <td className="whitespace-nowrap">
                        {fmtData(p.vencimento)}
                        {p.status === "aberta" && <span className={`block text-xs ${atrasada ? "font-semibold text-critico-600" : d <= 7 ? "text-atencao-700" : "text-slate-400"}`}>
                          {atrasada ? `atrasada ${-d} dia(s)` : d === 0 ? "vence hoje" : `em ${d} dia(s)`}
                        </span>}
                        {p.status === "paga" && <span className="block text-xs text-ok-700">paga {fmtDataHora(p.pago_em)} · {p.pago_forma && NOME_FORMA[p.pago_forma]}</span>}
                      </td>
                      <td className="text-right font-semibold">{moeda(p.valor)}</td>
                      <td className="nao-imprimir whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-secundario btn-pequeno" onClick={() => abrirCarne(p)}>Carnê</button>
                          {p.status === "aberta" && <button className="btn-acao btn-pequeno" onClick={() => setRecebendo(p)}>Receber</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recebendo && (
        <JanelaReceber
          titulo="Receber parcela"
          valor={Number(recebendo.valor)}
          descricao={<p><strong>{recebendo.clientes?.nome}</strong> · parcela {recebendo.numero}/{recebendo.total_parcelas} da venda nº {recebendo.venda_id} · vence {fmtData(recebendo.vencimento)}</p>}
          onFechar={() => setRecebendo(null)}
          onConfirmar={async (forma) => {
            const { error } = await supabase.rpc("receber_parcela", { p_parcela_id: recebendo.id, p_forma: forma });
            if (error) return mensagemErro(error);
            avisar("sucesso", `Parcela ${recebendo.numero}/${recebendo.total_parcelas} de ${recebendo.clientes?.nome} recebida (${moeda(recebendo.valor)}).`);
            setRecebendo(null);
            void carregar();
            return null;
          }}
        />
      )}

      {carne && (
        <JanelaComprovante titulo={`Carnê — venda nº ${carne.venda.id}`} onFechar={() => setCarne(null)}>
          {(l) => <CupomCarne venda={carne.venda} cliente={carne.cliente} parcelas={carne.parcelas} config={config} largura={l} />}
        </JanelaComprovante>
      )}
    </>
  );
}

/* ------------------------------ Clientes ------------------------------ */

function ListaClientes() {
  const moeda = useMoeda();
  const { config, ehAdmin, valoresOcultos } = useAuth();
  const avisar = useToast();
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [abertoPorCliente, setAbertoPorCliente] = useState<Record<number, number>>({});
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<Cliente | "novo" | null>(null);
  const [extrato, setExtrato] = useState<{ c: Cliente; parcelas: Parcela[] } | null>(null);

  const carregar = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from("clientes").select("*").order("nome").limit(5000),
      supabase.from("parcelas").select("cliente_id, valor").eq("status", "aberta").limit(10000),
    ]);
    if (c.error) { avisar("erro", mensagemErro(c.error)); setClientes([]); return; }
    setClientes(c.data as Cliente[]);
    const m: Record<number, number> = {};
    for (const x of (p.data ?? []) as { cliente_id: number; valor: number }[]) m[x.cliente_id] = (m[x.cliente_id] ?? 0) + Number(x.valor);
    setAbertoPorCliente(m);
  }, [avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  const t = busca.trim().toLowerCase();
  const visiveis = (clientes ?? []).filter((c) => (mostrarInativos || c.ativo) && (!t || c.nome.toLowerCase().includes(t) || (c.telefone ?? "").includes(t) || (c.cpf ?? "").includes(t)));

  async function verExtrato(c: Cliente) {
    const { data, error } = await supabase.from("parcelas").select("*").eq("cliente_id", c.id).eq("status", "aberta").order("vencimento");
    if (error) return avisar("erro", mensagemErro(error));
    setExtrato({ c, parcelas: data as Parcela[] });
  }

  return (
    <>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <input className="campo w-64 py-1.5 text-sm" placeholder="Buscar por nome, telefone, CPF ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-petroleo-700" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos</label>
        <span className="flex-1" />
        <button className="btn-secundario btn-pequeno" disabled={!visiveis.length} onClick={() => window.print()}>🖨 Imprimir lista</button>
        <button className="btn-acao btn-pequeno" onClick={() => setEditando("novo")}>+ Novo cliente</button>
      </div>

      <div className="cartao area-impressao overflow-hidden">
        <TituloImpressao titulo="Clientes" />
        {!clientes ? <Carregando /> : visiveis.length === 0 ? <Vazio titulo="Nenhum cliente cadastrado ainda." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nome</th><th>Telefone</th><th>CPF/CNPJ</th><th className="text-right">Limite</th><th className="text-right">Em aberto</th><th className="nao-imprimir"></th></tr></thead>
              <tbody>
                {visiveis.map((c) => {
                  const aberto = abertoPorCliente[c.id] ?? 0;
                  const passou = c.limite_credito !== null && aberto > Number(c.limite_credito);
                  return (
                    <tr key={c.id} className={!c.ativo ? "opacity-60" : ""}>
                      <td><span className="font-medium">{c.nome}</span>{!c.ativo && <Selo>Inativo</Selo>}{c.endereco && <span className="block text-xs text-slate-400">{c.endereco}</span>}</td>
                      <td className="whitespace-nowrap">{c.telefone ?? "—"}</td>
                      <td className="whitespace-nowrap">{c.cpf ?? "—"}</td>
                      <td className="text-right">{c.limite_credito === null ? <span className="text-xs text-slate-400">sem limite</span> : moeda(c.limite_credito)}</td>
                      <td className={`text-right font-semibold ${passou ? "text-critico-600" : ""}`}>{valoresOcultos ? "—" : moeda(aberto)}</td>
                      <td className="nao-imprimir whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-secundario btn-pequeno" onClick={() => verExtrato(c)}>Extrato</button>
                          <button className="btn-secundario btn-pequeno" onClick={() => setEditando(c)}>Editar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && <JanelaCliente cliente={editando === "novo" ? null : editando} ehAdmin={ehAdmin} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); void carregar(); }} />}

      {extrato && (
        <JanelaComprovante titulo={`Extrato — ${extrato.c.nome}`} onFechar={() => setExtrato(null)}>
          {(l) => (
            <CupomExtrato
              titulo="EXTRATO DE CREDIÁRIO"
              cliente={extrato.c.nome}
              telefone={extrato.c.telefone}
              config={config}
              largura={l}
              linhas={extrato.parcelas.map((p) => ({
                descricao: `Venda nº ${p.venda_id} · ${p.numero}/${p.total_parcelas}`,
                detalhe: `vence ${fmtData(p.vencimento)}${diasAte(p.vencimento) < 0 ? " (ATRASADA)" : ""}`,
                valor: Number(p.valor),
              }))}
              total={extrato.parcelas.reduce((s, p) => s + Number(p.valor), 0)}
              rodape={extrato.c.limite_credito !== null ? `Limite de crédito: ${moeda(extrato.c.limite_credito)}` : undefined}
            />
          )}
        </JanelaComprovante>
      )}
    </>
  );
}

function JanelaCliente({ cliente, ehAdmin, onFechar, onSalvo }: { cliente: Cliente | null; ehAdmin: boolean; onFechar: () => void; onSalvo: () => void }) {
  const avisar = useToast();
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [telefone, setTelefone] = useState(cliente?.telefone ?? "");
  const [cpf, setCpf] = useState(cliente?.cpf ? mascaraDocumento(cliente.cpf) : "");
  const [endereco, setEndereco] = useState(cliente?.endereco ?? "");
  const [limite, setLimite] = useState(cliente?.limite_credito != null ? numParaCampo(cliente.limite_credito) : "");
  const [obs, setObs] = useState(cliente?.observacao ?? "");
  const [ativo, setAtivo] = useState(cliente?.ativo ?? true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro("Informe o nome do cliente.");
    const errDoc = erroDocumento(cpf);
    if (errDoc) return setErro(errDoc);
    let lim: number | null = null;
    if (limite.trim()) {
      lim = lerNumero(limite);
      if (Number.isNaN(lim) || lim < 0) return setErro("Limite de crédito inválido.");
    }
    const dados: Record<string, unknown> = {
      nome: nome.trim(), telefone: telefone.trim() || null, cpf: cpf.trim() || null,
      endereco: endereco.trim() || null, observacao: obs.trim() || null, ativo,
    };
    if (ehAdmin) dados.limite_credito = lim;
    setSalvando(true);
    const { error } = cliente
      ? await supabase.from("clientes").update(dados).eq("id", cliente.id)
      : await supabase.from("clientes").insert(dados);
    setSalvando(false);
    if (error) return setErro(error.code === "23505" ? "Já existe um cliente com este CPF/CNPJ." : mensagemErro(error));
    avisar("sucesso", cliente ? "Cliente atualizado." : "Cliente cadastrado.");
    onSalvo();
  }

  return (
    <Modal aberto titulo={cliente ? "Editar cliente" : "Novo cliente"} largura="md" onFechar={onFechar}
      rodape={<><button className="btn-secundario" onClick={onFechar}>Cancelar</button><button className="btn-acao" form="form-cliente" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <form id="form-cliente" onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="c-nome">Nome <span className="text-critico-600">*</span></label>
          <input id="c-nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus maxLength={120} />
        </div>
        <div>
          <label className="rotulo" htmlFor="c-tel">Telefone</label>
          <input id="c-tel" className="campo" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
        </div>
        <div>
          <label className="rotulo" htmlFor="c-cpf">CPF ou CNPJ</label>
          <CampoDocumento id="c-cpf" valor={cpf} onMudar={(v) => { setCpf(v); setErro(""); }} />
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="c-end">Endereço</label>
          <input id="c-end" className="campo" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={160} />
        </div>
        <div>
          <label className="rotulo" htmlFor="c-lim">Limite de crédito (R$)</label>
          <input id="c-lim" className="campo" inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} disabled={!ehAdmin} placeholder="vazio = sem limite" />
          {!ehAdmin && <p className="mt-1 text-xs text-slate-400">Só o administrador altera o limite.</p>}
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-petroleo-700" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Cliente ativo
        </label>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="c-obs">Observação</label>
          <input id="c-obs" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} />
        </div>
        {erro && <div className="sm:col-span-2"><Aviso cor="critico">{erro}</Aviso></div>}
      </form>
    </Modal>
  );
}

/* ------------------------------ Caixas ------------------------------ */

function ListaCaixas() {
  const moeda = useMoeda();
  const { config, ehAdmin, valoresOcultos } = useAuth();
  const avisar = useToast();
  const [caixas, setCaixas] = useState<Caixa[] | null>(null);
  const [resumo, setResumo] = useState<{ c: Caixa; r: ResumoCaixa } | null>(null);

  useEffect(() => {
    (async () => {
      // SQL 0006: listar_caixas (respeita o fechamento cego). Antes dele: leitura direta.
      const r = await supabase.rpc("listar_caixas", { p_limite: 300 });
      if (!r.error) return setCaixas(r.data as Caixa[]);
      const completo = await supabase.from("caixas").select("*").order("aberto_em", { ascending: false }).limit(300);
      if (!completo.error) return setCaixas(completo.data as Caixa[]);
      const d = await supabase.from("caixas").select(COLUNAS_CAIXA).order("aberto_em", { ascending: false }).limit(300);
      if (d.error) { avisar("erro", mensagemErro(d.error)); setCaixas([]); return; }
      setCaixas((d.data as unknown as Caixa[]).map((c) => ({ ...c, valor_esperado: null, diferenca: null, resumo: null })));
    })();
  }, [avisar]);

  async function ver(c: Caixa) {
    if (c.status === "fechado" && c.resumo) return setResumo({ c, r: c.resumo });
    const { data, error } = await supabase.rpc("resumo_caixa", { p_caixa_id: c.id });
    if (error) return avisar("erro", mensagemErro(error));
    setResumo({ c, r: data as ResumoCaixa });
  }

  const colunasValores = !valoresOcultos;
  const caixasOrdenados = useMemo(() => caixas ?? [], [caixas]);

  return (
    <>
      {!ehAdmin && <p className="nao-imprimir mb-3 text-sm text-slate-500">Você vê apenas os seus caixas. O administrador vê todos.</p>}
      <div className="cartao area-impressao overflow-hidden">
        <TituloImpressao titulo="Caixas" />
        {!caixas ? <Carregando /> : caixasOrdenados.length === 0 ? <Vazio titulo="Nenhum caixa aberto ainda." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Operador</th><th>Abertura</th><th>Fechamento</th>{colunasValores && <th className="text-right">Esperado</th>}<th className="text-right">Contado</th>{colunasValores && <th className="text-right">Diferença</th>}<th className="nao-imprimir"></th></tr></thead>
              <tbody>
                {caixasOrdenados.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono">{c.id}</td>
                    <td>{c.usuario_nome}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDataHora(c.aberto_em)}</td>
                    <td className="whitespace-nowrap text-xs">{c.status === "aberto" ? <Selo cor="ok">Aberto</Selo> : fmtDataHora(c.fechado_em)}</td>
                    {colunasValores && <td className="text-right">{c.valor_esperado !== null ? moeda(c.valor_esperado) : "—"}</td>}
                    <td className="text-right">{c.valor_contado !== null ? moeda(c.valor_contado) : "—"}</td>
                    {colunasValores && (
                      <td className={`text-right font-semibold ${c.diferenca === null || Number(c.diferenca) === 0 ? "" : Number(c.diferenca) > 0 ? "text-petroleo-700" : "text-critico-600"}`}>
                        {c.diferenca === null ? "—" : Number(c.diferenca) === 0 ? "OK" : moeda(c.diferenca)}
                      </td>
                    )}
                    <td className="nao-imprimir text-right"><button className="btn-secundario btn-pequeno" onClick={() => ver(c)}>Ver / imprimir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {resumo && (
        <JanelaComprovante titulo={`Caixa nº ${resumo.c.id}`} onFechar={() => setResumo(null)}>
          {(l) => <CupomFechamento r={resumo.r} config={config} largura={l} contado={resumo.c.valor_contado} diferenca={resumo.c.diferenca === null ? null : Number(resumo.c.diferenca)} observacao={resumo.c.observacao_fechamento} />}
        </JanelaComprovante>
      )}
    </>
  );
}
