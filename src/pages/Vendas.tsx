import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { baixarCsv, hojeArquivo } from "../lib/csv";
import { fmtDataHora, fmtMoeda, NOME_FORMA } from "../lib/format";
import { FORMAS, type Caixa, type FormaPagamento, type ResumoCaixa, type VendaCompleta, type VendaPagamento } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { CupomFechamento, CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { Aviso, Cabecalho, Carregando, Selo, Vazio } from "../components/Ui";

type Aba = "vendas" | "fiado" | "caixas";

export default function Vendas() {
  const [params, setParams] = useSearchParams();
  const aba = (["vendas", "fiado", "caixas"].includes(params.get("aba") ?? "") ? params.get("aba") : "vendas") as Aba;
  const abas: { id: Aba; rotulo: string }[] = [
    { id: "vendas", rotulo: "Vendas" },
    { id: "fiado", rotulo: "Fiado a receber" },
    { id: "caixas", rotulo: "Caixas" },
  ];
  return (
    <div>
      <Cabecalho titulo="Vendas e fiado" descricao="Consulte vendas, reimprima comprovantes, receba fiados e confira os caixas." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setParams({ aba: a.id }, { replace: true })}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${aba === a.id ? "bg-petroleo-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === "vendas" && <ListaVendas />}
      {aba === "fiado" && <ListaFiado />}
      {aba === "caixas" && <ListaCaixas />}
    </div>
  );
}

function inicioPeriodo(dias: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString();
}

/* ------------------------------ Vendas ------------------------------ */

function ListaVendas() {
  const { config, ehAdmin } = useAuth();
  const avisar = useToast();
  const [dias, setDias] = useState(1);
  const [status, setStatus] = useState<"" | "concluida" | "cancelada">("");
  const [busca, setBusca] = useState("");
  const [vendas, setVendas] = useState<VendaCompleta[] | null>(null);
  const [aberta, setAberta] = useState<VendaCompleta | null>(null);
  const [cancelando, setCancelando] = useState<VendaCompleta | null>(null);

  const carregar = useCallback(async () => {
    setVendas(null);
    let q = supabase.from("vendas").select("*, venda_itens(*), venda_pagamentos(*)").gte("criado_em", inicioPeriodo(dias)).order("criado_em", { ascending: false }).limit(1000);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) { avisar("erro", mensagemErro(error)); setVendas([]); return; }
    setVendas(data as VendaCompleta[]);
  }, [dias, status, avisar]);
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
      <div className="cartao mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="rotulo" htmlFor="per">Período</label>
          <select id="per" className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>Hoje</option><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
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
        <div className="flex items-end"><button className="btn-secundario w-full" disabled={!lista.length} onClick={exportar}>⤓ Exportar CSV</button></div>
      </div>

      {vendas && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="cartao p-4"><p className="text-xs uppercase text-slate-500">Vendas concluídas</p><p className="text-2xl font-bold">{concluidas.length}</p></div>
          <div className="cartao p-4"><p className="text-xs uppercase text-slate-500">Total vendido</p><p className="text-2xl font-bold">{fmtMoeda(totalVendido)}</p></div>
          <div className="cartao col-span-2 p-4 text-sm">
            <p className="mb-1 text-xs uppercase text-slate-500">Por forma de pagamento</p>
            {Object.keys(porForma).length === 0 ? <p className="text-slate-400">—</p> : (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(porForma).map(([f, v]) => <span key={f}>{NOME_FORMA[f as FormaPagamento]}: <strong>{fmtMoeda(v)}</strong></span>)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cartao overflow-hidden">
        {!vendas ? <Carregando /> : lista.length === 0 ? <Vazio titulo="Nenhuma venda neste período." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Data</th><th>Operador</th><th>Pagamento</th><th className="text-right">Total</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.id} className={v.status === "cancelada" ? "opacity-60" : ""}>
                    <td className="font-mono">{v.id}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(v.criado_em)}</td>
                    <td>{v.usuario_nome}</td>
                    <td className="text-xs">{v.venda_pagamentos.map((p) => NOME_FORMA[p.forma]).join(" + ")}{v.cliente_nome && <span className="block text-slate-400">{v.cliente_nome}</span>}</td>
                    <td className="whitespace-nowrap text-right font-semibold">{fmtMoeda(v.total)}{Number(v.desconto) > 0 && <span className="block text-xs font-normal text-acao-700">desc. {fmtMoeda(v.desconto)}</span>}</td>
                    <td>{v.status === "concluida" ? <Selo cor="ok">Concluída</Selo> : <Selo cor="critico">Cancelada</Selo>}</td>
                    <td className="text-right"><button className="btn-secundario btn-pequeno" onClick={() => setAberta(v)}>Ver / imprimir</button></td>
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

  return (
    <Modal aberto titulo={`Cancelar venda nº ${venda.id}?`} largura="sm" onFechar={onFechar}
      rodape={<><button className="btn-secundario" onClick={onFechar}>Voltar</button><button className="btn-perigo" onClick={cancelar} disabled={enviando}>{enviando ? "Cancelando…" : "Confirmar cancelamento"}</button></>}>
      <div className="space-y-3 text-sm">
        <p>Total de <strong>{fmtMoeda(venda.total)}</strong>. Os {venda.venda_itens.length} item(ns) voltarão ao estoque e a venda sai do total do caixa.</p>
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
  const avisar = useToast();
  const [mostrarRecebidos, setMostrarRecebidos] = useState(false);
  const [lista, setLista] = useState<FiadoLinha[] | null>(null);
  const [recebendo, setRecebendo] = useState<FiadoLinha | null>(null);

  const carregar = useCallback(async () => {
    setLista(null);
    let q = supabase.from("venda_pagamentos")
      .select("*, vendas!inner(id, cliente_nome, cliente_telefone, criado_em, status, usuario_nome)")
      .eq("forma", "fiado").eq("vendas.status", "concluida").order("id", { ascending: false }).limit(1000);
    q = mostrarRecebidos ? q.not("fiado_recebido_em", "is", null) : q.is("fiado_recebido_em", null);
    const { data, error } = await q;
    if (error) { avisar("erro", mensagemErro(error)); setLista([]); return; }
    setLista(data as unknown as FiadoLinha[]);
  }, [mostrarRecebidos, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Total por cliente
  const porCliente = (lista ?? []).reduce<Record<string, number>>((acc, f) => {
    const c = f.vendas.cliente_nome ?? "—";
    acc[c] = (acc[c] ?? 0) + Number(f.valor);
    return acc;
  }, {});
  const total = Object.values(porCliente).reduce((s, v) => s + v, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button className={`btn-pequeno btn ${!mostrarRecebidos ? "bg-petroleo-700 text-white" : "btn-secundario"}`} onClick={() => setMostrarRecebidos(false)}>A receber</button>
          <button className={`btn-pequeno btn ${mostrarRecebidos ? "bg-petroleo-700 text-white" : "btn-secundario"}`} onClick={() => setMostrarRecebidos(true)}>Já recebidos</button>
        </div>
        {lista && !mostrarRecebidos && <p className="text-sm">Total a receber: <strong className="text-lg">{fmtMoeda(total)}</strong></p>}
      </div>

      {!mostrarRecebidos && Object.keys(porCliente).length > 1 && (
        <div className="cartao mb-4 p-4 text-sm">
          <p className="mb-2 text-xs uppercase text-slate-500">Por cliente</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {Object.entries(porCliente).sort((a, b) => b[1] - a[1]).map(([c, v]) => <span key={c}>{c}: <strong>{fmtMoeda(v)}</strong></span>)}
          </div>
        </div>
      )}

      <div className="cartao overflow-hidden">
        {!lista ? <Carregando /> : lista.length === 0 ? <Vazio titulo={mostrarRecebidos ? "Nenhum fiado recebido ainda." : "Nenhum fiado pendente. 🎉"} /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Venda</th><th>Data</th><th className="text-right">Valor</th><th>{mostrarRecebidos ? "Recebido" : ""}</th></tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td><span className="font-medium">{f.vendas.cliente_nome}</span>{f.vendas.cliente_telefone && <span className="block text-xs text-slate-400">{f.vendas.cliente_telefone}</span>}</td>
                    <td className="font-mono">{f.venda_id}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(f.vendas.criado_em)}</td>
                    <td className="text-right font-semibold">{fmtMoeda(f.valor)}</td>
                    <td className="text-right">
                      {mostrarRecebidos
                        ? <span className="text-xs text-slate-500">{fmtDataHora(f.fiado_recebido_em)} · {f.fiado_recebido_forma && NOME_FORMA[f.fiado_recebido_forma]} · {f.fiado_recebido_por}</span>
                        : <button className="btn-acao btn-pequeno" onClick={() => setRecebendo(f)}>Receber</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recebendo && <JanelaReceber f={recebendo} onFechar={() => setRecebendo(null)} onRecebido={() => { setRecebendo(null); void carregar(); }} />}
    </>
  );
}

function JanelaReceber({ f, onFechar, onRecebido }: { f: FiadoLinha; onFechar: () => void; onRecebido: () => void }) {
  const avisar = useToast();
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function receber() {
    setEnviando(true);
    const { error } = await supabase.rpc("receber_fiado", { p_pagamento_id: f.id, p_forma: forma });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error));
    avisar("sucesso", `Fiado de ${f.vendas.cliente_nome} (${fmtMoeda(f.valor)}) recebido em ${NOME_FORMA[forma].toLowerCase()}.`);
    onRecebido();
  }

  return (
    <Modal aberto titulo="Receber fiado" largura="sm" onFechar={onFechar}
      rodape={<><button className="btn-secundario" onClick={onFechar}>Cancelar</button><button className="btn-acao" onClick={receber} disabled={enviando}>{enviando ? "Registrando…" : `Receber ${fmtMoeda(f.valor)}`}</button></>}>
      <div className="space-y-3 text-sm">
        <p><strong>{f.vendas.cliente_nome}</strong> · venda nº {f.venda_id} de {fmtDataHora(f.vendas.criado_em)}</p>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS.filter((x) => x !== "fiado").map((x) => (
            <button key={x} type="button" onClick={() => setForma(x)} className={`rounded-lg border-2 p-2 text-sm font-semibold ${forma === x ? "border-acao-500 bg-orange-50 text-acao-700" : "border-slate-200"}`}>{NOME_FORMA[x]}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">O valor entra no <strong>seu caixa aberto</strong> e aparece no fechamento.</p>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

/* ------------------------------ Caixas ------------------------------ */

function ListaCaixas() {
  const { config, ehAdmin } = useAuth();
  const avisar = useToast();
  const [caixas, setCaixas] = useState<Caixa[] | null>(null);
  const [resumo, setResumo] = useState<{ c: Caixa; r: ResumoCaixa } | null>(null);

  useEffect(() => {
    supabase.from("caixas").select("*").order("aberto_em", { ascending: false }).limit(200)
      .then(({ data, error }) => (error ? (avisar("erro", mensagemErro(error)), setCaixas([])) : setCaixas(data as Caixa[])));
  }, [avisar]);

  async function ver(c: Caixa) {
    if (c.status === "fechado" && c.resumo) return setResumo({ c, r: c.resumo });
    const { data, error } = await supabase.rpc("resumo_caixa", { p_caixa_id: c.id });
    if (error) return avisar("erro", mensagemErro(error));
    setResumo({ c, r: data as ResumoCaixa });
  }

  return (
    <>
      {!ehAdmin && <p className="mb-3 text-sm text-slate-500">Você vê apenas os seus caixas. O administrador vê todos.</p>}
      <div className="cartao overflow-hidden">
        {!caixas ? <Carregando /> : caixas.length === 0 ? <Vazio titulo="Nenhum caixa aberto ainda." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th><th></th></tr></thead>
              <tbody>
                {caixas.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono">{c.id}</td>
                    <td>{c.usuario_nome}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDataHora(c.aberto_em)}</td>
                    <td className="whitespace-nowrap text-xs">{c.status === "aberto" ? <Selo cor="ok">Aberto</Selo> : fmtDataHora(c.fechado_em)}</td>
                    <td className="text-right">{c.valor_esperado !== null ? fmtMoeda(c.valor_esperado) : "—"}</td>
                    <td className="text-right">{c.valor_contado !== null ? fmtMoeda(c.valor_contado) : "—"}</td>
                    <td className={`text-right font-semibold ${c.diferenca === null || Number(c.diferenca) === 0 ? "" : Number(c.diferenca) > 0 ? "text-petroleo-700" : "text-critico-600"}`}>
                      {c.diferenca === null ? "—" : Number(c.diferenca) === 0 ? "OK" : fmtMoeda(c.diferenca)}
                    </td>
                    <td className="text-right"><button className="btn-secundario btn-pequeno" onClick={() => ver(c)}>Ver / imprimir</button></td>
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
