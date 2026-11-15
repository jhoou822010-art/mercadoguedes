import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { cnpjValido, fmtDataHora, lerNumero, mascaraCnpj } from "../lib/format";
import type { Configuracoes as TConfig, Papel, Perfil, VendaCompleta } from "../lib/types";
import { CupomVenda, JanelaComprovante } from "../components/Comprovante";
import { larguraCupom, salvarLarguraCupom } from "../lib/imprimir";
import { reduzirImagem } from "../lib/imagem";
import { LOGO_PADRAO } from "../lib/marca";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar } from "../components/Modal";
import { Aviso, Cabecalho, Carregando, Selo } from "../components/Ui";

/** Venda fictícia usada só para mostrar a prévia do comprovante. */
const VENDA_EXEMPLO: VendaCompleta = {
  id: 1234, caixa_id: 1, usuario_id: null, usuario_nome: "Maria (exemplo)", status: "concluida",
  subtotal: 64.79, desconto: 4.79, total: 60, valor_pago: 100, troco: 40, cliente_nome: null, cliente_telefone: null,
  criado_em: new Date().toISOString(), cancelada_em: null, cancelada_por_nome: null, motivo_cancelamento: null,
  venda_itens: [
    { id: 1, venda_id: 1234, produto_id: null, produto_codigo: "001", produto_nome: "Arroz Tipo 1 5 kg", unidade: "UN", quantidade: 2, preco_unitario: 27.9, total: 55.8 },
    { id: 2, venda_id: 1234, produto_id: null, produto_codigo: "002", produto_nome: "Banana Prata", unidade: "KG", quantidade: 1.5, preco_unitario: 5.99, total: 8.99 },
  ],
  venda_pagamentos: [{ id: 1, venda_id: 1234, forma: "dinheiro", valor: 100, fiado_recebido_em: null, fiado_recebido_forma: null, fiado_recebido_por: null }],
};

const NOME_PAPEL: Record<Papel, string> = { admin: "Administrador", operador: "Operador", pendente: "Aguardando liberação" };

