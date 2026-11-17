import { useState, type FormEvent } from "react";
import { emailDoLogin } from "../lib/login";
import { entrarSemInternet, guardarNoCofre } from "../lib/cofreSessoes";
import { ehErroDeRede } from "../lib/supabase";
import { InstalarApp } from "../components/InstalarApp";
import { supabase, mensagemErro } from "../lib/supabase";
import { Logo } from "../components/Layout";
import { Aviso } from "../components/Ui";

export default function Login() {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setInfo("");
    if (modo === "cadastrar" && nome.trim().length < 2) return setErro("Informe seu nome.");
    if (senha.length < 6) return setErro("A senha precisa ter pelo menos 6 caracteres.");
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const login = emailDoLogin(email);
        const { data: entrou, error } = await supabase.auth.signInWithPassword({ email: login, password: senha });
        if (error && ehErroDeRede(error)) {
          // Sem internet: entra com o que ficou guardado neste computador (se já entrou aqui antes).
          const msg = await entrarSemInternet(login, senha);
          if (msg) { setErro(msg); return; }
          window.location.reload();
          return;
        }
        if (error) throw error;
        if (entrou.session) void guardarNoCofre(login, senha, entrou.session);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Cadastro criado! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre aqui.");
          setModo("entrar");
        }
      }
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-petroleo-800 to-petroleo-600 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><div className="w-full max-w-xs"><Logo claro grande /></div></div>
        <form onSubmit={enviar} className="cartao space-y-4 p-6">
          <h1 className="text-xl font-bold text-slate-800">{modo === "entrar" ? "Entrar" : "Criar conta"}</h1>
          {erro && <Aviso cor="critico">{erro}</Aviso>}
          {info && <Aviso cor="ok">{info}</Aviso>}
          {modo === "cadastrar" && (
            <div>
              <label className="rotulo" htmlFor="nome">Seu nome</label>
              <input id="nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
            </div>
          )}
          <div>
            <label className="rotulo" htmlFor="email">{modo === "entrar" ? "E-mail ou usuário" : "E-mail"}</label>
            <input id="email" type={modo === "entrar" ? "text" : "email"} className="campo" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={modo === "entrar" ? "ex.: maria ou seu@email.com" : undefined} required />
          </div>
          <div>
            <label className="rotulo" htmlFor="senha">Senha</label>
            <input id="senha" type="password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === "entrar" ? "current-password" : "new-password"} required minLength={6} />
          </div>
          <button className="btn-primario w-full" disabled={enviando}>
            {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
          <p className="text-center text-sm text-slate-500">
            {modo === "entrar" ? "Ainda não tem acesso? " : "Já tem conta? "}
            <button type="button" className="font-semibold text-petroleo-700 hover:underline" onClick={() => { setModo(modo === "entrar" ? "cadastrar" : "entrar"); setErro(""); }}>
              {modo === "entrar" ? "Criar conta" : "Entrar"}
            </button>
          </p>
          {modo === "cadastrar" && (
            <p className="text-xs text-slate-500">
              A primeira conta criada vira <strong>administrador</strong>. As próximas ficam aguardando liberação do administrador.
            </p>
          )}
        </form>
        <div className="mt-4"><InstalarApp claro /></div>
      </div>
    </div>
  );
}
