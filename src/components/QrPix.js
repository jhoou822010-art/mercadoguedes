import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { fmtMoeda } from "../lib/format";
/** Desenha um QR Code em SVG (nítido na tela e na impressora térmica). */
export function QrCode({ texto, tamanho = 160 }) {
    const caminho = useMemo(() => {
        const qr = qrcode(0, "M");
        qr.addData(texto, "Byte");
        qr.make();
        const n = qr.getModuleCount();
        let d = "";
        for (let r = 0; r < n; r++)
            for (let c = 0; c < n; c++)
                if (qr.isDark(r, c))
                    d += `M${c + 2},${r + 2}h1v1h-1z`;
        return { d, n: n + 4 };
    }, [texto]);
    return (_jsx("svg", { viewBox: `0 0 ${caminho.n} ${caminho.n}`, width: tamanho, height: tamanho, role: "img", "aria-label": "QR Code Pix", shapeRendering: "crispEdges", style: { background: "#fff" }, children: _jsx("path", { d: caminho.d, fill: "#000" }) }));
}
/** Caixa com QR Code + "Pix copia e cola" para a tela (caixa, configurações). */
export function PixNaTela({ codigo, valor, recebedor, banco }) {
    const [copiado, setCopiado] = useState(false);
    async function copiar() {
        try {
            await navigator.clipboard.writeText(codigo);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        }
        catch { /* sem permissão: o texto continua selecionável */ }
    }
    return (_jsxs("div", { className: "flex flex-col items-center gap-3 rounded-lg border border-petroleo-200 bg-white p-3 sm:flex-row sm:items-start", children: [_jsx("div", { className: "shrink-0 rounded bg-white p-1 ring-1 ring-slate-200", children: _jsx(QrCode, { texto: codigo, tamanho: 168 }) }), _jsxs("div", { className: "min-w-0 flex-1 space-y-2 text-sm", children: [valor !== undefined && _jsx("p", { className: "text-lg font-bold", children: fmtMoeda(valor) }), recebedor && _jsxs("p", { className: "text-xs text-slate-500", children: ["Recebedor: ", _jsx("strong", { children: recebedor }), banco ? ` · ${banco}` : ""] }), _jsx("p", { className: "text-xs text-slate-500", children: "O cliente l\u00EA o QR com o app do banco, ou usa o \u201Ccopia e cola\u201D:" }), _jsx("textarea", { readOnly: true, className: "campo h-16 resize-none font-mono text-[11px]", value: codigo, onFocus: (e) => e.target.select(), "aria-label": "Pix copia e cola" }), _jsx("button", { type: "button", className: "btn-secundario btn-pequeno", onClick: copiar, children: copiado ? "Copiado ✓" : "Copiar código" })] })] }));
}
