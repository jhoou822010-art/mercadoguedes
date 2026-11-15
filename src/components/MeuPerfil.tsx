import { useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import { Aviso } from "./Ui";

/** Janela "Meu perfil": cada usuário troca o próprio nome e a própria senha. */
export function MeuPerfil({ onFechar }: { onFechar: () => void }) {
  const { perfil, sessao, recarregar } = useAuth();
  const avisar = useToast();
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const novoNome = nome.trim();
    const mudouNome = novoNome !== (perfil?.nome ?? "");
    const mudouSenha = senha.length > 0 || senha2.length > 0;
    if (novoNome.length < 2) return setErro("Informe seu nome (pelo menos 2 letras).");
    if (mudouSenha) {
      if (senha.length < 6) return setErro("A nova senha precisa ter pelo menos 6 caracteres.");
      if (senha !== senha2) return setErro("As duas senhas não são iguais. Digite de novo.");
    }
    if (!mudouNome && !mudouSenha) return onFechar();

    setSalvando(true);
    try {
      if (mudouNome) {
        const { error } = await supabase.from("perfis").update({ nome: novoNome }).eq("id", perfil!.id);
        if (error) throw error;
      }
      if (mudouSenha) {
        const { error } = await supabase.auth.updateUser({ password: senha });
        if (error) throw error;
      }
      await recarregar();
      avisar("sucesso", mudouSenha && mudouNome ? "Nome e senha atualizados." : mudouSenha ? "Senha alterada. Use a nova senha no próximo login." : "Nome atualizado.");
      onFechar();
    } catch (err) {
      const msg = mensagemErro(err);
      setErro(msg.includes("different from the old") ? "A nova senha precisa ser diferente da atual." : msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo="Meu perfil"
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn-secundario" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn-acao" form="form-perfil" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </>
      }
    >
      <form id="form-perfil" onSubmit={salvar} className="space-y-4">
        <div>
          <label className="rotulo" htmlFor="mp-nome">Seu nome</label>
          <input id="mp-nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoFocus autoComplete="name" />
          <p className="mt-1 text-xs text-slate-400">Aparece no menu, nas vendas, no comprovante e no histórico.</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p><strong>E-mail de login:</strong> {sessao?.user.email}</p>
          <p><strong>Acesso:</strong> {perfil?.papel === "admin" ? "Administrador" : perfil?.papel === "operador" ? "Operador" : "Aguardando liberação"}</p>
        </div>
        <fieldset className="space-y-3 border-t border-slate-100 pt-4">
          <legend className="text-sm font-semibold text-petroleo-700">Trocar senha (opcional)</legend>
          <p className="text-xs text-slate-500">Deixe em branco para manter a senha atual.</p>
          <div>
            <label className="rotulo" htmlFor="mp-s1">Nova senha</label>
            <input id="mp-s1" type="password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="rotulo" htmlFor="mp-s2">Repita a nova senha</label>
            <input id="mp-s2" type="password" className="campo" value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" />
          </div>
        </fieldset>
        {erro && <Aviso cor="critico">{erro}</Aviso>}
      </form>
    </Modal>
  );
}
