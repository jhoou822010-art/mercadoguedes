import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { RodapeAutoria } from "../components/Sobre";
import { emailDoLogin } from "../lib/login";
import { entrarSemInternet, guardarNoCofre } from "../lib/cofreSessoes";
import { ehErroDeRede } from "../lib/supabase";
import { InstalarApp } from "../components/InstalarApp";
import { supabase, mensagemErro } from "../lib/supabase";
import { Logo } from "../components/Layout";
import { Aviso } from "../components/Ui";
export default function Login() {
    const [modo, setModo] = useState("entrar");
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    const [info, setInfo] = useState("");
    async function enviar(e) {
        e.preventDefault();
        setErro("");
        setInfo("");
        if (modo === "cadastrar" && nome.trim().length < 2)
            return setErro("Informe seu nome.");
        if (senha.length < 6)
            return setErro("A senha precisa ter pelo menos 6 caracteres.");
        setEnviando(true);
        try {
            if (modo === "entrar") {
                const login = emailDoLogin(email);
                const { data: entrou, error } = await supabase.auth.signInWithPassword({ email: login, password: senha });
                if (error && ehErroDeRede(error)) {
                    // Sem internet: entra com o que ficou guardado neste computador (se já entrou aqui antes).
                    const msg = await entrarSemInternet(login, senha);
                    if (msg) {
                        setErro(msg);
                        return;
                    }
                    window.location.reload();
                    return;
                }
                if (error)
                    throw error;
                if (entrou.session)
                    void guardarNoCofre(login, senha, entrou.session);
            }
            else {
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password: senha,
                    options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
                });
                if (error)
                    throw error;
                if (!data.session) {
                    setInfo("Cadastro criado! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre aqui.");
                    setModo("entrar");
                }
            }
        }
        catch (err) {
            setErro(mensagemErro(err));
        }
        finally {
            setEnviando(false);
        }
    }
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gradient-to-br from-petroleo-800 to-petroleo-600 px-4 py-10", children: _jsxs("div", { className: "w-full max-w-sm", children: [_jsx("div", { className: "mb-6 flex justify-center", children: _jsx("div", { className: "w-full max-w-xs", children: _jsx(Logo, { claro: true, grande: true }) }) }), _jsxs("form", { onSubmit: enviar, className: "cartao space-y-4 p-6", children: [_jsx("h1", { className: "text-xl font-bold text-slate-800", children: modo === "entrar" ? "Entrar" : "Criar conta" }), erro && _jsx(Aviso, { cor: "critico", children: erro }), info && _jsx(Aviso, { cor: "ok", children: info }), modo === "cadastrar" && (_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "nome", children: "Seu nome" }), _jsx("input", { id: "nome", className: "campo", value: nome, onChange: (e) => setNome(e.target.value), autoComplete: "name", required: true })] })), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "email", children: modo === "entrar" ? "E-mail ou usuário" : "E-mail" }), _jsx("input", { id: "email", type: modo === "entrar" ? "text" : "email", className: "campo", value: email, onChange: (e) => setEmail(e.target.value), autoComplete: "username", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, placeholder: modo === "entrar" ? "ex.: maria ou seu@email.com" : undefined, required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "senha", children: "Senha" }), _jsx("input", { id: "senha", type: "password", className: "campo", value: senha, onChange: (e) => setSenha(e.target.value), autoComplete: modo === "entrar" ? "current-password" : "new-password", required: true, minLength: 6 })] }), _jsx("button", { className: "btn-primario w-full", disabled: enviando, children: enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta" }), _jsxs("p", { className: "text-center text-sm text-slate-500", children: [modo === "entrar" ? "Ainda não tem acesso? " : "Já tem conta? ", _jsx("button", { type: "button", className: "font-semibold text-petroleo-700 hover:underline", onClick: () => { setModo(modo === "entrar" ? "cadastrar" : "entrar"); setErro(""); }, children: modo === "entrar" ? "Criar conta" : "Entrar" })] }), modo === "cadastrar" && (_jsxs("p", { className: "text-xs text-slate-500", children: ["A primeira conta criada vira ", _jsx("strong", { children: "administrador" }), ". As pr\u00F3ximas ficam aguardando libera\u00E7\u00E3o do administrador."] }))] }), _jsx("div", { className: "mt-4", children: _jsx(InstalarApp, { claro: true }) }), _jsx("div", { className: "mt-6", children: _jsx(RodapeAutoria, { claro: true }) })] }) }));
}
