import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { supabaseConfigurado } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/Ui";
import Login from "./pages/Login";
import Pendente from "./pages/Pendente";
import NaoConfigurado from "./pages/NaoConfigurado";
import Painel from "./pages/Painel";
import Produtos from "./pages/Produtos";
import Estoque from "./pages/Estoque";
import Etiquetas from "./pages/Etiquetas";
import Relatorios from "./pages/Relatorios";
import Backup from "./pages/Backup";
import Configuracoes from "./pages/Configuracoes";
import Caixa from "./pages/Caixa";
import Vendas from "./pages/Vendas";
import Teclado from "./pages/Teclado";

export default function App() {
  const { sessao, perfil, carregando, ehAdmin } = useAuth();

  if (!supabaseConfigurado) return <NaoConfigurado />;
  if (carregando) return <Carregando texto="Abrindo o Loja Fácil…" />;
  if (!sessao) return <Login />;
  if (!perfil) return <Carregando texto="Carregando seu perfil…" />;
  if (perfil.papel === "pendente") return <Pendente />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route path="caixa" element={<Caixa />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="etiquetas" element={<Etiquetas />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="backup" element={ehAdmin ? <Backup /> : <Navigate to="/" replace />} />
        <Route path="configuracoes" element={ehAdmin ? <Configuracoes /> : <Navigate to="/" replace />} />
        <Route path="teclado" element={ehAdmin ? <Teclado /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
