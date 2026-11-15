import { useEffect, useRef } from "react";

/* =====================================================================
   Atalhos de teclado do caixa (configuráveis pelo administrador).
   Uma tecla é guardada como texto, ex.: "F2", "Ctrl+K", "NumpadAdd".
   ===================================================================== */

export type Contexto = "caixa" | "pagamento";

export interface AcaoTeclado {
  id: string;
  contexto: Contexto;
  nome: string;
  descricao: string;
  padrao: string;
}

export const ACOES: AcaoTeclado[] = [
  // Tela do caixa
  { id: "pagamento", contexto: "caixa", nome: "Pagamento", descricao: "Abre a janela de pagamento da compra.", padrao: "F2" },
  { id: "buscar_produto", contexto: "caixa", nome: "Voltar para a busca", descricao: "Coloca o cursor no campo do leitor / busca de produto.", padrao: "F3" },
  { id: "desconto", contexto: "caixa", nome: "Desconto", descricao: "Abre a janela de desconto.", padrao: "F4" },
  { id: "calculadora", contexto: "caixa", nome: "Calculadora", descricao: "Abre a calculadora.", padrao: "F7" },
  { id: "item_avulso", contexto: "caixa", nome: "Item avulso (sem cadastro)", descricao: "Lança um produto que não está cadastrado: descrição, preço e quantidade.", padrao: "Insert" },
  { id: "cancelar_compra", contexto: "caixa", nome: "Cancelar compra", descricao: "Limpa todos os itens da compra atual (pede confirmação).", padrao: "F8" },
  { id: "quantidade_ultimo", contexto: "caixa", nome: "Alterar quantidade", descricao: "Vai para a quantidade do último produto passado.", padrao: "F9" },
  { id: "mais_um", contexto: "caixa", nome: "Mais 1 do último item", descricao: "Soma 1 unidade ao último produto passado.", padrao: "NumpadAdd" },
  { id: "menos_um", contexto: "caixa", nome: "Menos 1 do último item", descricao: "Tira 1 unidade do último produto passado.", padrao: "NumpadSubtract" },
  { id: "remover_ultimo", contexto: "caixa", nome: "Remover último item", descricao: "Tira da compra o último produto passado.", padrao: "Ctrl+Delete" },
  { id: "suprimento", contexto: "caixa", nome: "Suprimento", descricao: "Colocar dinheiro de troco na gaveta.", padrao: "" },
  { id: "sangria", contexto: "caixa", nome: "Sangria", descricao: "Retirar dinheiro da gaveta.", padrao: "" },
  { id: "fechar_caixa", contexto: "caixa", nome: "Fechar caixa", descricao: "Abre o fechamento do caixa.", padrao: "" },
  { id: "ajuda_atalhos", contexto: "caixa", nome: "Ver atalhos", descricao: "Mostra a lista de teclas para a balconista.", padrao: "NumpadDivide" },
  // Janela de pagamento
  { id: "pag_dinheiro", contexto: "pagamento", nome: "Dinheiro", descricao: "Escolhe pagamento em dinheiro.", padrao: "F2" },
  { id: "pag_pix", contexto: "pagamento", nome: "Pix", descricao: "Escolhe pagamento em Pix.", padrao: "F3" },
  { id: "pag_debito", contexto: "pagamento", nome: "Cartão de débito", descricao: "Escolhe cartão de débito.", padrao: "F4" },
  { id: "pag_credito", contexto: "pagamento", nome: "Cartão de crédito", descricao: "Escolhe cartão de crédito.", padrao: "F7" },
  { id: "pag_fiado", contexto: "pagamento", nome: "Fiado", descricao: "Escolhe fiado (pede o nome do cliente).", padrao: "F8" },
  { id: "pag_vale_alimentacao", contexto: "pagamento", nome: "Vale-alimentação", descricao: "Escolhe vale-alimentação.", padrao: "" },
  { id: "pag_vale_refeicao", contexto: "pagamento", nome: "Vale-refeição", descricao: "Escolhe vale-refeição.", padrao: "" },
  { id: "pag_outro", contexto: "pagamento", nome: "Outro", descricao: "Escolhe outra forma de pagamento.", padrao: "" },
  { id: "pag_exato", contexto: "pagamento", nome: "Valor exato", descricao: "Preenche o valor que falta pagar.", padrao: "F9" },
  { id: "pag_calculadora", contexto: "pagamento", nome: "Calculadora", descricao: "Abre a calculadora; o resultado pode virar o valor recebido.", padrao: "NumpadDivide" },
];

export type MapaAtalhos = Record<string, string>;

/** Junta as teclas padrão com as escolhidas pelo administrador. */
export function mapaAtalhos(salvos: Record<string, string> | null | undefined): MapaAtalhos {
  const m: MapaAtalhos = {};
  for (const a of ACOES) m[a.id] = salvos && a.id in salvos ? salvos[a.id] : a.padrao;
  return m;
}

