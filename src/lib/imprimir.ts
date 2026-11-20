/*
  IMPRESSÃO — um único caminho para tudo o que o sistema imprime.

  O navegador só imprime sem abrir a janela de impressão quando o Chrome (ou o
  Edge) é aberto com o parâmetro --kiosk-printing. Não existe outro jeito
  suportado numa página web. Por isso:

  - "normal": cada impressão abre a janela do navegador (como sempre foi).
  - "direta": este computador usa o atalho "Caixa - impressão direta", que abre
    o Chrome com --kiosk-printing num perfil próprio. O clique em Imprimir manda
    direto para a impressora (a padrão do Windows ou a última escolhida no
    atalho "Caixa - configurar impressora").

  O sistema não consegue ver se a impressora está ligada (o navegador não
  informa isso). Se estiver desligada, o Windows guarda o documento na fila e
  imprime quando ela voltar; por isso uma segunda impressão do mesmo documento
  logo em seguida pede confirmação, para não sair repetido.

  Os modelos (tamanho, margens, fontes) continuam os mesmos: só muda quem
  confirma a impressão.
*/
import { useEffect, useState } from "react";

/* ------------------------- largura do papel (já existia) ------------------------- */
/** Lê a preferência de largura do papel guardada neste computador. */
export function larguraCupom(): "80" | "58" {
  try {
    return localStorage.getItem("lojafacil.cupom") === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}
export function salvarLarguraCupom(v: "80" | "58") {
  try {
    localStorage.setItem("lojafacil.cupom", v);
  } catch {
    /* sem armazenamento: usa o padrão */
  }
}

/* --------------------------------- modo do computador --------------------------------- */
export type ModoImpressao = "normal" | "direta";
/*
  O modo direto vale só para a JANELA aberta pelo atalho "Caixa - impressão direta"
  (o Chrome dele tem --kiosk-printing). Por isso fica no sessionStorage da janela,
  e não no computador inteiro: o Chrome comum (que sempre abre a janela de
  impressão) nunca fica marcado como direto.
*/
const CHAVE_MODO = "lojafacil.impressao";

export function modoImpressao(): ModoImpressao {
  try {
    return sessionStorage.getItem(CHAVE_MODO) === "direta" ? "direta" : "normal";
  } catch {
    return "normal";
  }
}
function definirModoImpressao(m: ModoImpressao) {
  try {
    if (m === "direta") sessionStorage.setItem(CHAVE_MODO, "direta");
    else sessionStorage.removeItem(CHAVE_MODO);
  } catch {
    /* sem armazenamento: continua no modo normal */
  }
  window.dispatchEvent(new Event("lojafacil:impressao"));
}
export function useModoImpressao(): ModoImpressao {
  const [m, setM] = useState(modoImpressao);
  useEffect(() => {
    const f = () => setM(modoImpressao());
    window.addEventListener("lojafacil:impressao", f);
    return () => window.removeEventListener("lojafacil:impressao", f);
  }, []);
  return m;
}

/**
 * Os atalhos abrem o sistema com ?impressao=direta (impressão direta) ou
 * ?impressao=normal (configurar impressora). Guarda nesta janela e tira da barra.
 */
export function aplicarModoDaUrl() {
  // Versão anterior guardava o modo no computador inteiro: apaga essa marca antiga.
  try { localStorage.removeItem(CHAVE_MODO); } catch { /* sem armazenamento */ }
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get("impressao");
    if (v !== "direta" && v !== "normal") return;
    definirModoImpressao(v);
    u.searchParams.delete("impressao");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch {
    /* endereço estranho: ignora */
  }
}

/* --------------------------- perguntas e avisos (tela) --------------------------- */
/** A tela (components/PerguntasImpressao) se registra aqui para mostrar perguntas e avisos. */
export interface TelaImpressao {
  perguntar: (titulo: string, paragrafos: string[], sim: string) => Promise<boolean>;
  avisar: (tipo: "sucesso" | "erro" | "info", texto: string) => void;
}
let tela: TelaImpressao | null = null;
export function registrarTelaImpressao(t: TelaImpressao | null) { tela = t; }

function perguntar(titulo: string, paragrafos: string[], sim: string): Promise<boolean> {
  if (tela) return tela.perguntar(titulo, paragrafos, sim);
  return Promise.resolve(window.confirm(`${titulo}\n\n${paragrafos.join("\n\n")}`));
}

/* ------------------------------------ imprimir ------------------------------------ */
/** "cupom": comprovante na impressora térmica. "folha": relatórios, listas e etiquetas (A4). */
export type TipoImpressao = "cupom" | "folha";

const REPETICAO_MS = 2 * 60 * 1000;
const enviados = new Map<string, number>();
let emAndamento = false;

function tirarModoCupom() { document.body.classList.remove("modo-cupom"); }

/**
 * Imprime o documento. Retorna true se foi enviado.
 * - Ignora cliques repetidos enquanto uma impressão está em andamento.
 * - No modo direto: pede confirmação para repetir o mesmo documento em até 2 min
 *   e avisa antes de mandar uma folha A4 para a impressora de cupom.
 */
export async function imprimir(tipo: TipoImpressao, chave?: string): Promise<boolean> {
  if (emAndamento) return false;
  emAndamento = true;
  try {
    const direta = modoImpressao() === "direta";

    if (direta && tipo === "folha") {
      const ok = await perguntar(
        "Imprimir na impressora de cupom?",
        [
          "Este computador está em impressão direta: tudo vai para a impressora configurada (normalmente a de cupom), sem abrir a janela de impressão.",
          "Relatórios, listas e etiquetas são feitos para folha A4. Para imprimir em folha, use o sistema aberto pelo atalho normal (sem impressão direta).",
        ],
        "Imprimir assim mesmo",
      );
      if (!ok) return false;
    }

    const k = chave ? `${tipo}:${chave}` : null;
    const antes = k ? enviados.get(k) : undefined;
    if (direta && antes && Date.now() - antes < REPETICAO_MS) {
      const seg = Math.max(1, Math.round((Date.now() - antes) / 1000));
      const ok = await perguntar(
        "Imprimir de novo?",
        [
          `Este documento já foi enviado para a impressora há ${seg} segundo(s).`,
          "Se não saiu, confira se a impressora está ligada, com papel e com o cabo conectado. O Windows guarda o documento e imprime sozinho quando ela voltar — imprimir de novo pode sair repetido.",
        ],
        "Imprimir outra via",
      );
      if (!ok) return false;
    }

    // Prepara a página: cupom mostra só o comprovante; folha mostra a tela inteira.
    tirarModoCupom();
    if (tipo === "cupom") {
      document.body.classList.add("modo-cupom");
      window.addEventListener("afterprint", tirarModoCupom, { once: true });
    }
    try {
      window.print();
    } catch (e) {
      tirarModoCupom();
      tela?.avisar("erro", `Não foi possível imprimir: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    // Na janela normal o print() só volta depois de fechar a janela; na direta volta logo.
    // A marca "modo-cupom" só vale para o papel; sai em seguida (ou no afterprint).
    setTimeout(tirarModoCupom, direta ? 4000 : 1000);

    if (direta) {
      if (k) enviados.set(k, Date.now());
      tela?.avisar("sucesso", "Enviado para a impressora. Se não sair, confira se ela está ligada e com papel.");
    }
    return true;
  } finally {
    // Pequena pausa contra clique duplo / tecla Enter repetida.
    setTimeout(() => { emAndamento = false; }, 800);
  }
}

/** Imprime somente o comprovante (.cupom). Mantido para as telas que já usavam. */
export function imprimirCupom(chave?: string) {
  return imprimir("cupom", chave);
}

/* ------------------------------ atalhos do Windows ------------------------------ */
/**
 * Monta o instalador (.cmd) que cria os atalhos:
 *  - Área de Trabalho: "Caixa - impressao direta" (Chrome/Edge com --kiosk-printing
 *    num perfil próprio) e "Caixa - configurar impressora" (o mesmo perfil, com a
 *    janela de impressão, para escolher impressora, papel e margens uma vez).
 *  - Inicializar do Windows: "Caixa - impressao direta", para abrir sozinho ao ligar.
 * Os atalhos usam o ícone do supermercado (gravado a partir do texto em base64).
 */
export function instaladorAtalhos(enderecoSistema: string, iconeBase64 = "") {
  const url = enderecoSistema.replace(/[^A-Za-z0-9:/._~-]/g, "");
  const ico = iconeBase64.replace(/[^A-Za-z0-9+/=]/g, "");
  const linhasIcone: string[] = [];
  if (ico) {
    // O ícone vai em pedaços de texto (base64) e o PowerShell monta o arquivo .ico.
    // (Sem certutil: alguns antivírus bloqueiam o certutil.) Se falhar, baixa do site.
    for (let i = 0; i < ico.length; i += 76) linhasIcone.push(`${i === 0 ? ">" : ">>"}"%ICO%.b64" echo ${ico.slice(i, i + 76)}`);
  }
  linhasIcone.push(
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"try { $t=(Get-Content -LiteralPath ($env:ICO+'.b64')) -join ''; [IO.File]::WriteAllBytes($env:ICO,[Convert]::FromBase64String($t)) } catch { try { Invoke-WebRequest -UseBasicParsing -Uri ($env:URLSIS+'icones/atalho.ico') -OutFile $env:ICO } catch {} }\"",
  );
  const atalho = (v: string, pasta: string, nome: string, args: string, desc: string) =>
    `$${v}=$w.CreateShortcut(${pasta}+'\\${nome}.lnk'); $${v}.TargetPath=$env:NAV; $${v}.Arguments=${args}; $${v}.Description='${desc}'; if (Test-Path $env:ICO) { $${v}.IconLocation=$env:ICO+',0' }; $${v}.Save(); `;
  const argsDireta = "'--kiosk-printing --user-data-dir='+$q+$env:PERFIL+$q+' --app='+$env:URLSIS+'?impressao=direta'";
  const argsConfig = "'--user-data-dir='+$q+$env:PERFIL+$q+' --app='+$env:URLSIS+'?impressao=normal'";
  const linhas = [
    "@echo off",
    "title Gerenciador de Mercado - impressao direta",
    "echo.",
    "echo  Gerenciador de Mercado - criando os atalhos de impressao direta...",
    "echo.",
    `set "URLSIS=${url}"`,
    'set "PASTA=%LOCALAPPDATA%\\GerenciadorMercado"',
    'set "PERFIL=%PASTA%\\perfil-caixa"',
    'set "ICO=%PASTA%\\gerenciador.ico"',
    'set "NAV="',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "NAV=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined NAV if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "NAV=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined NAV if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "NAV=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined NAV if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "NAV=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not defined NAV if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "NAV=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    "if not defined NAV goto semnavegador",
    'if not exist "%PERFIL%" mkdir "%PERFIL%"',
    ...linhasIcone,
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$q=[char]34; $w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $i=[Environment]::GetFolderPath('Startup'); " +
      atalho("a", "$d", "Caixa - impressao direta", argsDireta, "Gerenciador de Mercado - imprime direto, sem abrir a janela de impressao") +
      atalho("b", "$d", "Caixa - configurar impressora", argsConfig, "Gerenciador de Mercado - escolher impressora, papel e margens da impressao direta") +
      atalho("c", "$i", "Caixa - impressao direta", argsDireta, "Gerenciador de Mercado - abre o caixa ao ligar o computador") +
      "\"",
    "if errorlevel 1 goto erro",
    // Atualiza os ícones da Área de Trabalho (o Windows guarda os antigos na memória).
    "ie4uinit.exe -show >nul 2>&1",
    "echo  Pronto! Na Area de Trabalho foram criados:",
    "echo    - Caixa - impressao direta      (use este para vender)",
    "echo    - Caixa - configurar impressora (use uma vez para escolher a impressora)",
    "echo  E o caixa vai abrir sozinho quando o computador ligar.",
    "echo  Para desligar isso: tecla Windows + R, digite shell:startup e apague o atalho.",
    "echo.",
    "pause",
    "exit /b 0",
    ":semnavegador",
    "echo  Nao encontrei o Google Chrome nem o Microsoft Edge neste computador.",
    "echo  Instale o Google Chrome e rode este arquivo de novo.",
    "pause",
    "exit /b 1",
    ":erro",
    "echo  Nao foi possivel criar os atalhos. Tente clicar com o botao direito neste arquivo",
    "echo  e escolher 'Executar como administrador'.",
    "pause",
    "exit /b 1",
    "",
  ];
  return linhas.join("\r\n");
}
