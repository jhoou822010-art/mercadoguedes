import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase, mensagemErro, ehErroDeRede } from "../lib/supabase";
import { esquecerPerfil, guardarConfig, guardarPerfil, lerConfigGuardada, lerPerfilGuardado, lerSessaoGuardada, pedirArmazenamentoPersistente, } from "../lib/perfilLocal";
import { atualizarSessaoNoCofre, tirarDoCofre } from "../lib/cofreSessoes";
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
    const [sessao, setSessao] = useState(null);
    const [perfil, setPerfil] = useState(null);
    const [config, setConfig] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erroPerfil, setErroPerfil] = useState("");
    const [perfilOffline, setPerfilOffline] = useState(false);
    const [perfilConferidoEm, setPerfilConferidoEm] = useState(null);
    const sessaoRef = useRef(null);
    /** Sem servidor: usa o que ficou guardado da última vez que este usuário entrou com internet. */
    const usarGuardado = useCallback((s) => {
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
    const carregarPerfil = useCallback(async (s) => {
        if (!s) {
            setPerfil(null);
            setConfig(null);
            setErroPerfil("");
            setPerfilOffline(false);
            return;
        }
        // Sem internet: nem tenta o servidor, usa o perfil guardado na hora.
        if (!navigator.onLine) {
            usarGuardado(s);
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
        }
        else if (!data) {
            esquecerPerfil(s.user.id);
            setErroPerfil("Seu login funcionou, mas não existe perfil para este usuário na tabela “perfis”.");
        }
        else {
            setErroPerfil("");
            guardarPerfil(data);
            // Acesso tirado pelo administrador: não pode mais entrar offline neste computador.
            if (data.papel === "pendente")
                tirarDoCofre(s.user.id);
            setPerfilConferidoEm(new Date().toISOString());
        }
        setPerfil(data ?? null);
        setPerfilOffline(false);
        const { data: cfg, error: erroCfg } = await supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle();
        if (erroCfg && ehErroDeRede(erroCfg)) {
            setConfig((c) => c ?? lerConfigGuardada());
            return;
        }
        if (cfg)
            guardarConfig(cfg);
        setConfig(cfg ?? null);
    }, [usarGuardado]);
    useEffect(() => {
        supabase.auth.getSession().then(async ({ data }) => {
            // Sem internet com a sessão vencida, o supabase-js responde "sem sessão",
            // mas a sessão continua guardada (e é renovada quando a internet volta).
            let s = data.session;
            if (!s && !navigator.onLine)
                s = lerSessaoGuardada();
            if (!s) {
                const guardada = lerSessaoGuardada();
                if (guardada) {
                    const teste = await supabase.from("configuracoes").select("id").limit(1);
                    if (teste.error && ehErroDeRede(teste.error))
                        s = guardada;
                }
            }
            sessaoRef.current = s;
            setSessao(s);
            await carregarPerfil(s);
            setCarregando(false);
            if (s)
                void pedirArmazenamentoPersistente();
        });
        const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
            // INITIAL_SESSION já foi tratado acima (inclusive o caso offline).
            if (evento === "INITIAL_SESSION")
                return;
            if (s && (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN"))
                atualizarSessaoNoCofre(s);
            sessaoRef.current = s;
            setSessao(s);
            // Carrega fora do callback para não travar o cliente do Supabase.
            setTimeout(() => void carregarPerfil(s), 0);
        });
        // Internet voltou: confere o perfil de novo com o servidor (acesso pode ter mudado).
        const voltou = () => {
            const s = sessaoRef.current;
            if (!s)
                return;
            void supabase.auth.getSession().then(({ data }) => {
                if (data.session) {
                    sessaoRef.current = data.session;
                    setSessao(data.session);
                }
                void carregarPerfil(data.session ?? s);
            });
        };
        window.addEventListener("online", voltou);
        return () => { sub.subscription.unsubscribe(); window.removeEventListener("online", voltou); };
    }, [carregarPerfil]);
    const valor = {
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
    return _jsx(AuthCtx.Provider, { value: valor, children: children });
}
export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v)
        throw new Error("useAuth precisa estar dentro de AuthProvider");
    return v;
}
