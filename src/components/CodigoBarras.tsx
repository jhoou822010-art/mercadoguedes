import { code128 } from "../lib/barcode";

/** Desenha um código de barras Code 128 em SVG (imprime nítido em qualquer impressora). */
export function CodigoBarras({ valor, altura = 40, mostrarTexto = true }: { valor: string; altura?: number; mostrarTexto?: boolean }) {
  const larguras = code128(valor);
  if (!larguras) return <span className="text-xs text-slate-400">Código inválido</span>;
  const margem = 10;
  const total = larguras.reduce((a, b) => a + b, 0) + margem * 2;
  let x = margem;
  const barras: { x: number; w: number }[] = [];
  larguras.forEach((w, i) => {
    if (i % 2 === 0) barras.push({ x, w });
    x += w;
  });
  const alturaTexto = mostrarTexto ? 12 : 0;
  return (
    <svg viewBox={`0 0 ${total} ${altura + alturaTexto}`} className="h-full w-full" role="img" aria-label={`Código de barras ${valor}`} preserveAspectRatio="xMidYMid meet">
      <rect width={total} height={altura + alturaTexto} fill="#fff" />
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={altura} fill="#000" />
      ))}
      {mostrarTexto && (
        <text x={total / 2} y={altura + 10} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#000">
          {valor}
        </text>
      )}
    </svg>
  );
}
