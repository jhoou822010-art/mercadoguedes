import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { doServidorOuLocal } from "../lib/local/fallback";
import { perfisLocal } from "../lib/local/consultas";
import { supabase, mensagemErro } from "../lib/supabase";
import { cnpjValido, fmtDataHora, lerNumero, mascaraCnpj } from "../lib/format";
import { CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { larguraCupom, salvarLarguraCupom } from "../lib/imprimir";
import { reduzirImagem } from "../lib/imagem";
import { LOGO_PADRAO } from "../lib/marca";
import { montarPix, normalizarChave, NOME_TIPO_CHAVE } from "../lib/pix";
import { PixNaTela } from "../components/QrPix";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar, Modal } from "../components/Modal";
import { mostrarLogin } from "../lib/login";
import { Aviso, Cabecalho, Carregando, Selo } from "../components/Ui";
/** Venda fictícia usada só para mostrar a prévia do comprovante. */
const VENDA_EXEMPLO = {
    id: 1234, caixa_id: 1, usuario_id: null, usuario_nome: "Maria (exemplo)", status: "concluida",
    subtotal: 64.79, desconto: 4.79, total: 60, valor_pago: 100, troco: 40, cliente_nome: null, cliente_telefone: null,
    criado_em: new Date().toISOString(), cancelada_em: null, cancelada_por_nome: null, motivo_cancelamento: null,
    venda_itens: [
        { id: 1, venda_id: 1234, produto_id: null, produto_codigo: "001", produto_nome: "Arroz Tipo 1 5 kg", unidade: "UN", quantidade: 2, preco_unitario: 27.9, total: 55.8 },
        { id: 2, venda_id: 1234, produto_id: null, produto_codigo: "002", produto_nome: "Banana Prata", unidade: "KG", quantidade: 1.5, preco_unitario: 5.99, total: 8.99 },
    ],
    venda_pagamentos: [{ id: 1, venda_id: 1234, forma: "dinheiro", valor: 100, fiado_recebido_em: null, fiado_recebido_forma: null, fiado_recebido_por: null }],
};
const NOME_PAPEL = { admin: "Administrador", operador: "Operador", pendente: "Aguardando liberação" };
export default function Configuracoes() {
    const { perfil: eu, config, recarregar } = useAuth();
    const avisar = useToast();
    const [usuarios, setUsuarios] = useState(null);
    const [mudanca, setMudanca] = useState(null);
    const [novaSenhaDe, setNovaSenhaDe] = useState(null);
    const [processando, setProcessando] = useState(false);
    const [nomeLoja, setNomeLoja] = useState(config?.nome_loja ?? "");
    const [diasAlerta, setDiasAlerta] = useState(String(config?.dias_alerta_validade ?? 30));
    const [salvando, setSalvando] = useState(false);
    const [cnpj, setCnpj] = useState("");
    const [mostrarCnpj, setMostrarCnpj] = useState(true);
    const [endereco, setEndereco] = useState("");
    const [telefone, setTelefone] = useState("");
    const [mensagem, setMensagem] = useState("");
    const [descMax, setDescMax] = useState("100");
    const [logo, setLogo] = useState(null);
    const [logoNoComprovante, setLogoNoComprovante] = useState(true);
    const [processandoLogo, setProcessandoLogo] = useState(false);
    const [permitirAvulso, setPermitirAvulso] = useState(true);
    const [ocultarValores, setOcultarValores] = useState(false);
    const [pixTipo, setPixTipo] = useState("cnpj");
    const [pixChave, setPixChave] = useState("");
    const [pixNome, setPixNome] = useState("");
    const [pixCidade, setPixCidade] = useState("");
    const [pixBanco, setPixBanco] = useState("");
    const [pixNoComprovante, setPixNoComprovante] = useState(true);
    const [pixTeste, setPixTeste] = useState("1,00");
    const sem0006 = config !== null && config.ocultar_valores_operador === undefined;
    const semColunaAvulso = config !== null && config.permitir_item_avulso === undefined;
    // A coluna "logo" só existe depois de rodar o SQL 0004.
    const semColunaLogo = config !== null && config.logo === undefined;
    useEffect(() => {
        if (!config)
            return;
        setNomeLoja(config.nome_loja);
        setDiasAlerta(String(config.dias_alerta_validade));
        setCnpj(config.cnpj ?? "");
        setMostrarCnpj(config.mostrar_cnpj ?? true);
        setEndereco(config.endereco ?? "");
        setTelefone(config.telefone ?? "");
        setMensagem(config.mensagem_comprovante ?? "");
        setDescMax(String(config.desconto_maximo_percentual ?? 100).replace(".", ","));
        setLogo(config.logo ?? null);
        setLogoNoComprovante(config.logo_no_comprovante ?? true);
        setPermitirAvulso(config.permitir_item_avulso ?? true);
        setOcultarValores(config.ocultar_valores_operador ?? false);
        setPixTipo(config.pix_tipo || "cnpj");
        setPixChave(config.pix_chave ?? "");
        setPixNome(config.pix_nome ?? config.nome_loja ?? "");
        setPixCidade(config.pix_cidade ?? "");
        setPixBanco(config.pix_banco ?? "");
        setPixNoComprovante(config.pix_no_comprovante ?? true);
    }, [config]);
    async function escolherLogo(arquivo) {
        if (!arquivo)
            return;
        setProcessandoLogo(true);
        try {
            setLogo(await reduzirImagem(arquivo));
            avisar("info", "Logo carregada. Confira a prévia e clique em “Salvar”.");
        }
        catch (e) {
            avisar("erro", e instanceof Error ? e.message : String(e));
        }
        finally {
            setProcessandoLogo(false);
        }
    }
    const carregar = useCallback(async () => {
        const { data, error } = await doServidorOuLocal(() => supabase.from("perfis").select("*").order("criado_em"), perfisLocal);
        if (error)
            return avisar("erro", mensagemErro(error));
        setUsuarios(data);
    }, [avisar]);
    useEffect(() => { void carregar(); }, [carregar]);
    async function aplicarPapel() {
        if (!mudanca)
            return;
        setProcessando(true);
        const { error } = await supabase.rpc("definir_papel", { p_usuario: mudanca.u.id, p_papel: mudanca.papel });
        setProcessando(false);
        if (error)
            return avisar("erro", mensagemErro(error));
        avisar("sucesso", `${mudanca.u.nome} agora é ${NOME_PAPEL[mudanca.papel].toLowerCase()}.`);
        setMudanca(null);
        void carregar();
        if (mudanca.u.id === eu?.id)
            void recarregar();
    }
    async function salvarLoja(e) {
        e.preventDefault();
        const dias = Number(diasAlerta);
        if (!nomeLoja.trim())
            return avisar("erro", "Informe o nome da loja.");
        if (!Number.isInteger(dias) || dias < 1 || dias > 365)
            return avisar("erro", "Os dias de alerta devem ficar entre 1 e 365.");
        if (cnpj.trim() && !cnpjValido(cnpj))
            return avisar("erro", "CNPJ inválido. Confira os números.");
        if (!sem0006 && pixChave.trim()) {
            if (!normalizarChave(pixTipo, pixChave))
                return avisar("erro", `Chave Pix inválida para o tipo ${NOME_TIPO_CHAVE[pixTipo]}.`);
            if (!pixNome.trim() || !pixCidade.trim())
                return avisar("erro", "Para o Pix, preencha também o nome do recebedor e a cidade.");
        }
        const desc = lerNumero(descMax);
        if (Number.isNaN(desc) || desc < 0 || desc > 100)
            return avisar("erro", "O desconto máximo deve ficar entre 0 e 100%.");
        setSalvando(true);
        const { error } = await supabase.from("configuracoes").update({
            nome_loja: nomeLoja.trim(),
            dias_alerta_validade: dias,
            cnpj: cnpj.trim() || null,
            mostrar_cnpj: mostrarCnpj,
            endereco: endereco.trim() || null,
            telefone: telefone.trim() || null,
            mensagem_comprovante: mensagem.trim(),
            desconto_maximo_percentual: desc,
            ...(semColunaLogo ? {} : { logo, logo_no_comprovante: logoNoComprovante }),
            ...(semColunaAvulso ? {} : { permitir_item_avulso: permitirAvulso }),
            ...(sem0006 ? {} : {
                ocultar_valores_operador: ocultarValores,
                pix_tipo: pixChave.trim() ? pixTipo : null,
                pix_chave: pixChave.trim() || null,
                pix_nome: pixNome.trim() || null,
                pix_cidade: pixCidade.trim() || null,
                pix_banco: pixBanco.trim() || null,
                pix_no_comprovante: pixNoComprovante,
            }),
            atualizado_em: new Date().toISOString(),
        }).eq("id", 1);
        setSalvando(false);
        if (error)
            return avisar("erro", mensagemErro(error));
        avisar("sucesso", "Dados da loja salvos.");
        void recarregar();
    }
    // Configuração "ao vivo" com o que está digitado (ainda não salvo), para a prévia.
    const configPrevia = useMemo(() => ({
        id: 1,
        nome_loja: nomeLoja.trim() || "Nome da loja",
        dias_alerta_validade: Number(diasAlerta) || 30,
        atualizado_em: new Date().toISOString(),
        cnpj: cnpj.trim() || null,
        mostrar_cnpj: mostrarCnpj,
        endereco: endereco.trim() || null,
        telefone: telefone.trim() || null,
        mensagem_comprovante: mensagem.trim(),
        desconto_maximo_percentual: 100,
        logo,
        logo_no_comprovante: logoNoComprovante,
    }), [nomeLoja, diasAlerta, cnpj, mostrarCnpj, endereco, telefone, mensagem, logo, logoNoComprovante]);
    const [largura, setLargura] = useState(larguraCupom());
    const [teste, setTeste] = useState(false);
    const alterado = Boolean(config) && (nomeLoja !== config.nome_loja || cnpj !== (config.cnpj ?? "") || mostrarCnpj !== config.mostrar_cnpj ||
        endereco !== (config.endereco ?? "") || telefone !== (config.telefone ?? "") || mensagem !== (config.mensagem_comprovante ?? "") ||
        (!semColunaLogo && (logo !== (config.logo ?? null) || logoNoComprovante !== (config.logo_no_comprovante ?? true))));
    const pendentes = usuarios?.filter((u) => u.papel === "pendente").length ?? 0;
    return (_jsxs("div", { children: [_jsx(Cabecalho, { titulo: "Usu\u00E1rios e loja", descricao: "Libere acessos, defina pap\u00E9is e ajuste os dados da loja." }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsxs("form", { onSubmit: salvarLoja, className: "cartao space-y-4 p-5", children: [_jsx("h2", { className: "font-semibold", children: "Dados da loja" }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "nl", children: "Nome da loja" }), _jsx("input", { id: "nl", className: "campo", value: nomeLoja, onChange: (e) => setNomeLoja(e.target.value), maxLength: 80 }), _jsx("p", { className: "mt-1 text-xs text-slate-400", children: "Aparece no topo do menu, na aba do navegador, nas etiquetas, nos relat\u00F3rios e no comprovante." })] }), _jsxs("div", { children: [_jsx("span", { className: "rotulo", children: "Logo da loja" }), semColunaLogo ? (_jsxs(Aviso, { cor: "atencao", children: ["A logo do sistema j\u00E1 aparece no menu e no comprovante. Para trocar a logo por esta tela, rode antes o arquivo ", _jsx("code", { children: "supabase/migrations/0004_logo_loja.sql" }), " no SQL Editor do Supabase."] })) : (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50", children: _jsx("img", { src: logo || LOGO_PADRAO, alt: "Logo da loja", className: "h-full w-full object-contain p-1" }) }), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "btn-secundario btn-pequeno cursor-pointer", children: [processandoLogo ? "Processando…" : logo ? "Trocar logo" : "Enviar logo", _jsx("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", className: "sr-only", disabled: processandoLogo, onChange: (e) => { void escolherLogo(e.target.files?.[0]); e.target.value = ""; } })] }), logo && _jsx("button", { type: "button", className: "ml-2 text-xs font-semibold text-critico-600 hover:underline", onClick: () => setLogo(null), children: "Remover" }), _jsxs("p", { className: "text-xs text-slate-400", children: [logo ? "Logo enviada por você." : "Usando a logo que já vem no sistema.", " PNG, JPG ou WEBP; o sistema reduz o tamanho sozinho."] })] })] }))] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "da", children: "Avisar validade com quantos dias de anteced\u00EAncia?" }), _jsx("input", { id: "da", className: "campo", inputMode: "numeric", value: diasAlerta, onChange: (e) => setDiasAlerta(e.target.value) })] }), _jsx("h3", { className: "border-t border-slate-100 pt-4 font-semibold", children: "Comprovante n\u00E3o fiscal" }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "cnpj", children: "CNPJ" }), _jsx("input", { id: "cnpj", className: "campo", inputMode: "numeric", value: cnpj, onChange: (e) => setCnpj(mascaraCnpj(e.target.value)), placeholder: "00.000.000/0000-00" }), cnpj.replace(/\D/g, "").length === 14 && !cnpjValido(cnpj) && _jsx("p", { className: "mt-1 text-xs text-critico-600", children: "CNPJ inv\u00E1lido." })] }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-petroleo-700", checked: mostrarCnpj, onChange: (e) => setMostrarCnpj(e.target.checked) }), "Mostrar o CNPJ no comprovante"] }), !semColunaLogo && (_jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-petroleo-700", checked: logoNoComprovante, onChange: (e) => setLogoNoComprovante(e.target.checked) }), "Mostrar a logo no comprovante (sai em preto e branco)"] })), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "end", children: "Endere\u00E7o" }), _jsx("input", { id: "end", className: "campo", value: endereco, onChange: (e) => setEndereco(e.target.value), maxLength: 120, placeholder: "Rua, n\u00FAmero, bairro, cidade" })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "telj", children: "Telefone" }), _jsx("input", { id: "telj", className: "campo", inputMode: "tel", value: telefone, onChange: (e) => setTelefone(e.target.value), maxLength: 30 })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "msg", children: "Mensagem no rodap\u00E9" }), _jsx("input", { id: "msg", className: "campo", value: mensagem, onChange: (e) => setMensagem(e.target.value), maxLength: 120 })] }), _jsx("h3", { className: "border-t border-slate-100 pt-4 font-semibold", children: "Pix para recebimento" }), sem0006 ? (_jsxs("p", { className: "text-xs text-slate-500", children: ["Rode o SQL ", _jsx("code", { children: "0006_crediario_clientes_ocultar.sql" }), " no Supabase para configurar o Pix."] })) : (_jsxs("div", { className: "space-y-3", children: [_jsxs("p", { className: "text-xs text-slate-500", children: ["O QR Code \u00E9 gerado com a chave abaixo e o valor da compra. O dinheiro cai ", _jsx("strong", { children: "direto na conta do recebedor" }), ", sem taxa. A balconista confere no app do banco antes de confirmar a venda."] }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "pix-tipo", children: "Tipo de chave" }), _jsx("select", { id: "pix-tipo", className: "campo", value: pixTipo, onChange: (e) => setPixTipo(e.target.value), children: Object.keys(NOME_TIPO_CHAVE).map((t) => _jsx("option", { value: t, children: NOME_TIPO_CHAVE[t] }, t)) })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "rotulo", htmlFor: "pix-chave", children: "Chave Pix" }), _jsx("input", { id: "pix-chave", className: `campo ${pixChave.trim() && !normalizarChave(pixTipo, pixChave) ? "campo-erro" : ""}`, value: pixChave, onChange: (e) => setPixChave(e.target.value), placeholder: pixTipo === "telefone" ? "(11) 98888-7777" : pixTipo === "email" ? "pix@loja.com.br" : pixTipo === "cpf" ? "000.000.000-00" : pixTipo === "cnpj" ? "00.000.000/0000-00" : "chave aleatória" }), pixChave.trim() && !normalizarChave(pixTipo, pixChave) && _jsxs("p", { className: "mt-1 text-xs text-critico-600", children: ["Chave inv\u00E1lida para ", NOME_TIPO_CHAVE[pixTipo], "."] })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "pix-nome", children: "Nome do recebedor" }), _jsx("input", { id: "pix-nome", className: "campo", value: pixNome, onChange: (e) => setPixNome(e.target.value), maxLength: 60 }), _jsx("p", { className: "mt-1 text-xs text-slate-400", children: "Como est\u00E1 no banco (at\u00E9 25 letras no QR)." })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "pix-cidade", children: "Cidade" }), _jsx("input", { id: "pix-cidade", className: "campo", value: pixCidade, onChange: (e) => setPixCidade(e.target.value), maxLength: 40 })] })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "pix-banco", children: "Banco / conta (opcional, s\u00F3 para controle)" }), _jsx("input", { id: "pix-banco", className: "campo", value: pixBanco, onChange: (e) => setPixBanco(e.target.value), maxLength: 60, placeholder: "Ex.: Banco do Brasil ag. 1234, Nubank, Sicredi\u2026" })] }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-petroleo-700", checked: pixNoComprovante, onChange: (e) => setPixNoComprovante(e.target.checked) }), "Imprimir o QR Pix no comprovante, extrato e carn\u00EA"] }), (() => {
                                        const chave = normalizarChave(pixTipo, pixChave);
                                        if (!chave || !pixNome.trim() || !pixCidade.trim())
                                            return _jsx("p", { className: "text-xs text-slate-400", children: "Preencha chave, nome e cidade para ver o QR de teste." });
                                        const v = lerNumero(pixTeste);
                                        const codigo = montarPix({ chave, nome: pixNome, cidade: pixCidade, valor: Number.isNaN(v) ? undefined : v, txid: "TESTE" });
                                        return (_jsxs("div", { className: "space-y-2 rounded-lg bg-slate-50 p-3", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx("span", { className: "font-semibold", children: "Teste:" }), " pague", _jsx("input", { className: "campo w-24 py-1 text-sm", inputMode: "decimal", value: pixTeste, onChange: (e) => setPixTeste(e.target.value), "aria-label": "Valor do teste" }), "com o app do seu banco e confira se o nome e a conta est\u00E3o certos."] }), _jsx(PixNaTela, { codigo: codigo, valor: Number.isNaN(v) ? undefined : v, recebedor: pixNome, banco: pixBanco })] }));
                                    })()] })), _jsx("h3", { className: "border-t border-slate-100 pt-4 font-semibold", children: "Caixa" }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "dmax", children: "Desconto m\u00E1ximo que o operador pode dar (%)" }), _jsx("input", { id: "dmax", className: "campo", inputMode: "decimal", value: descMax, onChange: (e) => setDescMax(e.target.value) }), _jsx("p", { className: "mt-1 text-xs text-slate-400", children: "100 = sem limite. O administrador nunca tem limite." })] }), semColunaAvulso ? (_jsxs("p", { className: "text-xs text-slate-500", children: ["\u201CDigite o produto\u201D no caixa: rode o SQL ", _jsx("code", { children: "0005_item_avulso.sql" }), " no Supabase para ativar."] })) : (_jsxs("label", { className: "flex items-start gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "mt-0.5 h-4 w-4 accent-petroleo-700", checked: permitirAvulso, onChange: (e) => setPermitirAvulso(e.target.checked) }), _jsxs("span", { children: ["Operador pode usar ", _jsx("strong", { children: "\u201CDigite o produto\u201D" }), " (item sem cadastro) no caixa", _jsx("span", { className: "block text-xs text-slate-400", children: "A balconista digita descri\u00E7\u00E3o e pre\u00E7o. O administrador sempre pode." })] })] })), sem0006 ? (_jsxs("p", { className: "text-xs text-slate-500", children: ["Ocultar valores / fechamento cego: rode o SQL ", _jsx("code", { children: "0006_crediario_clientes_ocultar.sql" }), " no Supabase para ativar."] })) : (_jsxs("label", { className: "flex items-start gap-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "mt-0.5 h-4 w-4 accent-petroleo-700", checked: ocultarValores, onChange: (e) => setOcultarValores(e.target.checked) }), _jsxs("span", { children: [_jsx("strong", { children: "Ocultar valores das vendas" }), " para operadores (fechamento cego)", _jsx("span", { className: "block text-xs text-slate-400", children: "As balconistas n\u00E3o veem \u201CVendas de hoje\u201D, \u201CA receber\u201D, os totais de vendas nem o valor esperado do caixa: no fechamento s\u00F3 digitam o que contaram. O administrador sempre v\u00EA tudo." })] })] })), _jsx("button", { className: "btn-primario w-full", disabled: salvando, children: salvando ? "Salvando…" : "Salvar" })] }), _jsxs("section", { className: "cartao p-5 lg:sticky lg:top-6 lg:self-start", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Pr\u00E9via do comprovante" }), _jsx("p", { className: "text-xs text-slate-500", children: "Muda enquanto voc\u00EA digita. Os produtos s\u00E3o apenas exemplo." })] }), _jsxs("select", { className: "campo w-auto py-1.5 text-sm", value: largura, onChange: (e) => { const v = e.target.value; setLargura(v); salvarLarguraCupom(v); }, "aria-label": "Largura do papel", children: [_jsx("option", { value: "80", children: "Papel 80 mm" }), _jsx("option", { value: "58", children: "Papel 58 mm" })] })] }), alterado && _jsx("p", { className: "mb-3 rounded-lg bg-atencao-50 px-3 py-2 text-xs font-medium text-atencao-700", children: "Altera\u00E7\u00F5es ainda n\u00E3o salvas \u2014 clique em \u201CSalvar\u201D para valer nos comprovantes." }), _jsx("div", { className: "flex justify-center rounded-lg bg-slate-100 p-4", children: _jsx("div", { className: "shadow", children: _jsx(CupomVenda, { venda: VENDA_EXEMPLO, config: configPrevia, largura: largura }) }) }), _jsx("button", { type: "button", className: "btn-secundario mt-3 w-full", onClick: () => setTeste(true), children: "\uD83D\uDDA8 Imprimir comprovante de teste" })] })] }), _jsx("div", { className: "mt-6", children: _jsxs("section", { className: "cartao", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "Usu\u00E1rios" }), pendentes > 0 && _jsxs(Selo, { cor: "atencao", children: [pendentes, " aguardando libera\u00E7\u00E3o"] })] }), _jsxs("div", { className: "space-y-1 border-b border-slate-100 px-4 py-3 text-xs text-slate-500", children: [_jsxs("p", { children: [_jsx("strong", { children: "Administrador:" }), " tudo \u2014 cadastra, edita pre\u00E7os, remove produtos, cancela vendas, v\u00EA todos os caixas, gera backup e gerencia usu\u00E1rios."] }), _jsxs("p", { children: [_jsx("strong", { children: "Operador (balconista):" }), " vende no caixa, d\u00E1 desconto at\u00E9 o limite, recebe fiado e parcelas, cadastra clientes, movimenta estoque, imprime etiquetas e v\u00EA relat\u00F3rios. N\u00E3o altera pre\u00E7os, n\u00E3o cancela vendas, n\u00E3o define limite de cr\u00E9dito, n\u00E3o mexe em usu\u00E1rios nem em configura\u00E7\u00F5es."] }), _jsxs("p", { children: ["Cadastre cada balconista aqui embaixo, com ", _jsx("strong", { children: "nome, usu\u00E1rio e senha" }), ": ele entra digitando s\u00F3 o usu\u00E1rio (ex.: maria) e a senha. Quem criar a pr\u00F3pria conta pela tela de entrada fica ", _jsx("strong", { children: "aguardando libera\u00E7\u00E3o" }), " at\u00E9 voc\u00EA liberar."] })] }), _jsx(CadastroOperador, { onCriado: () => void carregar() }), !usuarios ? _jsx(Carregando, {}) : (_jsx("ul", { className: "divide-y divide-slate-100", children: usuarios.map((u) => (_jsxs("li", { className: "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("p", { className: "font-medium", children: [u.nome, " ", u.id === eu?.id && _jsx("span", { className: "text-xs text-slate-400", children: "(voc\u00EA)" })] }), _jsxs("p", { className: "truncate text-xs text-slate-500", children: [mostrarLogin(u.email), " \u00B7 desde ", fmtDataHora(u.criado_em)] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [u.papel !== "admin" && u.id !== eu?.id && (_jsx("button", { type: "button", className: "btn-secundario btn-pequeno", onClick: () => setNovaSenhaDe(u), title: "Para quando o operador esqueceu a senha", children: "\uD83D\uDD11 Nova senha" })), _jsx("select", { className: "campo w-full py-1.5 text-sm sm:w-56", value: u.papel, onChange: (e) => setMudanca({ u, papel: e.target.value }), "aria-label": `Papel de ${u.nome}`, disabled: u.id === eu?.id, title: u.id === eu?.id ? "Você não pode mudar o seu próprio acesso (a loja precisa de um administrador)." : undefined, children: Object.keys(NOME_PAPEL).map((p) => _jsx("option", { value: p, children: NOME_PAPEL[p] }, p)) })] })] }, u.id))) }))] }) }), novaSenhaDe && _jsx(JanelaNovaSenha, { usuario: novaSenhaDe, onFechar: () => setNovaSenhaDe(null) }), teste && (_jsx(JanelaComprovante, { titulo: "Comprovante de teste", onFechar: () => setTeste(false), children: (l) => _jsx(CupomVenda, { venda: VENDA_EXEMPLO, config: configPrevia, largura: l }) })), _jsx(Confirmar, { aberto: Boolean(mudanca), titulo: "Alterar acesso?", processando: processando, onCancelar: () => setMudanca(null), onConfirmar: aplicarPapel, perigo: mudanca?.u.id === eu?.id, mensagem: mudanca && (_jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsx("strong", { children: mudanca.u.nome }), " passar\u00E1 de ", _jsx("strong", { children: NOME_PAPEL[mudanca.u.papel] }), " para ", _jsx("strong", { children: NOME_PAPEL[mudanca.papel] }), "."] }), mudanca.u.id === eu?.id && _jsx("p", { className: "mt-2 text-critico-700", children: "Aten\u00E7\u00E3o: voc\u00EA est\u00E1 alterando o seu pr\u00F3prio acesso." })] })) })] }));
}
/* ---------------- Cadastro de operadores (SQL 0008) ---------------- */
const FALTA_0008 = "Para cadastrar operadores aqui, rode antes o SQL 0008_cadastrar_operadores.sql no Supabase.";
function erroOperador(e) {
    const m = mensagemErro(e);
    return /criar_operador|trocar_senha_operador|function|função/i.test(m) && /not find|não encontr|does not exist|schema cache/i.test(m) ? FALTA_0008 : m;
}
function CadastroOperador({ onCriado }) {
    const avisar = useToast();
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState("");
    const [usuario, setUsuario] = useState("");
    const [senha, setSenha] = useState("");
    const [senha2, setSenha2] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    async function salvar(e) {
        e.preventDefault();
        setErro("");
        const u = usuario.trim().toLowerCase();
        if (nome.trim().length < 2)
            return setErro("Informe o nome do operador.");
        if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u) && !u.includes("@"))
            return setErro("Usuário: de 3 a 30 letras sem acento, números, ponto ou traço (ex.: maria, joao.silva).");
        if (senha.length < 6)
            return setErro("A senha precisa ter pelo menos 6 caracteres.");
        if (senha !== senha2)
            return setErro("As duas senhas não são iguais.");
        setSalvando(true);
        const { error } = await supabase.rpc("criar_operador", { p_nome: nome.trim(), p_usuario: u, p_senha: senha });
        setSalvando(false);
        if (error)
            return setErro(erroOperador(error));
        avisar("sucesso", `Operador ${nome.trim()} cadastrado. Ele entra com o usuário “${u}” e a senha que você definiu.`);
        setNome("");
        setUsuario("");
        setSenha("");
        setSenha2("");
        setAberto(false);
        onCriado();
    }
    if (!aberto) {
        return (_jsx("div", { className: "border-b border-slate-100 px-4 py-3", children: _jsx("button", { type: "button", className: "btn-acao btn-pequeno", onClick: () => setAberto(true), children: "+ Cadastrar operador" }) }));
    }
    return (_jsxs("form", { onSubmit: salvar, className: "space-y-3 border-b border-slate-100 bg-petroleo-50/40 px-4 py-4", children: [_jsx("p", { className: "text-sm font-semibold", children: "Novo operador (balconista)" }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "op-nome", children: "Nome" }), _jsx("input", { id: "op-nome", className: "campo", value: nome, onChange: (e) => setNome(e.target.value), placeholder: "ex.: Maria Souza", autoFocus: true, maxLength: 80 }), _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "Aparece no caixa e no comprovante." })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "op-usuario", children: "Usu\u00E1rio (para entrar)" }), _jsx("input", { id: "op-usuario", className: "campo", value: usuario, onChange: (e) => setUsuario(e.target.value.replace(/\s/g, "").toLowerCase()), placeholder: "ex.: maria", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, maxLength: 60 }), _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "Sem espa\u00E7o e sem acento. N\u00E3o precisa de e-mail." })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "op-senha", children: "Senha" }), _jsx("input", { id: "op-senha", type: "password", className: "campo", value: senha, onChange: (e) => setSenha(e.target.value), autoComplete: "new-password", minLength: 6 }), _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "Pelo menos 6 letras ou n\u00FAmeros." })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "op-senha2", children: "Repita a senha" }), _jsx("input", { id: "op-senha2", type: "password", className: "campo", value: senha2, onChange: (e) => setSenha2(e.target.value), autoComplete: "new-password", minLength: 6 })] })] }), erro && _jsx(Aviso, { cor: "critico", children: erro }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { className: "btn-acao", disabled: salvando, children: salvando ? "Cadastrando…" : "Cadastrar operador" }), _jsx("button", { type: "button", className: "btn-secundario", onClick: () => { setAberto(false); setErro(""); }, children: "Cancelar" })] }), _jsxs("p", { className: "text-xs text-slate-500", children: ["O operador entra j\u00E1 liberado como ", _jsx("strong", { children: "Operador" }), ". Para tirar o acesso depois, mude para \u201CAguardando libera\u00E7\u00E3o\u201D."] })] }));
}
function JanelaNovaSenha({ usuario, onFechar }) {
    const avisar = useToast();
    const [senha, setSenha] = useState("");
    const [senha2, setSenha2] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    async function salvar(e) {
        e.preventDefault();
        setErro("");
        if (senha.length < 6)
            return setErro("A senha precisa ter pelo menos 6 caracteres.");
        if (senha !== senha2)
            return setErro("As duas senhas não são iguais.");
        setSalvando(true);
        const { error } = await supabase.rpc("trocar_senha_operador", { p_usuario_id: usuario.id, p_senha: senha });
        setSalvando(false);
        if (error)
            return setErro(erroOperador(error));
        avisar("sucesso", `Senha de ${usuario.nome} trocada. Passe a nova senha para ele.`);
        onFechar();
    }
    return (_jsx(Modal, { aberto: true, titulo: `Nova senha para ${usuario.nome}`, largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, children: "Cancelar" }), _jsx("button", { className: "btn-acao", form: "form-nova-senha", disabled: salvando, children: salvando ? "Salvando…" : "Trocar senha" })] }), children: _jsxs("form", { id: "form-nova-senha", onSubmit: salvar, className: "space-y-3", children: [_jsxs("p", { className: "text-sm text-slate-600", children: ["Login: ", _jsx("strong", { children: mostrarLogin(usuario.email) })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "ns1", children: "Nova senha" }), _jsx("input", { id: "ns1", type: "password", className: "campo", value: senha, onChange: (e) => setSenha(e.target.value), autoComplete: "new-password", autoFocus: true })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "ns2", children: "Repita a nova senha" }), _jsx("input", { id: "ns2", type: "password", className: "campo", value: senha2, onChange: (e) => setSenha2(e.target.value), autoComplete: "new-password" })] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }) }));
}
