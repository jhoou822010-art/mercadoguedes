/*
  Compra em andamento no caixa.
  Fica guardada no navegador (localStorage), por número do caixa. Assim:
  - trocar de menu e voltar não perde a compra;
  - recarregar a página ou cair a energia não perde a compra;
  - o caixa aberto em JANELA SEPARADA e a janela principal veem a mesma compra.
*/
export const JANELA_CAIXA = "lojafacil-caixa";
const PREFIXO = "lojafacil.carrinho.";
export const EVENTO_CARRINHO = "lojafacil:carrinho";

export interface CarrinhoGuardado<I = unknown, D = unknown> { itens: I[]; desconto: D; usuario_id?: string; atualizado?: number }

export const chaveCarrinho = (caixaId: number) => `${PREFIXO}${caixaId}`;

export function lerCarrinhoGuardado<I, D>(caixaId: number): CarrinhoGuardado<I, D> | null {
  try {
    const k = chaveCarrinho(caixaId);
    const t = localStorage.getItem(k) ?? sessionStorage.getItem(k);
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

export function gravarCarrinho(caixaId: number, dados: CarrinhoGuardado) {
  try {
    const k = chaveCarrinho(caixaId);
    const novo = JSON.stringify({ ...dados, atualizado: undefined });
    const atual = localStorage.getItem(k);
    if (!dados.itens.length) { if (atual !== null) localStorage.removeItem(k); }
    else if (atual !== novo) localStorage.setItem(k, novo);
    sessionStorage.removeItem(k);
    window.dispatchEvent(new Event(EVENTO_CARRINHO));
  } catch { /* navegador sem memória: segue sem guardar */ }
}

/** Compras em andamento deste usuário (para o aviso nas outras telas). */
export function comprasEmAndamento(usuarioId: string | undefined) {
  const r: { caixaId: number; itens: number; total: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO)) continue;
      const c = JSON.parse(localStorage.getItem(k) || "null") as CarrinhoGuardado<{ p: { preco: number | string }; qtd: string }> | null;
      if (!c?.itens?.length || (c.usuario_id && c.usuario_id !== usuarioId)) continue;
      const total = c.itens.reduce((s, it) => {
        const q = Number(String(it.qtd).replace(/\./g, "").replace(",", "."));
        return s + (Number.isFinite(q) ? q * Number(it.p.preco) : 0);
      }, 0);
      r.push({ caixaId: Number(k.slice(PREFIXO.length)), itens: c.itens.length, total: Math.round(total * 100) / 100 });
    }
  } catch { /* ignora */ }
  return r;
}

/** Abre (ou traz para a frente) o caixa numa janela separada, que pode ser movida e redimensionada. */
export function abrirCaixaEmJanela() {
  const w = Math.min(1180, screen.availWidth - 40), h = Math.min(820, screen.availHeight - 60);
  const x = Math.max(0, screen.availWidth - w - 20), y = 20;
  const jan = window.open(`${import.meta.env.BASE_URL}caixa`, JANELA_CAIXA, `popup=yes,width=${w},height=${h},left=${x},top=${y}`);
  jan?.focus();
  return !!jan;
}

/** Esta aba é a janela separada do caixa? */
export const ehJanelaDoCaixa = () => window.name === JANELA_CAIXA;
