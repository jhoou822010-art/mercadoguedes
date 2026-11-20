import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/Toast";
import { iniciarAppInstalavel } from "./lib/instalar";
import { ErroTela, recarregarParaVersaoNova } from "./components/ErroTela";
import { PerguntasImpressao } from "./components/PerguntasImpressao";
import { aplicarModoDaUrl } from "./lib/imprimir";

// Versão nova publicada enquanto a página estava aberta: o arquivo antigo de uma tela
// não existe mais. Em vez de tela branca, recarrega sozinho para a versão nova.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  recarregarParaVersaoNova();
});

iniciarAppInstalavel();
// Atalho "Caixa - impressão direta" / "configurar impressora": guarda o modo neste computador.
aplicarModoDaUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <ErroTela>
        <ToastProvider>
          <AuthProvider>
            <App />
            <PerguntasImpressao />
          </AuthProvider>
        </ToastProvider>
      </ErroTela>
    </BrowserRouter>
  </StrictMode>,
);
