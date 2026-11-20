import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { produtosPorIds } from "../lib/local/consultas";
import { useNavigate } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { centavos, dividirParcelas, fmtData, fmtDataHora, fmtMoeda, fmtQtd, hojeISO, lerNumero, NOME_FORMA, somarMeses } from "../lib/format";
import { FORMAS } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar, Modal } from "../components/Modal";
import { ProdutoBusca } from "../components/ProdutoBusca";
import { CupomFechamento, CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { Aviso, Cabecalho, Carregando } from "../components/Ui";
import { ativarCalculadora, Calculadora } from "../components/Calculadora";
import { abrirCaixaEmJanela, chaveCarrinho, ehJanelaDoCaixa, fixarCaixaNaPrincipal, gravarCarrinho, lerCarrinhoGuardado } from "../lib/carrinho";
import { ClienteSeletor } from "../components/ClienteSeletor";
import { COLUNAS_CAIXA } from "../lib/consultas";
import { estadoConexaoAgora } from "../lib/conexao";
import { ehErroDeRede } from "../lib/supabase";
import { abrirCaixaLocal, caixaAbertoLocal, fecharCaixaLocal, finalizarVendaLocal, guardarCaixaDoServidor, movimentarCaixaLocal, resumoCaixaLocal } from "../lib/local/caixaLocal";
/** Número do caixa para mostrar: o do servidor, ou "deste computador" enquanto não foi enviado. */
const nomeCaixa = (c) => (c.id > 0 ? `Caixa nº ${c.id}` : "Caixa (aguardando número do servidor)");
/** Fechamento cego: o operador não vê os valores (igual ao servidor). */
function mascarar(r) {
    return { caixa_id: r.caixa_id, status: r.status, usuario_nome: r.usuario_nome, aberto_em: r.aberto_em, fechado_em: r.fechado_em, qtd_vendas: r.qtd_vendas, qtd_canceladas: r.qtd_canceladas, oculto: true };
}
import { pixDaLoja } from "../lib/pix";
import { PixNaTela } from "../components/QrPix";
import { ACOES, mapaAtalhos, nomeTecla, rotulo, useAtalhos } from "../lib/atalhos";
/* ======================================================================
   Tela do Caixa: abre o caixa, vende e fecha o caixa.
   ====================================================================== */
export default function Caixa() {
    const { sessao } = useAuth();
    const [caixa, setCaixa] = useState(undefined);
    const carregar = useCallback(async () => {
        // Com servidor: guarda no computador o caixa aberto que o servidor conhece (ex.: aberto antes).
        if (estadoConexaoAgora() !== "offline") {
            let r = await supabase.from("caixas").select(`${COLUNAS_CAIXA}, uuid_local, dispositivo`).eq("usuario_id", sessao.user.id).eq("status", "aberto");
            if (r.error && !ehErroDeRede(r.error))
                r = await supabase.from("caixas").select(COLUNAS_CAIXA).eq("usuario_id", sessao.user.id).eq("status", "aberto");
            for (const c of (r.data ?? []))
                await guardarCaixaDoServidor({ ...c, valor_esperado: null, diferenca: null, resumo: null });
        }
        // O caixa da tela é sempre o deste computador (funciona sem internet).
        setCaixa(await caixaAbertoLocal(sessao.user.id));
    }, [sessao]);
    useEffect(() => { void carregar(); }, [carregar]);
    if (caixa === undefined)
        return _jsx(Carregando, {});
    if (caixa === null)
        return _jsx(AbrirCaixa, { onAberto: setCaixa });
    return _jsx(PontoDeVenda, { caixa: caixa, onFechado: () => setCaixa(null) });
}
/* ---------------------------- Abertura ---------------------------- */
function AbrirCaixa({ onAberto }) {
    const { perfil } = useAuth();
    const avisar = useToast();
    const [valor, setValor] = useState("");
    const [erro, setErro] = useState("");
    const [abrindo, setAbrindo] = useState(false);
    async function abrir(e) {
        e.preventDefault();
        const n = valor.trim() ? lerNumero(valor) : 0;
        if (Number.isNaN(n) || n < 0)
            return setErro("Digite um valor válido (ex.: 100 ou 150,50).");
        setAbrindo(true);
        try {
            const c = await abrirCaixaLocal(perfil, n);
            avisar("sucesso", `Caixa aberto com ${fmtMoeda(n)} de troco.`);
            onAberto(c);
        }
        catch (e) {
            setErro(mensagemErro(e));
        }
        finally {
            setAbrindo(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto max-w-md", children: [_jsx(Cabecalho, { titulo: "Caixa", descricao: `Olá, ${perfil?.nome.split(" ")[0] ?? ""}. Abra o caixa para começar a vender.` }), _jsxs("form", { onSubmit: abrir, className: "cartao space-y-4 p-6", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Abertura de caixa" }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "abertura", children: "Dinheiro na gaveta para troco (R$)" }), _jsx("input", { id: "abertura", className: "campo text-2xl font-bold", inputMode: "decimal", placeholder: "0,00", value: valor, onChange: (e) => { setValor(e.target.value); setErro(""); }, autoFocus: true }), _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "Conte o dinheiro que est\u00E1 na gaveta agora. Ele ser\u00E1 conferido no fechamento." })] }), erro && _jsx(Aviso, { cor: "critico", children: erro }), _jsx("button", { className: "btn-acao w-full py-3 text-base", disabled: abrindo, children: abrindo ? "Abrindo…" : "Abrir caixa" })] })] }));
}
/** Monta um "produto" de mentira para um item avulso (sem cadastro). Id negativo = nunca existe no banco. */
function produtoAvulso(descricao, preco) {
    const agora = new Date().toISOString();
    return {
        id: -Date.now() - Math.floor(Math.random() * 1000), codigo: "AVULSO", barras: null, nome: descricao, categoria: null,
        unidade: "UN", modelo: null, fornecedor: null, custo: 0, preco, estoque: 1e9, estoque_minimo: 0, validade: null,
        ativo: true, criado_em: agora, atualizado_em: agora, valor_estoque: 0, abaixo_minimo: false,
        dias_para_vencer: null, situacao_validade: "sem_validade",
    };
}
function lerCarrinho(caixaId) {
    const c = lerCarrinhoGuardado(caixaId);
    return { itens: c?.itens ?? [], desconto: c?.desconto ?? { tipo: "valor", valor: "" } };
}
const INTEIRAS = ["UN", "PCT", "CX"];
function PontoDeVenda({ caixa, onFechado }) {
    const { ehAdmin, config } = useAuth();
    const avisar = useToast();
    const inicial = useMemo(() => lerCarrinho(caixa.id), [caixa.id]);
    const [itens, setItens] = useState(inicial.itens);
    const [desconto, setDesconto] = useState(inicial.desconto);
    const [janela, setJanela] = useState("");
    const [calcAberta, setCalcAberta] = useState(false);
    const teclas = useMemo(() => mapaAtalhos(config?.atalhos), [config?.atalhos]);
    const [comprovante, setComprovante] = useState(null);
    const busca = useRef(null);
    const qtdRefs = useRef({});
    // Guarda a compra no navegador: trocar de menu, recarregar ou faltar energia não perde nada.
    const { perfil } = useAuth();
    const navegar = useNavigate();
    useEffect(() => {
        gravarCarrinho(caixa.id, { itens, desconto, usuario_id: perfil?.id });
    }, [itens, desconto, caixa.id, perfil?.id]);
    // Caixa aberto em duas janelas (principal e separada): as duas mostram a mesma compra.
    useEffect(() => {
        const k = chaveCarrinho(caixa.id);
        const ouvir = (e) => {
            if (e.key !== k)
                return;
            const c = lerCarrinho(caixa.id);
            setItens(c.itens);
            setDesconto(c.desconto);
        };
        window.addEventListener("storage", ouvir);
        return () => window.removeEventListener("storage", ouvir);
    }, [caixa.id]);
    const focarBusca = () => setTimeout(() => busca.current?.focus(), 50);
    const linhas = itens.map((i) => {
        const q = lerNumero(i.qtd);
        const invalida = Number.isNaN(q) || q <= 0 || (!i.avulso && INTEIRAS.includes(i.p.unidade) && !Number.isInteger(q));
        const total = invalida ? 0 : centavos(Number(i.p.preco) * q);
        return { ...i, q, invalida, total, semEstoque: !i.avulso && !invalida && q > Number(i.p.estoque) };
    });
    const subtotal = centavos(linhas.reduce((s, l) => s + l.total, 0));
    const descNum = desconto.valor.trim() ? lerNumero(desconto.valor) : 0;
    const descontoValor = Number.isNaN(descNum) ? 0 : centavos(desconto.tipo === "percentual" ? subtotal * descNum / 100 : descNum);
    const total = centavos(Math.max(0, subtotal - descontoValor));
    const limite = Number(config?.desconto_maximo_percentual ?? 100);
    const erroDesconto = Number.isNaN(descNum) || descNum < 0 ? "Desconto inválido."
        : descontoValor > subtotal ? "O desconto é maior que a compra."
            : !ehAdmin && subtotal > 0 && descontoValor > centavos(subtotal * limite / 100) ? `Desconto acima do permitido (máx. ${limite}%).`
                : "";
    // Estoque do sistema menor que a venda: a venda é PERMITIDA (o produto está na mão do cliente) e fica anotada.
    const problemas = linhas.filter((l) => l.invalida);
    const podePagar = itens.length > 0 && problemas.length === 0 && !erroDesconto;
    function adicionar(p) {
        setItens((lista) => {
            const i = lista.findIndex((x) => x.p.id === p.id);
            if (i >= 0 && INTEIRAS.includes(p.unidade)) {
                const n = [...lista];
                const atual = lerNumero(n[i].qtd);
                n[i] = { ...n[i], qtd: String((Number.isNaN(atual) ? 0 : atual) + 1) };
                return n;
            }
            if (i >= 0)
                return lista;
            return [...lista, { p, qtd: INTEIRAS.includes(p.unidade) ? "1" : "" }];
        });
        // Produto por peso/volume: pede a quantidade; os demais voltam direto para o leitor.
        if (!INTEIRAS.includes(p.unidade))
            setTimeout(() => qtdRefs.current[p.id]?.focus(), 60);
        else
            focarBusca();
    }
    async function abrirPagamento() {
        if (!itens.length)
            return avisar("info", "Passe pelo menos um produto.");
        if (!podePagar)
            return avisar("erro", erroDesconto || "Confira os itens marcados em vermelho.");
        // Confere preço e estoque atuais antes de cobrar.
        const ids = itens.filter((i) => !i.avulso).map((i) => i.p.id);
        const { data } = ids.length
            ? await doServidorOuLocal(() => supabase.from("vw_produtos").select("*").in("id", ids), () => produtosPorIds(ids), { espera: 4000 })
            : { data: [] };
        const atuais = new Map((data ?? []).map((p) => [p.id, p]));
        const mudou = itens.some((i) => {
            const a = atuais.get(i.p.id);
            return !i.avulso && a && (Number(a.preco) !== Number(i.p.preco) || Number(a.estoque) !== Number(i.p.estoque));
        });
        if (mudou) {
            setItens((x) => x.map((i) => (i.avulso ? i : { ...i, p: atuais.get(i.p.id) ?? i.p })));
            return avisar("info", "Preço ou estoque de algum item mudou. Confira os valores e aperte F2 de novo.");
        }
        setJanela("pagamento");
    }
    // Item avulso: produto sem cadastro, com descrição, preço e quantidade digitados.
    const avulsoLiberado = ehAdmin || config?.permitir_item_avulso !== false;
    function abrirAvulso() {
        if (config && config.permitir_item_avulso === undefined) {
            return avisar("erro", "Para usar “Digite o produto”, o administrador precisa rodar o SQL 0005_item_avulso.sql no Supabase.");
        }
        if (!avulsoLiberado)
            return avisar("erro", "“Digite o produto” não está liberado para operador. Peça ao administrador.");
        setJanela("avulso");
    }
    function adicionarAvulso(descricao, preco, quantidade) {
        setItens((x) => [...x, { p: produtoAvulso(descricao, preco), qtd: String(quantidade).replace(".", ","), avulso: true }]);
        setJanela("");
        avisar("info", `“${descricao}” adicionado (item sem cadastro).`);
        focarBusca();
    }
    // Mexe na quantidade do último produto passado.
    function mudarUltimo(delta) {
        const ultimo = itens[itens.length - 1];
        if (!ultimo)
            return;
        if (!INTEIRAS.includes(ultimo.p.unidade)) {
            setTimeout(() => { qtdRefs.current[ultimo.p.id]?.focus(); qtdRefs.current[ultimo.p.id]?.select(); }, 30);
            return;
        }
        const atual = lerNumero(ultimo.qtd);
        const novo = (Number.isNaN(atual) ? 0 : atual) + delta;
        if (novo < 1)
            return avisar("info", "Para tirar o produto, use “Remover último item”.");
        setItens((x) => x.map((i) => (i.p.id === ultimo.p.id ? { ...i, qtd: String(novo) } : i)));
    }
    // Atalhos de teclado (definidos pelo administrador em "Teclado do caixa").
    useAtalhos(teclas, {
        pagamento: () => void abrirPagamento(),
        buscar_produto: focarBusca,
        desconto: () => itens.length && setJanela("desconto"),
        calculadora: () => (calcAberta ? ativarCalculadora() : setCalcAberta(true)),
        item_avulso: () => abrirAvulso(),
        cancelar_compra: () => itens.length && setJanela("limpar"),
        quantidade_ultimo: () => {
            const u = itens[itens.length - 1];
            if (u)
                setTimeout(() => { qtdRefs.current[u.p.id]?.focus(); qtdRefs.current[u.p.id]?.select(); }, 30);
        },
        mais_um: () => mudarUltimo(1),
        menos_um: () => mudarUltimo(-1),
        remover_ultimo: () => {
            const u = itens[itens.length - 1];
            if (!u)
                return;
            setItens((x) => x.slice(0, -1));
            avisar("info", `“${u.p.nome}” retirado da compra.`);
            focarBusca();
        },
        suprimento: () => setJanela("suprimento"),
        sangria: () => setJanela("sangria"),
        fechar_caixa: () => (itens.length ? avisar("info", "Finalize ou cancele a compra atual antes de fechar o caixa.") : setJanela("fechar")),
        ajuda_atalhos: () => setJanela("atalhos"),
    }, !janela && !comprovante);
    function limpar() {
        setItens([]);
        setDesconto({ tipo: "valor", valor: "" });
        setJanela("");
        focarBusca();
    }
    function vendaConcluida(v) {
        limpar();
        setComprovante(v);
        avisar("sucesso", `Venda ${v.codigo_local ?? `nº ${v.id}`} registrada.${Number(v.troco) > 0 ? ` Troco: ${fmtMoeda(v.troco)}.` : ""}`);
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold", children: nomeCaixa(caixa) }), _jsxs("p", { className: "text-sm text-slate-500", children: ["Aberto em ", fmtDataHora(caixa.aberto_em), " \u00B7 ", caixa.usuario_nome] }), _jsx("div", { className: "nao-imprimir mt-2", children: ehJanelaDoCaixa() ? (_jsx("button", { type: "button", className: "btn-secundario btn-pequeno border-petroleo-300 text-petroleo-800", onClick: fixarCaixaNaPrincipal, title: "Fecha esta janela e o caixa volta para a janela principal, com o menu. A compra continua a mesma.", children: "\uD83D\uDCCC Fixar na janela principal" })) : (_jsx("button", { type: "button", className: "btn-secundario btn-pequeno border-petroleo-300 text-petroleo-800", onClick: () => {
                                        if (!abrirCaixaEmJanela())
                                            return avisar("erro", "O navegador bloqueou a janela. Clique no aviso de pop-up do navegador e escolha “Sempre permitir” para este site.");
                                        navegar("/");
                                    }, title: "Solta o caixa numa janela pr\u00F3pria, que pode ser movida e mudar de tamanho. A compra continua a mesma.", children: "\u29C9 Soltar em janela separada" })) })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { className: "btn-secundario btn-pequeno", onClick: () => setJanela("atalhos"), children: ["\u2328 Atalhos", rotulo(teclas, "ajuda_atalhos")] }), _jsxs("button", { className: "btn-secundario btn-pequeno", onClick: () => setJanela("suprimento"), children: ["+ Suprimento", rotulo(teclas, "suprimento")] }), _jsxs("button", { className: "btn-secundario btn-pequeno", onClick: () => setJanela("sangria"), children: ["\u2212 Sangria", rotulo(teclas, "sangria")] }), _jsxs("button", { className: "btn-perigo btn-pequeno", onClick: () => setJanela("fechar"), disabled: itens.length > 0, title: itens.length ? "Finalize ou cancele a compra atual antes" : "", children: ["Fechar caixa", rotulo(teclas, "fechar_caixa")] })] })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs("section", { className: "cartao flex min-h-[12rem] flex-col md:col-span-2 md:min-h-[24rem]", children: [_jsx("div", { className: "border-b border-slate-100 p-4", children: _jsx(ProdutoBusca, { onSelecionar: adicionar, autoFocus: true, campoRef: busca, placeholder: "Passe o leitor ou digite nome / c\u00F3digo" }) }), itens.length === 0 ? (_jsxs("div", { className: "flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400", children: [_jsx("p", { className: "text-4xl", children: "\uD83D\uDED2" }), _jsx("p", { className: "mt-2 font-medium", children: "Caixa livre" }), _jsx("p", { className: "text-sm", children: "Passe o primeiro produto no leitor." })] })) : (_jsx("ul", { className: "flex-1 divide-y divide-slate-100 overflow-y-auto", children: linhas.map((l, n) => (_jsxs("li", { className: `grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex ${l.invalida ? "bg-critico-50" : l.semEstoque ? "bg-atencao-50" : ""}`, children: [_jsx("span", { className: "hidden w-6 text-xs text-slate-400 sm:order-1 sm:block", children: n + 1 }), _jsxs("div", { className: "order-1 min-w-0 sm:order-2 sm:flex-1", children: [_jsx("p", { className: "truncate font-medium", children: l.p.nome }), _jsxs("p", { className: "text-xs text-slate-500", children: [fmtMoeda(l.p.preco), " / ", l.p.unidade, " \u00B7 ", l.avulso ? _jsx("span", { className: "font-semibold text-acao-700", children: "sem cadastro" }) : _jsxs(_Fragment, { children: ["c\u00F3d. ", l.p.codigo] }), l.semEstoque && _jsxs("span", { className: "ml-1 font-semibold text-atencao-700", title: "A venda \u00E9 permitida e fica anotada para o administrador conferir o estoque.", children: ["\u00B7 estoque do sistema: ", fmtQtd(l.p.estoque, l.p.unidade), " (ser\u00E1 anotado)"] }), l.invalida && l.qtd !== "" && _jsx("span", { className: "ml-1 font-semibold text-critico-700", children: "\u00B7 quantidade inv\u00E1lida" })] })] }), _jsxs("div", { className: "order-3 flex items-center gap-1", children: [INTEIRAS.includes(l.p.unidade) && (_jsx("button", { className: "h-9 w-9 rounded-lg border border-slate-300 text-lg hover:bg-slate-100", "aria-label": "Diminuir", onClick: () => setItens((x) => x.map((i) => i.p.id === l.p.id ? { ...i, qtd: String(Math.max(1, (Number.isNaN(l.q) ? 1 : l.q) - 1)) } : i)), children: "\u2212" })), _jsx("input", { ref: (el) => { qtdRefs.current[l.p.id] = el; }, className: `campo w-20 text-center ${l.invalida && l.qtd !== "" ? "campo-erro" : ""}`, inputMode: "decimal", value: l.qtd, placeholder: l.p.unidade === "KG" ? "kg" : "qtd", "aria-label": `Quantidade de ${l.p.nome}`, onChange: (e) => setItens((x) => x.map((i) => (i.p.id === l.p.id ? { ...i, qtd: e.target.value } : i))), onKeyDown: (e) => { if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        focarBusca();
                                                    } } }), INTEIRAS.includes(l.p.unidade) && (_jsx("button", { className: "h-9 w-9 rounded-lg border border-slate-300 text-lg hover:bg-slate-100", "aria-label": "Aumentar", onClick: () => setItens((x) => x.map((i) => i.p.id === l.p.id ? { ...i, qtd: String((Number.isNaN(l.q) ? 0 : l.q) + 1) } : i)), children: "+" }))] }), _jsx("span", { className: "order-4 text-right font-semibold sm:w-24", children: fmtMoeda(l.total) }), _jsx("button", { className: "order-2 justify-self-end rounded p-1 text-slate-400 hover:bg-critico-100 hover:text-critico-600 sm:order-5", "aria-label": `Remover ${l.p.nome}`, onClick: () => { setItens((x) => x.filter((i) => i.p.id !== l.p.id)); focarBusca(); }, children: "\u2715" })] }, l.p.id))) }))] }), _jsxs("aside", { className: "cartao flex flex-col gap-3 p-5 md:sticky md:top-6 md:self-start", children: [_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-slate-500", children: "Itens" }), _jsx("span", { children: itens.length })] }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-slate-500", children: "Subtotal" }), _jsx("span", { children: fmtMoeda(subtotal) })] }), _jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsxs("button", { className: "font-semibold text-petroleo-700 hover:underline disabled:text-slate-400 disabled:no-underline", disabled: !itens.length, onClick: () => setJanela("desconto"), children: ["Desconto", rotulo(teclas, "desconto")] }), _jsx("span", { className: descontoValor > 0 ? "font-semibold text-acao-700" : "", children: descontoValor > 0 ? `− ${fmtMoeda(descontoValor)}` : "—" })] }), erroDesconto && _jsx("p", { className: "text-xs font-semibold text-critico-600", children: erroDesconto }), _jsxs("div", { className: "rounded-xl bg-petroleo-800 p-4 text-white", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-petroleo-200", children: "Total a pagar" }), _jsx("p", { className: "text-4xl font-extrabold", children: fmtMoeda(total) })] }), _jsxs("button", { className: "btn-acao py-4 text-lg", disabled: !podePagar, onClick: abrirPagamento, children: ["Pagamento", rotulo(teclas, "pagamento")] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [avulsoLiberado && (_jsxs("button", { className: "btn-secundario btn-pequeno col-span-2 border-acao-500 text-acao-700 hover:bg-orange-50", onClick: abrirAvulso, children: ["\u271A Digite o produto", rotulo(teclas, "item_avulso")] })), _jsxs("button", { className: "btn-secundario btn-pequeno", onClick: () => (calcAberta ? ativarCalculadora() : setCalcAberta(true)), children: ["\uD83E\uDDEE Calculadora", rotulo(teclas, "calculadora")] }), _jsxs("button", { className: "btn-secundario btn-pequeno", disabled: !itens.length, onClick: () => setJanela("limpar"), children: ["Cancelar compra", rotulo(teclas, "cancelar_compra")] }), _jsxs("button", { className: "btn-secundario btn-pequeno", disabled: !itens.length, onClick: () => mudarUltimo(1), children: ["+1 no \u00FAltimo", rotulo(teclas, "mais_um")] }), _jsxs("button", { className: "btn-secundario btn-pequeno", disabled: !itens.length, onClick: () => mudarUltimo(-1), children: ["\u22121 no \u00FAltimo", rotulo(teclas, "menos_um")] })] }), _jsx("button", { className: "text-center text-xs text-slate-400 hover:text-petroleo-700 hover:underline", onClick: () => setJanela("atalhos"), children: "Ver todas as teclas de atalho" })] })] }), janela === "desconto" && (_jsx(JanelaDesconto, { subtotal: subtotal, atual: desconto, limite: ehAdmin ? 100 : limite, onAplicar: (d) => { setDesconto(d); setJanela(""); focarBusca(); }, onFechar: () => { setJanela(""); focarBusca(); } })), janela === "pagamento" && (_jsx(JanelaPagamento, { teclas: teclas, total: total, caixa: caixa, itens: linhas.map((l) => ({ p: l.p, quantidade: l.q, avulso: l.avulso })), desconto: descontoValor, onConcluida: vendaConcluida, onFechar: () => { setJanela(""); focarBusca(); } })), _jsx(Confirmar, { aberto: janela === "limpar", titulo: "Cancelar esta compra?", perigo: true, textoConfirmar: "Sim, limpar o caixa", mensagem: _jsxs("p", { children: ["Os ", itens.length, " item(ns) da compra atual ser\u00E3o retirados. Nada foi gravado ainda, o estoque n\u00E3o muda."] }), onCancelar: () => setJanela(""), onConfirmar: limpar }), (janela === "sangria" || janela === "suprimento") && (_jsx(JanelaSangria, { tipo: janela, caixa: caixa, onFechar: () => { setJanela(""); focarBusca(); } })), calcAberta && _jsx(Calculadora, { onFechar: () => { setCalcAberta(false); if (!janela)
                    focarBusca(); } }), janela === "avulso" && _jsx(JanelaAvulso, { onAdicionar: adicionarAvulso, onFechar: () => { setJanela(""); focarBusca(); } }), janela === "atalhos" && _jsx(JanelaAtalhos, { teclas: teclas, onFechar: () => { setJanela(""); focarBusca(); } }), janela === "fechar" && _jsx(JanelaFechamento, { caixa: caixa, onCancelar: () => setJanela(""), onFechado: onFechado }), comprovante && (_jsx(JanelaComprovante, { titulo: comprovante.id > 0 ? `Venda nº ${comprovante.id} concluída` : `Venda ${comprovante.codigo_local ?? ""} concluída`, onFechar: () => { setComprovante(null); focarBusca(); }, acaoExtra: _jsx("button", { className: "btn-secundario", onClick: () => { setComprovante(null); focarBusca(); }, children: "Nova venda" }), children: (largura) => (_jsxs(_Fragment, { children: [Number(comprovante.troco) > 0 && (_jsxs("div", { className: "cupom-fora mb-3 rounded-lg bg-ok-100 p-3 text-center text-ok-700", children: [_jsx("p", { className: "text-xs uppercase", children: "Troco" }), _jsx("p", { className: "text-3xl font-extrabold", children: fmtMoeda(comprovante.troco) })] })), _jsx(CupomVenda, { venda: comprovante, config: config, largura: largura })] })) }))] }));
}
/* ---------------------------- Desconto ---------------------------- */
function JanelaDesconto({ subtotal, atual, limite, onAplicar, onFechar }) {
    const [tipo, setTipo] = useState(atual.tipo);
    const [valor, setValor] = useState(atual.valor);
    const n = valor.trim() ? lerNumero(valor) : 0;
    const reais = Number.isNaN(n) ? NaN : centavos(tipo === "percentual" ? subtotal * n / 100 : n);
    const maximo = centavos(subtotal * limite / 100);
    const erro = Number.isNaN(reais) || n < 0 ? "Digite um número válido." : reais > subtotal ? "Maior que o valor da compra." : reais > maximo ? `O máximo permitido é ${fmtMoeda(maximo)} (${limite}%).` : "";
    return (_jsx(Modal, { aberto: true, titulo: "Desconto na compra", largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [atual.valor && _jsx("button", { className: "btn-secundario mr-auto", onClick: () => onAplicar({ tipo: "valor", valor: "" }), children: "Remover desconto" }), _jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Cancelar" }), _jsx("button", { className: "btn-acao", form: "form-desconto", disabled: Boolean(erro), children: "Aplicar" })] }), children: _jsxs("form", { id: "form-desconto", className: "space-y-4", onSubmit: (e) => { e.preventDefault(); if (!erro)
                onAplicar({ tipo, valor }); }, children: [_jsx("div", { className: "grid grid-cols-2 gap-2", children: ["valor", "percentual"].map((t) => (_jsx("button", { type: "button", onClick: () => setTipo(t), className: `rounded-lg border-2 p-2 text-sm font-semibold ${tipo === t ? "border-petroleo-500 bg-petroleo-50 text-petroleo-800" : "border-slate-200"}`, children: t === "valor" ? "Em reais (R$)" : "Em porcentagem (%)" }, t))) }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "desc", children: tipo === "valor" ? "Valor do desconto (R$)" : "Porcentagem (%)" }), _jsx("input", { id: "desc", className: "campo text-xl font-bold", inputMode: "decimal", value: valor, onChange: (e) => setValor(e.target.value), autoFocus: true, placeholder: "0" })] }), _jsxs("div", { className: "rounded-lg bg-slate-50 p-3 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: fmtMoeda(subtotal) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Desconto" }), _jsxs("span", { children: ["\u2212 ", fmtMoeda(Number.isNaN(reais) ? 0 : reais)] })] }), _jsxs("div", { className: "flex justify-between font-bold", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmtMoeda(Math.max(0, subtotal - (Number.isNaN(reais) ? 0 : reais))) })] })] }), limite < 100 && _jsxs("p", { className: "text-xs text-slate-500", children: ["Limite para operador: ", limite, "% da compra."] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }) }));
}
function JanelaPagamento({ teclas, caixa, total, itens, desconto, onConcluida, onFechar }) {
    const [pags, setPags] = useState([]);
    const [forma, setForma] = useState("dinheiro");
    // Pix e crediário mostram mais coisas embaixo: rola a janela para elas ficarem à vista.
    useEffect(() => {
        if (forma !== "pix" && forma !== "crediario")
            return;
        const t = setTimeout(() => document.getElementById("pag-extra")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
        return () => clearTimeout(t);
    }, [forma]);
    const [valor, setValor] = useState(String(total).replace(".", ","));
    const [cliente, setCliente] = useState("");
    const [telefone, setTelefone] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const campoValor = useRef(null);
    const [calc, setCalc] = useState(false);
    const { tem0006, config: cfgLoja, ehAdmin: admin, perfil: eu } = useAuth();
    const [credCliente, setCredCliente] = useState(null);
    const [credParcelas, setCredParcelas] = useState(1);
    const [credPrimeiro, setCredPrimeiro] = useState(hojeISO(30));
    const [credJuros, setCredJuros] = useState("");
    // Juros opcionais: vazio = sem juros. Aplicados uma vez sobre o valor parcelado.
    const jurosNum = credJuros.trim() ? lerNumero(credJuros) : 0;
    const jurosValido = !Number.isNaN(jurosNum) && jurosNum >= 0 && jurosNum <= 100;
    const pago = centavos(pags.reduce((s, p) => s + p.valor, 0));
    const falta = centavos(Math.max(0, total - pago));
    const troco = centavos(Math.max(0, pago - total));
    const dinheiro = centavos(pags.filter((p) => p.forma === "dinheiro").reduce((s, p) => s + p.valor, 0));
    const temFiado = pags.some((p) => p.forma === "fiado") || forma === "fiado";
    useEffect(() => { setValor(falta > 0 ? String(falta).replace(".", ",") : ""); }, [falta]);
    function escolherForma(f) {
        if (f === "crediario" && !tem0006) {
            setErro("O crediário precisa do SQL 0006 no Supabase. Peça ao administrador.");
            return;
        }
        setForma(f);
        setErro("");
        setTimeout(() => campoValor.current?.select(), 30);
    }
    useAtalhos(teclas, {
        ...Object.fromEntries(FORMAS.map((f) => [`pag_${f}`, () => escolherForma(f)])),
        pag_exato: () => { setValor(falta > 0 ? String(falta).replace(".", ",") : ""); setTimeout(() => campoValor.current?.select(), 30); },
        pag_calculadora: () => (calc ? ativarCalculadora() : setCalc(true)),
    }, !enviando);
    function validarNovo(f, v) {
        if (Number.isNaN(v) || v <= 0)
            return "Digite um valor maior que zero.";
        if (f !== "dinheiro" && centavos(pago - dinheiro + v) > total)
            return `${NOME_FORMA[f]} não pode passar do valor que falta (${fmtMoeda(falta)}). Troco só em dinheiro.`;
        return "";
    }
    function adicionar() {
        const v = centavos(lerNumero(valor));
        const e = validarNovo(forma, v);
        if (e) {
            setErro(e);
            return null;
        }
        let novo = { forma, valor: v };
        if (forma === "crediario") {
            if (pags.some((p) => p.forma === "crediario")) {
                setErro("Use apenas um pagamento em crediário por venda.");
                return null;
            }
            if (!credCliente) {
                setErro("Escolha ou cadastre o cliente do crediário.");
                return null;
            }
            if (credPrimeiro < hojeISO()) {
                setErro("O primeiro vencimento não pode ser uma data passada.");
                return null;
            }
            if (!jurosValido) {
                setErro("Juros inválido: use um número de 0 a 100 (ex.: 5 ou 2,5).");
                return null;
            }
            novo = { forma, valor: v, cliente_id: credCliente.id, cliente_nome: credCliente.nome, parcelas: credParcelas, primeiro_vencimento: credPrimeiro,
                juros_percentual: centavos(jurosNum), total_com_juros: centavos(v * (1 + jurosNum / 100)) };
        }
        const novos = [...pags, novo];
        setPags(novos);
        setErro("");
        return novos;
    }
    async function finalizar(lista) {
        const p = centavos(lista.reduce((s, x) => s + x.valor, 0));
        if (p < total)
            return setErro(`Ainda falta ${fmtMoeda(total - p)}.`);
        if (lista.some((x) => x.forma === "fiado") && !cliente.trim())
            return setErro("Para vender fiado, informe o nome do cliente.");
        setEnviando(true);
        setErro("");
        try {
            // Grava PRIMEIRO neste computador (funciona sem internet); a fila envia ao servidor.
            const venda = await finalizarVendaLocal({
                caixa, perfil: eu, ehAdmin: admin, config: cfgLoja, itens, desconto,
                pagamentos: lista.map(({ cliente_nome: _n, total_com_juros: _t, ...p }) => ({ ...p, cliente: p.forma === "crediario" ? credCliente : null })),
                clienteNome: cliente.trim() || null, clienteTelefone: telefone.trim() || null,
            });
            onConcluida(venda);
        }
        catch (e) {
            setErro(mensagemErro(e));
        }
        finally {
            setEnviando(false);
        }
    }
    async function aoConfirmar(e) {
        e.preventDefault();
        if (total === 0)
            return finalizar([]);
        // Enter com valor digitado: adiciona o pagamento; se já cobre o total, finaliza.
        if (falta > 0 && valor.trim()) {
            const novos = adicionar();
            if (novos && centavos(novos.reduce((s, x) => s + x.valor, 0)) >= total && !(novos.some((x) => x.forma === "fiado") && !cliente.trim())) {
                await finalizar(novos);
            }
            return;
        }
        await finalizar(pags);
    }
    return (_jsxs(Modal, { aberto: true, titulo: "Pagamento", largura: "lg", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, disabled: enviando, children: "Voltar" }), _jsx("button", { className: "btn-acao px-6", form: "form-pag", disabled: enviando, children: enviando ? "Finalizando…" : falta > 0 && total > 0 ? "Adicionar pagamento (Enter)" : "Finalizar venda (Enter)" })] }), children: [_jsxs("form", { id: "form-pag", onSubmit: aoConfirmar, className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-2 text-center", children: [_jsxs("div", { className: "rounded-lg bg-slate-100 p-3", children: [_jsx("p", { className: "text-xs text-slate-500", children: "Total" }), _jsx("p", { className: "text-xl font-bold", children: fmtMoeda(total) })] }), _jsxs("div", { className: "rounded-lg bg-slate-100 p-3", children: [_jsx("p", { className: "text-xs text-slate-500", children: "Pago" }), _jsx("p", { className: "text-xl font-bold", children: fmtMoeda(pago) })] }), troco > 0
                                ? _jsxs("div", { className: "rounded-lg bg-ok-100 p-3 text-ok-700", children: [_jsx("p", { className: "text-xs", children: "TROCO" }), _jsx("p", { className: "text-2xl font-extrabold", children: fmtMoeda(troco) })] })
                                : _jsxs("div", { className: `rounded-lg p-3 ${falta > 0 ? "bg-atencao-100 text-atencao-700" : "bg-ok-100 text-ok-700"}`, children: [_jsx("p", { className: "text-xs", children: "Falta" }), _jsx("p", { className: "text-xl font-bold", children: fmtMoeda(falta) })] })] }), total > 0 && falta > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-4", children: FORMAS.map((f) => (_jsxs("button", { type: "button", onClick: () => escolherForma(f), title: f === "crediario" && !tem0006 ? "Precisa do SQL 0006" : undefined, className: `rounded-lg border-2 px-2 py-2.5 text-sm font-semibold transition ${forma === f ? "border-acao-500 bg-orange-50 text-acao-700" : "border-slate-200 hover:bg-slate-50"} ${f === "crediario" && !tem0006 ? "opacity-40" : ""}`, children: [NOME_FORMA[f], teclas[`pag_${f}`] && _jsx("span", { className: "block text-[11px] font-normal text-slate-400", children: nomeTecla(teclas[`pag_${f}`]) })] }, f))) }), _jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "valor-pag", children: ["Valor em ", NOME_FORMA[forma].toLowerCase(), " ", forma === "dinheiro" && "(valor recebido do cliente)"] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { id: "valor-pag", ref: campoValor, className: "campo text-2xl font-bold", inputMode: "decimal", value: valor, onChange: (e) => { setValor(e.target.value); setErro(""); }, autoFocus: true, onFocus: (e) => e.target.select() }), _jsx("button", { type: "button", className: "btn-secundario shrink-0", onClick: () => (calc ? ativarCalculadora() : setCalc(true)), title: `Calculadora${rotulo(teclas, "pag_calculadora")}`, children: "\uD83E\uDDEE" })] }), forma === "dinheiro" && (_jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: [falta, 10, 20, 50, 100, 200].filter((v, i, a) => (i === 0 || v > falta) && a.indexOf(v) === i).map((v, i) => (_jsx("button", { type: "button", className: "btn-secundario btn-pequeno", onClick: () => setValor(String(v).replace(".", ",")), children: i === 0 ? `Exato ${fmtMoeda(v)}${rotulo(teclas, "pag_exato")}` : fmtMoeda(v) }, v))) })), forma === "dinheiro" && valor.trim() && !Number.isNaN(lerNumero(valor)) && lerNumero(valor) > falta && (_jsxs("p", { className: "mt-2 text-sm font-semibold text-ok-700", children: ["Troco previsto: ", fmtMoeda(centavos(lerNumero(valor) - falta))] })), (forma === "debito" || forma === "credito") && _jsx("p", { className: "mt-2 text-xs text-slate-500", children: "Passe o cart\u00E3o na maquininha e confirme aqui depois de aprovado." })] }), _jsxs("div", { id: "pag-extra", className: "space-y-3", children: [forma === "pix" && (() => {
                                        const v = centavos(lerNumero(valor));
                                        const codigo = !Number.isNaN(v) && v > 0 ? pixDaLoja(cfgLoja, v) : null;
                                        if (!pixDaLoja(cfgLoja)) {
                                            return _jsx(Aviso, { cor: "atencao", children: admin ? "Configure a chave Pix em Usuários e loja → Pix para recebimento para gerar o QR Code." : "O QR Code Pix ainda não foi configurado. Peça ao administrador." });
                                        }
                                        if (!codigo)
                                            return null;
                                        return (_jsxs("div", { className: "space-y-2", children: [_jsx(PixNaTela, { codigo: codigo, valor: v, recebedor: cfgLoja?.pix_nome, banco: cfgLoja?.pix_banco }), _jsxs("p", { className: "text-xs font-semibold text-atencao-700", children: ["\u26A0 Confira no app do banco que o Pix de ", fmtMoeda(v), " caiu antes de confirmar. N\u00E3o aceite s\u00F3 \u201Cprint\u201D de comprovante."] })] }));
                                    })(), forma === "crediario" && (_jsxs("div", { className: "space-y-3 rounded-lg border border-petroleo-200 bg-white p-3", children: [_jsx("p", { className: "text-sm font-semibold text-petroleo-800", children: "Credi\u00E1rio (parcelado)" }), _jsx(ClienteSeletor, { escolhido: credCliente, onEscolher: setCredCliente }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "cred-n", children: "Parcelas" }), _jsx("select", { id: "cred-n", className: "campo", value: credParcelas, onChange: (e) => setCredParcelas(Number(e.target.value)), children: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => _jsxs("option", { value: n, children: [n, "x"] }, n)) })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "cred-d", children: "1\u00BA vencimento" }), _jsx("input", { id: "cred-d", type: "date", className: "campo", value: credPrimeiro, min: hojeISO(), onChange: (e) => setCredPrimeiro(e.target.value) })] }), _jsxs("div", { className: "col-span-2 sm:col-span-1", children: [_jsxs("label", { className: "rotulo", htmlFor: "cred-j", children: ["Juros (%) ", _jsx("span", { className: "font-normal text-slate-400", children: "\u2014 opcional" })] }), _jsx("input", { id: "cred-j", className: `campo ${jurosValido ? "" : "campo-erro"}`, inputMode: "decimal", placeholder: "0 = sem juros", value: credJuros, onChange: (e) => { setCredJuros(e.target.value); setErro(""); } })] })] }), (() => {
                                                const v = centavos(lerNumero(valor));
                                                if (Number.isNaN(v) || v <= 0)
                                                    return null;
                                                const j = jurosValido ? jurosNum : 0;
                                                const comJuros = centavos(v * (1 + j / 100));
                                                return (_jsxs(_Fragment, { children: [j > 0 && (_jsxs("div", { className: "grid grid-cols-3 gap-2 rounded-lg bg-atencao-50 p-2 text-center text-xs", children: [_jsxs("div", { children: [_jsx("p", { className: "text-slate-500", children: "Valor parcelado" }), _jsx("p", { className: "font-semibold", children: fmtMoeda(v) })] }), _jsxs("div", { children: [_jsxs("p", { className: "text-slate-500", children: ["Juros (", String(j).replace(".", ","), "%)"] }), _jsxs("p", { className: "font-semibold text-acao-700", children: ["+ ", fmtMoeda(comJuros - v)] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-slate-500", children: "Total a pagar" }), _jsx("p", { className: "text-base font-bold", children: fmtMoeda(comJuros) })] })] })), _jsx("ul", { className: "grid gap-1 text-xs text-slate-600 sm:grid-cols-2", children: dividirParcelas(comJuros, credParcelas).map((x, i) => (_jsxs("li", { className: "flex justify-between rounded bg-slate-50 px-2 py-1", children: [_jsxs("span", { children: [i + 1, "/", credParcelas, " \u00B7 ", fmtData(somarMeses(credPrimeiro, i))] }), _jsx("strong", { children: fmtMoeda(x) })] }, i))) })] }));
                                            })()] }))] })] })), pags.length > 0 && (_jsx("ul", { className: "divide-y divide-slate-100 rounded-lg border border-slate-200", children: pags.map((p, i) => (_jsxs("li", { className: "flex items-center justify-between px-3 py-2 text-sm", children: [_jsxs("span", { children: [NOME_FORMA[p.forma], p.forma === "crediario" && _jsxs("span", { className: "text-xs text-slate-500", children: [" \u00B7 ", p.parcelas, "x \u00B7 ", p.cliente_nome, p.juros_percentual ? ` · juros ${String(p.juros_percentual).replace(".", ",")}% = ${fmtMoeda(p.total_com_juros ?? p.valor)}` : ""] })] }), _jsxs("span", { className: "flex items-center gap-3", children: [_jsx("strong", { children: fmtMoeda(p.valor) }), _jsx("button", { type: "button", className: "text-slate-400 hover:text-critico-600", "aria-label": "Remover pagamento", onClick: () => setPags(pags.filter((_, n) => n !== i)), children: "\u2715" })] })] }, i))) })), temFiado && (_jsxs("div", { className: "grid gap-3 rounded-lg border border-atencao-500 bg-atencao-50 p-3 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "cli", children: ["Nome do cliente (fiado) ", _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("input", { id: "cli", className: "campo", value: cliente, onChange: (e) => setCliente(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "tel", children: "Telefone" }), _jsx("input", { id: "tel", className: "campo", inputMode: "tel", value: telefone, onChange: (e) => setTelefone(e.target.value) })] })] })), erro && _jsx(Aviso, { cor: "critico", children: erro })] }), calc && (_jsx(Calculadora, { onFechar: () => { setCalc(false); setTimeout(() => campoValor.current?.select(), 30); }, onUsar: (v) => { setValor(String(v).replace(".", ",")); setCalc(false); setErro(""); setTimeout(() => campoValor.current?.select(), 30); }, textoUsar: "Usar como valor" }))] }));
}
/* ----------------------- Sangria / Suprimento ----------------------- */
function JanelaSangria({ tipo, caixa, onFechar }) {
    const { perfil } = useAuth();
    const avisar = useToast();
    const [valor, setValor] = useState("");
    const [obs, setObs] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const titulo = tipo === "sangria" ? "Sangria (retirar dinheiro do caixa)" : "Suprimento (colocar dinheiro para troco)";
    async function salvar(e) {
        e.preventDefault();
        const n = lerNumero(valor);
        if (Number.isNaN(n) || n <= 0)
            return setErro("Digite um valor maior que zero.");
        setEnviando(true);
        let error = null;
        try {
            await movimentarCaixaLocal({ caixa, perfil: perfil, tipo, valor: n, observacao: obs.trim() || null });
        }
        catch (e) {
            error = e;
        }
        setEnviando(false);
        if (error)
            return setErro(mensagemErro(error));
        avisar("sucesso", `${tipo === "sangria" ? "Sangria" : "Suprimento"} de ${fmtMoeda(n)} registrado.`);
        onFechar();
    }
    return (_jsx(Modal, { aberto: true, titulo: titulo, largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Cancelar" }), _jsx("button", { className: "btn-primario", form: "form-sangria", disabled: enviando, children: enviando ? "Salvando…" : "Confirmar" })] }), children: _jsxs("form", { id: "form-sangria", onSubmit: salvar, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "v-sang", children: "Valor (R$)" }), _jsx("input", { id: "v-sang", className: "campo text-xl font-bold", inputMode: "decimal", value: valor, onChange: (e) => setValor(e.target.value), autoFocus: true })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "o-sang", children: "Motivo" }), _jsx("input", { id: "o-sang", className: "campo", value: obs, onChange: (e) => setObs(e.target.value), placeholder: tipo === "sangria" ? "Ex.: depósito no banco" : "Ex.: moedas para troco" })] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }) }));
}
/* ---------------------------- Fechamento ---------------------------- */
function JanelaFechamento({ caixa, onCancelar, onFechado }) {
    const { config, perfil, valoresOcultos } = useAuth();
    const avisar = useToast();
    const [resumo, setResumo] = useState(null);
    const [contado, setContado] = useState("");
    const [obs, setObs] = useState("");
    const [erro, setErro] = useState("");
    const [confirmando, setConfirmando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [fechado, setFechado] = useState(null);
    const [parcial, setParcial] = useState(false);
    useEffect(() => {
        // Resumo calculado neste computador (funciona sem internet).
        resumoCaixaLocal(caixa).then((r) => setResumo(valoresOcultos ? mascarar(r) : r)).catch((e) => setErro(mensagemErro(e)));
    }, [caixa, valoresOcultos]);
    const n = lerNumero(contado);
    const cego = Boolean(resumo?.oculto);
    const diferenca = resumo && !cego && !Number.isNaN(n) ? centavos(n - resumo.dinheiro_esperado) : null;
    async function fechar() {
        setEnviando(true);
        let data;
        try {
            data = await fecharCaixaLocal({ caixa, perfil: perfil, valorContado: n, observacao: obs.trim() || null });
        }
        catch (e) {
            setEnviando(false);
            setConfirmando(false);
            return setErro(mensagemErro(e));
        }
        setEnviando(false);
        setConfirmando(false);
        try {
            sessionStorage.removeItem(chaveCarrinho(caixa.id));
            localStorage.removeItem(chaveCarrinho(caixa.id));
        }
        catch { /* ignora */ }
        avisar("sucesso", `${nomeCaixa(caixa)} fechado.`);
        setFechado(valoresOcultos && data.resumo ? { ...data, valor_esperado: null, diferenca: null, resumo: mascarar(data.resumo) } : data);
    }
    if (fechado?.resumo) {
        return (_jsx(JanelaComprovante, { titulo: `${nomeCaixa(fechado)} fechado`, onFechar: onFechado, children: (l) => _jsx(CupomFechamento, { r: fechado.resumo, config: config, largura: l, contado: fechado.valor_contado, diferenca: fechado.diferenca, observacao: fechado.observacao_fechamento }) }));
    }
    if (parcial && resumo) {
        return (_jsx(JanelaComprovante, { titulo: "Resumo parcial", onFechar: () => setParcial(false), children: (l) => _jsx(CupomFechamento, { r: resumo, config: config, largura: l }) }));
    }
    const linha = (r, v, forte = false) => (_jsxs("div", { className: `flex justify-between py-1 text-sm ${forte ? "font-bold" : ""}`, children: [_jsx("span", { children: r }), _jsx("span", { children: fmtMoeda(v) })] }));
    return (_jsxs(Modal, { aberto: true, titulo: `Fechar caixa nº ${caixa.id}`, largura: "lg", onFechar: onCancelar, rodape: _jsxs(_Fragment, { children: [!cego && _jsx("button", { className: "btn-secundario mr-auto", disabled: !resumo, onClick: () => setParcial(true), children: "\uD83D\uDDA8 Resumo parcial" }), _jsx("button", { className: "btn-secundario", onClick: onCancelar, children: "Voltar" }), _jsx("button", { className: "btn-perigo", disabled: !resumo || Number.isNaN(n) || n < 0, onClick: () => { setErro(""); setConfirmando(true); }, children: "Fechar caixa" })] }), children: [!resumo ? (erro ? _jsx(Aviso, { cor: "critico", children: erro }) : _jsx(Carregando, {})) : cego ? (_jsxs("div", { className: "mx-auto max-w-sm space-y-4", children: [_jsxs(Aviso, { cor: "petroleo", children: [_jsx("strong", { children: "Fechamento cego:" }), " conte todo o dinheiro da gaveta e digite o valor. A confer\u00EAncia com o sistema \u00E9 feita pelo administrador."] }), _jsxs("p", { className: "text-sm text-slate-500", children: [resumo.qtd_vendas, " venda(s) neste caixa", resumo.qtd_canceladas > 0 && ` · ${resumo.qtd_canceladas} cancelada(s)`, "."] }), _jsxs("div", { children: [_jsxs("label", { className: "rotulo", htmlFor: "contado", children: ["Dinheiro contado na gaveta (R$) ", _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("input", { id: "contado", className: "campo text-xl font-bold", inputMode: "decimal", value: contado, onChange: (e) => setContado(e.target.value), autoFocus: true })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "obs-f", children: "Observa\u00E7\u00E3o" }), _jsx("input", { id: "obs-f", className: "campo", value: obs, onChange: (e) => setObs(e.target.value), placeholder: "Ex.: moedas separadas em saquinho" })] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] })) : (_jsxs("div", { className: "grid gap-5 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("h3", { className: "mb-2 font-semibold", children: "Vendas" }), _jsxs("p", { className: "text-sm text-slate-500", children: [resumo.qtd_vendas, " venda(s)", resumo.qtd_canceladas > 0 && ` · ${resumo.qtd_canceladas} cancelada(s)`] }), linha("Descontos dados", resumo.descontos), linha("Total vendido", resumo.total_vendas, true), _jsx("h3", { className: "mb-1 mt-3 font-semibold", children: "Por forma de pagamento" }), Object.keys(resumo.por_forma).length === 0 ? _jsx("p", { className: "text-sm text-slate-400", children: "Nenhuma venda." })
                                : Object.entries(resumo.por_forma).map(([f, v]) => _jsx("div", { children: linha(NOME_FORMA[f] ?? f, Number(v)) }, f)), resumo.recebimentos_fiado > 0 && linha("Fiados recebidos", resumo.recebimentos_fiado), Number(resumo.recebimentos_crediario ?? 0) > 0 && linha("Parcelas recebidas", Number(resumo.recebimentos_crediario))] }), _jsxs("div", { children: [_jsx("h3", { className: "mb-2 font-semibold", children: "Dinheiro na gaveta" }), linha("Abertura", resumo.valor_abertura), linha("+ Vendas em dinheiro", Number(resumo.por_forma.dinheiro ?? 0)), linha("− Trocos dados", resumo.trocos), linha("+ Suprimentos", resumo.suprimentos), resumo.recebimentos_fiado_dinheiro > 0 && linha("+ Fiado recebido", resumo.recebimentos_fiado_dinheiro), Number(resumo.recebimentos_crediario_dinheiro ?? 0) > 0 && linha("+ Parcelas recebidas", Number(resumo.recebimentos_crediario_dinheiro)), linha("− Sangrias", resumo.sangrias), _jsx("div", { className: "mt-1 border-t border-slate-200 pt-1", children: linha("= Esperado na gaveta", resumo.dinheiro_esperado, true) }), _jsxs("div", { className: "mt-4", children: [_jsxs("label", { className: "rotulo", htmlFor: "contado", children: ["Dinheiro contado na gaveta (R$) ", _jsx("span", { className: "text-critico-600", children: "*" })] }), _jsx("input", { id: "contado", className: "campo text-xl font-bold", inputMode: "decimal", value: contado, onChange: (e) => setContado(e.target.value), autoFocus: true })] }), diferenca !== null && contado.trim() && (_jsx("p", { className: `mt-2 rounded-lg p-2 text-sm font-semibold ${diferenca === 0 ? "bg-ok-100 text-ok-700" : "bg-atencao-100 text-atencao-700"}`, children: diferenca === 0 ? "Caixa conferido: sem diferença." : diferenca > 0 ? `Sobra de ${fmtMoeda(diferenca)}` : `Falta de ${fmtMoeda(-diferenca)}` })), _jsxs("div", { className: "mt-3", children: [_jsx("label", { className: "rotulo", htmlFor: "obs-f", children: "Observa\u00E7\u00E3o" }), _jsx("input", { id: "obs-f", className: "campo", value: obs, onChange: (e) => setObs(e.target.value), placeholder: "Ex.: falta de R$ 2 em moedas" })] })] }), erro && _jsx("div", { className: "sm:col-span-2", children: _jsx(Aviso, { cor: "critico", children: erro }) })] })), _jsx(Confirmar, { aberto: confirmando, titulo: "Confirmar fechamento?", processando: enviando, textoConfirmar: "Fechar caixa", perigo: true, onCancelar: () => setConfirmando(false), onConfirmar: fechar, mensagem: _jsxs("p", { children: ["Depois de fechado, o caixa n\u00BA ", caixa.id, " n\u00E3o recebe mais vendas. Contado: ", _jsx("strong", { children: fmtMoeda(Number.isNaN(n) ? 0 : n) }), "."] }) })] }));
}
/* ------------------------ Lista de atalhos ------------------------ */
function JanelaAtalhos({ teclas, onFechar }) {
    const grupo = (ctx, titulo) => (_jsxs("div", { children: [_jsx("h3", { className: "mb-2 font-semibold", children: titulo }), _jsxs("ul", { className: "divide-y divide-slate-100 rounded-lg border border-slate-200", children: [ACOES.filter((a) => a.contexto === ctx && teclas[a.id]).map((a) => (_jsxs("li", { className: "flex items-center justify-between gap-3 px-3 py-2 text-sm", children: [_jsx("span", { children: a.nome }), _jsx("kbd", { className: "rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold shadow-sm", children: nomeTecla(teclas[a.id]) })] }, a.id))), _jsxs("li", { className: "flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-500", children: [_jsx("span", { children: "Confirmar" }), _jsx("kbd", { className: "rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs", children: "Enter" })] }), _jsxs("li", { className: "flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-500", children: [_jsx("span", { children: "Fechar janela / voltar" }), _jsx("kbd", { className: "rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs", children: "Esc" })] })] })] }));
    return (_jsxs(Modal, { aberto: true, titulo: "Teclas de atalho", largura: "lg", onFechar: onFechar, rodape: _jsx("button", { className: "btn-primario", onClick: onFechar, children: "Entendi" }), children: [_jsxs("div", { className: "grid gap-5 sm:grid-cols-2", children: [grupo("caixa", "Na tela do caixa"), grupo("pagamento", "Na janela de pagamento")] }), _jsxs("p", { className: "mt-4 text-xs text-slate-500", children: ["O administrador muda essas teclas em ", _jsx("strong", { children: "Teclado do caixa" }), "."] })] }));
}
/* ------------------------ Item avulso (sem cadastro) ------------------------ */
function JanelaAvulso({ onAdicionar, onFechar }) {
    const [descricao, setDescricao] = useState("");
    const [preco, setPreco] = useState("");
    const [qtd, setQtd] = useState("1");
    const [erro, setErro] = useState("");
    const [calc, setCalc] = useState(false);
    const campoPreco = useRef(null);
    const p = lerNumero(preco);
    const q = lerNumero(qtd);
    const total = !Number.isNaN(p) && !Number.isNaN(q) ? centavos(p * q) : null;
    function confirmar(e) {
        e.preventDefault();
        if (Number.isNaN(p) || p <= 0)
            return setErro("Digite o preço (maior que zero). Ex.: 12,50");
        if (p > 100000)
            return setErro("Preço muito alto. Confira o valor.");
        if (Number.isNaN(q) || q <= 0)
            return setErro("Digite a quantidade (maior que zero). Ex.: 1 ou 0,350");
        onAdicionar(descricao.trim() || "Item avulso", centavos(p), Math.round(q * 1000) / 1000);
    }
    return (_jsxs(Modal, { aberto: true, titulo: "Digite o produto (sem cadastro)", largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Cancelar" }), _jsx("button", { className: "btn-acao", form: "form-avulso", children: "Adicionar \u00E0 compra (Enter)" })] }), children: [_jsxs("form", { id: "form-avulso", onSubmit: confirmar, className: "space-y-4", children: [_jsx("p", { className: "text-sm text-slate-500", children: "Para produto que n\u00E3o est\u00E1 cadastrado ou est\u00E1 sem c\u00F3digo. Entra na venda e no comprovante, mas n\u00E3o mexe no estoque." }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "av-desc", children: "Descri\u00E7\u00E3o" }), _jsx("input", { id: "av-desc", className: "campo", value: descricao, onChange: (e) => setDescricao(e.target.value), maxLength: 120, autoFocus: true, placeholder: "Ex.: Bolo caseiro, verdura, saco de gelo" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "av-preco", children: "Pre\u00E7o unit\u00E1rio (R$)" }), _jsxs("div", { className: "flex gap-1", children: [_jsx("input", { id: "av-preco", ref: campoPreco, className: "campo min-w-0 text-lg font-bold", inputMode: "decimal", value: preco, onChange: (e) => { setPreco(e.target.value); setErro(""); }, placeholder: "0,00" }), _jsx("button", { type: "button", className: "btn-secundario shrink-0 px-3", title: "Calculadora", onClick: () => (calc ? ativarCalculadora() : setCalc(true)), children: "\uD83E\uDDEE" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "av-qtd", children: "Quantidade" }), _jsx("input", { id: "av-qtd", className: "campo text-lg font-bold", inputMode: "decimal", value: qtd, onChange: (e) => { setQtd(e.target.value); setErro(""); } })] })] }), _jsxs("div", { className: "rounded-lg bg-slate-50 p-3 text-sm", children: ["Total do item: ", _jsx("strong", { className: "text-lg", children: total !== null && total > 0 ? fmtMoeda(total) : "—" }), _jsx("span", { className: "block text-xs text-slate-400", children: "Peso: use v\u00EDrgula, ex.: 0,350 kg \u00D7 pre\u00E7o do kg." })] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }), calc && (_jsx(Calculadora, { onFechar: () => { setCalc(false); setTimeout(() => campoPreco.current?.select(), 30); }, onUsar: (v) => { setPreco(String(v).replace(".", ",")); setCalc(false); setErro(""); setTimeout(() => campoPreco.current?.select(), 30); }, textoUsar: "Usar como pre\u00E7o" }))] }));
}
