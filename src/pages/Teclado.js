import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { ACOES, comboDoEvento, mapaAtalhos, nomeTecla, validarCombo } from "../lib/atalhos";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar } from "../components/Modal";
import { Aviso, Cabecalho } from "../components/Ui";
const GRUPOS = [
    { ctx: "caixa", titulo: "Tela do caixa", texto: "Funcionam enquanto a balconista passa os produtos." },
    { ctx: "pagamento", titulo: "Janela de pagamento", texto: "Funcionam com a janela de pagamento aberta. Podem repetir teclas da tela do caixa." },
];
function Tecla({ combo }) {
    if (!combo)
        return _jsx("span", { className: "text-sm text-slate-400", children: "\u2014 sem atalho" });
    return (_jsx("kbd", { className: "inline-flex min-w-12 justify-center rounded-md border border-slate-300 border-b-[3px] bg-white px-2.5 py-1 font-mono text-sm font-semibold text-slate-800", children: nomeTecla(combo) }));
}
export default function Teclado() {
    const { config, recarregar } = useAuth();
    const avisar = useToast();
    const salvo = useMemo(() => mapaAtalhos(config?.atalhos), [config?.atalhos]);
    const [mapa, setMapa] = useState(salvo);
    const [gravando, setGravando] = useState(null);
    const [erro, setErro] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [restaurar, setRestaurar] = useState(false);
    const [teste, setTeste] = useState(null);
    const semColuna = config !== null && config.atalhos === undefined;
    useEffect(() => setMapa(salvo), [salvo]);
    const alterado = ACOES.some((a) => mapa[a.id] !== salvo[a.id]);
    // Captura a próxima tecla apertada para a ação escolhida.
    useEffect(() => {
        if (!gravando)
            return;
        const acao = ACOES.find((a) => a.id === gravando);
        const ouvir = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") {
                setGravando(null);
                return;
            }
            const combo = comboDoEvento(e);
            if (!combo)
                return; // só Ctrl/Alt/Shift: espera a tecla
            const problema = validarCombo(combo);
            if (problema) {
                setErro({ id: acao.id, texto: `${nomeTecla(combo)}: ${problema}` });
                return;
            }
            const conflito = ACOES.find((a) => a.id !== acao.id && a.contexto === acao.contexto && mapa[a.id] === combo);
            if (conflito) {
                setErro({ id: acao.id, texto: `${nomeTecla(combo)} já é usada por “${conflito.nome}”. Remova de lá primeiro ou escolha outra tecla.` });
                return;
            }
            setMapa((m) => ({ ...m, [acao.id]: combo }));
            setErro(null);
            setGravando(null);
        };
        window.addEventListener("keydown", ouvir, true);
        return () => window.removeEventListener("keydown", ouvir, true);
    }, [gravando, mapa]);
    // Área de teste: mostra o que a tecla faria.
    useEffect(() => {
        if (gravando)
            return;
        const ouvir = (e) => {
            const alvo = e.target;
            if (!alvo.closest?.("#area-teste"))
                return;
            e.preventDefault();
            const combo = comboDoEvento(e);
            if (!combo)
                return;
            setTeste({ combo, acoes: ACOES.filter((a) => mapa[a.id] === combo).map((a) => `${a.contexto === "caixa" ? "Caixa" : "Pagamento"}: ${a.nome}`) });
        };
        window.addEventListener("keydown", ouvir, true);
        return () => window.removeEventListener("keydown", ouvir, true);
    }, [gravando, mapa]);
    async function salvar() {
        setSalvando(true);
        // Guarda só o que difere do padrão (mais fácil de atualizar no futuro).
        const diferencas = {};
        for (const a of ACOES)
            if (mapa[a.id] !== a.padrao)
                diferencas[a.id] = mapa[a.id];
        const { error } = await supabase.from("configuracoes").update({ atalhos: diferencas, atualizado_em: new Date().toISOString() }).eq("id", 1);
        setSalvando(false);
        if (error)
            return avisar("erro", mensagemErro(error));
        avisar("sucesso", "Teclas salvas. Valem nos caixas na próxima vez que a tela for aberta.");
        void recarregar();
    }
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: "Teclado do caixa", descricao: "Escolha qual tecla faz cada a\u00E7\u00E3o no caixa. Vale para todos os computadores da loja.", acoes: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: () => setRestaurar(true), children: "Restaurar padr\u00E3o" }), _jsx("button", { className: "btn-acao", onClick: salvar, disabled: !alterado || salvando || semColuna, children: salvando ? "Salvando…" : "Salvar teclas" })] }) }), semColuna && (_jsx("div", { className: "mb-4", children: _jsxs(Aviso, { cor: "critico", children: ["O banco ainda n\u00E3o tem o espa\u00E7o para guardar as teclas. Rode o arquivo ", _jsx("code", { children: "supabase/migrations/0003_atalhos_teclado.sql" }), " no SQL Editor do Supabase e recarregue a p\u00E1gina."] }) })), alterado && _jsx("div", { className: "mb-4", children: _jsx(Aviso, { cor: "atencao", children: "H\u00E1 altera\u00E7\u00F5es ainda n\u00E3o salvas." }) }), _jsxs("div", { className: "mb-6 grid gap-4 lg:grid-cols-3", children: [_jsxs("div", { className: "cartao p-4 text-sm text-slate-600 lg:col-span-2", children: [_jsx("p", { className: "mb-2 font-semibold text-slate-800", children: "Como trocar uma tecla" }), _jsxs("ol", { className: "list-decimal space-y-1 pl-5", children: [_jsxs("li", { children: ["Clique em ", _jsx("strong", { children: "Alterar" }), " na a\u00E7\u00E3o desejada."] }), _jsxs("li", { children: ["Aperte a tecla (ou a combina\u00E7\u00E3o, como ", _jsx("kbd", { className: "font-mono", children: "Ctrl + K" }), ") no teclado do caixa."] }), _jsxs("li", { children: ["Clique em ", _jsx("strong", { children: "Salvar teclas" }), "."] })] }), _jsx("p", { className: "mt-2 text-xs text-slate-500", children: "Podem ser usadas: F1 a F12, Ctrl ou Alt + tecla, Insert, Page Up/Down e as teclas + \u2212 * / do teclado num\u00E9rico. \u201CNum\u201D = tecla do teclado num\u00E9rico (o bloco de n\u00FAmeros \u00E0 direita). Letras e n\u00FAmeros sozinhos n\u00E3o s\u00E3o aceitos porque servem para digitar. F5, F11, F12 e atalhos do navegador tamb\u00E9m n\u00E3o." })] }), _jsxs("div", { id: "area-teste", tabIndex: 0, className: "cartao flex cursor-text flex-col justify-center p-4 text-center outline-none focus:ring-2 focus:ring-petroleo-500", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "\u00C1rea de teste" }), !teste ? (_jsx("p", { className: "mt-2 text-sm text-slate-500", children: "Clique aqui e aperte uma tecla para ver o que ela faz no caixa." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "mt-2", children: _jsx(Tecla, { combo: teste.combo }) }), _jsx("p", { className: "mt-2 text-sm", children: teste.acoes.length ? teste.acoes.join(" · ") : _jsx("span", { className: "text-slate-400", children: "Nenhuma a\u00E7\u00E3o usa esta tecla." }) })] }))] })] }), _jsx("div", { className: "grid gap-6 lg:grid-cols-2", children: GRUPOS.map((g) => (_jsxs("section", { className: "cartao", children: [_jsxs("div", { className: "border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: g.titulo }), _jsx("p", { className: "text-xs text-slate-500", children: g.texto })] }), _jsx("ul", { className: "divide-y divide-slate-100", children: ACOES.filter((a) => a.contexto === g.ctx).map((a) => (_jsxs("li", { className: `px-4 py-3 ${gravando === a.id ? "bg-orange-50" : ""}`, children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "font-medium", children: a.nome }), _jsx("p", { className: "text-xs text-slate-500", children: a.descricao })] }), _jsxs("div", { className: "flex items-center gap-2", children: [gravando === a.id
                                                        ? _jsx("span", { className: "animate-pulse rounded-md bg-acao-500 px-3 py-1 text-sm font-semibold text-white", children: "Aperte a tecla\u2026" })
                                                        : _jsx(Tecla, { combo: mapa[a.id] }), gravando === a.id ? (_jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => { setGravando(null); setErro(null); }, children: "Cancelar (Esc)" })) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario btn-pequeno", onClick: () => { setErro(null); setGravando(a.id); }, children: "Alterar" }), mapa[a.id] && _jsx("button", { className: "btn-pequeno btn text-slate-500 hover:bg-slate-100", title: "Deixar sem atalho", onClick: () => setMapa((m) => ({ ...m, [a.id]: "" })), children: "\u2715" })] }))] })] }), erro?.id === a.id && _jsx("p", { className: "mt-2 text-xs font-medium text-critico-600", children: erro.texto }), mapa[a.id] !== a.padrao && a.padrao && !gravando && (_jsxs("button", { className: "mt-1 text-xs text-petroleo-700 hover:underline", onClick: () => setMapa((m) => ({ ...m, [a.id]: a.padrao })), children: ["Voltar para ", nomeTecla(a.padrao)] }))] }, a.id))) })] }, g.ctx))) }), _jsx(Confirmar, { aberto: restaurar, titulo: "Restaurar as teclas padr\u00E3o?", textoConfirmar: "Restaurar", onCancelar: () => setRestaurar(false), onConfirmar: () => { setMapa(mapaAtalhos({})); setRestaurar(false); avisar("info", "Teclas padrão de volta. Clique em “Salvar teclas” para confirmar."); }, mensagem: _jsx("p", { children: "Todas as a\u00E7\u00F5es voltam para as teclas originais do Gerenciador de Mercado. Nada \u00E9 gravado at\u00E9 voc\u00EA clicar em \u201CSalvar teclas\u201D." }) })] }));
}
