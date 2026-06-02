// Renderizacao SERVER-SIDE das paginas publicas de SEO (programatico). O conteudo
// (lista de editais reais) ja sai no HTML, para o Google indexar sem depender de JS.
//   /licitacoes              -> hub (todos os ramos + estados)
//   /licitacoes/<slug>       -> ramo, Brasil todo
//   /licitacoes/<slug>/<uf>  -> ramo + estado

import { buscarEditais } from "./db.mjs";
import { CATEGORIAS, UFS, categoriaPorSlug, ufPorSigla } from "./categorias.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://contratax.com.br";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const brl = (v) => (v == null || Number(v) === 0) ? "valor não informado" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
function diasAte(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.ceil((d - new Date()) / 864e5); }
function prazo(iso) { const d = diasAte(iso); if (d == null) return ""; return d < 0 ? "encerrado" : d === 0 ? "encerra hoje" : d === 1 ? "encerra amanhã" : `encerra em ${d} dias`; }
function portalUrl(e) { return e.link || (e.orgaoCnpj && e.ano && e.sequencial ? `https://pncp.gov.br/app/editais/${e.orgaoCnpj}/${e.ano}/${e.sequencial}` : "https://pncp.gov.br"); }

const CSS = `
:root{--navy:#0f1e46;--azul:#2563eb;--azul-c:#1e40af;--tinta:#0f172a;--cinza:#475569;--cinza-c:#94a3b8;--linha:#e2e8f0;--fundo:#f8fafc;--verde:#059669;--verde-bg:#ecfdf5}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--tinta);background:var(--fundo);line-height:1.55}
nav{background:#fff;border-bottom:1px solid var(--linha)}
nav .w{max-width:980px;margin:0 auto;height:62px;display:flex;align-items:center;gap:18px;padding:0 20px}
nav .dir{margin-left:auto;display:flex;gap:18px;font-size:14px;font-weight:600}
nav a{color:var(--cinza);text-decoration:none}
nav a.cta{background:var(--azul);color:#fff;padding:9px 16px;border-radius:9px}
.hero{background:linear-gradient(180deg,#eef2ff,#fff);padding:38px 0 26px}
.w{max-width:980px;margin:0 auto;padding:0 20px}
.bc{font-size:13px;color:var(--cinza-c);margin-bottom:10px}
.bc a{color:var(--azul);text-decoration:none}
h1{font-size:clamp(24px,4vw,34px);font-weight:800;letter-spacing:-.5px;color:var(--navy)}
.intro{color:var(--cinza);font-size:16px;margin-top:12px;max-width:740px}
.count{display:inline-block;background:var(--verde-bg);color:var(--verde);font-weight:700;font-size:14px;padding:6px 14px;border-radius:99px;margin:18px 0 6px}
.ed{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.ed .top{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--cinza-c);font-weight:600}
.ed .pz{color:var(--azul);white-space:nowrap}
.ed .pz.u{color:#dc2626}
.ed .obj{font-size:15px;font-weight:600;margin:7px 0;color:var(--tinta)}
.ed .rod{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px}
.ed .val{font-weight:700}
.ed a.ver{color:var(--azul);font-weight:700;text-decoration:none;white-space:nowrap}
.cta-box{background:var(--navy);color:#fff;border-radius:16px;padding:28px;margin:30px 0;text-align:center}
.cta-box h2{font-size:22px;font-weight:800;margin-bottom:8px}
.cta-box p{opacity:.85;max-width:560px;margin:0 auto 18px}
.cta-box a{display:inline-block;background:#fff;color:var(--navy);font-weight:800;padding:13px 26px;border-radius:11px;text-decoration:none}
.sec{margin:34px 0}
.sec h2{font-size:18px;font-weight:800;margin-bottom:14px;color:var(--navy)}
.chips{display:flex;flex-wrap:wrap;gap:9px}
.chips a{background:#fff;border:1px solid var(--linha);border-radius:99px;padding:8px 14px;font-size:13.5px;color:var(--azul-c);text-decoration:none;font-weight:600}
.chips a:hover{border-color:var(--azul)}
.como{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:22px}
.como h3{font-size:16px;margin-bottom:8px}
.como p{color:var(--cinza);font-size:14.5px;margin-bottom:8px}
footer{background:var(--navy);color:#94a3b8;padding:34px 0;font-size:13.5px;text-align:center;margin-top:40px}
footer a{color:#cbd5e1;text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.grid a{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:15px;text-decoration:none;color:var(--tinta);font-weight:700;font-size:14.5px}
.grid a span{display:block;color:var(--cinza-c);font-weight:500;font-size:12.5px;margin-top:3px}
`;

