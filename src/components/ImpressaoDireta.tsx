import { instaladorAtalhos, useModoImpressao } from "../lib/imprimir";
import { useToast } from "./Toast";

/** Configurações → impressão deste computador (impressão direta pelo atalho do Windows). */
export function ImpressaoDireta({ onTeste }: { onTeste: () => void }) {
  const modo = useModoImpressao();
  const avisar = useToast();

  async function baixarInstalador() {
    const endereco = window.location.origin + import.meta.env.BASE_URL;
    // Ícone do supermercado para os atalhos (se não carregar, fica o ícone do Chrome).
    let icone = "";
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}icones/atalho.ico`);
      if (r.ok) {
        const bytes = new Uint8Array(await r.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        icone = btoa(bin);
      }
    } catch { /* sem ícone */ }
    const blob = new Blob([instaladorAtalhos(endereco, icone)], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Instalar-impressao-direta.cmd";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    avisar("sucesso", "Instalador baixado. Abra a pasta Downloads e dê dois cliques nele.");
  }

  return (
    <section className="cartao mt-6 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Impressão neste computador</h2>
          <p className="text-xs text-slate-500">Vale só para este computador (cada caixa configura o seu).</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${modo === "direta" ? "bg-ok-50 text-ok-700" : "bg-slate-100 text-slate-600"}`}>
          {modo === "direta" ? "✓ Impressão direta (sem janela)" : "Janela de impressão (normal)"}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Com a <strong>impressão direta</strong>, um clique em <strong>Imprimir</strong> manda o comprovante
            direto para a impressora, sem abrir a janela de impressão. Funciona no <strong>Windows</strong> com o
            <strong> Google Chrome</strong> (ou Edge), por um atalho próprio na Área de Trabalho.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Clique em <strong>Baixar instalador</strong> e dê dois cliques no arquivo baixado. Ele cria dois atalhos na Área de Trabalho, com o ícone do supermercado, e faz o caixa <strong>abrir sozinho quando o computador ligar</strong>.</li>
            <li>Abra <strong>“Caixa - configurar impressora”</strong>, entre com usuário e senha, clique em <strong>Imprimir comprovante de teste</strong> e, na janela, escolha a impressora de cupom, o papel <strong>80 mm</strong> (ou 58), margens <strong>Nenhuma</strong>, e imprima. O navegador guarda essa escolha.</li>
            <li>Feche essa janela e abra <strong>“Caixa - impressão direta”</strong>. A partir daí, é só clicar em Imprimir.</li>
          </ol>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-acao" onClick={() => void baixarInstalador()}>⤓ Baixar instalador (Windows)</button>
            <button type="button" className="btn-secundario" onClick={onTeste}>🖨 Imprimir comprovante de teste</button>
          </div>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {modo === "direta"
              ? "Esta janela foi aberta pelo atalho “Caixa - impressão direta”: o Imprimir manda direto para a impressora."
              : "Esta janela é o navegador comum: o Imprimir abre a janela de impressão. Para imprimir direto, abra o sistema pelo atalho “Caixa - impressão direta”."}
          </p>
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-petroleo-700">Não acho o arquivo baixado</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>No Chrome, aperte <strong>Ctrl + J</strong> (lista de downloads).</li>
              <li>Se aparecer <em>“pode ser perigoso”</em> ou <em>“bloqueado”</em>, clique nos três pontinhos ⋮ do arquivo e em <strong>Manter</strong> (ou <strong>Fazer download de arquivo suspeito</strong>). O arquivo só cria os dois atalhos.</li>
              <li>Clique em <strong>Mostrar na pasta</strong> e dê <strong>dois cliques</strong> em <strong>Instalar-impressao-direta</strong>.</li>
              <li>Se o Windows mostrar <em>“O Windows protegeu o computador”</em>, clique em <strong>Mais informações</strong> → <strong>Executar assim mesmo</strong>.</li>
            </ol>
          </details>
          <div className="rounded-lg bg-atencao-50 px-3 py-2 text-xs text-atencao-700">
            <p className="font-semibold">Importante</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>A impressora usada é a <strong>escolhida no atalho “configurar impressora”</strong> (ou, se nunca escolheu, a padrão do Windows). Para trocar, abra esse atalho e imprima o teste escolhendo a outra.</li>
              <li>O atalho tem um <strong>espaço próprio</strong> no computador: entre com usuário e senha nele uma vez e use <strong>sempre ele para vender</strong> neste caixa (vendas feitas sem internet ficam guardadas nele até enviar).</li>
              <li>O navegador não informa se a impressora está desligada. Se não sair, ligue-a: o Windows imprime o que ficou na fila. O sistema pergunta antes de imprimir o mesmo documento de novo.</li>
              <li>Relatórios, listas e etiquetas (folha A4) devem ser impressos fora do atalho, para não irem para a impressora de cupom.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
