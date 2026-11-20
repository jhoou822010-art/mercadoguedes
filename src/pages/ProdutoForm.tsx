import { useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { lerNumero, numParaCampo } from "../lib/format";
import { UNIDADES, type Produto, type Unidade } from "../lib/types";
import { Modal } from "../components/Modal";
import { Aviso } from "../components/Ui";
import { useToast } from "../components/Toast";

interface Props {
  produto: Produto | null; // null = novo
  categorias: string[];
  fornecedores: string[];
  onFechar: () => void;
  onSalvo: () => void;
}

type Campos = {
  codigo: string; barras: string; nome: string; categoria: string; unidade: Unidade;
  modelo: string; fornecedor: string; custo: string; preco: string; estoque: string;
  estoque_minimo: string; validade: string; ativo: boolean;
};

export function ProdutoForm({ produto, categorias, fornecedores, onFechar, onSalvo }: Props) {
  const avisar = useToast();
  const novo = !produto;
  const [c, setC] = useState<Campos>({
    codigo: produto?.codigo ?? "",
    barras: produto?.barras ?? "",
    nome: produto?.nome ?? "",
    categoria: produto?.categoria ?? "",
    unidade: produto?.unidade ?? "UN",
    modelo: produto?.modelo ?? "",
    fornecedor: produto?.fornecedor ?? "",
    custo: numParaCampo(produto?.custo ?? null),
    preco: numParaCampo(produto?.preco ?? null),
    estoque: numParaCampo(produto?.estoque ?? null),
    estoque_minimo: numParaCampo(produto?.estoque_minimo ?? null),
    validade: produto?.validade ?? "",
    ativo: produto?.ativo ?? true,
  });
  const [erros, setErros] = useState<Partial<Record<keyof Campos, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  // Avisos (não impedem salvar): código com letras/símbolos, código de barras fora do padrão.
  const [confirmouAviso, setConfirmouAviso] = useState(false);
  const avisos = avisosDosCodigos(c.codigo, c.barras);

  const muda = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setC((x) => ({ ...x, [k]: v }));
    setErros((e) => ({ ...e, [k]: undefined }));
    if (k === "codigo" || k === "barras") setConfirmouAviso(false);
  };

  function validar() {
    const e: typeof erros = {};
    if (!c.codigo.trim()) e.codigo = "Informe o código interno.";
    if (!c.nome.trim()) e.nome = "Informe a descrição do produto.";
    const num = (k: "custo" | "preco" | "estoque" | "estoque_minimo", obrigatorio: boolean, rotulo: string) => {
      if (!c[k].trim()) {
        if (obrigatorio) e[k] = `Informe ${rotulo}.`;
        return;
      }
      const n = lerNumero(c[k]);
      if (Number.isNaN(n)) e[k] = "Digite apenas números (ex.: 12,50).";
      else if (n < 0) e[k] = "O valor não pode ser negativo.";
    };
    num("custo", false, "o custo");
    num("preco", true, "o preço de venda");
    if (novo) num("estoque", false, "o estoque");
    num("estoque_minimo", false, "o estoque mínimo");
    if (c.barras.trim() && !/^[\x20-\x7e]+$/.test(c.barras.trim())) e.barras = "Use apenas letras e números.";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErroGeral("");
    if (!validar()) return;
    // Primeiro clique com aviso: mostra e pede confirmação. Segundo clique: salva assim mesmo.
    if ((avisos.codigo || avisos.barras) && !confirmouAviso) {
      setConfirmouAviso(true);
      setErroGeral("");
      document.getElementById("aviso-codigos")?.scrollIntoView({ block: "nearest" });
      return;
    }
    setSalvando(true);
    const n = (v: string) => (v.trim() ? lerNumero(v) : 0);
    const texto = (v: string) => v.trim() || null;
    const dados = {
      codigo: c.codigo.trim(),
      barras: texto(c.barras),
      nome: c.nome.trim(),
      categoria: texto(c.categoria),
      unidade: c.unidade,
      modelo: texto(c.modelo),
      fornecedor: texto(c.fornecedor),
      custo: n(c.custo),
      preco: n(c.preco),
      estoque_minimo: n(c.estoque_minimo),
      validade: c.validade || null,
      ativo: c.ativo,
    };
    const { error } = novo
      ? await supabase.from("produtos").insert({ ...dados, estoque: n(c.estoque) })
      : await supabase.from("produtos").update(dados).eq("id", produto!.id);
    setSalvando(false);
    if (error) {
      const msg = mensagemErro(error);
      if (msg.includes("código interno")) setErros((e) => ({ ...e, codigo: msg }));
      else if (msg.includes("código de barras")) setErros((e) => ({ ...e, barras: msg }));
      setErroGeral(msg);
      return;
    }
    avisar("sucesso", novo ? `Produto “${dados.nome}” cadastrado.` : `Produto “${dados.nome}” atualizado.`);
    onSalvo();
  }

  const Campo = ({ k, rotulo, obrig, tipo = "text", modo, lista, dica }: { k: keyof Campos; rotulo: string; obrig?: boolean; tipo?: string; modo?: "decimal" | "numeric"; lista?: string; dica?: string }) => (
    <div>
      <label className="rotulo" htmlFor={`f-${k}`}>
        {rotulo} {obrig && <span className="text-critico-600" title="Obrigatório">*</span>}
      </label>
      <input
        id={`f-${k}`}
        type={tipo}
        inputMode={modo}
        list={lista}
        className={`campo ${erros[k] ? "campo-erro" : ""}`}
        value={c[k] as string}
        onChange={(e) => muda(k, e.target.value as never)}
        aria-invalid={Boolean(erros[k])}
      />
      {erros[k] ? <p className="mt-1 text-xs text-critico-600">{erros[k]}</p>
        : (k === "codigo" || k === "barras") && avisos[k] ? <p className="mt-1 text-xs font-semibold text-atencao-700">⚠ {avisos[k]}</p>
        : dica && <p className="mt-1 text-xs text-slate-400">{dica}</p>}
    </div>
  );

  return (
    <Modal
      aberto
      largura="lg"
      titulo={novo ? "Cadastrar produto" : `Editar produto`}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn-secundario" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn-acao" form="form-produto" disabled={salvando}>
            {salvando ? "Salvando…" : confirmouAviso ? "Salvar assim mesmo" : novo ? "Cadastrar" : "Salvar alterações"}
          </button>
        </>
      }
    >
      <form id="form-produto" onSubmit={salvar} className="space-y-5" noValidate>
        {erroGeral && <Aviso cor="critico">{erroGeral}</Aviso>}
        {confirmouAviso && (avisos.codigo || avisos.barras) && (
          <div id="aviso-codigos">
            <Aviso cor="atencao">
              <strong>Confira o código antes de salvar.</strong>
              {avisos.codigo && <span className="block">Código interno: {avisos.codigo}</span>}
              {avisos.barras && <span className="block">Código de barras: {avisos.barras}</span>}
              <span className="block">Se estiver errado, corrija o campo. Se estiver certo, clique em <strong>Salvar assim mesmo</strong>.</span>
            </Aviso>
          </div>
        )}
        <p className="text-xs text-slate-500">Campos com <span className="text-critico-600">*</span> são obrigatórios.</p>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-petroleo-700">Identificação</legend>
          {Campo({ k: "codigo", rotulo: "Código interno", obrig: true })}
          {Campo({ k: "barras", rotulo: "Código de barras", modo: "numeric", dica: "Pode usar o leitor: clique aqui e passe o produto." })}
          <div className="sm:col-span-2">{Campo({ k: "nome", rotulo: "Descrição / nome", obrig: true })}</div>
          {Campo({ k: "categoria", rotulo: "Categoria", lista: "lista-categorias" })}
          {Campo({ k: "fornecedor", rotulo: "Fornecedor", lista: "lista-fornecedores" })}
          <div>
            <label className="rotulo" htmlFor="f-unidade">Unidade de venda <span className="text-critico-600">*</span></label>
            <select id="f-unidade" className="campo" value={c.unidade} onChange={(e) => muda("unidade", e.target.value as Unidade)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {Campo({ k: "modelo", rotulo: "Modelo / apresentação", dica: "Ex.: 500 g, pacote com 6, garrafa 2 L" })}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-petroleo-700">Preços</legend>
          {Campo({ k: "custo", rotulo: "Custo (R$)", modo: "decimal" })}
          {Campo({ k: "preco", rotulo: "Preço de venda (R$)", obrig: true, modo: "decimal" })}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold text-petroleo-700">Estoque e validade</legend>
          {novo
            ? Campo({ k: "estoque", rotulo: "Estoque inicial", modo: "decimal", dica: "Gera uma entrada no histórico." })
            : (
              <div>
                <span className="rotulo">Estoque atual</span>
                <p className="campo bg-slate-100 text-slate-500">{c.estoque || "0"} {c.unidade}</p>
                <p className="mt-1 text-xs text-slate-400">Altere pela tela Estoque.</p>
              </div>
            )}
          {Campo({ k: "estoque_minimo", rotulo: "Estoque mínimo", modo: "decimal" })}
          {Campo({ k: "validade", rotulo: "Validade", tipo: "date" })}
        </fieldset>

        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-petroleo-700" checked={c.ativo} onChange={(e) => muda("ativo", e.target.checked)} />
          Produto ativo (desmarque para esconder sem apagar)
        </label>

        <datalist id="lista-categorias">{categorias.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="lista-fornecedores">{fornecedores.map((x) => <option key={x} value={x} />)}</datalist>
      </form>
    </Modal>
  );
}

/** Confere os códigos e devolve avisos em português (vazio = tudo certo). */
export function avisosDosCodigos(codigo: string, barras: string): { codigo?: string; barras?: string } {
  const r: { codigo?: string; barras?: string } = {};
  const cod = codigo.trim();
  if (cod && !/^\d+$/.test(cod)) {
    const estranhos = [...new Set(cod.replace(/\d/g, "").split(""))].map((x) => (x === " " ? "espaço" : `“${x}”`)).join(", ");
    r.codigo = `Costuma ter só números, mas este tem ${estranhos}.`;
  }
  const bar = barras.trim();
  if (bar) {
    if (!/^\d+$/.test(bar)) {
      const estranhos = [...new Set(bar.replace(/\d/g, "").split(""))].map((x) => (x === " " ? "espaço" : `“${x}”`)).join(", ");
      r.barras = `Deveria ter só números, mas este tem ${estranhos}.`;
    } else if (![8, 12, 13, 14].includes(bar.length)) {
      r.barras = `Costuma ter 8 ou 13 números, mas este tem ${bar.length}.`;
    } else if (!digitoVerificadorOk(bar)) {
      r.barras = "O último número não confere com os outros. Pode ter sido digitado errado; o melhor é passar o leitor.";
    }
  }
  return r;
}

/** Dígito verificador dos códigos EAN-8, UPC-A (12), EAN-13 e GTIN-14. */
function digitoVerificadorOk(n: string) {
  const d = n.split("").map(Number);
  const dv = d.pop()!;
  let soma = 0;
  d.reverse().forEach((x, i) => { soma += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (soma % 10)) % 10 === dv;
}