/** Converte o evento do teclado no texto da tecla (ou null para teclas só de modificador). */
export function comboDoEvento(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock", "NumLock"].includes(e.key)) return null;
  let tecla: string;
  if (e.code.startsWith("Numpad")) tecla = e.code;
  else if (/^F\d{1,2}$/.test(e.key)) tecla = e.key;
  else if (e.code.startsWith("Key")) tecla = e.code.slice(3);
  else if (e.code.startsWith("Digit")) tecla = e.code.slice(5);
  else tecla = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const partes: string[] = [];
  if (e.ctrlKey || e.metaKey) partes.push("Ctrl");
  if (e.altKey) partes.push("Alt");
  if (e.shiftKey && !e.code.startsWith("Numpad")) partes.push("Shift");
  partes.push(tecla);
  return partes.join("+");
}

const NOMES: Record<string, string> = {
  NumpadAdd: "Num +",
  NumpadSubtract: "Num −",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadEnter: "Num Enter",
  NumpadDecimal: "Num ,",
  Delete: "Delete",
  Insert: "Insert",
  PageUp: "Page Up",
  PageDown: "Page Down",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  " ": "Espaço",
};

/** Texto amigável da tecla, ex.: "Ctrl+Delete", "Num +" (Num = teclado numérico). */
export function nomeTecla(combo: string): string {
  if (!combo) return "";
  return combo
    .split("+")
    .map((p) => NOMES[p] ?? (/^Numpad\d$/.test(p) ? `Num ${p.slice(6)}` : p))
    .join("+");
}

const RESERVADAS = new Set([
  "F5", "Ctrl+F5", "F11", "F12", "Ctrl+R", "Ctrl+Shift+R", "Ctrl+W", "Ctrl+T", "Ctrl+N", "Ctrl+Shift+N",
  "Ctrl+P", "Ctrl+Tab", "Ctrl+Shift+Tab", "Alt+F4", "Ctrl+Shift+I", "Ctrl+Shift+J", "Ctrl+L", "Ctrl+Q",
  "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+A", "Alt+Left", "Alt+Right", "Alt+ArrowLeft", "Alt+ArrowRight",
  "Tab", "Shift+Tab", "Enter", "Escape", "Backspace", "NumpadEnter",
]);

/** Diz se a tecla pode ser usada como atalho; devolve a mensagem de erro ou "" se estiver tudo certo. */
export function validarCombo(combo: string): string {
  if (RESERVADAS.has(combo)) {
    if (["Enter", "NumpadEnter", "Escape", "Tab", "Backspace"].includes(combo)) return "Essa tecla já tem função fixa no sistema (confirmar, voltar ou apagar).";
    return "Essa tecla é usada pelo navegador ou pelo Windows. Escolha outra.";
  }
  if (/^Ctrl\+\d$/.test(combo) || /^Alt\+\d$/.test(combo)) return "Ctrl/Alt + número troca de aba no navegador. Escolha outra.";
  const temModificador = combo.startsWith("Ctrl+") || combo.startsWith("Alt+");
  const tecla = combo.split("+").pop() ?? "";
  if (/^Numpad(\d|Decimal)$/.test(tecla)) return "Os números do teclado numérico são usados para digitar quantidades e valores.";
  if (/^F\d{1,2}$/.test(tecla) || tecla.startsWith("Numpad") || temModificador) return "";
  if (["Insert", "PageUp", "PageDown", "Pause", "ScrollLock"].includes(tecla)) return "";
  return "Essa tecla é usada para digitar. Use F1 a F12, Ctrl ou Alt + uma tecla, Insert, Page Up/Down ou + − * / do teclado numérico.";
}

/** Rótulo para mostrar ao lado de um botão, ex.: " (F2)". */
export function rotulo(mapa: MapaAtalhos, id: string) {
  const t = mapa[id];
  return t ? ` (${nomeTecla(t)})` : "";
}

/**
 * Liga os atalhos enquanto `ativo` for verdadeiro.
 * `acoes` = { idDaAcao: função }. A tecla é bloqueada para não digitar no campo.
 */
export function useAtalhos(mapa: MapaAtalhos, acoes: Record<string, () => void>, ativo: boolean) {
  const ref = useRef(acoes);
  ref.current = acoes;
  useEffect(() => {
    if (!ativo) return;
    const ouvir = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const combo = comboDoEvento(e);
      if (!combo) return;
      const id = Object.keys(ref.current).find((k) => mapa[k] === combo);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      ref.current[id]();
    };
    window.addEventListener("keydown", ouvir, true);
    return () => window.removeEventListener("keydown", ouvir, true);
  }, [mapa, ativo]);
}
