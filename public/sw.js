/*
  Service worker do Loja Fácil (aplicativo instalável).
  - Telas (HTML): sempre busca a versão nova na internet; sem internet, abre a última guardada.
  - Arquivos do sistema (/assets/, com nome que muda a cada versão): guardados depois do 1º uso.
  - Logo e ícones: usa o guardado e atualiza em segundo plano.
  - Supabase (dados, login) NUNCA passa por aqui: vendas e estoque são sempre ao vivo.
  A versão abaixo é trocada a cada publicação (vite.config.ts), o que apaga os arquivos antigos.
*/
const VERSAO = "__VERSAO__";
const CACHE = `lojafacil-${VERSAO}`;
const BASE = new URL("./", self.location).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("lojafacil-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(BASE, copia)); }
          return r;
        })
        .catch(() => caches.match(BASE).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    e.respondWith(
      caches.match(req).then((guardado) => guardado || fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return r;
      })),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((guardado) => {
      const rede = fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return r;
      }).catch(() => guardado || Response.error());
      return guardado || rede;
    }),
  );
});
