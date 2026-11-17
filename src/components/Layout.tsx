import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { MeuPerfil } from "./MeuPerfil";
import { LOGO_PADRAO } from "../lib/marca";
import { Carregando } from "./Ui";
import { SemConexao } from "./SemConexao";
import { InstalarApp } from "./InstalarApp";
import { ErroTela } from "./ErroTela";
import { abrirCaixaEmJanela, comprasEmAndamento, ehJanelaDoCaixa, EVENTO_CARRINHO, ouvirFixarCaixa } from "../lib/carrinho";
import { fmtMoeda } from "../lib/format";

/** Lembrete diário para o administrador baixar o backup (precisa do SQL 0007). */
function LembreteBackup() {
  const { ehAdmin, config } = useAuth();
  const local = useLocation();
  if (!ehAdmin || !config || config.ultimo_backup_em === undefined || local.pathname.endsWith("/backup")) return null;
  const ultimo = config.ultimo_backup_em ? new Date(config.ultimo_backup_em) : null;
  const horas = ultimo ? (Date.now() - ultimo.getTime()) / 36e5 : Infinity;
  if (horas < 24) return null;
  return (
    <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-atencao-500 bg-atencao-50 px-4 py-3 text-sm text-atencao-700">
      <span>
        📦 <strong>Faça o backup de hoje.</strong>{" "}
        {ultimo ? `O último foi em ${ultimo.toLocaleDateString("pt-BR")} às ${ultimo.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : "Nenhum backup foi feito ainda."}{" "}
        Guarde o arquivo num pen drive ou no Google Drive.
      </span>
      <NavLink to="/backup" className="btn-acao btn-pequeno">Fazer backup agora</NavLink>
    </div>
  );
}

/** Aviso nas outras telas: tem compra no caixa esperando. Nada se perde. */
function CompraEmAndamento() {
  const { perfil } = useAuth();
  const local = useLocation();
  const [, atualizar] = useState(0);
  useEffect(() => {
    const f = () => atualizar((n) => n + 1);
    window.addEventListener(EVENTO_CARRINHO, f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener(EVENTO_CARRINHO, f); window.removeEventListener("storage", f); };
  }, []);
  if (local.pathname.endsWith("/caixa")) return null;
  const compras = comprasEmAndamento(perfil?.id);
  if (!compras.length) return null;
  const c = compras[0];
  return (
    <div className="nao-imprimir fixed bottom-3 left-3 z-[35] flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 rounded-xl border-2 border-acao-500 bg-white px-3 py-2 text-sm shadow-xl lg:left-[17rem]" role="status">
      <span className="font-semibold text-slate-800">🛒 Compra em andamento</span>
      <span className="text-slate-600">{c.itens} {c.itens === 1 ? "item" : "itens"} · {fmtMoeda(c.total)}</span>
      <NavLink to="/caixa" className="btn-acao btn-pequeno">Voltar ao caixa</NavLink>
      <button type="button" className="btn-secundario btn-pequeno" onClick={() => abrirCaixaEmJanela()} title="Abre o caixa numa janela própria, que pode ser movida e mudar de tamanho">⧉ Janela separada</button>
    </div>
  );
}

interface Item { para: string; rotulo: string; icone: string; admin?: boolean }

const ITENS: Item[] = [
  { para: "/", rotulo: "Painel", icone: "▦" },
  { para: "/caixa", rotulo: "Caixa (venda)", icone: "🛒" },
  { para: "/vendas", rotulo: "Vendas e crediário", icone: "🧾" },
  { para: "/produtos", rotulo: "Produtos", icone: "▤" },
  { para: "/estoque", rotulo: "Estoque", icone: "⇅" },
  { para: "/etiquetas", rotulo: "Etiquetas", icone: "🏷" },
  { para: "/relatorios", rotulo: "Relatórios", icone: "≡" },
  { para: "/backup", rotulo: "Backup", icone: "⤓", admin: true },
  { para: "/configuracoes", rotulo: "Usuários e loja", icone: "⚙", admin: true },
  { para: "/teclado", rotulo: "Teclado do caixa", icone: "⌨", admin: true },
];

export function Logo({ claro = false, loja, compacto = false, grande = false }: { claro?: boolean; loja?: { nome: string; logo?: string | null } | null; compacto?: boolean; grande?: boolean }) {
  const nome = loja?.nome?.trim();
  const fonte = loja?.logo || LOGO_PADRAO;
  const [falhou, setFalhou] = useState<string | null>(null);

  // Logo da loja (enviada pela tela ou a padrão do sistema), num fundo branco para ficar legível.
  if (falhou !== fonte) {
    return (
      <div className={`flex items-center justify-center rounded-xl bg-white ${compacto ? "h-11 px-2" : "w-full p-2"}`}>
        <img
          src={fonte}
          alt={nome ? `Logo ${nome}` : "Logo da loja"}
          className={compacto ? "h-9 w-auto max-w-[160px] object-contain" : `mx-auto w-auto max-w-full object-contain ${grande ? "max-h-40" : "max-h-20"}`}
          onError={() => setFalhou(fonte)}
        />
      </div>
    );
  }

  // Sem logo: ícone e nome.
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9 shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className={`truncate text-lg font-bold ${claro ? "text-white" : "text-petroleo-800"}`}>{nome || "Loja Fácil"}</div>
        <div className={`truncate text-[11px] ${claro ? "text-petroleo-200" : "text-slate-500"}`}>
          {nome ? "Loja Fácil · controle de loja" : "Controle de loja sem complicação"}
        </div>
      </div>
    </div>
  );
}

function Menu({ onNavegar }: { onNavegar?: () => void }) {
  const { ehAdmin } = useAuth();
  return (
    <nav className="flex flex-col gap-1">
      {ITENS.filter((i) => !i.admin || ehAdmin).map((i) => (
        <NavLink
          key={i.para}
          to={i.para}
          end={i.para === "/"}
          onClick={onNavegar}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "bg-white/15 text-white" : "text-petroleo-100 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <span className="w-5 text-center text-base">{i.icone}</span>
          {i.rotulo}
        </NavLink>
      ))}
    </nav>
  );
}

function Usuario() {
  const { perfil, sair } = useAuth();
  const [editando, setEditando] = useState(false);
  return (
    <div className="border-t border-white/10 pt-4 text-sm">
      <button onClick={() => setEditando(true)} className="group mb-3 block w-full rounded-lg px-2 py-1 text-left hover:bg-white/10" title="Editar meu nome e senha">
        <span className="block truncate font-medium text-white">{perfil?.nome}</span>
        <span className="block text-xs text-petroleo-200">{perfil?.papel === "admin" ? "Administrador" : "Operador"} · <span className="underline group-hover:text-white">Meu perfil</span></span>
      </button>
      <div className="mb-2"><InstalarApp claro /></div>
      <button onClick={sair} className="w-full rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10">
        Sair
      </button>
      {editando && <MeuPerfil onFechar={() => setEditando(false)} />}
    </div>
  );
}

export function Layout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  const { config } = useAuth();
  const loja = config ? { nome: config.nome_loja, logo: config.logo } : null;
  useEffect(() => setMenuAberto(false), [local.pathname]);
  const navegar = useNavigate();
  useEffect(() => ouvirFixarCaixa(() => navegar("/caixa")), [navegar]);
  useEffect(() => {
    document.title = config?.nome_loja ? `${config.nome_loja} · Loja Fácil` : "Loja Fácil";
  }, [config?.nome_loja]);

  // Caixa aberto em janela separada: só o caixa, sem menu (a janela principal continua com tudo).
  if (ehJanelaDoCaixa() && local.pathname.endsWith("/caixa")) {
    return (
      <div className="min-h-screen">
        <header className="nao-imprimir flex items-center justify-between gap-2 bg-petroleo-800 px-4 py-1.5 text-xs text-petroleo-100">
          <span>🛒 Caixa em janela separada · mova e mude o tamanho desta janela à vontade</span>
          <span>A compra é a mesma da janela principal</span>
        </header>
        <main className="min-w-0 px-3 py-3 sm:px-4">
          <SemConexao />
          <ErroTela key={local.pathname}>
            <Suspense fallback={<Carregando texto="Abrindo a tela…" />}>
              <Outlet />
            </Suspense>
          </ErroTela>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Barra lateral (computador) */}
      <aside className="nao-imprimir hidden w-64 shrink-0 flex-col justify-between bg-petroleo-800 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="space-y-6">
          <Logo claro loja={loja} />
          <Menu />
        </div>
        <Usuario />
      </aside>

      {/* Barra superior (celular/tablet) */}
      <header className="nao-imprimir sticky top-0 z-20 flex items-center justify-between bg-petroleo-800 px-4 py-3 lg:hidden">
        <Logo claro loja={loja} compacto />
        <button onClick={() => setMenuAberto(true)} className="rounded-lg p-2 text-2xl leading-none text-white hover:bg-white/10" aria-label="Abrir menu">
          ☰
        </button>
      </header>
      {menuAberto && (
        <div className="nao-imprimir fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setMenuAberto(false)}>
          <div className="flex h-full w-72 max-w-[85vw] flex-col justify-between bg-petroleo-800 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <Logo claro loja={loja} />
                <button onClick={() => setMenuAberto(false)} className="p-1 text-white" aria-label="Fechar menu">✕</button>
              </div>
              <Menu onNavegar={() => setMenuAberto(false)} />
            </div>
            <Usuario />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <SemConexao />
          <LembreteBackup />
          <ErroTela key={local.pathname}>
            <Suspense fallback={<Carregando texto="Abrindo a tela…" />}>
              <Outlet />
            </Suspense>
          </ErroTela>
        </div>
      </main>
      <CompraEmAndamento />
    </div>
  );
}