function layout({ title, description, canonical, jsonld = "", body }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="${canonical}"/>
<link rel="icon" href="/logo-favicon.png" type="image/png"/>
<meta property="og:type" content="website"/><meta property="og:locale" content="pt_BR"/>
<meta property="og:site_name" content="ContrataX"/><meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${BASE}/og-image.png"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>${CSS}</style>${jsonld}</head><body>
<nav><div class="w"><a href="/"><img src="/logo-horizontal.png" alt="ContrataX" style="height:30px;display:block"/></a>
<div class="dir"><a href="/licitacoes">Ramos</a><a href="/entrar">Entrar</a><a class="cta" href="/cadastro">Criar conta grátis</a></div></div></nav>
${body}
<footer><div class="w"><b style="color:#fff">ContrataX</b> — Monitoramento de licitações públicas do PNCP.<br>
<a href="/licitacoes">Todos os ramos</a> · <a href="/cadastro">Criar conta grátis</a> · Dados públicos do PNCP.</div></footer>
</body></html>`;
}

function editalHTML(e) {
  const d = diasAte(e.encerramento);
  const pz = prazo(e.encerramento);
  return `<article class="ed">
    <div class="top"><span>${esc(e.municipio || "")}/${esc(e.uf || "")} · ${esc(e.orgao || "")}</span><span class="pz${d != null && d <= 3 ? " u" : ""}">${esc(pz)}</span></div>
    <div class="obj">${esc((e.objeto || "").slice(0, 160))}</div>
    <div class="rod"><span class="val">${esc(e.modalidade || "")} · ${brl(e.valorEstimado)}</span>
    <a class="ver" href="${esc(portalUrl(e))}" target="_blank" rel="nofollow noopener">Ver edital no PNCP →</a></div>
  </article>`;
}

// ---- Pagina de um ramo (Brasil todo ou por UF) ----
export function paginaCategoria(slug, ufSigla = null) {
  const cat = categoriaPorSlug(slug);
  if (!cat) return null;
  const uf = ufSigla ? ufPorSigla(ufSigla) : null;
  if (ufSigla && !uf) return null;

  const { total, editais } = buscarEditais({ termo: cat.termo, uf: uf?.sigla || null, limite: 24 });
  const onde = uf ? `em ${uf.nome}` : "no Brasil";
  const ondeCurto = uf ? uf.sigla : "Brasil";
  const canonical = `${BASE}/licitacoes/${slug}${uf ? "/" + uf.sigla.toLowerCase() : ""}`;
  const title = `Licitações de ${cat.nome} ${onde} — Editais Abertos | ContrataX`;
  const description = `${total} licitações de ${cat.nome.toLowerCase()} abertas agora ${onde}. Editais do PNCP atualizados hoje, com prazo e valor. Receba alertas grátis dos editais do seu ramo.`;

  const lista = editais.length
    ? editais.map(editalHTML).join("")
    : `<div class="como"><p>No momento não há editais de ${esc(cat.nome.toLowerCase())} abertos ${esc(onde)}. Novos editais entram todo dia — crie uma conta grátis e seja avisado assim que surgir um.</p></div>`;

  // Links internos: por estado (se nacional) ou "Brasil todo" (se UF) + outros ramos
  const linksEstados = !uf
    ? `<div class="sec"><h2>Licitações de ${esc(cat.nome)} por estado</h2><div class="chips">${UFS.map((u) => `<a href="/licitacoes/${slug}/${u.sigla.toLowerCase()}">${esc(cat.nome)} em ${u.sigla}</a>`).join("")}</div></div>`
    : `<div class="sec"><h2>Veja também</h2><div class="chips"><a href="/licitacoes/${slug}">${esc(cat.nome)} no Brasil todo</a>${UFS.filter((u) => u.sigla !== uf.sigla).slice(0, 10).map((u) => `<a href="/licitacoes/${slug}/${u.sigla.toLowerCase()}">${esc(cat.nome)} em ${u.sigla}</a>`).join("")}</div></div>`;
  const outrosRamos = `<div class="sec"><h2>Outros ramos de licitação</h2><div class="chips">${CATEGORIAS.filter((c) => c.slug !== slug).slice(0, 16).map((c) => `<a href="/licitacoes/${c.slug}${uf ? "/" + uf.sigla.toLowerCase() : ""}">${esc(c.nome)}</a>`).join("")}</div></div>`;

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: BASE + "/" },
        { "@type": "ListItem", position: 2, name: "Licitações", item: BASE + "/licitacoes" },
        { "@type": "ListItem", position: 3, name: `${cat.nome} ${onde}`, item: canonical },
      ] },
      { "@type": "CollectionPage", name: title, description, url: canonical, inLanguage: "pt-BR" },
    ],
  })}</script>`;

  const body = `<header class="hero"><div class="w">
    <div class="bc"><a href="/">Início</a> › <a href="/licitacoes">Licitações</a> › ${esc(cat.nome)} ${esc(uf ? "em " + uf.nome : "")}</div>
    <h1>Licitações de ${esc(cat.nome)} ${esc(onde)}</h1>
    <p class="intro">Acompanhe os editais de ${esc(cat.nome.toLowerCase())} abertos ${esc(onde)}, com dados oficiais do PNCP atualizados todos os dias. Veja prazo, valor e órgão de cada licitação — e receba no e-mail os novos editais do seu ramo.</p>
    </div></header>
    <div class="w">
    <div class="count">${total} ${total === 1 ? "edital aberto" : "editais abertos"} ${esc(ondeCurto === "Brasil" ? "no Brasil" : "em " + ondeCurto)}</div>
    ${lista}
    <div class="cta-box"><h2>Não perca nenhuma licitação de ${esc(cat.nome.toLowerCase())}</h2>
    <p>Crie sua conta grátis e receba todo dia os editais do seu ramo, já sabendo se a sua empresa está apta a participar.</p>
    <a href="/cadastro">Criar conta grátis</a></div>
    ${linksEstados}
    ${outrosRamos}
    <div class="sec"><div class="como"><h3>Como participar de licitações de ${esc(cat.nome)}</h3>
    <p>As licitações de ${esc(cat.nome.toLowerCase())} são publicadas no PNCP por prefeituras, governos estaduais e órgãos federais. Para participar, a empresa precisa estar com a documentação de habilitação em dia (certidões fiscais, trabalhista e qualificação técnica) e enviar a proposta no portal indicado no edital.</p>
    <p>O ContrataX reúne esses editais num só lugar, lê cada um e cruza as exigências com a sua empresa, mostrando se você está apto e o que falta — antes de você gastar tempo montando a papelada.</p></div></div>
    </div>`;

  return layout({ title, description, canonical, jsonld, body });
}

