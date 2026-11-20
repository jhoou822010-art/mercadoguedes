import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { cadastrarClienteLocal } from "../lib/local/caixaLocal";
import { estadoConexaoAgora } from "../lib/conexao";
import { ehErroDeRede } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { doServidorOuLocal } from "../lib/local/fallback";
import { clientesLocal, parcelasLocal } from "../lib/local/consultas";
import { supabase, mensagemErro } from "../lib/supabase";
import { termoBusca } from "../lib/data";
import { fmtMoeda } from "../lib/format";
import { Aviso } from "./Ui";
import { CampoDocumento, erroDocumento } from "./CampoDocumento";
/**
 * Escolher um cliente cadastrado (crediário). Busca por nome, telefone, CPF ou CNPJ
 * e permite cadastrar um cliente novo sem sair da venda.
 */
export function ClienteSeletor({ escolhido, onEscolher }) {
    const { perfil } = useAuth();
    const [texto, setTexto] = useState("");
    const [lista, setLista] = useState([]);
    const [emAberto, setEmAberto] = useState(null);
    const [novo, setNovo] = useState(false);
    const [nome, setNome] = useState("");
    const [telefone, setTelefone] = useState("");
    const [cpf, setCpf] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        const t = termoBusca(texto);
        if (!t) {
            setLista([]);
            return;
        }
        const id = setTimeout(async () => {
            const { data } = await doServidorOuLocal(() => supabase.from("clientes").select("*").eq("ativo", true)
                .or(`nome.ilike.*${t}*,telefone.ilike.*${t}*,cpf.ilike.*${t}*`).order("nome").limit(8), () => clientesLocal({ termo: texto, somenteAtivos: true, limite: 8 }), { espera: 4000 });
            setLista(data ?? []);
        }, 250);
        return () => clearTimeout(id);
    }, [texto]);
    // Quanto o cliente escolhido já deve no crediário.
    useEffect(() => {
        setEmAberto(null);
        if (!escolhido)
            return;
        void doServidorOuLocal(() => supabase.from("parcelas").select("valor").eq("cliente_id", escolhido.id).eq("status", "aberta"), () => parcelasLocal({ clienteId: escolhido.id, status: "aberta" })).then(({ data }) => setEmAberto((data ?? []).reduce((s, p) => s + Number(p.valor), 0)));
    }, [escolhido]);
    async function cadastrar() {
        setErro("");
        if (nome.trim().length < 2)
            return setErro("Informe o nome do cliente.");
        const errDoc = erroDocumento(cpf);
        if (errDoc)
            return setErro(errDoc);
        setSalvando(true);
        const offline = ["offline", "servidor"].includes(estadoConexaoAgora());
        let { data, error } = offline ? { data: null, error: { message: "Failed to fetch" } } : await supabase.from("clientes")
            .insert({ nome: nome.trim(), telefone: telefone.trim() || null, cpf: cpf.trim() || null })
            .select("*").single();
        // Sem internet: cadastra neste computador (vale para o crediário na hora) e envia depois.
        if (error && ehErroDeRede(error)) {
            try {
                data = await cadastrarClienteLocal({ perfil: perfil, nome, telefone: telefone.trim() || null, cpf: cpf.trim() || null });
                error = null;
            }
            catch (e) {
                error = { message: mensagemErro(e) };
            }
        }
        setSalvando(false);
        if (error)
            return setErro(error.code === "23505" ? "Já existe um cliente com este CPF/CNPJ." : mensagemErro(error));
        onEscolher(data);
        setNovo(false);
        setNome("");
        setTelefone("");
        setCpf("");
        setTexto("");
    }
    if (escolhido) {
        return (_jsxs("div", { className: "flex items-start justify-between gap-3 rounded-lg border border-petroleo-200 bg-petroleo-50 p-3 text-sm", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: escolhido.nome }), _jsx("p", { className: "text-xs text-slate-500", children: [escolhido.telefone, escolhido.cpf && `${escolhido.cpf.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"} ${escolhido.cpf}`].filter(Boolean).join(" · ") || "sem telefone" }), _jsxs("p", { className: "mt-1 text-xs", children: ["Em aberto no credi\u00E1rio: ", _jsx("strong", { children: emAberto === null ? "…" : fmtMoeda(emAberto) }), escolhido.limite_credito !== null && _jsxs(_Fragment, { children: [" \u00B7 Limite: ", _jsx("strong", { children: fmtMoeda(escolhido.limite_credito) })] })] })] }), _jsx("button", { type: "button", className: "text-xs font-semibold text-petroleo-700 hover:underline", onClick: () => onEscolher(null), children: "Trocar" })] }));
    }
    return (_jsx("div", { className: "space-y-2", children: !novo ? (_jsxs(_Fragment, { children: [_jsx("input", { className: "campo", placeholder: "Buscar cliente por nome, telefone, CPF ou CNPJ", value: texto, onChange: (e) => setTexto(e.target.value), "aria-label": "Buscar cliente" }), lista.length > 0 && (_jsx("ul", { className: "max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200", children: lista.map((c) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "w-full px-3 py-2 text-left text-sm hover:bg-petroleo-50", onClick: () => onEscolher(c), children: [_jsx("span", { className: "font-medium", children: c.nome }), _jsx("span", { className: "ml-2 text-xs text-slate-500", children: [c.telefone, c.cpf].filter(Boolean).join(" · ") })] }) }, c.id))) })), texto.trim() && lista.length === 0 && _jsx("p", { className: "text-xs text-slate-500", children: "Nenhum cliente encontrado." }), _jsx("button", { type: "button", className: "text-sm font-semibold text-petroleo-700 hover:underline", onClick: () => { setNovo(true); setNome(texto); }, children: "+ Cadastrar cliente novo" })] })) : (_jsxs("div", { className: "space-y-2 rounded-lg border border-slate-200 p-3", children: [_jsx("p", { className: "text-sm font-semibold", children: "Cliente novo" }), _jsx("input", { className: "campo", placeholder: "Nome completo *", value: nome, onChange: (e) => setNome(e.target.value), autoFocus: true, "aria-label": "Nome do cliente" }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx("input", { className: "campo", placeholder: "Telefone", inputMode: "tel", value: telefone, onChange: (e) => setTelefone(e.target.value), "aria-label": "Telefone" }), _jsx(CampoDocumento, { valor: cpf, onMudar: (v) => { setCpf(v); setErro(""); }, placeholder: "CPF ou CNPJ (opcional)" })] }), erro && _jsx(Aviso, { cor: "critico", children: erro }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn-primario btn-pequeno", onClick: cadastrar, disabled: salvando, children: salvando ? "Salvando…" : "Cadastrar e usar" }), _jsx("button", { type: "button", className: "btn-secundario btn-pequeno", onClick: () => setNovo(false), children: "Cancelar" })] }), _jsx("p", { className: "text-xs text-slate-400", children: "O limite de cr\u00E9dito \u00E9 definido pelo administrador em Vendas \u2192 Clientes." })] })) }));
}
