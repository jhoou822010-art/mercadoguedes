import { mascaraDocumento, tipoDocumento } from "../lib/format";

/** Campo único para CPF (pessoa) ou CNPJ (empresa), com máscara e conferência dos dígitos. */
export function CampoDocumento({ id, valor, onMudar, placeholder }: { id?: string; valor: string; onMudar: (v: string) => void; placeholder?: string }) {
  const digitos = valor.replace(/\D/g, "").length;
  const tipo = tipoDocumento(valor);
  let dica = "";
  let cor = "text-slate-500";
  if (digitos > 0) {
    if (tipo) { dica = tipo === "CPF" ? "✓ CPF (pessoa física)" : "✓ CNPJ (empresa)"; cor = "text-ok-700"; }
    else if (digitos === 11 || digitos === 14) { dica = `${digitos === 11 ? "CPF" : "CNPJ"} com número errado. Confira.`; cor = "text-critico-600"; }
    else dica = digitos < 11 ? "CPF tem 11 números" : "CNPJ tem 14 números";
  }
  return (
    <div>
      <input
        id={id}
        className="campo"
        inputMode="numeric"
        placeholder={placeholder ?? "CPF ou CNPJ"}
        aria-label={id ? undefined : "CPF ou CNPJ"}
        value={valor}
        onChange={(e) => onMudar(mascaraDocumento(e.target.value))}
        maxLength={18}
      />
      {dica && <p className={`mt-1 text-xs ${cor}`}>{dica}</p>}
    </div>
  );
}

/** Mensagem de erro para salvar, ou "" se estiver vazio ou certo. */
export function erroDocumento(valor: string) {
  if (!valor.trim()) return "";
  return tipoDocumento(valor) ? "" : "CPF ou CNPJ inválido. Confira os números (CPF tem 11, CNPJ tem 14).";
}