export default function Configuracoes() {
  const { perfil: eu, config, recarregar } = useAuth();
  const avisar = useToast();
  const [usuarios, setUsuarios] = useState<Perfil[] | null>(null);
  const [mudanca, setMudanca] = useState<{ u: Perfil; papel: Papel } | null>(null);
  const [processando, setProcessando] = useState(false);
  const [nomeLoja, setNomeLoja] = useState(config?.nome_loja ?? "");
  const [diasAlerta, setDiasAlerta] = useState(String(config?.dias_alerta_validade ?? 30));
  const [salvando, setSalvando] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [mostrarCnpj, setMostrarCnpj] = useState(true);
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [descMax, setDescMax] = useState("100");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoNoComprovante, setLogoNoComprovante] = useState(true);
  const [processandoLogo, setProcessandoLogo] = useState(false);
  const [permitirAvulso, setPermitirAvulso] = useState(true);
  const semColunaAvulso = config !== null && config.permitir_item_avulso === undefined;
  // A coluna "logo" só existe depois de rodar o SQL 0004.
  const semColunaLogo = config !== null && config.logo === undefined;

  useEffect(() => {
    if (!config) return;
    setNomeLoja(config.nome_loja);
    setDiasAlerta(String(config.dias_alerta_validade));
    setCnpj(config.cnpj ?? "");
    setMostrarCnpj(config.mostrar_cnpj ?? true);
    setEndereco(config.endereco ?? "");
    setTelefone(config.telefone ?? "");
    setMensagem(config.mensagem_comprovante ?? "");
    setDescMax(String(config.desconto_maximo_percentual ?? 100).replace(".", ","));
    setLogo(config.logo ?? null);
    setLogoNoComprovante(config.logo_no_comprovante ?? true);
    setPermitirAvulso(config.permitir_item_avulso ?? true);
  }, [config]);

  async function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    setProcessandoLogo(true);
    try {
      setLogo(await reduzirImagem(arquivo));
      avisar("info", "Logo carregada. Confira a prévia e clique em “Salvar”.");
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : String(e));
    } finally {
      setProcessandoLogo(false);
    }
  }

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("perfis").select("*").order("criado_em");
    if (error) return avisar("erro", mensagemErro(error));
    setUsuarios(data as Perfil[]);
  }, [avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function aplicarPapel() {
    if (!mudanca) return;
    setProcessando(true);
    const { error } = await supabase.rpc("definir_papel", { p_usuario: mudanca.u.id, p_papel: mudanca.papel });
    setProcessando(false);
    if (error) return avisar("erro", mensagemErro(error));
    avisar("sucesso", `${mudanca.u.nome} agora é ${NOME_PAPEL[mudanca.papel].toLowerCase()}.`);
    setMudanca(null);
    void carregar();
    if (mudanca.u.id === eu?.id) void recarregar();
  }

  async function salvarLoja(e: FormEvent) {
    e.preventDefault();
    const dias = Number(diasAlerta);
    if (!nomeLoja.trim()) return avisar("erro", "Informe o nome da loja.");
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) return avisar("erro", "Os dias de alerta devem ficar entre 1 e 365.");
    if (cnpj.trim() && !cnpjValido(cnpj)) return avisar("erro", "CNPJ inválido. Confira os números.");
    const desc = lerNumero(descMax);
    if (Number.isNaN(desc) || desc < 0 || desc > 100) return avisar("erro", "O desconto máximo deve ficar entre 0 e 100%.");
    setSalvando(true);
    const { error } = await supabase.from("configuracoes").update({
      nome_loja: nomeLoja.trim(),
      dias_alerta_validade: dias,
      cnpj: cnpj.trim() || null,
      mostrar_cnpj: mostrarCnpj,
      endereco: endereco.trim() || null,
      telefone: telefone.trim() || null,
      mensagem_comprovante: mensagem.trim(),
      desconto_maximo_percentual: desc,
      ...(semColunaLogo ? {} : { logo, logo_no_comprovante: logoNoComprovante }),
      ...(semColunaAvulso ? {} : { permitir_item_avulso: permitirAvulso }),
      atualizado_em: new Date().toISOString(),
    }).eq("id", 1);
    setSalvando(false);
    if (error) return avisar("erro", mensagemErro(error));
    avisar("sucesso", "Dados da loja salvos.");
    void recarregar();
  }

  // Configuração "ao vivo" com o que está digitado (ainda não salvo), para a prévia.
  const configPrevia = useMemo<TConfig>(() => ({
    id: 1,
    nome_loja: nomeLoja.trim() || "Nome da loja",
    dias_alerta_validade: Number(diasAlerta) || 30,
    atualizado_em: new Date().toISOString(),
    cnpj: cnpj.trim() || null,
    mostrar_cnpj: mostrarCnpj,
    endereco: endereco.trim() || null,
    telefone: telefone.trim() || null,
    mensagem_comprovante: mensagem.trim(),
    desconto_maximo_percentual: 100,
    logo,
    logo_no_comprovante: logoNoComprovante,
  }), [nomeLoja, diasAlerta, cnpj, mostrarCnpj, endereco, telefone, mensagem, logo, logoNoComprovante]);
  const [largura, setLargura] = useState<"80" | "58">(larguraCupom());
  const [teste, setTeste] = useState(false);
  const alterado = Boolean(config) && (
    nomeLoja !== config!.nome_loja || cnpj !== (config!.cnpj ?? "") || mostrarCnpj !== config!.mostrar_cnpj ||
    endereco !== (config!.endereco ?? "") || telefone !== (config!.telefone ?? "") || mensagem !== (config!.mensagem_comprovante ?? "") ||
    (!semColunaLogo && (logo !== (config!.logo ?? null) || logoNoComprovante !== (config!.logo_no_comprovante ?? true))));

  const pendentes = usuarios?.filter((u) => u.papel === "pendente").length ?? 0;

  return (
    <div>
      <Cabecalho titulo="Usuários e loja" descricao="Libere acessos, defina papéis e ajuste os dados da loja." />

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={salvarLoja} className="cartao space-y-4 p-5">
          <h2 className="font-semibold">Dados da loja</h2>
          <div>
            <label className="rotulo" htmlFor="nl">Nome da loja</label>
            <input id="nl" className="campo" value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} maxLength={80} />
            <p className="mt-1 text-xs text-slate-400">Aparece no topo do menu, na aba do navegador, nas etiquetas, nos relatórios e no comprovante.</p>
          </div>
          <div>
            <span className="rotulo">Logo da loja</span>
            {semColunaLogo ? (
              <Aviso cor="atencao">
                A logo do sistema já aparece no menu e no comprovante. Para trocar a logo por esta tela, rode antes o arquivo <code>supabase/migrations/0004_logo_loja.sql</code> no SQL Editor do Supabase.
              </Aviso>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <img src={logo || LOGO_PADRAO} alt="Logo da loja" className="h-full w-full object-contain p-1" />
                </div>
                <div className="space-y-2">
                  <label className="btn-secundario btn-pequeno cursor-pointer">
                    {processandoLogo ? "Processando…" : logo ? "Trocar logo" : "Enviar logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={processandoLogo}
                      onChange={(e) => { void escolherLogo(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {logo && <button type="button" className="ml-2 text-xs font-semibold text-critico-600 hover:underline" onClick={() => setLogo(null)}>Remover</button>}
                  <p className="text-xs text-slate-400">
                    {logo ? "Logo enviada por você." : "Usando a logo que já vem no sistema."} PNG, JPG ou WEBP; o sistema reduz o tamanho sozinho.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="rotulo" htmlFor="da">Avisar validade com quantos dias de antecedência?</label>
            <input id="da" className="campo" inputMode="numeric" value={diasAlerta} onChange={(e) => setDiasAlerta(e.target.value)} />
          </div>
          <h3 className="border-t border-slate-100 pt-4 font-semibold">Comprovante não fiscal</h3>
          <div>
            <label className="rotulo" htmlFor="cnpj">CNPJ</label>
            <input id="cnpj" className="campo" inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
            {cnpj.replace(/\D/g, "").length === 14 && !cnpjValido(cnpj) && <p className="mt-1 text-xs text-critico-600">CNPJ inválido.</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-petroleo-700" checked={mostrarCnpj} onChange={(e) => setMostrarCnpj(e.target.checked)} />
            Mostrar o CNPJ no comprovante
          </label>
          {!semColunaLogo && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-petroleo-700" checked={logoNoComprovante} onChange={(e) => setLogoNoComprovante(e.target.checked)} />
              Mostrar a logo no comprovante (sai em preto e branco)
            </label>
          )}
          <div>
            <label className="rotulo" htmlFor="end">Endereço</label>
            <input id="end" className="campo" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={120} placeholder="Rua, número, bairro, cidade" />
          </div>
          <div>
            <label className="rotulo" htmlFor="telj">Telefone</label>
            <input id="telj" className="campo" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
          </div>
          <div>
            <label className="rotulo" htmlFor="msg">Mensagem no rodapé</label>
            <input id="msg" className="campo" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={120} />
          </div>
          <h3 className="border-t border-slate-100 pt-4 font-semibold">Caixa</h3>
          <div>
            <label className="rotulo" htmlFor="dmax">Desconto máximo que o operador pode dar (%)</label>
            <input id="dmax" className="campo" inputMode="decimal" value={descMax} onChange={(e) => setDescMax(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">100 = sem limite. O administrador nunca tem limite.</p>
          </div>
          {semColunaAvulso ? (
            <p className="text-xs text-slate-500">Item sem cadastro no caixa: rode o SQL <code>0005_item_avulso.sql</code> no Supabase para ativar.</p>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-petroleo-700" checked={permitirAvulso} onChange={(e) => setPermitirAvulso(e.target.checked)} />
              <span>
                Operador pode lançar <strong>item sem cadastro</strong> no caixa
                <span className="block text-xs text-slate-400">A balconista digita descrição e preço. O administrador sempre pode.</span>
              </span>
            </label>
          )}
          <button className="btn-primario w-full" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </form>

        <section className="cartao p-5 lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Prévia do comprovante</h2>
              <p className="text-xs text-slate-500">Muda enquanto você digita. Os produtos são apenas exemplo.</p>
            </div>
            <select className="campo w-auto py-1.5 text-sm" value={largura} onChange={(e) => { const v = e.target.value as "80" | "58"; setLargura(v); salvarLarguraCupom(v); }} aria-label="Largura do papel">
              <option value="80">Papel 80 mm</option>
              <option value="58">Papel 58 mm</option>
            </select>
          </div>
          {alterado && <p className="mb-3 rounded-lg bg-atencao-50 px-3 py-2 text-xs font-medium text-atencao-700">Alterações ainda não salvas — clique em “Salvar” para valer nos comprovantes.</p>}
          <div className="flex justify-center rounded-lg bg-slate-100 p-4">
            <div className="shadow">
              <CupomVenda venda={VENDA_EXEMPLO} config={configPrevia} largura={largura} />
            </div>
          </div>
          <button type="button" className="btn-secundario mt-3 w-full" onClick={() => setTeste(true)}>🖨 Imprimir comprovante de teste</button>
        </section>
      </div>

      <div className="mt-6">
        <section className="cartao">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold">Usuários</h2>
            {pendentes > 0 && <Selo cor="atencao">{pendentes} aguardando liberação</Selo>}
          </div>
          <div className="space-y-1 border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            <p><strong>Administrador:</strong> tudo — cadastra, edita preços, remove produtos, cancela vendas, vê todos os caixas, gera backup e gerencia usuários.</p>
            <p><strong>Operador (balconista):</strong> vende no caixa, dá desconto até o limite, recebe fiado, movimenta estoque, imprime etiquetas e vê relatórios.</p>
            <p>Novos cadastros entram como <strong>aguardando liberação</strong> e não veem nada até você liberar.</p>
          </div>
          {!usuarios ? <Carregando /> : (
            <ul className="divide-y divide-slate-100">
              {usuarios.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{u.nome} {u.id === eu?.id && <span className="text-xs text-slate-400">(você)</span>}</p>
                    <p className="truncate text-xs text-slate-500">{u.email} · desde {fmtDataHora(u.criado_em)}</p>
                  </div>
                  <select
                    className="campo w-full py-1.5 text-sm sm:w-56"
                    value={u.papel}
                    onChange={(e) => setMudanca({ u, papel: e.target.value as Papel })}
                    aria-label={`Papel de ${u.nome}`}
                  >
                    {(Object.keys(NOME_PAPEL) as Papel[]).map((p) => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {teste && (
        <JanelaComprovante titulo="Comprovante de teste" onFechar={() => setTeste(false)}>
          {(l) => <CupomVenda venda={VENDA_EXEMPLO} config={configPrevia} largura={l} />}
        </JanelaComprovante>
      )}

      <Confirmar
        aberto={Boolean(mudanca)}
        titulo="Alterar acesso?"
        processando={processando}
        onCancelar={() => setMudanca(null)}
        onConfirmar={aplicarPapel}
        perigo={mudanca?.u.id === eu?.id}
        mensagem={mudanca && (
          <>
            <p><strong>{mudanca.u.nome}</strong> passará de <strong>{NOME_PAPEL[mudanca.u.papel]}</strong> para <strong>{NOME_PAPEL[mudanca.papel]}</strong>.</p>
            {mudanca.u.id === eu?.id && <p className="mt-2 text-critico-700">Atenção: você está alterando o seu próprio acesso.</p>}
          </>
        )}
      />
    </div>
  );
}
