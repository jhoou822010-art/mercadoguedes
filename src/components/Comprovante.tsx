import { useState } from "react";
import { createPortal } from "react-dom";
import type { Configuracoes, ResumoCaixa, VendaCompleta, FormaPagamento, Parcela } from "../lib/types";
import { fmtData, fmtDataHora, fmtMoeda, fmtQtd, NOME_FORMA } from "../lib/format";
import { imprimirCupom, larguraCupom, salvarLarguraCupom } from "../lib/imprimir";
import { Modal } from "./Modal";
import { LOGO_PADRAO } from "../lib/marca";
import { pixDaLoja } from "../lib/pix";
import { QrCode } from "./QrPix";

function CabecalhoLoja({ config }: { config: Configuracoes | null }) {
  return (
    <div className="centro">
      {config?.logo_no_comprovante !== false && (
        <img
          src={config?.logo || LOGO_PADRAO}
          alt=""
          style={{ display: "block", margin: "0 auto 4px", maxHeight: "20mm", maxWidth: "70%", objectFit: "contain", filter: "grayscale(1) contrast(1.4)" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
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
      {(() => {
        const valorPix = venda.venda_pagamentos.filter((p) => p.forma === "pix").reduce((s, p) => s + Number(p.valor), 0);
        return valorPix > 0 && !cancelada ? <BlocoPix config={config} valor={valorPix} txid={`V${venda.id}`} titulo="Pagamento via Pix" /> : null;
      })()}
      {venda.cliente_nome && (
        <>
          <hr />
          <div>Cliente: {venda.cliente_nome}</div>
          {venda.cliente_telefone && <div>Telefone: {venda.cliente_telefone}</div>}
          {venda.parcelas && venda.parcelas.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontWeight: 700 }}>Crediário em {venda.parcelas[0].total_parcelas}x</div>
              {(() => {
                const pc = venda.venda_pagamentos.find((p) => p.forma === "crediario");
                const j = Number(pc?.juros_percentual ?? 0);
                if (!pc || j <= 0) return null;
                const comJuros = Number(pc.valor_com_juros ?? 0);
                return (
                  <>
                    <div className="linha"><span>Valor parcelado</span><span>{fmtMoeda(pc.valor)}</span></div>
                    <div className="linha"><span>Juros ({String(j).replace(".", ",")}%)</span><span>+ {fmtMoeda(comJuros - Number(pc.valor))}</span></div>
                    <div className="linha" style={{ fontWeight: 700 }}><span>Total do crediário</span><span>{fmtMoeda(comJuros)}</span></div>
                  </>
                );
              })()}
              {[...venda.parcelas].sort((a, b) => a.numero - b.numero).map((p) => (
                <div key={p.id} className="linha">
                  <span>{p.numero}/{p.total_parcelas} · vence {fmtData(p.vencimento)}</span>
                  <span>{fmtMoeda(p.valor)}</span>
                </div>
              ))}
            </div>
          )}
          {venda.venda_pagamentos.some((p) => p.forma === "fiado" || p.forma === "crediario") && (
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
  if (r.oculto) {
    // Fechamento cego: a balconista só vê/imprime o que contou.
    return (
      <div className={`cupom ${largura === "58" ? "cupom-58" : ""}`}>
        <CabecalhoLoja config={config} />
        <hr />
        <div className="centro" style={{ fontWeight: 700 }}>{r.status === "fechado" ? "FECHAMENTO DE CAIXA" : "CAIXA EM ANDAMENTO"}</div>
        <hr />
        <div>Caixa nº {r.caixa_id} · {r.usuario_nome}</div>
        <div>Aberto: {fmtDataHora(r.aberto_em)}</div>
        {r.fechado_em && <div>Fechado: {fmtDataHora(r.fechado_em)}</div>}
        <div>Vendas: {r.qtd_vendas} {r.qtd_canceladas > 0 && `(canceladas: ${r.qtd_canceladas})`}</div>
        <hr />
        {contado !== undefined && contado !== null && linha("Dinheiro contado", contado, true)}
        {observacao && <div>Obs.: {observacao}</div>}
        <div style={{ marginTop: 6, fontSize: "0.85em" }}>Conferência feita pelo administrador.</div>
        <div style={{ marginTop: 18 }}>Entregue por: ___________________</div>
        <div style={{ marginTop: 14 }}>Conferido por: ___________________</div>
        <hr />
        <div className="centro" style={{ fontSize: "0.8em" }}>Documento interno · Loja Fácil</div>
      </div>
    );
  }
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
      {Number(r.recebimentos_crediario ?? 0) > 0 && linha("Parcelas recebidas", Number(r.recebimentos_crediario))}
      <hr />
      <div style={{ fontWeight: 700 }}>Dinheiro na gaveta</div>
      {linha("Abertura", r.valor_abertura)}
      {linha("+ Vendas em dinheiro", Number(r.por_forma.dinheiro ?? 0))}
      {linha("- Trocos", -r.trocos)}
      {linha("+ Suprimentos", r.suprimentos)}
      {r.recebimentos_fiado_dinheiro > 0 && linha("+ Fiado recebido", r.recebimentos_fiado_dinheiro)}
      {Number(r.recebimentos_crediario_dinheiro ?? 0) > 0 && linha("+ Parcelas recebidas", Number(r.recebimentos_crediario_dinheiro))}
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

/** QR Code Pix impresso (se o Pix da loja estiver configurado e a opção ligada). */
function BlocoPix({ config, valor, txid, titulo, pequeno }: { config: Configuracoes | null; valor: number; txid: string; titulo: string; pequeno?: boolean }) {
  if (config?.pix_no_comprovante === false) return null;
  const codigo = pixDaLoja(config, valor, txid);
  if (!codigo) return null;
  return (
    <div className="centro" style={{ marginTop: 6 }}>
      <hr />
      <div style={{ fontWeight: 700 }}>{titulo}: {fmtMoeda(valor)}</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}><QrCode texto={codigo} tamanho={pequeno ? 96 : 132} /></div>
      {!pequeno && <div style={{ fontSize: "0.8em", wordBreak: "break-all" }}>{codigo}</div>}
      <div style={{ fontSize: "0.8em" }}>Recebedor: {config?.pix_nome}</div>
    </div>
  );
}

/** Extrato de um cliente (fiado ou crediário) para cobrança/assinatura. */
export function CupomExtrato({ titulo, cliente, telefone, linhas, total, config, largura, rodape }: {
  titulo: string; cliente: string; telefone?: string | null; config: Configuracoes | null; largura: "80" | "58";
  linhas: { descricao: string; detalhe?: string; valor: number }[]; total: number; rodape?: string;
}) {
  return (
    <div className={`cupom ${largura === "58" ? "cupom-58" : ""}`}>
      <CabecalhoLoja config={config} />
      <hr />
      <div className="centro" style={{ fontWeight: 700 }}>{titulo}</div>
      <div className="centro" style={{ fontSize: "0.85em" }}>Emitido em {fmtDataHora(new Date().toISOString())}</div>
      <hr />
      <div>Cliente: <strong>{cliente}</strong></div>
      {telefone && <div>Telefone: {telefone}</div>}
      <hr />
      {linhas.length === 0 ? <div className="centro">Nada em aberto.</div> : linhas.map((l, i) => (
        <div key={i} style={{ marginBottom: 2 }}>
          <div className="linha"><span>{l.descricao}</span><span>{fmtMoeda(l.valor)}</span></div>
          {l.detalhe && <div style={{ fontSize: "0.85em" }}>&nbsp;&nbsp;{l.detalhe}</div>}
        </div>
      ))}
      <hr />
      <div className="linha" style={{ fontWeight: 700, fontSize: "1.2em" }}><span>TOTAL EM ABERTO</span><span>{fmtMoeda(total)}</span></div>
      {rodape && <div style={{ marginTop: 4, fontSize: "0.85em" }}>{rodape}</div>}
      {total > 0 && <BlocoPix config={config} valor={total} txid="EXTRATO" titulo="Pague o total com Pix" />}
      <div style={{ marginTop: 18 }}>Assinatura do cliente: _____________</div>
      <hr />
      <div className="centro" style={{ fontSize: "0.8em" }}>Documento não fiscal · Loja Fácil</div>
    </div>
  );
}

/** Carnê do crediário: um canhoto por parcela, para destacar. */
export function CupomCarne({ venda, cliente, parcelas, config, largura }: {
  venda: { id: number; criado_em: string; total: number }; cliente: string; parcelas: Parcela[]; config: Configuracoes | null; largura: "80" | "58";
}) {
  const ordenadas = [...parcelas].sort((a, b) => a.numero - b.numero);
  return (
    <div className={`cupom ${largura === "58" ? "cupom-58" : ""}`}>
      <CabecalhoLoja config={config} />
      <hr />
      <div className="centro" style={{ fontWeight: 700 }}>CARNÊ DE CREDIÁRIO</div>
      <div className="linha"><span>Venda nº {venda.id}</span><span>{fmtDataHora(venda.criado_em)}</span></div>
      <div>Cliente: <strong>{cliente}</strong></div>
      <div className="linha"><span>Total parcelado</span><span>{fmtMoeda(ordenadas.reduce((s, p) => s + Number(p.valor), 0))}</span></div>
      {ordenadas.map((p) => (
        <div key={p.id} style={{ borderTop: "1px dashed #000", marginTop: 6, paddingTop: 6 }}>
          <div className="linha" style={{ fontWeight: 700 }}><span>Parcela {p.numero}/{p.total_parcelas}</span><span>{fmtMoeda(p.valor)}</span></div>
          <div className="linha"><span>Vencimento</span><span>{fmtData(p.vencimento)}</span></div>
          <div>{p.status === "paga" ? `PAGA em ${fmtDataHora(p.pago_em)}` : p.status === "cancelada" ? "CANCELADA" : "Pago em: ___/___/_____"}</div>
          {p.status === "aberta" && <BlocoPix config={config} valor={Number(p.valor)} txid={`V${venda.id}P${p.numero}`} titulo={`Pix da parcela ${p.numero}`} pequeno />}
          <div style={{ marginTop: 8 }}>Recebido por: ______________</div>
        </div>
      ))}
      <hr />
      <div className="centro" style={{ fontSize: "0.8em" }}>Documento não fiscal · Loja Fácil</div>
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
