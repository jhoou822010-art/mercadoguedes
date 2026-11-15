import { useEffect, useState } from "react";

/**
 * Aviso fixo quando o computador fica sem internet. O sistema depende da
 * internet (os dados ficam no Supabase): sem ela, vendas e estoque não são gravados.
 */
export function SemConexao() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [voltou, setVoltou] = useState(false);

  useEffect(() => {
    const on = () => { setOnline(true); setVoltou(true); setTimeout(() => setVoltou(false), 5000); };
    const off = () => { setOnline(false); setVoltou(false); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (!online) {
    return (
      <div role="alert" className="nao-imprimir mb-4 rounded-lg border-l-4 border-critico-600 bg-critico-50 px-4 py-3 text-sm text-critico-700">
        <strong>Sem internet.</strong> Vendas, estoque e cadastros não serão gravados até a conexão voltar. Se estiver no meio de uma venda, não feche a página: os itens ficam guardados nesta aba.
      </div>
    );
  }
  if (voltou) {
    return (
      <div role="status" className="nao-imprimir mb-4 rounded-lg border-l-4 border-ok-600 bg-ok-50 px-4 py-3 text-sm text-ok-700">
        Internet de volta. Pode continuar.
      </div>
    );
  }
  return null;
}
