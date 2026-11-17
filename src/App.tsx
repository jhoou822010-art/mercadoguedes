import { lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { supabaseConfigurado } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/Ui";
import Login from "./pages/Login";
import Pendente from "./pages/Pendente";
import ErroPerfil from "./pages/ErroPerfil";
import NaoConfigurado from "./pages/NaoConfigurado";
// Cada tela é baixada só quando for aberta (o site abre mais rápido).
const Painel = lazy(() => import("./pages/Painel"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Estoque = lazy(() => import("./pages/Estoque"));
const Etiquetas = lazy(() => import("./pages/Etiquetas"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Backup = lazy(() => import("./pages/Backup"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Caixa = lazy(() => import("./pages/Caixa"));
const Vendas = lazy(() => import("./pages/Vendas"));
const Teclado = lazy(() => import("./pages/Teclado"));

/** Depois de entrar, já deixa o Caixa e o Painel baixados (abrem na hora quando clicar). */
function preCarregar() {
  const fazer = () => { void import("./pages/Caixa"); void import("./pages/Painel"); };
  if ("requestIdleCallback" in window) (window as Window & { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(fazer);
  else setTimeout(fazer, 1500);
}

export default function App() {
  const { sessao, perfil, carregando, ehAdmin, erroPerfil } = useAuth();
  useEffect(() => { if (sessao) preCarregar(); }, [sessao]);

  if (!supabaseConfigurado) return <NaoConfigurado />;
  if (carregando) return <Carregando texto="Abrindo o Gerenciador de Mercado…" />;
  if (!sessao) return <Login />;
  if (!perfil) return erroPerfil ? <ErroPerfil /> : <Carregando texto="Carregando seu perfil…" />;
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