// ---- Hub /licitacoes ----
export function paginaHub() {
  const canonical = `${BASE}/licitacoes`;
  const title = "Licitações Públicas por Ramo e Estado — Editais Abertos | ContrataX";
  const description = "Encontre licitações públicas abertas por ramo de atividade e por estado. Editais do PNCP atualizados todo dia, com prazo e valor. Crie sua conta grátis.";
  const body = `<header class="hero"><div class="w">
    <div class="bc"><a href="/">Início</a> › Licitações</div>
    <h1>Licitações públicas por ramo</h1>
    <p class="intro">Escolha o seu ramo de atividade e veja os editais abertos agora, no Brasil todo ou no seu estado. Dados oficiais do PNCP, atualizados todos os dias.</p>
    </div></header><div class="w">
    <div class="sec"><h2>Ramos de licitação</h2><div class="grid">${CATEGORIAS.map((c) => `<a href="/licitacoes/${c.slug}"><b>${esc(c.nome)}</b><span>Ver editais abertos</span></a>`).join("")}</div></div>
    <div class="cta-box"><h2>Receba os editais do seu ramo todo dia</h2><p>Crie sua conta grátis e o ContrataX garimpa as licitações que combinam com a sua empresa, e ainda diz se você está apto a participar.</p><a href="/cadastro">Criar conta grátis</a></div>
    <div class="sec"><h2>Por estado</h2><div class="chips">${UFS.map((u) => `<a href="/licitacoes/material-hospitalar/${u.sigla.toLowerCase()}">${esc(u.nome)}</a>`).join("")}</div></div>
    </div>`;
  return layout({ title, description, canonical, body });
}

// URLs para o sitemap (hub + cada ramo nacional + ramo x UF).
export function urlsSEO() {
  const urls = [`${BASE}/licitacoes`];
  for (const c of CATEGORIAS) {
    urls.push(`${BASE}/licitacoes/${c.slug}`);
    for (const u of UFS) urls.push(`${BASE}/licitacoes/${c.slug}/${u.sigla.toLowerCase()}`);
  }
  return urls;
}
