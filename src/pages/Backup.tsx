import { useState } from "react";
import { mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { supabase } from "../lib/supabase";
import { baixarArquivo } from "../lib/csv";
import type { Configuracoes, Movimentacao, Produto } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Aviso, Cabecalho } from "../components/Ui";

export const VERSAO_BACKUP = 3;

export default function Backup() {
  const { perfil, tem0006 } = useAuth();
  const avisar = useToast();
  const [etapa, setEtapa] = useState("");
  const [ultimo, setUltimo] = useState<{ arquivo: string; produtos: number; movimentacoes: number } | null>(null);

  async function exportar() {
    try {
      setEtapa("Lendo produtos…");
      const produtos = await buscarTodos<Produto>("produtos");
      setEtapa("Lendo movimentações…");
      const movimentacoes = await buscarTodos<Movimentacao>("movimentacoes");
      setEtapa("Lendo vendas e caixas…");
      const vendas = await buscarTodos("vendas");
      const venda_itens = await buscarTodos("venda_itens");
      const venda_pagamentos = await buscarTodos("venda_pagamentos");
      // Caixas completos (com esperado/diferença) vêm por listar_caixas (SQL 0006); antes dele, leitura direta.
      const rc = await supabase.rpc("listar_caixas", { p_limite: 5000 });
      const caixas = rc.error ? await buscarTodos("caixas") : (rc.data as unknown[]);
      const caixa_movimentos = await buscarTodos("caixa_movimentos");
      const clientes = tem0006 ? await buscarTodos("clientes") : [];
      const parcelas = tem0006 ? await buscarTodos("parcelas") : [];
      setEtapa("Lendo configurações…");
      const [configuracoes] = await buscarTodos<Configuracoes>("configuracoes");
      const agora = new Date();
      const backup = {
        formato: "loja-facil-backup",
        versao_formato: VERSAO_BACKUP,
        exportado_em: agora.toISOString(),
        exportado_por: perfil?.email ?? null,
        totais: { produtos: produtos.length, movimentacoes: movimentacoes.length, vendas: vendas.length, caixas: caixas.length },
        configuracoes,
        produtos,
        movimentacoes,
        vendas,
        venda_itens,
        venda_pagamentos,
        caixas,
        caixa_movimentos,
        clientes,
        parcelas,
      };
      const carimbo = agora.toLocaleString("sv-SE").replace(/[: ]/g, "-");
      const arquivo = `loja-facil-backup-${carimbo}.json`;
      baixarArquivo(arquivo, JSON.stringify(backup, null, 2), "application/json");
      setUltimo({ arquivo, produtos: produtos.length, movimentacoes: movimentacoes.length });
      avisar("sucesso", "Backup gerado. Guarde o arquivo em local seguro.");
    } catch (e) {
      avisar("erro", `Não foi possível gerar o backup: ${mensagemErro(e)}`);
    } finally {
      setEtapa("");
    }
  }

  return (
    <div className="max-w-2xl">
      <Cabecalho titulo="Backup" descricao="Gere uma cópia dos dados da loja em um arquivo JSON." />
      <div className="cartao space-y-4 p-5">
        <p className="text-sm text-slate-600">O arquivo contém:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>todos os produtos (ativos e inativos);</li>
          <li>todo o histórico de movimentações de estoque;</li>
          <li>vendas (itens e pagamentos), fiados, caixas, sangrias e suprimentos;</li>
          <li>clientes e parcelas do crediário;</li>
          <li>as configurações da loja;</li>
          <li>a data da exportação e a versão do formato do backup (versão {VERSAO_BACKUP}).</li>
        </ul>
        <Aviso cor="atencao">
          <strong>Guarde o arquivo em local seguro</strong> (pen drive, nuvem ou outro computador). Ele tem custos e preços da loja: não envie para
          pessoas desconhecidas.
        </Aviso>
        <Aviso cor="petroleo">
          Esta versão <strong>só exporta</strong>. A restauração automática a partir do arquivo ainda não existe; se precisar recuperar dados,
          o arquivo pode ser importado manualmente por um técnico.
        </Aviso>
        <button className="btn-acao" onClick={exportar} disabled={Boolean(etapa)}>
          {etapa || "⤓ Gerar backup agora"}
        </button>
        {ultimo && (
          <Aviso cor="ok">
            Último backup: <strong>{ultimo.arquivo}</strong> — {ultimo.produtos} produto(s) e {ultimo.movimentacoes} movimentação(ões).
            Verifique a pasta de downloads.
          </Aviso>
        )}
      </div>
    </div>
  );
}
