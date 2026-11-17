import { useEffect, useMemo, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { ACOES, comboDoEvento, mapaAtalhos, nomeTecla, validarCombo, type Contexto, type MapaAtalhos } from "../lib/atalhos";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { Confirmar } from "../components/Modal";
import { Aviso, Cabecalho } from "../components/Ui";

const GRUPOS: { ctx: Contexto; titulo: string; texto: string }[] = [
  { ctx: "caixa", titulo: "Tela do caixa", texto: "Funcionam enquanto a balconista passa os produtos." },
  { ctx: "pagamento", titulo: "Janela de pagamento", texto: "Funcionam com a janela de pagamento aberta. Podem repetir teclas da tela do caixa." },
];

function Tecla({ combo }: { combo: string }) {
  if (!combo) return <span className="text-sm text-slate-400">— sem atalho</span>;
  return (
    <kbd className="inline-flex min-w-12 justify-center rounded-md border border-slate-300 border-b-[3px] bg-white px-2.5 py-1 font-mono text-sm font-semibold text-slate-800">
      {nomeTecla(combo)}
    </kbd>
  );
}

export default function Teclado() {
  const { config, recarregar } = useAuth();
  const avisar = useToast();
  const salvo = useMemo(() => mapaAtalhos(config?.atalhos), [config?.atalhos]);
  const [mapa, setMapa] = useState<MapaAtalhos>(salvo);
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);
  const [teste, setTeste] = useState<{ combo: string; acoes: string[] } | null>(null);
  const semColuna = config !== null && config.atalhos === undefined;

  useEffect(() => setMapa(salvo), [salvo]);

  const alterado = ACOES.some((a) => mapa[a.id] !== salvo[a.id]);

  // Captura a próxima tecla apertada para a ação escolhida.
  useEffect(() => {
    if (!gravando) return;
    const acao = ACOES.find((a) => a.id === gravando)!;
    const ouvir = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setGravando(null); return; }
      const combo = comboDoEvento(e);
      if (!combo) return; // só Ctrl/Alt/Shift: espera a tecla
      const problema = validarCombo(combo);
      if (problema) { setErro({ id: acao.id, texto: `${nomeTecla(combo)}: ${problema}` }); return; }
      const conflito = ACOES.find((a) => a.id !== acao.id && a.contexto === acao.contexto && mapa[a.id] === combo);
      if (conflito) {
        setErro({ id: acao.id, texto: `${nomeTecla(combo)} já é usada por “${conflito.nome}”. Remova de lá primeiro ou escolha outra tecla.` });
        return;
      }
      setMapa((m) => ({ ...m, [acao.id]: combo }));
      setErro(null);
      setGravando(null);
    };
    window.addEventListener("keydown", ouvir, true);
    return () => window.removeEventListener("keydown", ouvir, true);
  }, [gravando, mapa]);

  // Área de teste: mostra o que a tecla faria.
  useEffect(() => {
    if (gravando) return;
    const ouvir = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (!alvo.closest?.("#area-teste")) return;
      e.preventDefault();
      const combo = comboDoEvento(e);
      if (!combo) return;
      setTeste({ combo, acoes: ACOES.filter((a) => mapa[a.id] === combo).map((a) => `${a.contexto === "caixa" ? "Caixa" : "Pagamento"}: ${a.nome}`) });
    };
    window.addEventListener("keydown", ouvir, true);
    return () => window.removeEventListener("keydown", ouvir, true);
  }, [gravando, mapa]);

  async function salvar() {
    setSalvando(true);
    // Guarda só o que difere do padrão (mais fácil de atualizar no futuro).
    const diferencas: Record<string, string> = {};
    for (const a of ACOES) if (mapa[a.id] !== a.padrao) diferencas[a.id] = mapa[a.id];
    const { error } = await supabase.from("configuracoes").update({ atalhos: diferencas, atualizado_em: new Date().toISOString() }).eq("id", 1);
    setSalvando(false);
    if (error) return avisar("erro", mensagemErro(error));
    avisar("sucesso", "Teclas salvas. Valem nos caixas na próxima vez que a tela for aberta.");
    void recarregar();
  }

  return (
    <div>
      <Cabecalho
        titulo="Teclado do caixa"
        descricao="Escolha qual tecla faz cada ação no caixa. Vale para todos os computadores da loja."
        acoes={
          <>
            <button className="btn-secundario" onClick={() => setRestaurar(true)}>Restaurar padrão</button>
            <button className="btn-acao" onClick={salvar} disabled={!alterado || salvando || semColuna}>{salvando ? "Salvando…" : "Salvar teclas"}</button>
          </>
        }
      />

      {semColuna && (
        <div className="mb-4">
          <Aviso cor="critico">
            O banco ainda não tem o espaço para guardar as teclas. Rode o arquivo <code>supabase/migrations/0003_atalhos_teclado.sql</code> no SQL Editor do Supabase e recarregue a página.
          </Aviso>
        </div>
      )}
      {alterado && <div className="mb-4"><Aviso cor="atencao">Há alterações ainda não salvas.</Aviso></div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="cartao p-4 text-sm text-slate-600 lg:col-span-2">
          <p className="mb-2 font-semibold text-slate-800">Como trocar uma tecla</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Clique em <strong>Alterar</strong> na ação desejada.</li>
            <li>Aperte a tecla (ou a combinação, como <kbd className="font-mono">Ctrl + K</kbd>) no teclado do caixa.</li>
            <li>Clique em <strong>Salvar teclas</strong>.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            Podem ser usadas: F1 a F12, Ctrl ou Alt + tecla, Insert, Page Up/Down e as teclas + − * / do teclado numérico.
            “Num” = tecla do teclado numérico (o bloco de números à direita).
            Letras e números sozinhos não são aceitos porque servem para digitar. F5, F11, F12 e atalhos do navegador também não.
          </p>
        </div>
        <div id="area-teste" tabIndex={0} className="cartao flex cursor-text flex-col justify-center p-4 text-center outline-none focus:ring-2 focus:ring-petroleo-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Área de teste</p>
          {!teste ? (
            <p className="mt-2 text-sm text-slate-500">Clique aqui e aperte uma tecla para ver o que ela faz no caixa.</p>
          ) : (
            <>
              <div className="mt-2"><Tecla combo={teste.combo} /></div>
              <p className="mt-2 text-sm">{teste.acoes.length ? teste.acoes.join(" · ") : <span className="text-slate-400">Nenhuma ação usa esta tecla.</span>}</p>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {GRUPOS.map((g) => (
          <section key={g.ctx} className="cartao">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold">{g.titulo}</h2>
              <p className="text-xs text-slate-500">{g.texto}</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {ACOES.filter((a) => a.contexto === g.ctx).map((a) => (
                <li key={a.id} className={`px-4 py-3 ${gravando === a.id ? "bg-orange-50" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.nome}</p>
                      <p className="text-xs text-slate-500">{a.descricao}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {gravando === a.id
                        ? <span className="animate-pulse rounded-md bg-acao-500 px-3 py-1 text-sm font-semibold text-white">Aperte a tecla…</span>
                        : <Tecla combo={mapa[a.id]} />}
                      {gravando === a.id ? (
                        <button className="btn-secundario btn-pequeno" onClick={() => { setGravando(null); setErro(null); }}>Cancelar (Esc)</button>
                      ) : (
                        <>
                          <button className="btn-secundario btn-pequeno" onClick={() => { setErro(null); setGravando(a.id); }}>Alterar</button>
                          {mapa[a.id] && <button className="btn-pequeno btn text-slate-500 hover:bg-slate-100" title="Deixar sem atalho" onClick={() => setMapa((m) => ({ ...m, [a.id]: "" }))}>✕</button>}
                        </>
                      )}
                    </div>
                  </div>
                  {erro?.id === a.id && <p className="mt-2 text-xs font-medium text-critico-600">{erro.texto}</p>}
                  {mapa[a.id] !== a.padrao && a.padrao && !gravando && (
                    <button className="mt-1 text-xs text-petroleo-700 hover:underline" onClick={() => setMapa((m) => ({ ...m, [a.id]: a.padrao }))}>
                      Voltar para {nomeTecla(a.padrao)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Confirmar
        aberto={restaurar}
        titulo="Restaurar as teclas padrão?"
        textoConfirmar="Restaurar"
        onCancelar={() => setRestaurar(false)}
        onConfirmar={() => { setMapa(mapaAtalhos({})); setRestaurar(false); avisar("info", "Teclas padrão de volta. Clique em “Salvar teclas” para confirmar."); }}
        mensagem={<p>Todas as ações voltam para as teclas originais do Gerenciador de Mercado. Nada é gravado até você clicar em “Salvar teclas”.</p>}
      />
    </div>
  );
}
