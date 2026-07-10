// Paginas SEO por CNAE (/cnae/<codigo>). Alta intencao comercial - quem busca
// "licitacao para empresa de informatica" tem CNAE 6201-5/01 e ja quer vender.
//
// Estrategia: mapeamos CNAEs principais para termos do PNCP. Cada pagina lista
// editais abertos que casam com aquele segmento.

import { editaisPorTermos } from "./db.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

// Catalogo de CNAEs estrategicos para licitacao. Cobrimos os ramos com maior
// volume de compras publicas. Cada um tem codigo, descricao oficial e termos
// que casam no objeto do edital.
export const CNAES = [
  { codigo: "4781-4-00", nome: "Comércio varejista de artigos do vestuário", termos: ["uniforme", "vestuario", "fardamento"] },
  { codigo: "4789-0-99", nome: "Comércio varejista de outros produtos não especificados", termos: ["material escritorio", "papelaria"] },
  { codigo: "4774-1-00", nome: "Comércio varejista de artigos médico-hospitalares", termos: ["material hospitalar", "material medico", "descartavel hospitalar"] },
  { codigo: "4771-7-01", nome: "Comércio varejista de produtos farmacêuticos", termos: ["medicamento", "farmaco", "remedio"] },
  { codigo: "4753-9-00", nome: "Comércio varejista de eletrodomésticos", termos: ["eletrodomestico", "geladeira", "fogao"] },
  { codigo: "4751-2-01", nome: "Comércio varejista de equipamentos de informática", termos: ["computador", "notebook", "equipamento de informatica"] },
  { codigo: "4744-0-99", nome: "Comércio varejista de materiais de construção", termos: ["material construcao", "tijolo", "cimento", "areia"] },
  { codigo: "4732-6-00", nome: "Comércio varejista de combustíveis", termos: ["combustivel", "gasolina", "diesel", "etanol"] },
  { codigo: "4729-6-99", nome: "Comércio varejista de produtos alimentícios", termos: ["genero alimenticio", "merenda", "alimentos"] },
  { codigo: "4530-7-03", nome: "Comércio a varejo de pneumáticos", termos: ["pneu", "pneumatico"] },
  { codigo: "4520-0-01", nome: "Serviços de manutenção e reparação de veículos", termos: ["manutencao veiculo", "reparacao veicular"] },
  { codigo: "4399-1-03", nome: "Obras de alvenaria", termos: ["alvenaria", "construcao predial", "reforma"] },
  { codigo: "4321-5-00", nome: "Instalação e manutenção elétrica", termos: ["instalacao eletrica", "manutencao eletrica", "material eletrico"] },
  { codigo: "4312-6-00", nome: "Perfurações e sondagens", termos: ["perfuracao", "sondagem", "poço artesiano"] },
  { codigo: "4211-1-01", nome: "Construção de rodovias e ferrovias", termos: ["pavimentacao", "asfalto", "rodovia"] },
  { codigo: "8011-1-01", nome: "Atividades de vigilância e segurança privada", termos: ["vigilancia", "seguranca privada", "porteiro"] },
  { codigo: "8121-4-00", nome: "Limpeza em prédios e em domicílios", termos: ["limpeza", "conservacao", "asseio"] },
  { codigo: "8129-0-00", nome: "Atividades de limpeza não especificadas", termos: ["limpeza urbana", "varricao"] },
  { codigo: "8130-3-00", nome: "Atividades paisagísticas", termos: ["jardinagem", "paisagismo", "poda"] },
  { codigo: "6201-5-01", nome: "Desenvolvimento de software sob encomenda", termos: ["software", "sistema informatica", "desenvolvimento sistema"] },
  { codigo: "6202-3-00", nome: "Desenvolvimento e licenciamento de software customizável", termos: ["licenciamento software", "licenca de uso"] },
  { codigo: "6204-0-00", nome: "Consultoria em tecnologia da informação", termos: ["consultoria ti", "consultoria informatica"] },
  { codigo: "7112-0-00", nome: "Serviços de engenharia", termos: ["engenharia", "projeto engenharia", "consultoria engenharia"] },
  { codigo: "7311-4-00", nome: "Agências de publicidade", termos: ["publicidade", "campanha publicitaria", "agencia propaganda"] },
  { codigo: "5611-2-01", nome: "Restaurantes e similares", termos: ["fornecimento refeicao", "refeicao pronta", "alimentacao"] },
  { codigo: "5620-1-01", nome: "Fornecimento de alimentos preparados (catering)", termos: ["catering", "alimentacao escolar", "merenda escolar"] },
  { codigo: "4923-0-01", nome: "Transporte rodoviário de passageiros", termos: ["transporte escolar", "fretamento", "transporte passageiros"] },
  { codigo: "3811-4-00", nome: "Coleta de resíduos não-perigosos", termos: ["coleta lixo", "residuo", "coleta residuos"] },
  { codigo: "1813-0-99", nome: "Impressão de material para uso publicitário", termos: ["impressao", "grafica", "material grafico"] },
  { codigo: "1731-1-00", nome: "Fabricação de embalagens de papel", termos: ["papel a4", "sulfite", "embalagem papel", "papel toalha", "papel higienico"] },
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}
function brl(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL", maximumFractionDigits:0 });
}
function dataBR(s) { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("pt-BR"); }

export function cnaePorCodigo(codigo) {
  const c = String(codigo || "").trim();
  return CNAES.find((x) => x.codigo === c || x.codigo.replace(/\W+/g, "") === c.replace(/\W+/g, "")) || null;
}

