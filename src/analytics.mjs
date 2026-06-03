// Analytics: GA4 + GTM em todas as paginas HTML (injetado no <head>) + Conversion
// API server-side via Measurement Protocol GA4 (dispara purchase quando o webhook
// do Asaas confirma o pagamento). Sem deps externas.
//
// Config por env:
//   LICITA_GA4_ID          ID de medicao GA4 (ex: G-XXXXXXXXXX)
//   LICITA_GA4_API_SECRET  segredo do Measurement Protocol (Admin > Data Streams)
//   LICITA_GTM_ID          ID do Google Tag Manager (opcional, ex: GTM-XXXXXXX)
//   LICITA_META_PIXEL_ID   ID do Pixel da Meta (opcional, ex: 1234567890)

const GA4_ID = process.env.LICITA_GA4_ID || "";
const GA4_SECRET = process.env.LICITA_GA4_API_SECRET || "";
const GTM_ID = process.env.LICITA_GTM_ID || "";
const META_PIXEL = process.env.LICITA_META_PIXEL_ID || "";

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
  return s;
}

// Snippet noscript pro GTM (logo apos <body>, fallback sem JS).
function snippetBody() {
  if (!GTM_ID) return "";
  return `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

// Injeta os snippets no HTML antes de servir. Se nao ha analytics configurado,
// devolve o HTML inalterado (sem custo).
export function injetarAnalytics(html) {
  if (!temAnalytics()) return html;
  let novo = html;
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
