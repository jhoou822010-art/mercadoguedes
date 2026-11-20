import { centavos, dividirParcelas, somarMeses } from "../format";
import { gravarJunto, gravarVarios, lerMeta, lerTodos, lerUm } from "./idb";
import { atualizarResumoFila, novaOperacao, processarFila } from "./fila";
/* ---------------------------- este computador ---------------------------- */
const CHAVE_DISP = "lojafacil.dispositivo";
/** Código curto e permanente deste computador (ex.: A3F1). */
export function meuDispositivo() {
    try {
        let d = localStorage.getItem(CHAVE_DISP);
        if (!d) {
            d = Array.from(crypto.getRandomValues(new Uint8Array(2))).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
            localStorage.setItem(CHAVE_DISP, d);
        }
        return d;
    }
    catch {
        return "XXXX";
    }
}
const uuid = () => crypto.randomUUID();
let idSeq = 0;
/** Número provisório (negativo) para registros feitos aqui. */
const idLocal = () => -(Date.now() * 100 + (idSeq++ % 100));
/** Caixa aberto do usuário NESTE computador (o do servidor sem computador definido também vale). */
export async function caixaAbertoLocal(usuarioId) {
    const disp = meuDispositivo();
    const lista = (await lerTodos("caixas"))
        .filter((c) => c.usuario_id === usuarioId && c.status === "aberto" && (!c.dispositivo || c.dispositivo === disp));
    // Mesmo caixa em duas versões (provisória e a do servidor): fica a do servidor.
    const porUuid = new Map();
    const semUuid = [];
    for (const c of lista) {
        if (!c.uuid_local) {
            semUuid.push(c);
            continue;
        }
        const j = porUuid.get(c.uuid_local);
        if (!j || (j.id < 0 && c.id > 0))
            porUuid.set(c.uuid_local, c);
    }
    const todos = [...porUuid.values(), ...semUuid].sort((a, b) => b.aberto_em.localeCompare(a.aberto_em));
    return todos[0] ?? null;
}
/** Guarda no computador o caixa aberto que o servidor informou (para não abrir outro por engano). */
export async function guardarCaixaDoServidor(c) {
    const pendente = (await lerTodos("fila")).some((o) => o.tipo === "fechar_caixa" && o.estado !== "sincronizado" && (o.parametros.p_caixa_id === c.id || (c.uuid_local && o.parametros.p_caixa_uuid === c.uuid_local)));
    if (!pendente)
        await gravarVarios("caixas", [c]);
}
export async function abrirCaixaLocal(perfil, valor) {
    const id = idLocal(), u = uuid(), disp = meuDispositivo(), agora = new Date().toISOString();
    const caixa = {
        id, usuario_id: perfil.id, usuario_nome: perfil.nome, status: "aberto", valor_abertura: centavos(valor), aberto_em: agora,
        fechado_em: null, fechado_por_nome: null, valor_esperado: null, valor_contado: null, diferenca: null, observacao_fechamento: null, resumo: null,
        uuid_local: u, dispositivo: disp, sync: "pendente",
    };
    const op = novaOperacao({ id: u, tipo: "abrir_caixa", usuario_id: perfil.id, dispositivo: disp, alvo: { tabela: "caixas", id }, funcao: "sinc_abrir_caixa",
        parametros: { p_uuid: u, p_valor_abertura: caixa.valor_abertura, p_aberto_em: agora, p_dispositivo: disp } });
    await gravarJunto([{ tabela: "caixas", linhas: [caixa] }, { tabela: "fila", linhas: [op] }]);
    await atualizarResumoFila();
    void processarFila();
    return caixa;
}
const refCaixa = (c) => ({ p_caixa_uuid: c.uuid_local ?? null, p_caixa_id: c.id > 0 ? c.id : null });
const doCaixa = (c) => (x) => (c.id > 0 && x.caixa_id === c.id) || (!!c.uuid_local && x.caixa_uuid === c.uuid_local) || (c.id < 0 && x.caixa_id === c.id);
const FORMAS_VALIDAS = ["dinheiro", "pix", "debito", "credito", "vale_alimentacao", "vale_refeicao", "fiado", "crediario", "outro"];
/** Quanto o cliente já deve no crediário (servidor guardado + vendas feitas aqui ainda não enviadas). */
async function emAbertoCrediario(clienteId) {
    const parcelas = (await lerTodos("parcelas")).filter((p) => p.cliente_id === clienteId && p.status === "aberta");
    const locais = (await lerTodos("vendas")).filter((v) => v.id < 0 && v.status === "concluida")
        .flatMap((v) => (v.parcelas ?? []).filter((p) => p.cliente_id === clienteId && p.status === "aberta"));
    return centavos([...parcelas, ...locais].reduce((s, p) => s + Number(p.valor), 0));
}
/**
 * Registra a venda NO COMPUTADOR (mesmas regras do servidor) e põe na fila.
 * Retorna a venda pronta para o comprovante. Lança Error com mensagem clara se algo estiver errado.
 */
