import { useEffect, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { termoBusca } from "../lib/data";
import { fmtMoeda } from "../lib/format";
import type { Cliente } from "../lib/types";
import { Aviso } from "./Ui";

/**
 * Escolher um cliente cadastrado (crediário). Busca por nome, telefone ou CPF
 * e permite cadastrar um cliente novo sem sair da venda.
 */
export function ClienteSeletor({ escolhido, onEscolher }: { escolhido: Cliente | null; onEscolher: (c: Cliente | null) => void }) {
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState<Cliente[]>([]);
  const [emAberto, setEmAberto] = useState<number | null>(null);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = termoBusca(texto);
    if (!t) { setLista([]); return; }
    const id = setTimeout(async () => {
      const { data } = await supabase.from("clientes").select("*").eq("ativo", true)
        .or(`nome.ilike.*${t}*,telefone.ilike.*${t}*,cpf.ilike.*${t}*`).order("nome").limit(8);
      setLista((data ?? []) as Cliente[]);
    }, 250);
    return () => clearTimeout(id);
  }, [texto]);

  // Quanto o cliente escolhido já deve no crediário.
  useEffect(() => {
    setEmAberto(null);
    if (!escolhido) return;
    supabase.from("parcelas").select("valor").eq("cliente_id", escolhido.id).eq("status", "aberta")
      .then(({ data }) => setEmAberto((data ?? []).reduce((s, p) => s + Number(p.valor), 0)));
  }, [escolhido]);

  async function cadastrar() {
    setErro("");
    if (nome.trim().length < 2) return setErro("Informe o nome do cliente.");
    setSalvando(true);
    const { data, error } = await supabase.from("clientes")
      .insert({ nome: nome.trim(), telefone: telefone.trim() || null, cpf: cpf.trim() || null })
      .select("*").single();
    setSalvando(false);
    if (error) return setErro(error.code === "23505" ? "Já existe um cliente com este CPF." : mensagemErro(error));
    onEscolher(data as Cliente);
    setNovo(false); setNome(""); setTelefone(""); setCpf(""); setTexto("");
  }

  if (escolhido) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-petroleo-200 bg-petroleo-50 p-3 text-sm">
        <div>
          <p className="font-semibold">{escolhido.nome}</p>
          <p className="text-xs text-slate-500">{[escolhido.telefone, escolhido.cpf && `CPF ${escolhido.cpf}`].filter(Boolean).join(" · ") || "sem telefone"}</p>
          <p className="mt-1 text-xs">
            Em aberto no crediário: <strong>{emAberto === null ? "…" : fmtMoeda(emAberto)}</strong>
            {escolhido.limite_credito !== null && <> · Limite: <strong>{fmtMoeda(escolhido.limite_credito)}</strong></>}
          </p>
        </div>
        <button type="button" className="text-xs font-semibold text-petroleo-700 hover:underline" onClick={() => onEscolher(null)}>Trocar</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!novo ? (
        <>
          <input className="campo" placeholder="Buscar cliente por nome, telefone ou CPF" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar cliente" />
          {lista.length > 0 && (
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {lista.map((c) => (
                <li key={c.id}>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-petroleo-50" onClick={() => onEscolher(c)}>
                    <span className="font-medium">{c.nome}</span>
                    <span className="ml-2 text-xs text-slate-500">{[c.telefone, c.cpf].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {texto.trim() && lista.length === 0 && <p className="text-xs text-slate-500">Nenhum cliente encontrado.</p>}
          <button type="button" className="text-sm font-semibold text-petroleo-700 hover:underline" onClick={() => { setNovo(true); setNome(texto); }}>+ Cadastrar cliente novo</button>
        </>
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold">Cliente novo</p>
          <input className="campo" placeholder="Nome completo *" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus aria-label="Nome do cliente" />
          <div className="grid grid-cols-2 gap-2">
            <input className="campo" placeholder="Telefone" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} aria-label="Telefone" />
            <input className="campo" placeholder="CPF (opcional)" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} aria-label="CPF" />
          </div>
          {erro && <Aviso cor="critico">{erro}</Aviso>}
          <div className="flex gap-2">
            <button type="button" className="btn-primario btn-pequeno" onClick={cadastrar} disabled={salvando}>{salvando ? "Salvando…" : "Cadastrar e usar"}</button>
            <button type="button" className="btn-secundario btn-pequeno" onClick={() => setNovo(false)}>Cancelar</button>
          </div>
          <p className="text-xs text-slate-400">O limite de crédito é definido pelo administrador em Vendas → Clientes.</p>
        </div>
      )}
    </div>
  );
}
