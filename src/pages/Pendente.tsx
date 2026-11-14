import { useAuth } from "../contexts/AuthContext";
import { Logo } from "../components/Layout";

export default function Pendente() {
  const { perfil, recarregar, sair } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="cartao max-w-md space-y-4 p-6 text-center">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="text-xl font-bold">Aguardando liberação</h1>
        <p className="text-sm text-slate-600">
          Olá, <strong>{perfil?.nome}</strong>. Sua conta foi criada, mas o administrador da loja ainda precisa liberar o seu acesso
          em <em>Usuários e loja</em>.
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-primario" onClick={recarregar}>Verificar novamente</button>
          <button className="btn-secundario" onClick={sair}>Sair</button>
        </div>
      </div>
    </div>
  );
}
