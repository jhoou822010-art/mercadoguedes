import type { ReactNode } from "react";
import type { ProdutoView, TipoMov } from "../lib/types";
import { NOME_TIPO, textoDias } from "../lib/format";

type Cor = "ok" | "atencao" | "critico" | "neutro" | "petroleo" | "acao";
const COR: Record<Cor, string> = {
  ok: "bg-ok-100 text-ok-700",
  atencao: "bg-atencao-100 text-atencao-700",
  critico: "bg-critico-100 text-critico-700",
  neutro: "bg-slate-100 text-slate-600",
  petroleo: "bg-petroleo-100 text-petroleo-700",
  acao: "bg-orange-100 text-acao-700",
};

export function Selo({ cor = "neutro", children }: { cor?: Cor; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR[cor]}`}>{children}</span>;
}

export function SeloTipo({ tipo }: { tipo: TipoMov }) {
  const cor: Cor = tipo === "entrada" ? "ok" : tipo === "saida" ? "acao" : "petroleo";
  const sinal = tipo === "entrada" ? "↑ " : tipo === "saida" ? "↓ " : "⇄ ";
  return <Selo cor={cor}>{sinal}{NOME_TIPO[tipo]}</Selo>;
}

export function SeloValidade({ p }: { p: Pick<ProdutoView, "situacao_validade" | "dias_para_vencer"> }) {
  switch (p.situacao_validade) {
    case "vencido": return <Selo cor="critico">Vencido</Selo>;
    case "critico": return <Selo cor="critico">{textoDias(p.dias_para_vencer)}</Selo>;
    case "proximo": return <Selo cor="atencao">{textoDias(p.dias_para_vencer)}</Selo>;
    case "ok": return <Selo cor="ok">Dentro da validade</Selo>;
    default: return <Selo>Sem validade</Selo>;
  }
}

export function SeloEstoque({ p }: { p: Pick<ProdutoView, "abaixo_minimo" | "estoque"> }) {
  if (Number(p.estoque) === 0) return <Selo cor="critico">Sem estoque</Selo>;
  if (p.abaixo_minimo) return <Selo cor="atencao">Abaixo do mínimo</Selo>;
  return <Selo cor="ok">Normal</Selo>;
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-petroleo-200 border-t-petroleo-700" />
      {texto}
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      <p className="font-medium text-slate-600">{titulo}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="nao-imprimir flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Aviso({ cor = "atencao", children }: { cor?: "atencao" | "critico" | "petroleo" | "ok"; children: ReactNode }) {
  const estilo = {
    atencao: "border-atencao-500 bg-atencao-50 text-atencao-700",
    critico: "border-critico-600 bg-critico-50 text-critico-700",
    petroleo: "border-petroleo-500 bg-petroleo-50 text-petroleo-800",
    ok: "border-ok-600 bg-ok-50 text-ok-700",
  }[cor];
  return <div className={`rounded-lg border-l-4 px-4 py-3 text-sm ${estilo}`}>{children}</div>;
}
