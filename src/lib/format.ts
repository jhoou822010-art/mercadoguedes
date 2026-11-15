import type { FormaPagamento, SituacaoValidade, TipoMov, Unidade } from "./types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const fmtMoeda = (v: number | string | null | undefined) => moeda.format(Number(v ?? 0));

/** Quantidade: até 3 casas para KG/LT, inteiro para os demais quando possível. */
export function fmtQtd(v: number | string | null | undefined, unidade?: Unidade | string) {
  const n = Number(v ?? 0);
  const casas = unidade === "KG" || unidade === "LT" || !Number.isInteger(n) ? 3 : 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

/** "2026-11-14" → "14/11/2026" (sem passar por fuso horário). */
export function fmtData(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Aceita "12,50" ou "12.50" ou "1.234,56". Retorna NaN se inválido. */
export function lerNumero(texto: string): number {
  const t = texto.trim();
  if (t === "") return NaN;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^-?\d*\.?\d+$/.test(normal) ? Number(normal) : NaN;
}

/** Número → texto para campos de formulário ("12,5"). */
export const numParaCampo = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(v).replace(".", ",");

export const NOME_TIPO: Record<TipoMov, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
};

export const NOME_VALIDADE: Record<SituacaoValidade, string> = {
  sem_validade: "Sem validade",
  vencido: "Vencido",
  critico: "Vence em até 7 dias",
  proximo: "Próximo do vencimento",
  ok: "Dentro da validade",
};

export function textoDias(dias: number | null) {
  if (dias === null) return "—";
  if (dias < 0) return `vencido há ${-dias} dia${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "vence hoje";
  return `vence em ${dias} dia${dias === 1 ? "" : "s"}`;
}

export const NOME_FORMA: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  vale_alimentacao: "Vale-alimentação",
  vale_refeicao: "Vale-refeição",
  fiado: "Fiado",
  crediario: "Crediário",
  outro: "Outro",
};

/** Arredonda para centavos evitando erros de ponto flutuante. */
export const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Formata CNPJ enquanto digita: 00.000.000/0000-00 */
export function mascaraCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Confere os dígitos verificadores do CNPJ. */
export function cnpjValido(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Confere os dígitos verificadores do CPF (só números). */
export function cpfValido(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/**
 * CPF ou CNPJ no mesmo campo: até 11 números vira CPF (000.000.000-00),
 * de 12 a 14 vira CNPJ (00.000.000/0000-00).
 */
export function mascaraDocumento(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return mascaraCnpj(d);
}

/** "CPF", "CNPJ" ou "" (incompleto ou com número errado). */
export function tipoDocumento(v: string): "CPF" | "CNPJ" | "" {
  const d = v.replace(/\D/g, "");
  if (d.length === 11 && cpfValido(d)) return "CPF";
  if (d.length === 14 && cnpjValido(d)) return "CNPJ";
  return "";
}

/** Data de hoje (fuso do navegador) no formato AAAA-MM-DD. */
export function hojeISO(somarDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + somarDias);
  return d.toLocaleDateString("sv-SE");
}

/** Divide um valor em parcelas iguais; a última fica com os centavos (igual ao banco). */
export function dividirParcelas(total: number, n: number): number[] {
  const base = Math.floor((total * 100) / n) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? centavos(total - base * (n - 1)) : base));
}

/** Soma meses a uma data AAAA-MM-DD (mesmo comportamento do banco: 31/01 + 1 mês = 28/02). */
export function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return alvo.toLocaleDateString("sv-SE");
}

/** Dias entre hoje e a data (negativo = atrasado). */
export function diasAte(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d).getTime();
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((alvo - h.getTime()) / 86400000);
}