export function urlsCnae() {
  return CNAES.map((c) => `${BASE}/cnae/${c.codigo}`);
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
h1{font-size:30px;font-weight:800;letter-spacing:-.5px;line-height:1.2;margin-bottom:8px}
.sub{color:#475569;font-size:15.5px;margin-bottom:22px}
.cnae-tag{display:inline-block;background:#EEF0FF;color:#4338ca;padding:6px 13px;border-radius:99px;font-size:13px;font-weight:700;margin-bottom:16px}
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
<div class="dir"><a href="/licitacoes">Ramos</a><a href="/blog">Blog</a><a class="cta" href="/cadastro">Criar conta grátis</a></div></div></nav>
${body}
<footer>
<a href="/">Início</a> · <a href="/cnae">CNAEs</a> · <a href="/licitacoes">Licitações</a> · <a href="/blog">Blog</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a>
<div style="margin-top:10px;opacity:.7">Dados oficiais do PNCP.</div>
</footer>
</body></html>`;
}

// ===== Pagina de CNAE individual =====
export function paginaCnae(codigo) {
  const cnae = cnaePorCodigo(codigo);
  if (!cnae) return null;

  const { total, editais } = editaisPorTermos({ termos: cnae.termos, limite: 24 });
  const canonical = `${BASE}/cnae/${cnae.codigo}`;
  const title = `Licitações para empresas de ${cnae.nome.toLowerCase()} (CNAE ${cnae.codigo}) | ContrataX`;
  const description = `${total} licitações abertas no Brasil para empresas de ${cnae.nome.toLowerCase()} (CNAE ${cnae.codigo}). Acompanhe diariamente os editais do seu segmento.`;

  const lista = editais.length
    ? editais.map((e) => `<div class="card">
        <div class="org">${esc([e.municipio, e.uf].filter(Boolean).join("/"))} · ${esc(e.orgao || "")}</div>
        <div class="obj">${esc((e.objeto || "").slice(0, 220))}</div>
        <div class="meta">${e.modalidade ? `<span>${esc(e.modalidade)}</span>` : ""}
          ${e.valorEstimado > 0 ? `<span><b>${brl(e.valorEstimado)}</b></span>` : `<span style="color:#94a3b8">valor não divulgado</span>`}
          <span>encerra em ${dataBR(e.encerramento)}</span></div>
      </div>`).join("")
    : `<div class="como"><p>Não há editais abertos para esse segmento no momento. Crie sua conta grátis e seja avisado assim que surgir.</p></div>`;

  const outrosCnaes = CNAES.filter((c) => c.codigo !== cnae.codigo).slice(0, 14)
    .map((c) => `<a href="/cnae/${c.codigo}">${esc(c.nome.slice(0, 50))}</a>`).join("");

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: BASE + "/" },
        { "@type": "ListItem", position: 2, name: "CNAEs", item: BASE + "/cnae" },
        { "@type": "ListItem", position: 3, name: cnae.nome, item: canonical },
      ] },
      { "@type": "CollectionPage", name: title, description, url: canonical, inLanguage: "pt-BR" },
    ],
  })}</script>`;

  const body = `<div class="w">
    <div class="bc"><a href="/">Início</a> › <a href="/cnae">CNAEs</a> › ${esc(cnae.nome)}</div>
    <div class="cnae-tag">CNAE ${esc(cnae.codigo)}</div>
    <h1>Licitações para empresas de ${esc(cnae.nome.toLowerCase())}</h1>
    <div class="sub">${total} licitações abertas no Brasil para empresas que atuam neste segmento. Acompanhe diariamente os editais e cresça com vendas para o setor público.</div>

    <h2>Editais abertos (${total})</h2>
    ${lista}

    <div class="cta-box">
      <h2>Receba todo dia as licitações do seu CNAE</h2>
      <p>Crie sua conta grátis e tenha as licitações do seu segmento no seu painel + alerta por e-mail, com leitura automática do edital pela ContrataX.IA.</p>
      <a href="/cadastro">Criar conta grátis</a>
    </div>

    <div class="como">
      <h3>Como participar das licitações de ${esc(cnae.nome.toLowerCase())}</h3>
      <p>As compras públicas neste segmento são publicadas no PNCP por prefeituras, governos estaduais, autarquias e órgãos federais. Para participar, sua empresa precisa estar com a documentação em dia: certidões fiscais, FGTS, trabalhista, e em alguns casos atestado de capacidade técnica.</p>
      <p>O ContrataX monitora o PNCP em tempo real e filtra automaticamente as licitações do seu CNAE, te avisando todo dia por e-mail.</p>
    </div>

    <h2>Outros segmentos com licitações abertas</h2>
    <div class="chips">${outrosCnaes}</div>
  </div>`;

  return layout({ title, description, canonical, jsonld, body });
}

// ===== Hub /cnae =====
export function paginaHubCnae() {
  const canonical = `${BASE}/cnae`;
  const title = "Licitações por CNAE — Encontre editais para o seu segmento | ContrataX";
  const description = "Lista de CNAEs com licitações públicas ativas no Brasil. Encontre editais para o segmento da sua empresa: limpeza, informática, alimentação, construção e mais.";

  const lista = CNAES.map((c) => `<div class="card">
    <div class="org">CNAE ${esc(c.codigo)}</div>
    <div class="obj"><a href="/cnae/${c.codigo}" style="color:#4338ca;text-decoration:none;font-weight:700">${esc(c.nome)}</a></div>
  </div>`).join("");

  const body = `<div class="w">
    <div class="bc"><a href="/">Início</a> › CNAEs</div>
    <h1>Licitações por CNAE</h1>
    <div class="sub">Encontre licitações públicas para o segmento da sua empresa. Cada página agrega os editais abertos por CNAE.</div>
    ${lista}
    <div class="cta-box">
      <h2>Receba editais do seu CNAE todo dia</h2>
      <a href="/cadastro">Criar conta grátis</a>
    </div>
  </div>`;

  return layout({ title, description, canonical, body });
}
