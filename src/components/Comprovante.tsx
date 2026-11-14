import { useState } from "react";
import { createPortal } from "react-dom";
import type { Configuracoes, ResumoCaixa, VendaCompleta, FormaPagamento } from "../lib/types";
import { fmtDataHora, fmtMoeda, fmtQtd, NOME_FORMA } from "../lib/format";
import { imprimirCupom, larguraCupom, salvarLarguraCupom } from "../lib/imprimir";
import { Modal } from "./Modal";

function CabecalhoLoja({ config }: { config: Configuracoes | null }) {
  return (
    <div className="centro">
      <div style={{ fontWeight: 700, fontSize: "1.15em" }}>{config?.nome_loja ?? "Loja"}</div>
      {config?.mostrar_cnpj && config.cnpj && <div>CNPJ: {config.cnpj}</div>}
      {config?.endereco && <div>{config.endereco}</div>}
      {config?.telefone && <div>Tel.: {config.telefone}</div>}
    </div>
  );
}

export function CupomVenda({ venda, config, largura }: { venda: VendaCompleta; config: Configuracoes | null; largura: "80" | "58" }) {
  const cancelada = venda.status === "cancelada";
  return (
    <div className={`cupom ${largura === "58" ? "cupom-58" : ""}`}>
      <CabecalhoLoja config={config} />
      <hr />
      <div className="centro" style={{ fontWeight: 700 }}>COMPROVANTE NÃO FISCAL</div>
      {cancelada && <div className="centro" style={{ fontWeight: 700 }}>*** VENDA CANCELADA ***</div>}
      <hr />
      <div className="linha"><span>Venda nº {venda.id}</span><span>{fmtDataHora(venda.criado_em)}</span></div>
      <div>Operador(a): {venda.usuario_nome ?? "—"}</div>
      <hr />
      {venda.venda_itens.map((i, n) => (
        <div key={i.id} style={{ marginBottom: 2 }}>
          <div>{String(n + 1).padStart(2, "0")} {i.produto_nome}</div>
          <div className="linha">
            <span>&nbsp;&nbsp;{fmtQtd(i.quantidade, i.unidade)} {i.unidade} x {fmtMoeda(i.preco_unitario)}</span>
            <span>{fmtMoeda(i.total)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="linha"><span>Subtotal</span><span>{fmtMoeda(venda.subtotal)}</span></div>
      {Number(venda.desconto) > 0 && <div className="linha"><span>Desconto</span><span>- {fmtMoeda(venda.desconto)}</span></div>}
      <div className="linha" style={{ fontWeight: 700, fontSize: "1.25em" }}><span>TOTAL</span><span>{fmtMoeda(venda.total)}</span></div>
      <hr />
      {venda.venda_pagamentos.map((p) => (
        <div key={p.id} className="linha"><span>{NOME_FORMA[p.forma as FormaPagamento]}</span><span>{fmtMoeda(p.valor)}</span></div>
      ))}
      {Number(venda.troco) > 0 && <div className="linha" style={{ fontWeight: 700 }}><span>Troco</span><span>{fmtMoeda(venda.troco)}</span></div>}
      {venda.cliente_nome && (
        <>
          <hr />
          <div>Cliente: {venda.cliente_nome}</div>
          {venda.cliente_telefone && <div>Telefone: {venda.cliente_telefone}</div>}
          {venda.venda_pagamentos.some((p) => p.forma === "fiado") && (
            <div style={{ marginTop: 14 }}>
              <div>Assinatura: _______________________</div>
            </div>
          )}
        </>
      )}
      <hr />
      {config?.mensagem_comprovante && <div className="centro">{config.mensagem_comprovante}</div>}
      <div className="centro" style={{ fontSize: "0.85em", marginTop: 4 }}>
        Comprovante não fiscal. Não substitui NF-e, NFC-e ou cupom fiscal.
      </div>
      <div className="centro" style={{ fontSize: "0.8em", marginTop: 2 }}>Loja Fácil</div>
    </div>
  );
}

export function CupomFechamento({ r, config, largura, contado, diferenca, observacao }: {
  r: ResumoCaixa; config: Configuracoes | null; largura: "80" | "58"; contado?: number | null; diferenca?: number | null; observacao?: string | null;
}) {
  const linha = (rotulo: string, valor: number, negrito = false) => (
    <div className="linha" style={negrito ? { fontWeight: 700 } : undefined}><span>{rotulo}</span><span>{fmtMoeda(valor)}</span></div>
  );
  return (
    <div className={`cupom ${largura === "58" ? "cupom-58" : ""}`}>
      <CabecalhoLoja config={config} />
      <hr />
      <div className="centro" style={{ fontWeight: 700 }}>{r.status === "fechado" ? "FECHAMENTO DE CAIXA" : "RESUMO PARCIAL DO CAIXA"}</div>
      <hr />
      <div>Caixa nº {r.caixa_id} · {r.usuario_nome}</div>
      <div>Aberto: {fmtDataHora(r.aberto_em)}</div>
      {r.fechado_em && <div>Fechado: {fmtDataHora(r.fechado_em)}</div>}
      <hr />
      <div>Vendas: {r.qtd_vendas} {r.qtd_canceladas > 0 && `(canceladas: ${r.qtd_canceladas})`}</div>
      {linha("Subtotal", r.subtotal)}
      {linha("Descontos", -r.descontos)}
      {linha("Total vendido", r.total_vendas, true)}
      <hr />
      <div style={{ fontWeight: 700 }}>Por forma de pagamento</div>
      {Object.entries(r.por_forma).map(([f, v]) => linha(NOME_FORMA[f as FormaPagamento] ?? f, Number(v)))}
      {r.recebimentos_fiado > 0 && linha("Fiados recebidos", r.recebimentos_fiado)}
      <hr />
      <div style={{ fontWeight: 700 }}>Dinheiro na gaveta</div>
      {linha("Abertura", r.valor_abertura)}
      {linha("+ Vendas em dinheiro", Number(r.por_forma.dinheiro ?? 0))}
      {linha("- Trocos", -r.trocos)}
      {linha("+ Suprimentos", r.suprimentos)}
      {r.recebimentos_fiado_dinheiro > 0 && linha("+ Fiado recebido", r.recebimentos_fiado_dinheiro)}
      {linha("- Sangrias", -r.sangrias)}
      {linha("= Esperado", r.dinheiro_esperado, true)}
      {contado !== undefined && contado !== null && (
        <>
          {linha("Contado", contado, true)}
          {diferenca !== undefined && diferenca !== null && linha(diferenca === 0 ? "Diferença (ok)" : diferenca > 0 ? "Sobra" : "Falta", diferenca, true)}
        </>
      )}
      {observacao && <div>Obs.: {observacao}</div>}
      <div style={{ marginTop: 18 }}>Conferido por: ___________________</div>
      <hr />
      <div className="centro" style={{ fontSize: "0.8em" }}>Documento interno · Loja Fácil</div>
    </div>
  );
}

/** Janela com a prévia do comprovante e o botão de imprimir. */
export function JanelaComprovante({ titulo, onFechar, children, acaoExtra }: {
  titulo: string; onFechar: () => void; children: (largura: "80" | "58") => React.ReactNode; acaoExtra?: React.ReactNode;
}) {
  const [largura, setLargura] = useState<"80" | "58">(larguraCupom());
  return (
    <Modal
      aberto
      titulo={titulo}
      onFechar={onFechar}
      largura="sm"
      rodape={
        <>
          <select className="campo mr-auto w-auto py-1.5 text-sm" value={largura} onChange={(e) => { const v = e.target.value as "80" | "58"; setLargura(v); salvarLarguraCupom(v); }} aria-label="Largura do papel">
            <option value="80">Papel 80 mm</option>
            <option value="58">Papel 58 mm</option>
          </select>
          {acaoExtra}
          <button className="btn-acao" onClick={imprimirCupom} autoFocus>🖨 Imprimir</button>
        </>
      }
    >
      <div className="flex justify-center rounded-lg bg-slate-100 p-3">
        <div className="shadow">{children(largura)}</div>
      </div>
      {createPortal(<div className="area-cupom">{children(largura)}</div>, document.body)}
    </Modal>
  );
}
