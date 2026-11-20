import { useEffect, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { produtoLocal, produtosLocais } from "../lib/local/consultas";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fmtMoeda } from "../lib/format";
import type { ProdutoView } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { ProdutoBusca } from "../components/ProdutoBusca";
import { CodigoBarras } from "../components/CodigoBarras";
import { Aviso, Cabecalho, Vazio } from "../components/Ui";
import { imprimir } from "../lib/imprimir";

type Tamanho = "pequena" | "media" | "grande";
const TAMANHOS: Record<Tamanho, { rotulo: string; largura: string; altura: string; preco: string; nome: string }> = {
  pequena: { rotulo: "Pequena (50 × 30 mm)", largura: "50mm", altura: "30mm", preco: "text-[20px]", nome: "text-[9px]" },
  media: { rotulo: "Média (70 × 40 mm)", largura: "70mm", altura: "40mm", preco: "text-[28px]", nome: "text-[11px]" },
  grande: { rotulo: "Grande (100 × 50 mm)", largura: "100mm", altura: "50mm", preco: "text-[38px]", nome: "text-[13px]" },
};

interface Item { p: ProdutoView; copias: number }

export default function Etiquetas() {
  const { config } = useAuth();
  const avisar = useToast();
  const [params] = useSearchParams();
  const [itens, setItens] = useState<Item[]>([]);
  const [tamanho, setTamanho] = useState<Tamanho>("media");
  const [mostrarBarras, setMostrarBarras] = useState(true);

  useEffect(() => {
    const id = params.get("produto");
    if (!id) return;
    void doServidorOuLocal<ProdutoView | null>(
      () => supabase.from("vw_produtos").select("*").eq("id", id).maybeSingle(),
      () => produtoLocal(Number(id)),
    ).then(({ data }) => {
      if (data) setItens([{ p: data as ProdutoView, copias: 1 }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function adicionar(p: ProdutoView) {
    setItens((lista) => {
      const existe = lista.find((i) => i.p.id === p.id);
      if (existe) return lista.map((i) => (i.p.id === p.id ? { ...i, copias: i.copias + 1 } : i));
      return [...lista, { p, copias: 1 }];
    });
    avisar("info", `“${p.nome}” adicionado às etiquetas.`);
  }

  async function adicionarTodos() {
    const { data } = await doServidorOuLocal<ProdutoView[]>(
      () => supabase.from("vw_produtos").select("*").eq("ativo", true).order("nome").limit(500),
      async () => (await produtosLocais()).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 500),
    );
    const lista = (data ?? []) as ProdutoView[];
    setItens(lista.map((p) => ({ p, copias: 1 })));
    avisar("info", `${lista.length} produto(s) ativos adicionados.`);
  }

  const totalEtiquetas = itens.reduce((s, i) => s + i.copias, 0);
  const t = TAMANHOS[tamanho];
  const etiquetas = itens.flatMap((i) => Array.from({ length: i.copias }, (_, n) => ({ ...i, chave: `${i.p.id}-${n}` })));

  return (
    <div>
      <div className="nao-imprimir">
        <Cabecalho
          titulo="Etiquetas de gôndola"
          descricao="Escolha os produtos, confira a prévia e imprima pela janela de impressão do navegador."
          acoes={
            <button className="btn-acao" disabled={totalEtiquetas === 0} onClick={() => void imprimir("folha", "etiquetas")}>
              🖨 Imprimir {totalEtiquetas > 0 && `(${totalEtiquetas})`}
            </button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="cartao space-y-4 p-5">
            <div>
              <span className="rotulo">Adicionar produto</span>
              <ProdutoBusca onSelecionar={adicionar} />
              <button className="mt-2 text-xs font-semibold text-petroleo-700 hover:underline" onClick={adicionarTodos}>
                Adicionar todos os produtos ativos
              </button>
            </div>
            <div>
              <label className="rotulo" htmlFor="tam">Tamanho</label>
              <select id="tam" className="campo" value={tamanho} onChange={(e) => setTamanho(e.target.value as Tamanho)}>
                {(Object.keys(TAMANHOS) as Tamanho[]).map((k) => <option key={k} value={k}>{TAMANHOS[k].rotulo}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-petroleo-700" checked={mostrarBarras} onChange={(e) => setMostrarBarras(e.target.checked)} />
              Mostrar código de barras (quando houver)
            </label>
            <Aviso cor="petroleo">
              Na janela de impressão, escolha a impressora, ajuste a <strong>margem</strong> se precisar e deixe a escala em <strong>100%</strong>.
              Para impressora de etiquetas, selecione o tamanho do papel dela.
            </Aviso>
          </div>

          <div className="cartao lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold">Selecionados</h2>
              {itens.length > 0 && <button className="text-xs font-semibold text-critico-600 hover:underline" onClick={() => setItens([])}>Limpar lista</button>}
            </div>
            {itens.length === 0 ? <Vazio titulo="Nenhum produto selecionado.">Use a busca ao lado ou o leitor de código de barras.</Vazio> : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {itens.map((i) => (
                  <li key={i.p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.p.nome}</span>
                      <span className="text-xs text-slate-400">{fmtMoeda(i.p.preco)} / {i.p.unidade}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <label className="sr-only" htmlFor={`c-${i.p.id}`}>Cópias</label>
                      <input
                        id={`c-${i.p.id}`}
                        type="number"
                        min={1}
                        max={100}
                        className="campo w-20 py-1"
                        value={i.copias}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                          setItens((l) => l.map((x) => (x.p.id === i.p.id ? { ...x, copias: n } : x)));
                        }}
                      />
                      <button className="rounded p-1 text-slate-400 hover:bg-critico-50 hover:text-critico-600" onClick={() => setItens((l) => l.filter((x) => x.p.id !== i.p.id))} aria-label={`Remover ${i.p.nome}`}>✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {etiquetas.length > 0 && <h2 className="mb-3 mt-8 font-semibold">Prévia da impressão</h2>}
      </div>

      {/* Área impressa */}
      <div className="area-impressao flex flex-wrap gap-[3mm]">
        {etiquetas.map(({ p, chave }) => (
          <div
            key={chave}
            className="etiqueta flex flex-col overflow-hidden rounded-[2mm] border border-slate-400 bg-white text-black"
            style={{ width: t.largura, height: t.altura }}
          >
            <div className="flex items-center justify-between bg-petroleo-700 px-[2mm] py-[0.6mm] text-[7px] font-semibold uppercase tracking-wide text-white" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
              <span className="truncate">{config?.nome_loja ?? "Gerenciador de Mercado"}</span>
            </div>
            <div className="flex flex-1 flex-col justify-between px-[2mm] py-[1mm]">
              <p className={`${t.nome} line-clamp-2 font-semibold uppercase leading-tight`}>{p.nome}{p.modelo ? ` ${p.modelo}` : ""}</p>
              <div className="flex items-end justify-between gap-1">
                <p className={`${t.preco} font-extrabold leading-none`}>
                  {fmtMoeda(p.preco)}
                  <span className="ml-0.5 text-[9px] font-semibold">/{p.unidade}</span>
                </p>
                <p className="text-[7px] text-slate-600">Cód. {p.codigo}</p>
              </div>
              {mostrarBarras && p.barras && (
                <div className="mt-[0.5mm] h-[9mm]">
                  <CodigoBarras valor={p.barras} altura={28} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
