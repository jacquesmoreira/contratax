// Paginas SEO programaticas por ORGAO PUBLICO (/orgaos/<slug>).
// Cada orgao com >= 5 contratos no acervo vira uma pagina, listando os editais
// abertos + contratos recentes + reputacao de pagamento (CAPAG quando disponivel).
// Conteudo UNICO por orgao - dados que ninguem mais agrega assim.

import { topOrgaos, orgaoPorCnpj } from "./db.mjs";
import { reputacaoDoOrgao } from "./reputacaoOrgaos.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}
function brl(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL", maximumFractionDigits:0 });
}
function dataBR(s) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString("pt-BR");
}

// Slug de orgao: nome normalizado + ultimos 4 digitos do CNPJ pra unicidade.
export function slugOrgao(orgao) {
  if (!orgao?.nome || !orgao?.cnpj) return null;
  const nome = String(orgao.nome).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  const sufixo = String(orgao.cnpj).replace(/\D+/g, "").slice(-4);
  return `${nome}-${sufixo}`;
}

// Extrai o CNPJ a partir do slug (ultimos 4 digitos sao apenas dica - precisamos
// achar o CNPJ completo no banco). Usado pra resolver /orgaos/<slug>.
export async function orgaoPorSlug(slug) {
  // Pega os top orgaos e bate o slug
  const todos = topOrgaos({ limite: 5000, minimoContratos: 5 });
  return todos.find((o) => slugOrgao(o) === slug) || null;
}

