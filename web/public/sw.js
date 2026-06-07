// Service worker minimalista do ContrataX.
// Objetivo: revisitas instantaneas (cache do shell + assets estaticos),
// sem prejudicar a frescura do conteudo dinamico.
//
// Estrategia:
//   - GET de HTML/dados dinamicos -> rede primeiro, cache como fallback offline
//   - GET de assets estaticos (.png/.svg/.ico/.webp/.css/.woff/.woff2) -> cache primeiro
//   - POST e outras requisicoes nao sao cacheadas

const VERSAO = "v2";
const CACHE_ESTATICO = `contratax-estatico-${VERSAO}`;
const CACHE_DINAMICO = `contratax-dinamico-${VERSAO}`;

const SHELL = [
  "/painel",
  "/logo-horizontal.png",
  "/logo-favicon.png",
  "/manifest.json",
];

// Instalacao: precacheia o shell minimo (best-effort).
self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE_ESTATICO).then((c) => c.addAll(SHELL).catch(() => null))
  );
  self.skipWaiting();
});

// Ativacao: limpa caches antigos.
self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((k) => k !== CACHE_ESTATICO && k !== CACHE_DINAMICO)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function ehEstatico(url) {
  return /\.(svg|png|ico|webp|jpg|jpeg|woff2?|css)$/i.test(url.pathname);
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cross-origin (GA, Clarity, Google Fonts, GTM, Asaas) NUNCA passa pelo SW.
  // Se o SW fizer fetch desses, o navegador trata como "connect-src" no CSP
  // da pagina, e a request e bloqueada. Deixa o navegador resolver direto.
  if (url.origin !== self.location.origin) return;
  // Nunca cachear chamadas a API ou rotas com token (?c=...)
  if (url.pathname.startsWith("/api/")) return;
  if (url.searchParams.has("c")) return;

  if (ehEstatico(url)) {
    // cache-first
    ev.respondWith(
      caches.open(CACHE_ESTATICO).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const r = await fetch(req);
          if (r.ok) c.put(req, r.clone());
          return r;
        } catch { return new Response("offline", { status: 503 }); }
      })
    );
    return;
  }

  // HTML / dados publicos: rede primeiro, cache como fallback
  ev.respondWith(
    fetch(req).then((r) => {
      const cp = r.clone();
      caches.open(CACHE_DINAMICO).then((c) => c.put(req, cp)).catch(() => null);
      return r;
    }).catch(() => caches.match(req).then((hit) => hit || new Response("offline", { status: 503 })))
  );
});
