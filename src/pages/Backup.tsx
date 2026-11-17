import { useCallback, useEffect, useState } from "react";
import { mensagemErro } from "../lib/supabase";
import { buscarTodos } from "../lib/data";
import { supabase } from "../lib/supabase";
import { baixarArquivo } from "../lib/csv";
import type { Configuracoes, Movimentacao, Produto } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Aviso, Cabecalho } from "../components/Ui";
import { fmtDataHora, fmtMoeda } from "../lib/format";

export const VERSAO_BACKUP = 3;

export default function Backup() {
  const { perfil, tem0006, config, recarregar } = useAuth();
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
      // Histórico de alterações (SQL 0007): se ainda não existir, segue sem ele.
      const auditoria = await buscarTodos("auditoria").catch(() => []);
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
        auditoria,
      };
      const carimbo = agora.toLocaleString("sv-SE").replace(/[: ]/g, "-");
      const arquivo = `loja-facil-backup-${carimbo}.json`;
      baixarArquivo(arquivo, JSON.stringify(backup, null, 2), "application/json");
      setUltimo({ arquivo, produtos: produtos.length, movimentacoes: movimentacoes.length });
      // Anota no banco a data do backup (SQL 0007) para o aviso diário. Sem o 0007, só ignora.
      const rb = await supabase.rpc("registrar_backup");
      if (!rb.error) void recarregar();
      avisar("sucesso", "Backup gerado. Guarde o arquivo em local seguro.");
    } catch (e) {
      avisar("erro", `Não foi possível gerar o backup: ${mensagemErro(e)}`);
    } finally {
      setEtapa("");
    }
  }

  return (
    <div className="max-w-4xl">
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
        {config?.ultimo_backup_em !== undefined && (
          <p className="text-sm">
            Último backup registrado:{" "}
            {config.ultimo_backup_em ? <strong>{fmtDataHora(config.ultimo_backup_em)}{config.ultimo_backup_por ? ` por ${config.ultimo_backup_por}` : ""}</strong> : <strong className="text-critico-600">nenhum ainda</strong>}
          </p>
        )}
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
      <Historico />
    </div>
  );
}

/* ---------------- Histórico de alterações (SQL 0007) ---------------- */

interface Registro {
  id: number; tabela: string; operacao: string; registro_id: string | null;
  antes: Record<string, unknown> | null; depois: Record<string, unknown> | null;
  usuario_nome: string | null; em: string;
}

const NOME_TABELA: Record<string, string> = {
  produtos: "Produto", clientes: "Cliente", configuracoes: "Dados da loja", vendas: "Venda",
  venda_pagamentos: "Pagamento / fiado", parcelas: "Parcela do crediário", caixas: "Caixa", perfis: "Usuário",
};
const CAMPO: Record<string, string> = {
  preco: "preço", custo: "custo", nome: "nome", ativo: "ativo", codigo: "código", barras: "código de barras",
  estoque_minimo: "estoque mínimo", validade: "validade", categoria: "categoria", unidade: "unidade",
  limite_credito: "limite de crédito", telefone: "telefone", cpf: "CPF/CNPJ", endereco: "endereço",
  status: "situação", papel: "acesso", fiado_recebido_em: "fiado recebido", pago_em: "pago em", pago_forma: "forma de pagamento",
  motivo_cancelamento: "motivo", nome_loja: "nome da loja", cnpj: "CNPJ", desconto_maximo_percentual: "desconto máximo",
  ocultar_valores_operador: "ocultar valores", pix_chave: "chave Pix", valor_contado: "valor contado",
};
const MOEDA = new Set(["preco", "custo", "limite_credito", "valor_contado"]);
const IGNORAR = new Set(["atualizado_em", "criado_em", "estoque", "ultimo_backup_em", "ultimo_backup_por", "resumo", "atalhos"]);

function mostrar(campo: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "vazio";
  if (MOEDA.has(campo)) return fmtMoeda(Number(v));
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

function descrever(r: Registro) {
  if (r.operacao === "DELETE") return `apagado: ${String(r.antes?.nome ?? r.antes?.codigo ?? r.registro_id ?? "")}`;
  const a = r.antes ?? {}, d = r.depois ?? {};
  const mudou = Object.keys(d).filter((k) => !IGNORAR.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
  const quem = String(d.nome ?? d.cliente_nome ?? "");
  const partes = mudou.slice(0, 4).map((k) => `${CAMPO[k] ?? k}: ${mostrar(k, a[k])} → ${mostrar(k, d[k])}`);
  return `${quem ? quem + " · " : ""}${partes.join(" · ") || "alterado"}${mudou.length > 4 ? " …" : ""}`;
}

function Historico() {
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [existe, setExiste] = useState(true);
  const [filtro, setFiltro] = useState("");
  const carregar = useCallback(async () => {
    let q = supabase.from("auditoria").select("*").order("id", { ascending: false }).limit(300);
    if (filtro) q = q.eq("tabela", filtro);
    const { data, error } = await q;
    if (error) { setExiste(false); return; }
    setLista(data as Registro[]);
  }, [filtro]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!existe) {
    return (
      <div className="cartao mt-6 p-5">
        <h2 className="font-semibold">Histórico de alterações</h2>
        <p className="mt-1 text-sm text-slate-600">Rode o SQL <code>0007_protecao_dados.sql</code> no Supabase para ligar a proteção contra apagar e o histórico de alterações.</p>
      </div>
    );
  }
  return (
    <div className="cartao mt-6 p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">Histórico de alterações</h2>
          <p className="text-xs text-slate-500">Quem mudou preço, cadastro, limite, cancelou venda ou recebeu fiado/parcela. Ninguém consegue apagar este histórico.</p>
        </div>
        <select className="campo w-auto py-1.5 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar histórico">
          <option value="">Tudo</option>
          {Object.entries(NOME_TABELA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!lista ? <p className="text-sm text-slate-500">Carregando…</p> : lista.length === 0 ? <p className="text-sm text-slate-500">Nenhuma alteração registrada ainda.</p> : (
        <div className="overflow-x-auto">
          <table className="tabela text-sm">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Mudança</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDataHora(r.em)}</td>
                  <td>{r.usuario_nome ?? "—"}</td>
                  <td className="whitespace-nowrap">{NOME_TABELA[r.tabela] ?? r.tabela}{r.registro_id ? ` nº ${r.registro_id}` : ""}</td>
                  <td>{descrever(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
