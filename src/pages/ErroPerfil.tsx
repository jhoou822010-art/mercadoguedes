import { useAuth } from "../contexts/AuthContext";
import { Logo } from "../components/Layout";
import { Aviso } from "../components/Ui";

/** Mostrada quando o login funciona, mas o perfil do usuário não pode ser carregado. */
export default function ErroPerfil() {
  const { sessao, erroPerfil, recarregar, sair } = useAuth();
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const projeto = url.replace(/^https?:\/\//, "").split(".")[0];
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="cartao w-full max-w-lg space-y-4 p-6">
        <Logo />
        <h1 className="text-xl font-bold">Não consegui carregar seu perfil</h1>
        <Aviso cor="critico">{erroPerfil}</Aviso>
        <dl className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div><dt className="inline font-semibold">E-mail: </dt><dd className="inline">{sessao?.user.email}</dd></div>
          <div><dt className="inline font-semibold">ID do usuário: </dt><dd className="inline break-all font-mono">{sessao?.user.id}</dd></div>
          <div><dt className="inline font-semibold">Projeto Supabase: </dt><dd className="inline font-mono">{projeto || "—"}</dd></div>
        </dl>
        <div className="text-sm text-slate-600">
          <p className="font-semibold">O que conferir:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Os SQLs 0001, 0002 e 0003 foram rodados <strong>neste mesmo projeto</strong> do Supabase (código acima)?</li>
            <li>Se aparece “não existe perfil”: rode no SQL Editor o comando que cria o perfil do administrador.</li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primario" onClick={() => void recarregar()}>Tentar de novo</button>
          <button className="btn-secundario" onClick={() => void sair()}>Sair</button>
        </div>
        <p className="text-xs text-slate-400">Mande um print desta tela para quem dá suporte ao sistema.</p>
      </div>
    </div>
  );
}
