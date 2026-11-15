export type Papel = "admin" | "operador" | "pendente";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  criado_em: string;
}

export const UNIDADES = ["UN", "KG", "LT", "PCT", "CX"] as const;
export type Unidade = (typeof UNIDADES)[number];

export interface Produto {
  id: number;
  codigo: string;
  barras: string | null;
  nome: string;
  categoria: string | null;
  unidade: Unidade;
  modelo: string | null;
  fornecedor: string | null;
  custo: number;
  preco: number;
  estoque: number;
  estoque_minimo: number;
  validade: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type SituacaoValidade = "sem_validade" | "vencido" | "critico" | "proximo" | "ok";

/** Linha da visão vw_produtos: produto + indicadores calculados no banco. */
export interface ProdutoView extends Produto {
  valor_estoque: number;
  abaixo_minimo: boolean;
  dias_para_vencer: number | null;
  situacao_validade: SituacaoValidade;
}

export type TipoMov = "entrada" | "saida" | "ajuste";

export interface Movimentacao {
  id: number;
  produto_id: number | null;
  produto_codigo: string;
  produto_nome: string;
  tipo: TipoMov;
  quantidade: number;
  saldo_anterior: number;
  saldo_apos: number;
  observacao: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  criado_em: string;
}

export interface Configuracoes {
  id: number;
  nome_loja: string;
  dias_alerta_validade: number;
  atualizado_em: string;
  cnpj: string | null;
  mostrar_cnpj: boolean;
  endereco: string | null;
  telefone: string | null;
  mensagem_comprovante: string;
  desconto_maximo_percentual: number;
  /** Teclas de atalho do caixa (migração 0003). */
  atalhos?: Record<string, string> | null;
  /** Logo da loja como data URL (migração 0004). */
  logo?: string | null;
  logo_no_comprovante?: boolean;
  /** Se operadores podem vender item avulso (migração 0005). Ausente = SQL 0005 não rodado. */
  permitir_item_avulso?: boolean;
  /** Esconde totais e o valor esperado do caixa dos operadores (migração 0006). Ausente = SQL 0006 não rodado. */
  ocultar_valores_operador?: boolean;
  /** Pix para recebimento (SQL 0006). */
  pix_tipo?: string | null;
  pix_chave?: string | null;
  pix_nome?: string | null;
  pix_cidade?: string | null;
  pix_banco?: string | null;
  pix_no_comprovante?: boolean;
}

export interface ResumoPainel {
  total_produtos: number;
  total_inativos: number;
  valor_estoque: number;
  abaixo_minimo: number;
  proximos_vencimento: number;
  vencidos: number;
}

export const FORMAS = ["dinheiro", "pix", "debito", "credito", "vale_alimentacao", "vale_refeicao", "fiado", "crediario", "outro"] as const;
/** Formas aceitas para receber fiado ou parcela (não faz sentido receber "no fiado"). */
export const FORMAS_RECEBIMENTO = ["dinheiro", "pix", "debito", "credito", "vale_alimentacao", "vale_refeicao", "outro"] as const;
export type FormaPagamento = (typeof FORMAS)[number];

export interface Caixa {
  id: number;
  usuario_id: string;
  usuario_nome: string | null;
  status: "aberto" | "fechado";
  valor_abertura: number;
  aberto_em: string;
  fechado_em: string | null;
  fechado_por_nome: string | null;
  valor_esperado: number | null;
  valor_contado: number | null;
  diferenca: number | null;
  observacao_fechamento: string | null;
  resumo: ResumoCaixa | null;
}

export interface ResumoCaixa {
  caixa_id: number;
  status: "aberto" | "fechado";
  usuario_nome: string | null;
  aberto_em: string;
  fechado_em: string | null;
  valor_abertura: number;
  qtd_vendas: number;
  qtd_canceladas: number;
  subtotal: number;
  descontos: number;
  total_vendas: number;
  trocos: number;
  por_forma: Partial<Record<FormaPagamento, number>>;
  sangrias: number;
  suprimentos: number;
  recebimentos_fiado: number;
  recebimentos_fiado_dinheiro: number;
  recebimentos_crediario?: number;
  recebimentos_crediario_dinheiro?: number;
  dinheiro_esperado: number;
  /** Verdadeiro quando os valores foram escondidos (operador + fechamento cego). */
  oculto?: boolean;
}

export interface VendaItem {
  id: number;
  venda_id: number;
  produto_id: number | null;
  produto_codigo: string;
  produto_nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
  /** Item vendido sem cadastro (migração 0005). */
  avulso?: boolean;
}

export interface VendaPagamento {
  id: number;
  venda_id: number;
  forma: FormaPagamento;
  valor: number;
  fiado_recebido_em: string | null;
  fiado_recebido_forma: FormaPagamento | null;
  fiado_recebido_por: string | null;
  /** Crediário: juros (%) e valor parcelado com juros (SQL 0006). */
  juros_percentual?: number;
  valor_com_juros?: number | null;
}

export interface Venda {
  id: number;
  caixa_id: number;
  usuario_id: string | null;
  usuario_nome: string | null;
  status: "concluida" | "cancelada";
  subtotal: number;
  desconto: number;
  total: number;
  valor_pago: number;
  troco: number;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_id?: number | null;
  criado_em: string;
  cancelada_em: string | null;
  cancelada_por_nome: string | null;
  motivo_cancelamento: string | null;
}

/** Venda com itens e pagamentos (consulta com relacionamentos). */
export interface VendaCompleta extends Venda {
  venda_itens: VendaItem[];
  venda_pagamentos: VendaPagamento[];
  parcelas?: Parcela[];
}

export interface Cliente {
  id: number;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  endereco: string | null;
  limite_credito: number | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Parcela {
  id: number;
  venda_id: number;
  pagamento_id: number | null;
  cliente_id: number;
  numero: number;
  total_parcelas: number;
  valor: number;
  vencimento: string;
  status: "aberta" | "paga" | "cancelada";
  pago_em: string | null;
  pago_forma: FormaPagamento | null;
  pago_por: string | null;
  caixa_id: number | null;
  criado_em: string;
}
