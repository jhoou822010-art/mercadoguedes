/*
  PERFIL GUARDADO NO COMPUTADOR (modo offline).

  Depois de entrar uma vez COM internet, o perfil (nome, acesso) e as
  configurações da loja ficam guardados neste computador. Sem internet,
  o sistema abre com eles. Quando a internet volta, tudo é conferido de novo
  com o servidor (se o acesso foi tirado, a pessoa é bloqueada na hora).

  Segurança: nenhuma senha é guardada. O que fica aqui só controla o que a
  TELA mostra; tudo o que é gravado no Supabase continua sendo conferido
  pelas regras do banco (RLS), então editar este dado à mão não dá poder
  nenhum no servidor.
*/
import type { Session } from "@supabase/supabase-js";
import type { Configuracoes, Perfil } from "./types";
import { CHAVE_SESSAO } from "./supabase";

const PREFIXO = "lojafacil.perfil.";
const CHAVE_CONFIG = "lojafacil.config";

interface PerfilGuardado { perfil: Perfil; salvo_em: string }

export function guardarPerfil(perfil: Perfil) {
  try { localStorage.setItem(PREFIXO + perfil.id, JSON.stringify({ perfil, salvo_em: new Date().toISOString() } satisfies PerfilGuardado)); } catch { /* sem espaço: segue */ }
}

export function lerPerfilGuardado(usuarioId: string): PerfilGuardado | null {
  try {
    const g = JSON.parse(localStorage.getItem(PREFIXO + usuarioId) || "null") as PerfilGuardado | null;
    return g && g.perfil?.id === usuarioId ? g : null;
  } catch { return null; }
}

export function esquecerPerfil(usuarioId: string) {
  try { localStorage.removeItem(PREFIXO + usuarioId); } catch { /* ignora */ }
}

export function guardarConfig(config: Configuracoes) {
  try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config)); } catch {
    // Logo muito grande para o espaço: guarda sem a logo.
    try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ ...config, logo: null })); } catch { /* segue */ }
  }
}

export function lerConfigGuardada(): Configuracoes | null {
  try { return JSON.parse(localStorage.getItem(CHAVE_CONFIG) || "null"); } catch { return null; }
}

/**
 * Sessão guardada pelo supabase-js, mesmo vencida. Sem internet o supabase-js
 * não consegue renová-la e responde "sem sessão", mas ela continua guardada e é
 * renovada sozinha quando a internet volta.
 */
export function lerSessaoGuardada(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null") as Session | null;
    return s && s.user?.id && s.refresh_token ? s : null;
  } catch { return null; }
}

/** Pede ao navegador para NÃO apagar os dados deste site sozinho (Chrome/Edge). */
export async function pedirArmazenamentoPersistente(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
