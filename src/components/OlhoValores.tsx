import { alternarPrivacidade, usePrivacidade } from "../lib/privacidade";

/** Botão de olho: mostra ou esconde os valores em dinheiro nesta tela. */
export function OlhoValores() {
  const oculto = usePrivacidade();
  return (
    <button
      type="button"
      onClick={alternarPrivacidade}
      className={`btn-secundario ${oculto ? "border-petroleo-400 bg-petroleo-50 text-petroleo-800" : ""}`}
      aria-pressed={oculto}
      title={oculto ? "Mostrar os valores" : "Esconder os valores (para quem está do lado não ver)"}
    >
      {oculto ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.5-2.7 3.8M6.2 6.2C4 7.6 2.6 9.8 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
      <span>{oculto ? "Mostrar valores" : "Ocultar valores"}</span>
    </button>
  );
}
