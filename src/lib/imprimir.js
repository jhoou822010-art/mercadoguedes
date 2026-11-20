/** Imprime somente o comprovante (.cupom) pela janela de impressão do navegador. */
export function imprimirCupom() {
    document.body.classList.add("modo-cupom");
    const limpar = () => document.body.classList.remove("modo-cupom");
    window.addEventListener("afterprint", limpar, { once: true });
    window.print();
    setTimeout(limpar, 1000);
}
/** Lê a preferência de largura do papel guardada neste computador. */
export function larguraCupom() {
    try {
        return localStorage.getItem("lojafacil.cupom") === "58" ? "58" : "80";
    }
    catch {
        return "80";
    }
}
export function salvarLarguraCupom(v) {
    try {
        localStorage.setItem("lojafacil.cupom", v);
    }
    catch {
        /* sem armazenamento: usa o padrão */
    }
}
