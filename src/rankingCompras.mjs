// Paginas de RANKING (/ranking/<slug>) - ativo de dados linkavel.
//
// Diferente de /licitacoes e /cnae (que mostram editais ABERTOS, uteis pro
// fornecedor comprar), esta pagina responde "quem MAIS COMPROU X no Brasil"
// com base no HISTORICO de contratos. E o tipo de dado que jornalista,
// consultor e blog de contador citam e linkam sem a gente pedir - o unico
// jeito de ganhar backlink de verdade sem outbound (regra do fundador).
//
// Reaproveita as mesmas 36 categorias de src/categorias.mjs (ja usadas em
// /licitacoes/<slug>) para nao duplicar catalogo.

import { rankingPorTermo } from "./db.mjs";
import { CATEGORIAS, categoriaPorSlug } from "./categorias.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}
function brl(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL", maximumFractionDigits:0 });
}

// Slug de orgao identico ao de seoOrgaos.mjs (nome normalizado + 4 digitos do
// CNPJ), para os links do ranking apontarem pra pagina /orgaos/<slug> ja
// existente sem duplicar geracao de conteudo.
function slugOrgao(o) {
  if (!o?.nome || !o?.cnpj) return null;
  const nome = String(o.nome).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  const sufixo = String(o.cnpj).replace(/\D+/g, "").slice(-4);
  return `${nome}-${sufixo}`;
}