// Lista de URLs pra sitemap
export function urlsOrgaos() {
  const todos = topOrgaos({ limite: 1000, minimoContratos: 5 });
  return todos.map((o) => `${BASE}/orgaos/${slugOrgao(o)}`).filter(Boolean);
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Public Sans',-apple-system,BlinkMacSystemFont,sans-serif;background:#FAF9F5;color:#0B1E3A;line-height:1.6}h1,h2,h3{font-family:'Manrope','Public Sans',sans-serif}
nav{background:#fff;border-bottom:1px solid #E4E7F0;position:sticky;top:0;z-index:10}
nav .w{max-width:980px;margin:0 auto;display:flex;align-items:center;height:60px;padding:0 20px;gap:18px}
nav .w img{height:30px}
nav .dir{margin-left:auto;display:flex;gap:18px;font-size:14px;font-weight:600}
nav .dir a{color:#475569;text-decoration:none}
nav .dir a.cta{background:#4338ca;color:#fff;padding:9px 17px;border-radius:9px}
.w{max-width:980px;margin:0 auto;padding:30px 20px 60px}
.bc{font-size:13px;color:#64748b;margin-bottom:12px}
.bc a{color:#4338ca;text-decoration:none}
h1{font-size:30px;font-weight:800;letter-spacing:-.5px;line-height:1.2;margin-bottom:8px}
.sub{color:#475569;font-size:15.5px;margin-bottom:22px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px}
.stat{background:#fff;border:1px solid #E4E7F0;border-radius:11px;padding:14px}
.stat .lbl{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}
.stat .v{font-size:22px;font-weight:900;color:#4338ca}
h2{font-size:22px;font-weight:800;margin:30px 0 12px}
h3{font-size:17px;font-weight:700;margin:18px 0 10px}
.card{background:#fff;border:1px solid #E4E7F0;border-radius:12px;padding:16px;margin-bottom:11px}
.card .org{font-size:12.5px;color:#64748b;font-weight:600;margin-bottom:5px}
.card .obj{font-size:14.5px;color:#0B1E3A;line-height:1.45;margin-bottom:7px}
.card .meta{display:flex;gap:14px;font-size:13px;color:#475569;flex-wrap:wrap}
.card .meta b{color:#0B1E3A}
.cta-box{background:linear-gradient(135deg,#EEF0FF,#fff);border:1px solid #c7d2fe;border-radius:14px;padding:22px;margin:24px 0;text-align:center}
.cta-box h2{margin-top:0;font-size:19px}
.cta-box a{display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;margin-top:6px}
.como{background:#fff;border:1px solid #E4E7F0;border-radius:12px;padding:18px 22px;margin:20px 0;font-size:14.5px;color:#475569}
.como p{margin-bottom:10px}
.reputacao{background:#fff;border:1px solid #E4E7F0;border-radius:12px;padding:16px 18px;margin:18px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.reputacao .rotulo{font-weight:800;font-size:13px;padding:7px 13px;border-radius:99px}
.reputacao .dias{font-size:22px;font-weight:900}
footer{background:#0B1E3A;color:#cbd5e1;padding:30px 20px;text-align:center;font-size:13px}
footer a{color:#a5b4fc;text-decoration:none;margin:0 9px}
`;

function layout({ title, description, canonical, jsonld = "", body }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="${canonical}"/>
<link rel="icon" href="/logo-favicon.png" type="image/png"/>
<meta property="og:type" content="website"/><meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${BASE}/og-image.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Public+Sans:wght@400;500;600;700;800&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Public+Sans:wght@400;500;600;700;800&display=swap"></noscript>
<style>${CSS}</style>${jsonld}</head><body>
<nav><div class="w"><a href="/"><img src="/logo-horizontal.png" alt="ContrataX"/></a>
<div class="dir"><a href="/licitacoes">Ramos</a><a href="/blog">Blog</a><a class="cta" href="/cadastro">Criar conta grátis</a></div></div></nav>
${body}
<footer>
<a href="/">Início</a> · <a href="/licitacoes">Licitações por ramo</a> · <a href="/blog">Blog</a> · <a href="/ajuda">Ajuda</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a>
<div style="margin-top:10px;opacity:.7">Dados oficiais do PNCP. ContrataX não é vinculada ao governo.</div>
</footer>
</body></html>`;
}

// ===== Pagina de orgao individual =====
export async function paginaOrgao(slug) {
  const orgao = await orgaoPorSlug(slug);
  if (!orgao) return null;
  const detalhe = orgaoPorCnpj(orgao.cnpj);
  if (!detalhe) return null;

  const onde = [orgao.municipio, orgao.uf].filter(Boolean).join("/");
  const canonical = `${BASE}/orgaos/${slug}`;
  const title = `Licitações de ${orgao.nome} — Editais Abertos e Contratos | ContrataX`;
  const description = `${detalhe.editais.length} editais abertos e ${detalhe.totalContratos.toLocaleString("pt-BR")} contratos no histórico de ${orgao.nome}${onde ? " (" + onde + ")" : ""}. Acompanhe oportunidades de venda para esse órgão.`;

  // Reputação de pagamento (CAPAG)
  const rep = await reputacaoDoOrgao({ cnpj: orgao.cnpj, nome: orgao.nome, uf: orgao.uf, municipio: orgao.municipio });
  const corRep = rep.classificacao === "rapido" ? "#16A34A" : rep.classificacao === "lento" ? "#dc2626" : "#d97706";
  const bgRep = rep.classificacao === "rapido" ? "#DCFCE7" : rep.classificacao === "lento" ? "#fef2f2" : "#fffbeb";
  const rotuloRep = rep.classificacao === "rapido" ? "Paga rápido" : rep.classificacao === "lento" ? "Tende a atrasar" : "Pagamento regular";

  const listaEditais = detalhe.editais.length
    ? detalhe.editais.map((e) => `<div class="card">
        <div class="obj">${esc((e.objeto || "").slice(0, 220))}</div>
        <div class="meta">${e.modalidade ? `<span>${esc(e.modalidade)}</span>` : ""}
          ${e.valorEstimado > 0 ? `<span><b>${brl(e.valorEstimado)}</b></span>` : `<span style="color:#94a3b8">valor não divulgado</span>`}
          <span>encerra em ${dataBR(e.encerramento)}</span></div>
      </div>`).join("")
    : `<div class="como"><p>No momento não há editais abertos deste órgão. Crie sua conta grátis e seja avisado assim que surgir um.</p></div>`;

  const listaContratos = detalhe.contratos.slice(0, 10).map((c) => `<div class="card">
    <div class="org">${esc(c.fornecedor || "Fornecedor não informado")}</div>
    <div class="obj">${esc((c.objeto || "").slice(0, 180))}</div>
    <div class="meta">${c.valor > 0 ? `<span><b>${brl(c.valor)}</b></span>` : ""}
      ${c.vigenciaInicio ? `<span>desde ${dataBR(c.vigenciaInicio)}</span>` : ""}</div>
  </div>`).join("");

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: BASE + "/" },
        { "@type": "ListItem", position: 2, name: "Órgãos", item: BASE + "/orgaos" },
        { "@type": "ListItem", position: 3, name: orgao.nome, item: canonical },
      ] },
      { "@type": "GovernmentOrganization", name: orgao.nome, taxID: orgao.cnpj,
        address: { "@type": "PostalAddress", addressLocality: orgao.municipio, addressRegion: orgao.uf, addressCountry: "BR" } },
    ],
  })}</script>`;

  const body = `<div class="w">
    <div class="bc"><a href="/">Início</a> › <a href="/orgaos">Órgãos públicos</a> › ${esc(orgao.nome)}</div>
    <h1>Licitações de ${esc(orgao.nome)}</h1>
    <div class="sub">${onde ? `Sediado em ${esc(onde)}. ` : ""}Acompanhe editais abertos, contratos firmados e a reputação de pagamento deste órgão.</div>

    <div class="stats">
      <div class="stat"><div class="lbl">Editais abertos</div><div class="v">${detalhe.editais.length}</div></div>
      <div class="stat"><div class="lbl">Contratos no acervo</div><div class="v">${detalhe.totalContratos.toLocaleString("pt-BR")}</div></div>
      <div class="stat"><div class="lbl">CNPJ</div><div class="v" style="font-size:14px">${esc(orgao.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"))}</div></div>
    </div>

    <h2>Reputação de pagamento</h2>
    <div class="reputacao">
      <div class="rotulo" style="background:${bgRep};color:${corRep};border:1px solid ${corRep}33">${rotuloRep}</div>
      <div><div class="dias" style="color:${corRep}">${rep.diasMedios} dias</div><div style="font-size:12.5px;color:#64748b">tempo médio até receber</div></div>
      <div style="flex:1;font-size:13.5px;color:#64748b">${esc(rep.contexto)}</div>
    </div>

    <h2>Editais abertos (${detalhe.editais.length})</h2>
    ${listaEditais}

    <div class="cta-box">
      <h2>Quer ser avisado quando esse órgão publicar nova licitação?</h2>
      <p>Crie sua conta grátis e receba todo dia os editais do seu ramo com leitura automática do edital pela ContrataX.IA.</p>
      <a href="/cadastro">Criar conta grátis</a>
    </div>

    ${listaContratos ? `<h2>Últimos contratos firmados</h2>${listaContratos}` : ""}

    <div class="como">
      <h3>Como vender para ${esc(orgao.nome)}</h3>
      <p>As compras deste órgão são publicadas no PNCP. Para participar, sua empresa precisa estar com a documentação de habilitação em dia (certidões fiscais, trabalhista, qualificação técnica quando aplicável). O ContrataX monitora o órgão em tempo real e te avisa assim que sair um novo edital do seu ramo.</p>
    </div>
  </div>`;

  return layout({ title, description, canonical, jsonld, body });
}

// ===== Hub /orgaos =====
export function paginaHubOrgaos() {
  const top = topOrgaos({ limite: 100, minimoContratos: 50 });
  const canonical = `${BASE}/orgaos`;
  const title = "Órgãos públicos no PNCP — Acompanhe editais por órgão | ContrataX";
  const description = "Lista de órgãos públicos com maior volume de licitações no PNCP. Veja editais abertos, contratos firmados e reputação de pagamento de cada órgão.";

  const lista = top.map((o) => `<div class="card">
    <div class="org">${esc([o.municipio, o.uf].filter(Boolean).join("/"))}</div>
    <div class="obj"><a href="/orgaos/${slugOrgao(o)}" style="color:#4338ca;text-decoration:none;font-weight:700">${esc(o.nome)}</a></div>
    <div class="meta"><span>${o.contratos.toLocaleString("pt-BR")} contratos no acervo</span></div>
  </div>`).join("");

  const body = `<div class="w">
    <div class="bc"><a href="/">Início</a> › Órgãos públicos</div>
    <h1>Órgãos públicos no PNCP</h1>
    <div class="sub">Conheça os ${top.length} órgãos com maior volume de licitações no acervo nacional. Para cada um, você vê os editais abertos, o histórico de contratos e a reputação de pagamento.</div>
    ${lista}
    <div class="cta-box">
      <h2>Receba editais do seu ramo todo dia</h2>
      <a href="/cadastro">Criar conta grátis</a>
    </div>
  </div>`;

  return layout({ title, description, canonical, body });
}
