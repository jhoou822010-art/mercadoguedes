let pedido = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());
export function iniciarAppInstalavel() {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        pedido = e;
        avisar();
    });
    window.addEventListener("appinstalled", () => {
        pedido = null;
        avisar();
    });
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => { });
        });
    }
}
export function ouvirInstalacao(f) {
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
}
/** Já está aberto como aplicativo instalado? */
export function estaInstalado() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
/** iPhone/iPad: não tem botão automático; é pelo Compartilhar do Safari. */
export function ehIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function podeInstalar() {
    return pedido !== null;
}
export async function instalar() {
    if (!pedido)
        return false;
    const p = pedido;
    pedido = null;
    await p.prompt();
    const r = await p.userChoice;
    avisar();
    return r.outcome === "accepted";
}
