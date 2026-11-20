import { CHAVE_SESSAO } from "./supabase";
const PREFIXO = "lojafacil.perfil.";
const CHAVE_CONFIG = "lojafacil.config";
export function guardarPerfil(perfil) {
    try {
        localStorage.setItem(PREFIXO + perfil.id, JSON.stringify({ perfil, salvo_em: new Date().toISOString() }));
    }
    catch { /* sem espaço: segue */ }
}
export function lerPerfilGuardado(usuarioId) {
    try {
        const g = JSON.parse(localStorage.getItem(PREFIXO + usuarioId) || "null");
        return g && g.perfil?.id === usuarioId ? g : null;
    }
    catch {
        return null;
    }
}
export function esquecerPerfil(usuarioId) {
    try {
        localStorage.removeItem(PREFIXO + usuarioId);
    }
    catch { /* ignora */ }
}
export function guardarConfig(config) {
    try {
        localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config));
    }
    catch {
        // Logo muito grande para o espaço: guarda sem a logo.
        try {
            localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ ...config, logo: null }));
        }
        catch { /* segue */ }
    }
}
export function lerConfigGuardada() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_CONFIG) || "null");
    }
    catch {
        return null;
    }
}
/**
 * Sessão guardada pelo supabase-js, mesmo vencida. Sem internet o supabase-js
 * não consegue renová-la e responde "sem sessão", mas ela continua guardada e é
 * renovada sozinha quando a internet volta.
 */
export function lerSessaoGuardada() {
    try {
        const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
        return s && s.user?.id && s.refresh_token ? s : null;
    }
    catch {
        return null;
    }
}
/** Pede ao navegador para NÃO apagar os dados deste site sozinho (Chrome/Edge). */
export async function pedirArmazenamentoPersistente() {
    try {
        if (!navigator.storage?.persist)
            return null;
        if (await navigator.storage.persisted())
            return true;
        return await navigator.storage.persist();
    }
    catch {
        return null;
    }
}
