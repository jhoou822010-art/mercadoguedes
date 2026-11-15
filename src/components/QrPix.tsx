import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { fmtMoeda } from "../lib/format";

/** Desenha um QR Code em SVG (nítido na tela e na impressora térmica). */
export function QrCode({ texto, tamanho = 160 }: { texto: string; tamanho?: number }) {
  const caminho = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(texto, "Byte");
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2},${r + 2}h1v1h-1z`;
    return { d, n: n + 4 };
  }, [texto]);
  return (
    <svg viewBox={`0 0 ${caminho.n} ${caminho.n}`} width={tamanho} height={tamanho} role="img" aria-label="QR Code Pix" shapeRendering="crispEdges" style={{ background: "#fff" }}>
      <path d={caminho.d} fill="#000" />
    </svg>
  );
}

/** Caixa com QR Code + "Pix copia e cola" para a tela (caixa, configurações). */
export function PixNaTela({ codigo, valor, recebedor, banco }: { codigo: string; valor?: number; recebedor?: string | null; banco?: string | null }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão: o texto continua selecionável */ }
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-petroleo-200 bg-white p-3 sm:flex-row sm:items-start">
      <div className="shrink-0 rounded bg-white p-1 ring-1 ring-slate-200"><QrCode texto={codigo} tamanho={168} /></div>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        {valor !== undefined && <p className="text-lg font-bold">{fmtMoeda(valor)}</p>}
        {recebedor && <p className="text-xs text-slate-500">Recebedor: <strong>{recebedor}</strong>{banco ? ` · ${banco}` : ""}</p>}
        <p className="text-xs text-slate-500">O cliente lê o QR com o app do banco, ou usa o “copia e cola”:</p>
        <textarea readOnly className="campo h-16 resize-none font-mono text-[11px]" value={codigo} onFocus={(e) => e.target.select()} aria-label="Pix copia e cola" />
        <button type="button" className="btn-secundario btn-pequeno" onClick={copiar}>{copiado ? "Copiado ✓" : "Copiar código"}</button>
      </div>
    </div>
  );
}
