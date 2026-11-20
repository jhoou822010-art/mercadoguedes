import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { mostrarLogin } from "../lib/login";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import { Aviso } from "./Ui";
/** Janela "Meu perfil": cada usuário troca o próprio nome e a própria senha. */
export function MeuPerfil({ onFechar }) {
    const { perfil, sessao, recarregar } = useAuth();
    const avisar = useToast();
    const [nome, setNome] = useState(perfil?.nome ?? "");
    const [senha, setSenha] = useState("");
    const [senha2, setSenha2] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    async function salvar(e) {
        e.preventDefault();
        setErro("");
        const novoNome = nome.trim();
        const mudouNome = novoNome !== (perfil?.nome ?? "");
        const mudouSenha = senha.length > 0 || senha2.length > 0;
        if (novoNome.length < 2)
            return setErro("Informe seu nome (pelo menos 2 letras).");
        if (mudouSenha) {
            if (senha.length < 6)
                return setErro("A nova senha precisa ter pelo menos 6 caracteres.");
            if (senha !== senha2)
                return setErro("As duas senhas não são iguais. Digite de novo.");
        }
        if (!mudouNome && !mudouSenha)
            return onFechar();
        setSalvando(true);
        try {
            if (mudouNome) {
                const { error } = await supabase.from("perfis").update({ nome: novoNome }).eq("id", perfil.id);
                if (error)
                    throw error;
            }
            if (mudouSenha) {
                const { error } = await supabase.auth.updateUser({ password: senha });
                if (error)
                    throw error;
            }
            await recarregar();
            avisar("sucesso", mudouSenha && mudouNome ? "Nome e senha atualizados." : mudouSenha ? "Senha alterada. Use a nova senha no próximo login." : "Nome atualizado.");
            onFechar();
        }
        catch (err) {
            const msg = mensagemErro(err);
            setErro(msg.includes("different from the old") ? "A nova senha precisa ser diferente da atual." : msg);
        }
        finally {
            setSalvando(false);
        }
    }
    return (_jsx(Modal, { aberto: true, titulo: "Meu perfil", largura: "sm", onFechar: onFechar, rodape: _jsxs(_Fragment, { children: [_jsx("button", { className: "btn-secundario", onClick: onFechar, disabled: salvando, children: "Cancelar" }), _jsx("button", { className: "btn-acao", form: "form-perfil", disabled: salvando, children: salvando ? "Salvando…" : "Salvar" })] }), children: _jsxs("form", { id: "form-perfil", onSubmit: salvar, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "mp-nome", children: "Seu nome" }), _jsx("input", { id: "mp-nome", className: "campo", value: nome, onChange: (e) => setNome(e.target.value), maxLength: 60, autoFocus: true, autoComplete: "name" }), _jsx("p", { className: "mt-1 text-xs text-slate-400", children: "Aparece no menu, nas vendas, no comprovante e no hist\u00F3rico." })] }), _jsxs("div", { className: "rounded-lg bg-slate-50 p-3 text-xs text-slate-600", children: [_jsxs("p", { children: [_jsx("strong", { children: "Login:" }), " ", mostrarLogin(sessao?.user.email)] }), _jsxs("p", { children: [_jsx("strong", { children: "Acesso:" }), " ", perfil?.papel === "admin" ? "Administrador" : perfil?.papel === "operador" ? "Operador" : "Aguardando liberação"] })] }), _jsxs("fieldset", { className: "space-y-3 border-t border-slate-100 pt-4", children: [_jsx("legend", { className: "text-sm font-semibold text-petroleo-700", children: "Trocar senha (opcional)" }), _jsx("p", { className: "text-xs text-slate-500", children: "Deixe em branco para manter a senha atual." }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "mp-s1", children: "Nova senha" }), _jsx("input", { id: "mp-s1", type: "password", className: "campo", value: senha, onChange: (e) => setSenha(e.target.value), autoComplete: "new-password" })] }), _jsxs("div", { children: [_jsx("label", { className: "rotulo", htmlFor: "mp-s2", children: "Repita a nova senha" }), _jsx("input", { id: "mp-s2", type: "password", className: "campo", value: senha2, onChange: (e) => setSenha2(e.target.value), autoComplete: "new-password" })] })] }), erro && _jsx(Aviso, { cor: "critico", children: erro })] }) }));
}
