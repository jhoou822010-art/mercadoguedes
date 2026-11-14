import { Logo } from "../components/Layout";

export default function NaoConfigurado() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="cartao max-w-lg space-y-4 p-6">
        <Logo />
        <h1 className="text-xl font-bold">Falta conectar ao Supabase</h1>
        <p className="text-sm text-slate-600">
          O sistema não encontrou as variáveis <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Copie o arquivo <code>.env.example</code> para <code>.env</code>.</li>
          <li>Cole a URL e a chave pública do seu projeto Supabase.</li>
          <li>Pare e rode de novo <code>pnpm dev</code>. Na hospedagem, cadastre as variáveis e publique de novo.</li>
        </ol>
        <p className="text-xs text-slate-500">O passo a passo completo está no arquivo GUIA.md.</p>
      </div>
    </div>
  );
}
