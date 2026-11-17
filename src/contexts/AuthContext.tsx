import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, mensagemErro, ehErroDeRede } from "../lib/supabase";
import type { Configuracoes, Perfil } from "../lib/types";
import {
  esquecerPerfil, guardarConfig, guardarPerfil, lerConfigGuardada, lerPerfilGuardado, lerSessaoGuardada, pedirArmazenamentoPersistente,
} from "../lib/perfilLocal";
import { atualizarSessaoNoCofre, tirarDoCofre } from "../lib/cofreSessoes";

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
  /** Perfil e configurações vieram do que está guardado no computador (sem servidor). */
  perfilOffline: boolean;
  /** Quando o perfil foi conferido com o servidor pela última vez. */
  perfilConferidoEm: string | null;
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
  const [perfilOffline, setPerfilOffline] = useState(false);
  const [perfilConferidoEm, setPerfilConferidoEm] = useState<string | null>(null);
  const sessaoRef = useRef<Session | null>(null);

  /** Sem servidor: usa o que ficou guardado da última vez que este usuário entrou com internet. */
  const usarGuardado = useCallback((s: Session) => {
    const g = lerPerfilGuardado(s.user.id);
    if (!g) {
      setPerfil(null);
      setErroPerfil("Sem conexão com o servidor, e este computador ainda não tem o seu perfil guardado. Conecte à internet e entre uma vez neste computador; depois disso ele passa a abrir mesmo sem internet.");
      return;
    }
    setPerfil(g.perfil);
    setPerfilConferidoEm(g.salvo_em);
    setPerfilOffline(true);
    setErroPerfil("");
    setConfig((c) => c ?? lerConfigGuardada());
  }, []);

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null);
      setConfig(null);
      setErroPerfil("");
      setPerfilOffline(false);
      return;
    }
    const { data, error } = await supabase.from("perfis").select("*").eq("id", s.user.id).maybeSingle();
    if (error && ehErroDeRede(error)) {
      usarGuardado(s);
      return;
    }
    if (error) {
      // Ex.: tabela inexistente (SQL 0001 não rodado neste projeto) ou chave errada.
      setErroPerfil(`Erro ao ler o perfil: ${mensagemErro(error)}${error.code ? ` (código ${error.code})` : ""}`);
    } else if (!data) {
      esquecerPerfil(s.user.id);
      setErroPerfil("Seu login funcionou, mas não existe perfil para este usuário na tabela “perfis”.");
    } else {
      setErroPerfil("");
      guardarPerfil(data as Perfil);
      // Acesso tirado pelo administrador: não pode mais entrar offline neste computador.
      if ((data as Perfil).papel === "pendente") tirarDoCofre(s.user.id);
      setPerfilConferidoEm(new Date().toISOString());
    }
    setPerfil((data as Perfil) ?? null);
    setPerfilOffline(false);
    const { data: cfg, error: erroCfg } = await supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle();
    if (erroCfg && ehErroDeRede(erroCfg)) {
      setConfig((c) => c ?? lerConfigGuardada());
      return;
    }
    if (cfg) guardarConfig(cfg as Configuracoes);
    setConfig((cfg as Configuracoes) ?? null);
  }, [usarGuardado]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // Sem internet com a sessão vencida, o supabase-js responde "sem sessão",
      // mas a sessão continua guardada (e é renovada quando a internet volta).
      let s = data.session;
      if (!s && !navigator.onLine) s = lerSessaoGuardada();
      if (!s) {
        const guardada = lerSessaoGuardada();
        if (guardada) {
          const teste = await supabase.from("configuracoes").select("id").limit(1);
          if (teste.error && ehErroDeRede(teste.error)) s = guardada;
        }
      }
      sessaoRef.current = s;
      setSessao(s);
      await carregarPerfil(s);
      setCarregando(false);
      if (s) void pedirArmazenamentoPersistente();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      // INITIAL_SESSION já foi tratado acima (inclusive o caso offline).
      if (evento === "INITIAL_SESSION") return;
      if (s && (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN")) atualizarSessaoNoCofre(s);
      sessaoRef.current = s;
      setSessao(s);
      // Carrega fora do callback para não travar o cliente do Supabase.
      setTimeout(() => void carregarPerfil(s), 0);
    });
    // Internet voltou: confere o perfil de novo com o servidor (acesso pode ter mudado).
    const voltou = () => {
      const s = sessaoRef.current;
      if (!s) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) { sessaoRef.current = data.session; setSessao(data.session); }
        void carregarPerfil(data.session ?? s);
      });
    };
    window.addEventListener("online", voltou);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("online", voltou); };
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
    perfilOffline,
    perfilConferidoEm,
    recarregar: () => carregarPerfil(sessao),
    sair: async () => {
      // Sai só NESTE computador (funciona sem internet) e mantém a pessoa apta a entrar
      // de novo offline aqui (troca de turno). Bloquear alguém é pelo administrador.
      await supabase.auth.signOut({ scope: "local" });
      sessaoRef.current = null;
      setSessao(null);
      setPerfil(null);
    },
  };

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return v;
}