export async function finalizarVendaLocal(a) {
    if (!a.itens.length)
        throw new Error("A venda não tem produtos.");
    const id = idLocal(), u = uuid(), disp = meuDispositivo(), agora = new Date().toISOString();
    const permiteAvulso = a.config?.permitir_item_avulso ?? true;
    const itens = a.itens.map((i, n) => {
        const q = Number(i.quantidade), preco = centavos(Number(i.p.preco));
        if (!(q > 0))
            throw new Error(`Quantidade inválida para "${i.p.nome}".`);
        if (i.avulso && !permiteAvulso && !a.ehAdmin)
            throw new Error("Item avulso (sem cadastro) não está liberado para operador. Peça ao administrador.");
        if (!i.avulso && ["UN", "PCT", "CX"].includes(i.p.unidade) && !Number.isInteger(q))
            throw new Error(`Para "${i.p.nome}" (${i.p.unidade}) use quantidade inteira.`);
        if (i.avulso && !(preco > 0))
            throw new Error(`Informe um preço maior que zero para "${i.p.nome}".`);
        return { id: id * 100 - n, venda_id: id, produto_id: i.avulso ? null : i.p.id, produto_codigo: i.avulso ? "AVULSO" : i.p.codigo, produto_nome: i.p.nome,
            unidade: i.avulso ? "UN" : i.p.unidade, quantidade: q, preco_unitario: preco, total: centavos(preco * q), avulso: Boolean(i.avulso) };
    });
    const subtotal = centavos(itens.reduce((s, i) => s + i.total, 0));
    const desconto = centavos(a.desconto || 0);
    if (desconto < 0)
        throw new Error("O desconto não pode ser negativo.");
    if (desconto > subtotal)
        throw new Error("O desconto não pode ser maior que o valor da compra.");
    const limite = Number(a.config?.desconto_maximo_percentual ?? 100);
    if (!a.ehAdmin && subtotal > 0 && desconto > centavos(subtotal * limite / 100))
        throw new Error(`Desconto acima do permitido para operador: máximo de ${limite}% do valor da compra.`);
    const total = centavos(subtotal - desconto);
    let pago = 0, dinheiro = 0;
    for (const p of a.pagamentos) {
        if (!FORMAS_VALIDAS.includes(p.forma))
            throw new Error(`Forma de pagamento inválida: ${p.forma}.`);
        if (!(p.valor > 0))
            throw new Error("Valor de pagamento inválido.");
        pago = centavos(pago + p.valor);
        if (p.forma === "dinheiro")
            dinheiro = centavos(dinheiro + p.valor);
    }
    if (pago < total)
        throw new Error(`Falta pagar ${(total - pago).toFixed(2).replace(".", ",")}.`);
    const troco = centavos(pago - total);
    if (troco > dinheiro)
        throw new Error("Só é possível dar troco sobre pagamento em dinheiro. Confira os valores do cartão, Pix ou fiado.");
    const creds = a.pagamentos.filter((p) => p.forma === "crediario");
    if (creds.length > 1)
        throw new Error("Use apenas um pagamento em crediário por venda.");
    let cliente;
    const parcelas = [];
    const pagamentos = a.pagamentos.map((p, n) => ({ id: id * 100 - n, venda_id: id, forma: p.forma, valor: centavos(p.valor), fiado_recebido_em: null, fiado_recebido_forma: null, fiado_recebido_por: null }));
    if (creds.length === 1) {
        const c = creds[0];
        cliente = (await lerUm("clientes", Number(c.cliente_id))) ?? c.cliente ?? undefined;
        if (cliente && c.cliente)
            await gravarVarios("clientes", [cliente]);
        if (!cliente)
            throw new Error("Para vender no crediário, escolha um cliente cadastrado.");
        if (!cliente.ativo)
            throw new Error(`O cliente "${cliente.nome}" está inativo.`);
        const n = Math.round(Number(c.parcelas ?? 1));
        if (n < 1 || n > 24)
            throw new Error("Número de parcelas deve ficar entre 1 e 24.");
        const juros = centavos(Number(c.juros_percentual ?? 0));
        if (juros < 0 || juros > 100)
            throw new Error("Juros do crediário deve ficar entre 0 e 100 por cento.");
        const totalCred = centavos(centavos(c.valor) * (1 + juros / 100));
        const primeiro = c.primeiro_vencimento ?? new Date(Date.now() + 30 * 864e5).toLocaleDateString("sv-SE");
        if (primeiro < new Date().toLocaleDateString("sv-SE"))
            throw new Error("O primeiro vencimento não pode ser uma data passada.");
        if (cliente.limite_credito != null && !a.ehAdmin) {
            const aberto = await emAbertoCrediario(cliente.id);
            if (aberto + totalCred > Number(cliente.limite_credito)) {
                throw new Error(`Limite de crédito de "${cliente.nome}" excedido: limite R$ ${Number(cliente.limite_credito).toFixed(2).replace(".", ",")}, em aberto R$ ${aberto.toFixed(2).replace(".", ",")}.`);
            }
        }
        const pg = pagamentos.find((p) => p.forma === "crediario");
        pg.juros_percentual = juros;
        pg.valor_com_juros = totalCred;
        dividirParcelas(totalCred, n).forEach((valor, k) => parcelas.push({
            id: id * 100 - 50 - k, venda_id: id, pagamento_id: pg.id, cliente_id: cliente.id, numero: k + 1, total_parcelas: n, valor,
            vencimento: somarMeses(primeiro, k), status: "aberta", pago_em: null, pago_forma: null, pago_por: null, caixa_id: null, criado_em: agora,
        }));
    }
    if (a.pagamentos.some((p) => p.forma === "fiado") && !a.clienteNome?.trim() && !cliente)
        throw new Error("Para vender fiado, informe o nome do cliente.");
    // Numeração do comprovante deste computador.
    const seq = ((await lerMeta("seq.venda")) ?? 0) + 1;
    const codigo = `${disp}-${String(seq).padStart(6, "0")}`;
    const venda = {
        id, caixa_id: a.caixa.id, caixa_uuid: a.caixa.uuid_local ?? null, usuario_id: a.perfil.id, usuario_nome: a.perfil.nome, status: "concluida",
        subtotal, desconto, total, valor_pago: pago, troco,
        cliente_nome: a.clienteNome?.trim() || cliente?.nome || null, cliente_telefone: a.clienteTelefone?.trim() || cliente?.telefone || null, cliente_id: cliente?.id ?? null,
        criado_em: agora, cancelada_em: null, cancelada_por_nome: null, motivo_cancelamento: null,
        venda_itens: itens, venda_pagamentos: pagamentos, parcelas,
        uuid_local: u, dispositivo: disp, codigo_local: codigo, sync: "pendente",
    };
    const op = novaOperacao({
        id: u, tipo: "venda", usuario_id: a.perfil.id, dispositivo: disp, alvo: { tabela: "vendas", id }, funcao: "sinc_venda",
        parametros: {
            p_uuid: u, ...refCaixa(a.caixa),
            p_itens: itens.map((i) => (i.avulso
                ? { avulso: true, descricao: i.produto_nome, preco: i.preco_unitario, quantidade: i.quantidade }
                : { produto_id: i.produto_id, quantidade: i.quantidade, preco_unitario: i.preco_unitario, produto_codigo: i.produto_codigo, produto_nome: i.produto_nome, unidade: i.unidade })),
            p_desconto: desconto,
            p_pagamentos: a.pagamentos.map(({ cliente: _c, ...p }) => ({ forma: p.forma, valor: centavos(p.valor), ...(p.forma === "crediario" ? { cliente_id: p.cliente_id, cliente_uuid: cliente?.uuid_local ?? null, parcelas: p.parcelas, primeiro_vencimento: p.primeiro_vencimento, juros_percentual: p.juros_percentual } : {}) })),
            p_cliente_nome: venda.cliente_nome, p_cliente_telefone: venda.cliente_telefone,
            p_criado_em: agora, p_codigo_local: codigo, p_dispositivo: disp,
        },
    });
    // Tudo junto: venda + fila + numeração. Se faltar luz no meio, ou fica tudo ou nada.
    await gravarJunto([{ tabela: "vendas", linhas: [venda] }, { tabela: "fila", linhas: [op] }, { tabela: "meta", linhas: [{ chave: "seq.venda", valor: seq }] }]);
    await atualizarResumoFila();
    void processarFila();
    return venda;
}
export async function movimentarCaixaLocal(a) {
    if (!(a.valor > 0))
        throw new Error("Digite um valor maior que zero.");
    if (a.tipo === "sangria") {
        const r = await resumoCaixaLocal(a.caixa);
        if (centavos(a.valor) > r.dinheiro_esperado)
            throw new Error("A sangria é maior que o dinheiro que deveria estar no caixa.");
    }
    const id = idLocal(), u = uuid(), agora = new Date().toISOString();
    const mov = { id, caixa_id: a.caixa.id, caixa_uuid: a.caixa.uuid_local ?? null, tipo: a.tipo, valor: centavos(a.valor), observacao: a.observacao, criado_em: agora, uuid_local: u, sync: "pendente" };
    const op = novaOperacao({ id: u, tipo: "movimento_caixa", usuario_id: a.perfil.id, dispositivo: meuDispositivo(), alvo: { tabela: "caixa_movimentos", id }, funcao: "sinc_movimento_caixa",
        parametros: { p_uuid: u, ...refCaixa(a.caixa), p_tipo: a.tipo, p_valor: mov.valor, p_observacao: a.observacao, p_criado_em: agora } });
    await gravarJunto([{ tabela: "caixa_movimentos", linhas: [mov] }, { tabela: "fila", linhas: [op] }]);
    await atualizarResumoFila();
    void processarFila();
    return mov;
}
/* ------------------------------ resumo ------------------------------ */
/** Mesmo cálculo do servidor (calcular_resumo_caixa), com o que está neste computador. */
export async function resumoCaixaLocal(c) {
    const eh = doCaixa(c);
    const todas = (await lerTodos("vendas")).filter(eh);
    // A mesma venda pode estar em duas versões (provisória e a do servidor): conta uma vez.
    const vistas = new Set();
    const vendas = todas.sort((a, b) => b.id - a.id).filter((v) => {
        if (!v.uuid_local)
            return true;
        if (vistas.has(v.uuid_local))
            return false;
        vistas.add(v.uuid_local);
        return true;
    });
    const ok = vendas.filter((v) => v.status === "concluida");
    const porForma = {};
    for (const v of ok)
        for (const p of v.venda_pagamentos)
            porForma[p.forma] = centavos((porForma[p.forma] ?? 0) + Number(p.valor));
    const movsVistos = new Set();
    const movs = (await lerTodos("caixa_movimentos")).filter(eh).sort((a, b) => b.id - a.id).filter((m) => {
        if (!m.uuid_local)
            return true;
        if (movsVistos.has(m.uuid_local))
            return false;
        movsVistos.add(m.uuid_local);
        return true;
    });
    const soma = (f) => centavos(movs.filter(f).reduce((s, m) => s + Number(m.valor), 0));
    const sangrias = soma((m) => m.tipo === "sangria"), suprimentos = soma((m) => m.tipo === "suprimento");
    const fiadoDin = soma((m) => m.tipo === "recebimento_fiado" && m.forma === "dinheiro"), fiadoTot = soma((m) => m.tipo === "recebimento_fiado");
    const credDin = soma((m) => m.tipo === "recebimento_crediario" && m.forma === "dinheiro"), credTot = soma((m) => m.tipo === "recebimento_crediario");
    const trocos = centavos(ok.reduce((s, v) => s + Number(v.troco), 0));
    return {
        caixa_id: c.id, status: c.status, usuario_nome: c.usuario_nome, aberto_em: c.aberto_em, fechado_em: c.fechado_em, valor_abertura: Number(c.valor_abertura),
        qtd_vendas: ok.length, qtd_canceladas: vendas.length - ok.length,
        subtotal: centavos(ok.reduce((s, v) => s + Number(v.subtotal), 0)), descontos: centavos(ok.reduce((s, v) => s + Number(v.desconto), 0)),
        total_vendas: centavos(ok.reduce((s, v) => s + Number(v.total), 0)), trocos, por_forma: porForma,
        sangrias, suprimentos, recebimentos_fiado: fiadoTot, recebimentos_fiado_dinheiro: fiadoDin,
        recebimentos_crediario: credTot, recebimentos_crediario_dinheiro: credDin,
        dinheiro_esperado: centavos(Number(c.valor_abertura) + (porForma.dinheiro ?? 0) - trocos + suprimentos - sangrias + fiadoDin + credDin),
        oculto: false,
    };
}
/* ------------------------------ fechar ------------------------------ */
export async function fecharCaixaLocal(a) {
    if (!(a.valorContado >= 0))
        throw new Error("Informe o valor contado na gaveta.");
    const r = await resumoCaixaLocal(a.caixa);
    const agora = new Date().toISOString(), u = uuid();
    const fechado = { ...a.caixa, status: "fechado", fechado_em: agora, fechado_por_nome: a.perfil.nome, valor_contado: centavos(a.valorContado),
        valor_esperado: r.dinheiro_esperado, diferenca: centavos(a.valorContado - r.dinheiro_esperado), observacao_fechamento: a.observacao,
        resumo: { ...r, status: "fechado", fechado_em: agora }, sync: "pendente" };
    const op = novaOperacao({ id: u, tipo: "fechar_caixa", usuario_id: a.perfil.id, dispositivo: meuDispositivo(), alvo: { tabela: "caixas", id: a.caixa.id }, funcao: "sinc_fechar_caixa",
        parametros: { ...refCaixa(a.caixa), p_valor_contado: centavos(a.valorContado), p_observacao: a.observacao, p_fechado_em: agora } });
    await gravarJunto([{ tabela: "caixas", linhas: [fechado] }, { tabela: "fila", linhas: [op] }]);
    await atualizarResumoFila();
    void processarFila();
    return fechado;
}
/* ------------------------- vendas não enviadas ------------------------- */
/** Vendas feitas neste computador que o servidor ainda não tem (para listas e painel). */
export async function vendasLocaisNaoEnviadas() {
    const todas = await lerTodos("vendas");
    const doServidor = new Set(todas.filter((v) => v.id > 0 && v.uuid_local).map((v) => v.uuid_local));
    return todas.filter((v) => v.id < 0 && !doServidor.has(v.uuid_local ?? "")).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}
