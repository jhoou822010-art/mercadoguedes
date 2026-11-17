/*
  Operadores cadastrados pelo administrador entram só com USUÁRIO (ex.: maria),
  sem e-mail. Por dentro o login vira "maria@operador.lojafacil" (igual ao SQL 0008).
*/
export const DOMINIO_OPERADOR = "@operador.lojafacil";

/** O que a pessoa digitou (usuário ou e-mail) → e-mail de login. */
export function emailDoLogin(texto: string) {
  const t = texto.trim().toLowerCase();
  return t.includes("@") ? t : t + DOMINIO_OPERADOR;
}

/** Como mostrar o login na tela: "usuário: maria" ou o próprio e-mail. */
export function mostrarLogin(email: string | null | undefined) {
  if (!email) return "";
  return email.endsWith(DOMINIO_OPERADOR) ? `usuário: ${email.slice(0, -DOMINIO_OPERADOR.length)}` : email;
}
