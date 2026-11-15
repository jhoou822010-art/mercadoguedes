import { useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { fmtMoeda } from "../lib/format";
import { baixarModeloPlanilha, lerArquivoTexto, lerCsv, validarLinhas, type LinhaImportacao } from "../lib/planilha";
import type { Produto } from "../lib/types";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { Aviso } from "../components/Ui";

type Acao = "criar" | "atualizar" | "erro";
interface Previa extends LinhaImportacao { acao: Acao; id?: number }

/**
 * Importar planilha (CSV do Excel): cria produtos com código novo e atualiza
 * os que já existem (só as colunas presentes na planilha). O estoque de
 * produto existente não muda por aqui — só pela tela Estoque.
 */
export function ImportarPlanilha({ onFechar, onConcluido }: { onFechar: () => void; onConcluido: () => void }) {
  const avisar = useToast();
  const [arquivo, setArquivo] = useState("");
  const [previa, setPrevia] = useState<Previa[] | null>(null);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState<{ feito: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ criados: number; atualizados: number; falhas: { linha: number; codigo: string; motivo: string }[] } | null>(null);

  async function escolher(f: File | undefined) {
    if (!f) return;
    setErro(""); setPrevia(null); setResultado(null); setLendo(true); setArquivo(f.name);
    try {
      const texto = await lerArquivoTexto(f);
      const { linhas, ignoradas, erroGeral } = validarLinhas(lerCsv(texto));
      if (erroGeral) { setErro(erroGeral); return; }
      if (linhas.length > 5000) { setErro("A planilha tem mais de 5.000 linhas. Divida em arquivos menores."); return; }
      const existentes = await buscarTodos<Produto>("produtos");
      const porCodigo = new Map(existentes.map((p) => [p.codigo, p]));
      const barrasDeOutro = new Map(existentes.filter((p) => p.barras).map((p) => [p.barras as string, p.codigo]));
      setIgnoradas(ignoradas);
      setPrevia(linhas.map((l) => {
        const atual = porCodigo.get(l.codigo);
        const erros = [...l.erros];
        const barras = String(l.dados.barras ?? "");
        if (barras && barrasDeOutro.has(barras) && barrasDeOutro.get(barras) !== l.codigo) erros.push(`código de barras já usado no produto ${barrasDeOutro.get(barras)}`);
        if (!atual) {
          if (!l.dados.nome) erros.push("produto novo precisa de “Descrição”");
          if (l.dados.preco === undefined || l.dados.preco === null) erros.push("produto novo precisa de “Preço de venda”");
        } else if ("nome" in l.dados && !l.dados.nome) erros.push("“Descrição” vazia");
        return { ...l, erros, acao: erros.length ? "erro" : atual ? "atualizar" : "criar", id: atual?.id };
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }

  async function importar() {
    if (!previa) return;
    const criar = previa.filter((p) => p.acao === "criar");
    const atualizar = previa.filter((p) => p.acao === "atualizar");
    const total = criar.length + atualizar.length;
    const falhas: { linha: number; codigo: string; motivo: string }[] = [];
    let criados = 0, atualizados = 0, feito = 0;
    setGravando({ feito: 0, total });

    // Novos: em blocos (com estoque inicial, que gera a entrada no histórico).
    for (let i = 0; i < criar.length; i += 200) {
      const bloco = criar.slice(i, i + 200);
      const linhas = bloco.map((p) => ({
        codigo: p.codigo, barras: p.dados.barras ?? null, nome: p.dados.nome, categoria: p.dados.categoria ?? null,
        unidade: p.dados.unidade ?? "UN", modelo: p.dados.modelo ?? null, fornecedor: p.dados.fornecedor ?? null,
        custo: p.dados.custo ?? 0, preco: p.dados.preco ?? 0, estoque: p.dados.estoque ?? 0,
        estoque_minimo: p.dados.estoque_minimo ?? 0, validade: p.dados.validade ?? null, ativo: p.dados.ativo ?? true,
      }));
      const { error } = await supabase.from("produtos").insert(linhas);
      if (!error) criados += bloco.length;
      else {
        // Bloco falhou: tenta um a um para dizer exatamente qual linha tem problema.
        for (let k = 0; k < bloco.length; k++) {
          const r = await supabase.from("produtos").insert(linhas[k]);
          if (r.error) falhas.push({ linha: bloco[k].linha, codigo: bloco[k].codigo, motivo: mensagemErro(r.error) });
          else criados++;
        }
      }
      feito += bloco.length;
      setGravando({ feito, total });
    }

    // Existentes: só as colunas presentes na planilha (estoque nunca).
    const fila = [...atualizar];
    async function trabalhador() {
      for (let p = fila.shift(); p; p = fila.shift()) {
        const campos: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p.dados)) {
          if (k === "codigo" || k === "estoque") continue;
          if (v === null || v === "") continue; // célula vazia: mantém o que já está cadastrado
          campos[k] = v;
        }
        if (Object.keys(campos).length) {
          const { error } = await supabase.from("produtos").update(campos).eq("id", p.id!);
          if (error) falhas.push({ linha: p.linha, codigo: p.codigo, motivo: mensagemErro(error) });
          else atualizados++;
        } else atualizados++;
        feito++;
        setGravando({ feito, total });
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);

    setGravando(null);
    setResultado({ criados, atualizados, falhas: falhas.sort((a, b) => a.linha - b.linha) });
    avisar(falhas.length ? "info" : "sucesso", `Importação concluída: ${criados} criado(s), ${atualizados} atualizado(s)${falhas.length ? `, ${falhas.length} com erro` : ""}.`);
    onConcluido();
  }

  const nCriar = previa?.filter((p) => p.acao === "criar").length ?? 0;
  const nAtualizar = previa?.filter((p) => p.acao === "atualizar").length ?? 0;
  const nErro = previa?.filter((p) => p.acao === "erro").length ?? 0;

  return (
    <Modal aberto titulo="Importar planilha de produtos" largura="xl" onFechar={gravando ? () => {} : onFechar}
      rodape={resultado ? <button className="btn-primario" onClick={onFechar}>Fechar</button> : (
        <>
          <button className="btn-secundario mr-auto" onClick={baixarModeloPlanilha}>⤓ Baixar modelo de planilha</button>
          <button className="btn-secundario" onClick={onFechar} disabled={Boolean(gravando)}>Cancelar</button>
          <button className="btn-acao" disabled={!previa || nCriar + nAtualizar === 0 || Boolean(gravando)} onClick={importar}>
            {gravando ? `Gravando ${gravando.feito}/${gravando.total}…` : `Importar ${nCriar + nAtualizar} produto(s)`}
          </button>
        </>
      )}>
      <div className="space-y-4 text-sm">
        {!resultado && (
          <>
            <Aviso cor="petroleo">
              Use um arquivo <strong>CSV</strong> (no Excel: Arquivo → Salvar como → “CSV (separado por vírgulas)”). A primeira linha deve ter os nomes das colunas,
              como no modelo. <strong>Código</strong> é obrigatório. Produto com código novo é <strong>criado</strong>; código que já existe é <strong>atualizado</strong>
              (só as colunas que estiverem na planilha — dá para atualizar só os preços). <strong>Célula vazia não apaga nada</strong> e o estoque de produto existente <strong>não muda</strong> por aqui.
            </Aviso>
            <label className="btn-secundario cursor-pointer">
              {lendo ? "Lendo…" : arquivo ? `Trocar arquivo (${arquivo})` : "Escolher planilha (.csv)"}
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </>
        )}
        {erro && <Aviso cor="critico">{erro}</Aviso>}
        {ignoradas.length > 0 && !resultado && <p className="text-xs text-slate-500">Colunas ignoradas: {ignoradas.join(", ")}.</p>}

        {previa && !resultado && (
          <>
            <div className="flex flex-wrap gap-3">
              <span className="rounded-full bg-ok-100 px-3 py-1 font-semibold text-ok-700">{nCriar} para criar</span>
              <span className="rounded-full bg-petroleo-100 px-3 py-1 font-semibold text-petroleo-700">{nAtualizar} para atualizar</span>
              <span className={`rounded-full px-3 py-1 font-semibold ${nErro ? "bg-critico-100 text-critico-700" : "bg-slate-100 text-slate-500"}`}>{nErro} com erro (não serão importados)</span>
            </div>
            <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200">
              <table className="tabela">
                <thead><tr><th>Linha</th><th>Código</th><th>Descrição</th><th className="text-right">Preço</th><th>Ação</th><th>Observação</th></tr></thead>
                <tbody>
                  {previa.map((p) => (
                    <tr key={p.linha} className={p.acao === "erro" ? "bg-critico-50" : ""}>
                      <td className="text-xs text-slate-400">{p.linha}</td>
                      <td className="font-mono text-xs">{p.codigo || "—"}</td>
                      <td>{String(p.dados.nome ?? "") || <span className="text-slate-400">(sem alteração)</span>}</td>
                      <td className="whitespace-nowrap text-right">{typeof p.dados.preco === "number" ? fmtMoeda(p.dados.preco) : "—"}</td>
                      <td>{p.acao === "criar" ? <span className="font-semibold text-ok-700">Criar</span> : p.acao === "atualizar" ? <span className="font-semibold text-petroleo-700">Atualizar</span> : <span className="font-semibold text-critico-600">Erro</span>}</td>
                      <td className="text-xs text-critico-700">{p.erros.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {resultado && (
          <div className="space-y-3">
            <Aviso cor={resultado.falhas.length ? "atencao" : "ok"}>
              <strong>{resultado.criados}</strong> produto(s) criado(s) e <strong>{resultado.atualizados}</strong> atualizado(s).
              {resultado.falhas.length > 0 && <> <strong>{resultado.falhas.length}</strong> não foram gravados (veja abaixo).</>}
            </Aviso>
            {resultado.falhas.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
                {resultado.falhas.map((f) => <li key={f.linha}>Linha {f.linha} (código {f.codigo}): {f.motivo}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
