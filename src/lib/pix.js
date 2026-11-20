/* =====================================================================
   Pix "copia e cola" / QR Code estático (padrão BR Code do Banco Central).
   Gerado no próprio navegador a partir da chave Pix da loja: o dinheiro vai
   direto para a conta do recebedor, sem intermediário e sem taxa.
   A confirmação do pagamento é feita pela balconista no app do banco.
   ===================================================================== */
import { cnpjValido, cpfValido } from "./format";
export const NOME_TIPO_CHAVE = {
    cpf: "CPF",
    cnpj: "CNPJ",
    email: "E-mail",
    telefone: "Celular",
    aleatoria: "Chave aleatória",
};
/** Tira acentos e caracteres que alguns bancos recusam no QR. */
function limparTexto(t, max) {
    return t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .,\-/&]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
/** Coloca a chave no formato que o Pix exige. Devolve "" se a chave for inválida. */
export function normalizarChave(tipo, chave) {
    const c = chave.trim();
    const digitos = c.replace(/\D/g, "");
    switch (tipo) {
        case "cpf": return cpfValido(digitos) ? digitos : "";
        case "cnpj": return cnpjValido(digitos) ? digitos : "";
        case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c.toLowerCase() : "";
        case "telefone": {
            const d = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
            return d.length === 10 || d.length === 11 ? `+55${d}` : "";
        }
        case "aleatoria": return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? c.toLowerCase() : "";
    }
}
function campo(id, valor) {
    return id + String(valor.length).padStart(2, "0") + valor;
}
/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido pelo BR Code. */
export function crc16(texto) {
    let crc = 0xffff;
    for (const byte of new TextEncoder().encode(texto)) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++)
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}
/** Monta o texto do Pix "copia e cola" (é o mesmo conteúdo do QR Code). */
export function montarPix(d, cru = false) {
    const nome = cru ? d.nome : limparTexto(d.nome, 25).toUpperCase();
    const cidade = cru ? d.cidade : limparTexto(d.cidade, 15).toUpperCase();
    const txid = (d.txid ?? "***").replace(/[^A-Za-z0-9*]/g, "").slice(0, 25) || "***";
    const descricao = d.descricao ? limparTexto(d.descricao, 40) : "";
    const conta = campo("00", "br.gov.bcb.pix") + campo("01", d.chave) + (descricao ? campo("02", descricao) : "");
    let corpo = campo("00", "01") +
        campo("26", conta) +
        campo("52", "0000") +
        campo("53", "986") +
        (d.valor && d.valor > 0 ? campo("54", d.valor.toFixed(2)) : "") +
        campo("58", "BR") +
        campo("59", nome) +
        campo("60", cidade) +
        campo("62", campo("05", txid));
    corpo += "6304";
    return corpo + crc16(corpo);
}
/** Devolve o "copia e cola" para um valor, ou null se o Pix da loja não estiver configurado. */
export function pixDaLoja(cfg, valor, txid) {
    if (!cfg?.pix_tipo || !cfg.pix_chave || !cfg.pix_nome || !cfg.pix_cidade)
        return null;
    const chave = normalizarChave(cfg.pix_tipo, cfg.pix_chave);
    if (!chave)
        return null;
    return montarPix({ chave, nome: cfg.pix_nome, cidade: cfg.pix_cidade, valor, txid });
}
