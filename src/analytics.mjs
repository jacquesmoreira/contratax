// Analytics: GA4 + GTM em todas as paginas HTML (injetado no <head>) + Conversion
// API server-side via Measurement Protocol GA4 (dispara purchase quando o webhook
// do Asaas confirma o pagamento). Sem deps externas.
//
// Config por env:
//   LICITA_GA4_ID          ID de medicao GA4 (ex: G-XXXXXXXXXX)
//   LICITA_GA4_API_SECRET  segredo do Measurement Protocol (Admin > Data Streams)
//   LICITA_GTM_ID          ID do Google Tag Manager (opcional, ex: GTM-XXXXXXX)
//   LICITA_META_PIXEL_ID   ID do Pixel da Meta (opcional, ex: 1234567890)

// GA4 padrao do ContrataX em producao. Pode ser sobrescrito por env.
const GA4_ID = process.env.LICITA_GA4_ID || "G-N79Q5SH624";
const GA4_SECRET = process.env.LICITA_GA4_API_SECRET || "";
const GTM_ID = process.env.LICITA_GTM_ID || "";
const META_PIXEL = process.env.LICITA_META_PIXEL_ID || "";
// Microsoft Clarity (heatmap + session replay, gratis). Project ID padrao do
// ContrataX em producao. Sobrescreve via LICITA_CLARITY_ID se quiser trocar.
const CLARITY_ID = process.env.LICITA_CLARITY_ID || "wrs09m31ps";

export function temAnalytics() {
  return Boolean(GA4_ID || GTM_ID);
}

// Snippet que vai no <head> de toda pagina (gtag + GTM + Pixel Meta opcional).
// Carrega o gtag.js (GA4) com Anonymize IP por padrao (LGPD-friendly).
function snippetHead() {
  let s = "";
  if (GA4_ID) {
    s += `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${GA4_ID}",{anonymize_ip:true});</script>`;
  }
  if (GTM_ID) {
    s += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');</script>`;
  }
  if (META_PIXEL) {
    s += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL}');fbq('track','PageView');</script>`;
  }
  if (CLARITY_ID) {
    s += `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");</script>`;
  }
  return s;
}

// Snippet noscript pro GTM (logo apos <body>, fallback sem JS).
function snippetBody() {
  if (!GTM_ID) return "";
  return `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

// Snippet PWA: manifest + theme-color + apple-touch-icon + register do SW.
// Aplica em TODAS as paginas servidas via injetarAnalytics (inclusive sem GA),
// pra que mobile reconheca como app instalavel ("Adicionar a tela inicial").
const SNIPPET_PWA = `
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#4338ca">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ContrataX">
<link rel="apple-touch-icon" href="/icon-192.png">
<style>
/* Responsive base aplicado em TODAS as paginas via injecao - garante que
   contas/cadastro/entrar/equipe e demais paginas funcionem bem no celular
   mesmo sem media queries proprias. */
@media (max-width: 760px) {
  .wrap, .wrap-main, .card, .container { max-width: 100% !important; }
  body { font-size: 15px; }
  h1 { font-size: 22px !important; line-height: 1.25; }
  h2 { font-size: 19px !important; }
  h3 { font-size: 16px !important; }
  input, textarea, select { font-size: 16px !important; }  /* evita zoom iOS */
  .btn, button.btn, button[type="submit"] { padding: 13px 16px !important; font-size: 15px !important; }
  /* Tabelas viram scrollaveis horizontalmente em vez de quebrar layout */
  table { font-size: 13px !important; }
  .tabela, .tabela-comp { overflow-x: auto; display: block; }
  /* Grids viram coluna unica */
  .grid2, .dores, .passos, .preco-grid { grid-template-columns: 1fr !important; }
  /* Wrappers principais ganham padding lateral menor */
  .wrap-main { padding: 22px 14px 50px !important; }
  /* Forms full-width */
  form input, form textarea, form select { width: 100% !important; }
  /* Modais (recebiveis/contratos) caem pra full screen */
  .modal-card { max-width: 100% !important; max-height: 96vh !important; padding: 20px !important; }
}
@media (max-width: 420px) {
  h1 { font-size: 20px !important; }
  .wrap-main { padding: 16px 12px 40px !important; }
}
</style>
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}
// Banner de consentimento de cookies (LGPD). Aparece uma vez; o aceite fica
// salvo em localStorage. Discreto, fixo no rodape.
(function(){
  try {
    if (localStorage.getItem("cx_cookies_ok")) return;
    window.addEventListener("load", function(){
      var b = document.createElement("div");
      b.id = "cx-cookie-banner";
      b.style.cssText = "position:fixed;left:14px;right:14px;bottom:14px;max-width:560px;margin:0 auto;background:#0f172a;color:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.25);z-index:9999;font-family:Inter,-apple-system,sans-serif;display:flex;gap:14px;align-items:center;flex-wrap:wrap";
      b.innerHTML = '<div style="flex:1;min-width:200px;font-size:13.5px;line-height:1.5">Usamos cookies para manter seu acesso e melhorar a plataforma. Ao continuar, você concorda com a nossa <a href="/privacidade" style="color:#a5b4fc;font-weight:700">Política de Privacidade</a>.</div><button id="cx-cookie-ok" style="background:#4338ca;color:#fff;border:none;padding:11px 22px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;white-space:nowrap">Aceitar</button>';
      document.body.appendChild(b);
      document.getElementById("cx-cookie-ok").onclick = function(){
        try { localStorage.setItem("cx_cookies_ok", "1"); } catch(e){}
        b.remove();
      };
    });
  } catch(e){}
})();
</script>
`;

// Injeta os snippets no HTML antes de servir. Sempre roda (analytics opcional,
// mas PWA entra em tudo).
export function injetarAnalytics(html) {
  let novo = html;
  // PWA: sempre. Evita duplicar se ja tem manifest no HTML.
  if (!/rel=["']manifest["']/i.test(novo) && /<\/head>/i.test(novo)) {
    novo = novo.replace(/<\/head>/i, SNIPPET_PWA + "</head>");
  }
  if (!temAnalytics()) return novo;
  const head = snippetHead();
  const body = snippetBody();
  if (head && /<\/head>/i.test(novo)) novo = novo.replace(/<\/head>/i, head + "</head>");
  if (body && /<body[^>]*>/i.test(novo)) novo = novo.replace(/<body([^>]*)>/i, `<body$1>${body}`);
  return novo;
}

// Envio server-side de evento PURCHASE pro GA4 via Measurement Protocol.
// Use quando o pagamento for confirmado (webhook Asaas) — independe de cookie
// e do navegador do cliente estar aberto, registrando a conversao com certeza.
//   perfil: { token, email, nome }
//   evento: { transactionId, value, planoId, planoNome, formaPagamento }
export async function enviarConversao(perfil, evento) {
  if (!GA4_ID || !GA4_SECRET) return { ok: false, motivo: "ga4-nao-configurado" };
  try {
    const clientId = perfil.token || perfil.id || crypto.randomUUID();
    const corpo = {
      client_id: clientId,
      user_id: perfil.email || clientId,
      events: [{
        name: "purchase",
        params: {
          transaction_id: evento.transactionId,
          currency: "BRL",
          value: Number(evento.value) || 0,
          items: [{
            item_id: evento.planoId,
            item_name: evento.planoNome || evento.planoId,
            price: Number(evento.value) || 0,
            quantity: 1,
          }],
          forma_pagamento: evento.formaPagamento || "UNDEFINED",
        },
      }],
    };
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_ID}&api_secret=${GA4_SECRET}`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
