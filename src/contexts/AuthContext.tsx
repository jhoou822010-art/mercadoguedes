import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, mensagemErro } from "../lib/supabase";
import type { Configuracoes, Perfil } from "../lib/types";

interface AuthValor {
  sessao: Session | null;
  perfil: Perfil | null;
  config: Configuracoes | null;
  carregando: boolean;
  /** Mensagem quando o login funcionou mas o perfil não pôde ser carregado. */
  erroPerfil: string;
  ehAdmin: boolean;
  /** SQL 0006 (crediário, clientes, ocultar valores) já foi rodado no Supabase. */
  tem0006: boolean;
  /** Usuário atual não deve ver totais de venda (operador + opção ligada). */
  valoresOcultos: boolean;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
}

const AuthCtx = createContext<AuthValor | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [config, setConfig] = useState<Configuracoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroPerfil, setErroPerfil] = useState("");

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null);
      setConfig(null);
      setErroPerfil("");
      return;
    }
    const { data, error } = await supabase.from("perfis").select("*").eq("id", s.user.id).maybeSingle();
    if (error) {
      // Ex.: tabela inexistente (SQL 0001 não rodado neste projeto) ou chave errada.
      setErroPerfil(`Erro ao ler o perfil: ${mensagemErro(error)}${error.code ? ` (código ${error.code})` : ""}`);
    } else if (!data) {
      setErroPerfil("Seu login funcionou, mas não existe perfil para este usuário na tabela “perfis”.");
    } else {
      setErroPerfil("");
    }
    setPerfil((data as Perfil) ?? null);
    const { data: cfg } = await supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle();
    setConfig((cfg as Configuracoes) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s);
      // Carrega fora do callback para não travar o cliente do Supabase.
      setTimeout(() => void carregarPerfil(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [carregarPerfil]);

  const valor: AuthValor = {
    sessao,
    perfil,
    config,
    carregando,
    erroPerfil,
    ehAdmin: perfil?.papel === "admin",
    tem0006: config?.ocultar_valores_operador !== undefined,
    valoresOcultos: perfil?.papel !== "admin" && config?.ocultar_valores_operador === true,
    recarregar: () => carregarPerfil(sessao),
    sair: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return v;
}