/* --------------------- recebimentos (fiado / parcela) --------------------- */
async function caixaParaReceber(perfil) {
    const c = await caixaAbertoLocal(perfil.id);
    if (!c)
        throw new Error("Abra o seu caixa para receber (o dinheiro entra no seu caixa).");
    return c;
}
/** Recebe um fiado (com ou sem internet). A venda pode ser do servidor ou feita aqui. */
export async function receberFiadoLocal(a) {
    const caixa = await caixaParaReceber(a.perfil);
    const venda = await lerUm("vendas", a.vendaId);
    const agora = new Date().toISOString(), u = uuid(), id = idLocal();
    const mov = { id, caixa_id: caixa.id, caixa_uuid: caixa.uuid_local ?? null, tipo: "recebimento_fiado", forma: a.forma, valor: centavos(a.valor), observacao: "Fiado", criado_em: agora, uuid_local: u, sync: "pendente" };
    const op = novaOperacao({ id: u, tipo: "receber_fiado", usuario_id: a.perfil.id, dispositivo: meuDispositivo(), alvo: { tabela: "caixa_movimentos", id }, funcao: "sinc_receber_fiado",
        parametros: { p_uuid: u, p_pagamento_id: a.pagamentoId > 0 ? a.pagamentoId : null, p_venda_uuid: a.vendaUuid, p_forma: a.forma, ...refCaixa(caixa), p_recebido_em: agora },
        meta: { venda_id: a.vendaId, pagamento_id: a.pagamentoId } });
    const gravar = [{ tabela: "caixa_movimentos", linhas: [mov] }, { tabela: "fila", linhas: [op] }];
    if (venda)
        gravar.push({ tabela: "vendas", linhas: [{ ...venda, venda_pagamentos: venda.venda_pagamentos.map((p) => (p.id === a.pagamentoId ? { ...p, fiado_recebido_em: agora, fiado_recebido_forma: a.forma, fiado_recebido_por: a.perfil.nome } : p)) }] });
    await gravarJunto(gravar);
    await atualizarResumoFila();
    void processarFila();
}
/** Recebe uma parcela do crediário (com ou sem internet). */
export async function receberParcelaLocal(a) {
    const caixa = await caixaParaReceber(a.perfil);
    const agora = new Date().toISOString(), u = uuid(), id = idLocal(), p = a.parcela;
    const mov = { id, caixa_id: caixa.id, caixa_uuid: caixa.uuid_local ?? null, tipo: "recebimento_crediario", forma: a.forma, valor: centavos(Number(p.valor)), observacao: `Parcela ${p.numero}/${p.total_parcelas}`, criado_em: agora, uuid_local: u, sync: "pendente" };
    const op = novaOperacao({ id: u, tipo: "receber_parcela", usuario_id: a.perfil.id, dispositivo: meuDispositivo(), alvo: { tabela: "caixa_movimentos", id }, funcao: "sinc_receber_parcela",
        parametros: { p_uuid: u, p_parcela_id: p.id > 0 ? p.id : null, p_venda_uuid: a.vendaUuid, p_numero: p.numero, p_forma: a.forma, ...refCaixa(caixa), p_recebido_em: agora },
        meta: { parcela_id: p.id, venda_id: p.venda_id } });
    const paga = { status: "paga", pago_em: agora, pago_forma: a.forma, pago_por: a.perfil.nome, caixa_id: caixa.id };
    const gravar = [{ tabela: "caixa_movimentos", linhas: [mov] }, { tabela: "fila", linhas: [op] }];
    if (p.id > 0) {
        const atual = await lerUm("parcelas", p.id);
        if (atual)
            gravar.push({ tabela: "parcelas", linhas: [{ ...atual, ...paga }] });
    }
    else {
        const venda = await lerUm("vendas", p.venda_id);
        if (venda)
            gravar.push({ tabela: "vendas", linhas: [{ ...venda, parcelas: (venda.parcelas ?? []).map((x) => (x.numero === p.numero ? { ...x, ...paga } : x)) }] });
    }
    await gravarJunto(gravar);
    await atualizarResumoFila();
    void processarFila();
}
/* ------------------------- cliente novo sem internet ------------------------- */
export async function cadastrarClienteLocal(a) {
    if (a.nome.trim().length < 2)
        throw new Error("Informe o nome do cliente.");
    if (a.cpf) {
        const igual = (await lerTodos("clientes")).find((c) => c.cpf && c.cpf === a.cpf);
        if (igual)
            throw new Error("Já existe um cliente com este CPF/CNPJ.");
    }
    const id = idLocal(), u = uuid(), agora = new Date().toISOString();
    const cliente = { id, nome: a.nome.trim(), telefone: a.telefone, cpf: a.cpf, endereco: a.endereco ?? null, limite_credito: null, observacao: a.observacao ?? null,
        ativo: true, criado_em: agora, atualizado_em: agora, uuid_local: u, sync: "pendente" };
    const op = novaOperacao({ id: u, tipo: "cliente", usuario_id: a.perfil.id, dispositivo: meuDispositivo(), alvo: { tabela: "clientes", id }, funcao: "sinc_cliente",
        parametros: { p_uuid: u, p_nome: cliente.nome, p_telefone: a.telefone, p_cpf: a.cpf, p_endereco: a.endereco ?? null, p_observacao: a.observacao ?? null } });
    await gravarJunto([{ tabela: "clientes", linhas: [cliente] }, { tabela: "fila", linhas: [op] }]);
    await atualizarResumoFila();
    void processarFila();
    return cliente;
}
/** Entrada, saída ou ajuste feito sem internet. O ajuste vai ao servidor como DIFERENÇA do que a tela mostrava. */
export async function movimentarEstoqueLocal(a) {
    const q = Number(a.quantidade), atual = Number(a.produto.estoque);
    if (!(q >= 0) || (a.tipo !== "ajuste" && q === 0))
        throw new Error("Informe uma quantidade maior que zero.");
    const novo = a.tipo === "entrada" ? atual + q : a.tipo === "saida" ? atual - q : q;
    if (a.tipo === "saida" && novo < 0)
        throw new Error(`Estoque insuficiente: saldo atual ${atual} e saída de ${q}.`);
    const id = idLocal(), u = uuid(), agora = new Date().toISOString();
    const mov = { id, produto_id: a.produto.id, produto_codigo: a.produto.codigo, produto_nome: a.produto.nome, tipo: a.tipo, quantidade: q,
        saldo_anterior: atual, saldo_apos: Math.round(novo * 1000) / 1000, observacao: a.observacao, usuario_id: a.perfil.id, usuario_nome: a.perfil.nome, criado_em: agora,
        uuid_local: u, delta: Math.round((novo - atual) * 1000) / 1000, sync: "pendente" };
    const op = novaOperacao({ id: u, tipo: "estoque", usuario_id: a.perfil.id, dispositivo: meuDispositivo(), alvo: { tabela: "movimentacoes", id }, funcao: "sinc_movimentar_estoque",
        parametros: { p_uuid: u, p_produto_id: a.produto.id, p_tipo: a.tipo, p_quantidade: q, p_delta: mov.delta, p_observacao: a.observacao, p_criado_em: agora } });
    await gravarJunto([{ tabela: "movimentacoes", linhas: [mov] }, { tabela: "fila", linhas: [op] }]);
    await atualizarResumoFila();
    void processarFila();
    return mov;
}