export function urlsRanking() {
  return CATEGORIAS.map((c) => `${BASE}/ranking/${c.slug}`);
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Public Sans',sans-serif;background:#FAF9F5;color:#0B1E3A;line-height:1.6}h1,h2,h3{font-family:'Manrope','Public Sans',sans-serif}
nav{background:#fff;border-bottom:1px solid #E4E7F0;position:sticky;top:0;z-index:10}
nav .w{max-width:980px;margin:0 auto;display:flex;align-items:center;height:60px;padding:0 20px;gap:18px}
nav .w img{height:30px}
nav .dir{margin-left:auto;display:flex;gap:18px;font-size:14px;font-weight:600}
nav .dir a{color:#475569;text-decoration:none}
nav .dir a.cta{background:#4338ca;color:#fff;padding:9px 17px;border-radius:9px}
.w{max-width:980px;margin:0 auto;padding:30px 20px 60px}
.bc{font-size:13px;color:#64748b;margin-bottom:12px}
.bc a{color:#4338ca;text-decoration:none}
h1{font-size:28px;font-weight:800;letter-spacing:-.5px;line-height:1.25;margin-bottom:8px}
.sub{color:#475569;font-size:15.5px;margin-bottom:22px}
.tag{display:inline-block;background:#EEF0FF;color:#4338ca;padding:6px 13px;border-radius:99px;font-size:13px;font-weight:700;margin-bottom:16px}
h2{font-size:21px;font-weight:800;margin:28px 0 12px}
h3{font-size:17px;font-weight:700;margin:18px 0 10px}
table{width:100%;min-width:520px;border-collapse:collapse;background:#fff;border:1px solid #E4E7F0;border-radius:12px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:11px 13px;border-bottom:1px solid #E4E7F0;vertical-align:top}
th{background:#FAF9F5;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#64748b}
tr:last-child td{border-bottom:none}
td.pos{font-weight:800;color:#94a3b8;width:36px}
td.org a{color:#0B1E3A;text-decoration:none;font-weight:700}
td.org a:hover{color:#4338ca}
td.org .loc{display:block;font-size:12.5px;color:#64748b;font-weight:400;margin-top:2px}
td.val{font-weight:800;color:#16A34A;white-space:nowrap}
td.n{color:#64748b;white-space:nowrap}
.metodologia{background:#fff;border:1px solid #E4E7F0;border-radius:12px;padding:18px 22px;margin:22px 0;font-size:13.5px;color:#475569}
.cta-box{background:linear-gradient(135deg,#EEF0FF,#fff);border:1px solid #c7d2fe;border-radius:14px;padding:22px;margin:24px 0;text-align:center}
.cta-box h2{margin-top:0;font-size:19px}
.cta-box a{display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;margin-top:6px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.chips a{background:#fff;border:1px solid #E4E7F0;color:#475569;padding:8px 14px;border-radius:9px;font-size:13.5px;font-weight:600;text-decoration:none}
.chips a:hover{border-color:#4338ca;color:#4338ca}
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
<div class="dir"><a href="/ranking">Rankings</a><a href="/licitacoes">Ramos</a><a class="cta" href="/cadastro">Criar conta grátis</a></div></div></nav>
${body}
<footer>
<a href="/">Início</a> · <a href="/ranking">Rankings</a> · <a href="/licitacoes">Licitações</a> · <a href="/blog">Blog</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a>
<div style="margin-top:10px;opacity:.7">Dados oficiais do PNCP. Atualizado continuamente.</div>
</footer>
</body></html>`;
}

// ===== Pagina de ranking individual =====
export function paginaRanking(slug) {
  const cat = categoriaPorSlug(slug);
  if (!cat) return null;

  const linhas = rankingPorTermo({ termo: cat.termo, limite: 50 });
  const canonical = `${BASE}/ranking/${cat.slug}`;
  const title = `Quem mais comprou ${cat.nome.toLowerCase()} no Brasil: ranking de órgãos públicos | ContrataX`;
  const description = `Ranking dos órgãos públicos que mais gastaram com ${cat.nome.toLowerCase()} nos últimos 18 meses, com base em dados oficiais do PNCP. Valor total, número de contratos e localização.`;

  const linhasHtml = linhas.length
    ? linhas.map((o, i) => {
        const slugO = slugOrgao(o);
        const nomeLink = slugO ? `<a href="/orgaos/${slugO}">${esc(o.nome)}</a>` : esc(o.nome);
        return `<tr>
          <td class="pos">${i + 1}</td>
          <td class="org">${nomeLink}<span class="loc">${esc([o.municipio, o.uf].filter(Boolean).join("/") || "-")}</span></td>
          <td class="val">${brl(o.total)}</td>
          <td class="n">${o.contratos} contrato${o.contratos > 1 ? "s" : ""}</td>
        </tr>`;
      }).join("")
    : "";

  const semDados = !linhas.length;

  const outrasCategorias = CATEGORIAS.filter((c) => c.slug !== cat.slug).slice(0, 14)
    .map((c) => `<a href="/ranking/${c.slug}">${esc(c.nome)}</a>`).join("");

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: BASE + "/" },
        { "@type": "ListItem", position: 2, name: "Rankings", item: BASE + "/ranking" },
        { "@type": "ListItem", position: 3, name: cat.nome, item: canonical },
      ] },
      { "@type": "CollectionPage", name: title, description, url: canonical, inLanguage: "pt-BR" },
      ...(linhas.length ? [{
        "@type": "ItemList",
        name: `Ranking de compras públicas: ${cat.nome}`,
        itemListElement: linhas.slice(0, 20).map((o, i) => ({
          "@type": "ListItem", position: i + 1, name: o.nome,
        })),
      }] : []),
    ],
  })}</script>`;

  const body = `<div class="w">
    <div class="bc"><a href="/">Início</a> › <a href="/ranking">Rankings</a> › ${esc(cat.nome)}</div>
    <div class="tag">Ranking de compras públicas</div>
    <h1>Quem mais comprou ${esc(cat.nome.toLowerCase())} no Brasil</h1>
    <div class="sub">Ranking dos órgãos públicos (prefeituras, governos estaduais, autarquias e órgãos federais) com maior volume de compras de ${esc(cat.nome.toLowerCase())}, com base nos contratos publicados no PNCP nos últimos 18 meses.</div>

    ${semDados
      ? `<div class="metodologia"><p>Ainda não temos volume suficiente de contratos históricos para este ramo no acervo. Volte em breve, o acervo é atualizado continuamente.</p></div>`
      : `<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Órgão</th><th>Valor total</th><th>Contratos</th></tr></thead><tbody>${linhasHtml}</tbody></table></div>`
    }

    <div class="metodologia">
      <h3>Metodologia</h3>
      <p>Dados extraídos diretamente da API oficial do PNCP (Portal Nacional de Contratações Públicas, Lei 14.133/2021). Consideramos contratos cujo objeto menciona ${esc(cat.nome.toLowerCase())}, agregados por órgão comprador (identificado pelo CNPJ) e somados pelo valor total do contrato. Período: últimos 18 meses. Ranking atualizado continuamente conforme novos contratos são publicados.</p>
    </div>

    <div class="cta-box">
      <h2>Quer vender ${esc(cat.nome.toLowerCase())} pra algum desses órgãos?</h2>
      <p>A ContrataX monitora automaticamente quando eles abrem uma nova licitação nesse ramo, e a ContrataX.IA já lê o edital e diz se a sua empresa está apta.</p>
      <a href="/cadastro">Criar conta grátis</a>
    </div>

    <h2>Outros rankings</h2>
    <div class="chips">${outrasCategorias}</div>
  </div>`;

  return layout({ title, description, canonical, jsonld, body });
}

// ===== Hub /ranking =====
export function paginaHubRanking() {
  const canonical = `${BASE}/ranking`;
  const title = "Rankings de Compras Públicas por Ramo: quem mais compra no Brasil | ContrataX";
  const description = "Ranking dos órgãos públicos brasileiros que mais compram em cada ramo (material hospitalar, merenda escolar, limpeza, informática e mais), com base em dados oficiais do PNCP.";

  const lista = CATEGORIAS.map((c) => `<div style="background:#fff;border:1px solid #E4E7F0;border-radius:12px;padding:16px" >
    <a href="/ranking/${c.slug}" style="color:#4338ca;text-decoration:none;font-weight:700;font-size:15px">${esc(c.nome)}</a>
  </div>`).join("");

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: BASE + "/" },
        { "@type": "ListItem", position: 2, name: "Rankings", item: canonical },
      ] },
      { "@type": "CollectionPage", name: title, description, url: canonical, inLanguage: "pt-BR" },
    ],
  })}</script>`;

  const body = `<div class="w">
    <div class="bc"><a href="/">Início</a> › Rankings</div>
    <h1>Rankings de compras públicas por ramo</h1>
    <div class="sub">Quem mais compra o quê no Brasil, com base em dados oficiais do PNCP. Útil para jornalismo de dados, planejamento comercial e transparência pública.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:11px;margin-top:18px">${lista}</div>
    <div class="cta-box">
      <h2>Monitore automaticamente esses órgãos</h2>
      <a href="/cadastro">Criar conta grátis</a>
    </div>
  </div>`;

  return layout({ title, description, canonical, jsonld, body });
}
