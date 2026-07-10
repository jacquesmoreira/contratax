// Blog SEO do ContrataX: artigos em Markdown servidos em /blog e /blog/<slug>.
// Sem deps externas: parser Markdown basico inline pra evitar instalar pacote.

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { injetarAnalytics } from "./analytics.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_POSTS = resolve(AQUI, "..", "content", "blog");

// Cache em memoria (artigos sao estaticos, mudam so com deploy).
let cache = null;

function escHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
}

// Parser Markdown ENXUTO: cobre o que precisamos pra blog SEO (headers H2/H3,
// paragrafos, listas ordenadas/nao-ord, bold, italic, links, codigo inline).
export function mdParaHtml(md) {
  const linhas = md.split(/\r?\n/);
  const out = [];
  let parag = [];
  let lista = null; // {tipo: 'ul' | 'ol'}

  const fechaParag = () => {
    if (parag.length) { out.push("<p>" + parag.join(" ") + "</p>"); parag = []; }
  };
  const fechaLista = () => {
    if (lista) { out.push("</" + lista.tipo + ">"); lista = null; }
  };
  const fechaTodos = () => { fechaParag(); fechaLista(); };

  const inline = (s) => {
    let t = escHtml(s);
    // Negrito **texto**
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Italico *texto*
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    // Codigo inline `texto`
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Links [texto](url) — interno e externo
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => {
      const ext = /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${escHtml(url)}"${ext}>${txt}</a>`;
    });
    return t;
  };

  for (const linha of linhas) {
    // Linha em branco: fecha paragrafo
    if (/^\s*$/.test(linha)) { fechaParag(); fechaLista(); continue; }
    // Headers H2 ##  H3 ###
    let m;
    if ((m = linha.match(/^###\s+(.*)$/))) { fechaTodos(); out.push("<h3>" + inline(m[1]) + "</h3>"); continue; }
    if ((m = linha.match(/^##\s+(.*)$/)))  { fechaTodos(); out.push("<h2>" + inline(m[1]) + "</h2>"); continue; }
    // Lista nao ordenada: - item  ou  * item
    if ((m = linha.match(/^[-*]\s+(.*)$/))) {
      fechaParag();
      if (!lista || lista.tipo !== "ul") { fechaLista(); out.push("<ul>"); lista = { tipo: "ul" }; }
      out.push("<li>" + inline(m[1]) + "</li>");
      continue;
    }
    // Lista ordenada: 1. item
    if ((m = linha.match(/^\d+\.\s+(.*)$/))) {
      fechaParag();
      if (!lista || lista.tipo !== "ol") { fechaLista(); out.push("<ol>"); lista = { tipo: "ol" }; }
      out.push("<li>" + inline(m[1]) + "</li>");
      continue;
    }
    // Citacao > texto
    if ((m = linha.match(/^>\s+(.*)$/))) {
      fechaParag(); fechaLista();
      out.push("<blockquote>" + inline(m[1]) + "</blockquote>");
      continue;
    }
    // Paragrafo: acumula texto
    fechaLista();
    parag.push(inline(linha.trim()));
  }
  fechaTodos();
  return out.join("\n");
}

// Le e parseia um arquivo .md com front-matter simples:
//   ---
//   title: ...
//   description: ...
//   date: 2026-06-03
//   keywords: licitacao, mei, pncp
//   ---
//   conteudo...
function parseArquivo(texto) {
  const fm = texto.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fm) return { meta: {}, corpo: texto };
  const meta = {};
  for (const linha of fm[1].split(/\r?\n/)) {
    const m = linha.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, corpo: fm[2] };
}

// Carrega todos os artigos disponiveis (uma vez por execucao).
export async function listarArtigos() {
  if (cache) return cache;
  let arquivos = [];
  try { arquivos = await readdir(DIR_POSTS); } catch { return []; }
  const posts = [];
  for (const f of arquivos) {
    if (!f.endsWith(".md")) continue;
    const slug = f.replace(/\.md$/, "");
    const texto = await readFile(resolve(DIR_POSTS, f), "utf8");
    const { meta, corpo } = parseArquivo(texto);
    posts.push({
      slug,
      title: meta.title || slug,
      description: meta.description || "",
      date: meta.date || "",
      keywords: meta.keywords || "",
      corpo,
    });
  }
  posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  cache = posts;
  return posts;
}

export async function obterArtigo(slug) {
  const todos = await listarArtigos();
  return todos.find((p) => p.slug === slug) || null;
}

// Renderiza o artigo em HTML completo (com cabeçalho/rodapé/SEO).
export async function renderizarArtigo(slug, baseUrl) {
  const post = await obterArtigo(slug);
  if (!post) return null;
  const corpoHtml = mdParaHtml(post.corpo);
  const url = `${baseUrl}/blog/${slug}`;
  const dataIso = post.date ? new Date(post.date).toISOString() : new Date().toISOString();
  const dataBR = post.date ? new Date(post.date).toLocaleDateString("pt-BR") : "";
  // Schema BlogPosting (base)
  const ldBlog = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: dataIso,
    author: { "@type": "Organization", name: "ContrataX" },
    publisher: {
      "@type": "Organization",
      name: "ContrataX",
      logo: { "@type": "ImageObject", url: `${baseUrl}/logo-horizontal.png` },
    },
    mainEntityOfPage: url,
  };
  // Schema FAQPage: extrai perguntas e respostas do markdown se houver secao
  // "Perguntas frequentes" ou "FAQ". Google pode mostrar as Q&A direto no SERP
  // (rich snippet), aumentando CTR em 10-30%.
  function extrairFAQ(md) {
    const m = md.match(/##\s+(?:Perguntas frequentes|FAQ|Duvidas|Dúvidas)[^\n]*\n([\s\S]+?)(?=\n##\s+|$)/i);
    if (!m) return null;
    const bloco = m[1];
    const faqs = [];
    const re = /###\s+([^\n]+)\n([\s\S]+?)(?=\n###\s+|$)/g;
    let q;
    while ((q = re.exec(bloco)) !== null) {
      const pergunta = q[1].trim();
      // Resposta: remove markdown basico (negrito, links) pra texto limpo
      const resposta = q[2].trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ");
      if (pergunta && resposta) faqs.push({ pergunta, resposta });
    }
    if (faqs.length < 2) return null;
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.pergunta,
        acceptedAnswer: { "@type": "Answer", text: f.resposta },
      })),
    };
  }
  const ldFaq = extrairFAQ(post.corpo);
  // JSON-LD final: array com BlogPosting + FAQPage quando aplicavel
  const ld = ldFaq ? [ldBlog, ldFaq] : ldBlog;
  // Sugere outros 3 artigos
  const todos = await listarArtigos();
  const outros = todos.filter((p) => p.slug !== slug).slice(0, 3);
  const relacionados = outros.map((p) => `
    <a href="/blog/${p.slug}" style="background:#fff;border:1px solid #E4E7F0;border-radius:12px;padding:16px;text-decoration:none;color:inherit;display:block">
      <div style="font-weight:700;font-size:15px;color:#0B1E3A;margin-bottom:6px">${escHtml(p.title)}</div>
      <div style="font-size:13px;color:#475569;line-height:1.4">${escHtml(p.description)}</div>
    </a>`).join("");

  return template({
    title: `${post.title} · ContrataX`,
    description: post.description,
    keywords: post.keywords,
    url, dataBR, ld,
    conteudo: `
      <article class="post">
        <header style="margin-bottom:28px">
          <a href="/blog" style="display:inline-block;font-size:13px;color:#4338ca;font-weight:700;margin-bottom:14px;text-decoration:none">← Blog ContrataX</a>
          <h1 style="font-size:34px;line-height:1.2;letter-spacing:-.7px;margin-bottom:10px">${escHtml(post.title)}</h1>
          ${dataBR ? `<div style="font-size:13px;color:#94a3b8">Publicado em ${dataBR}</div>` : ""}
        </header>
        <div class="conteudo-post">${corpoHtml}</div>
        <div style="background:linear-gradient(135deg,#4338ca,#2563eb);color:#fff;border-radius:16px;padding:28px;margin:40px 0;text-align:center">
          <div style="font-size:13px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;opacity:.85;margin-bottom:6px">Sobre o ContrataX</div>
          <h3 style="font-size:22px;font-weight:800;margin-bottom:8px">Monitore licitações do seu ramo no Brasil todo</h3>
          <p style="font-size:14.5px;line-height:1.55;color:#c7d2fe;margin-bottom:16px">Nosso sistema lê cada edital e diz, em segundos, se a sua empresa está apta e o que falta. 7 dias grátis sem cartão.</p>
          <a href="/cadastro" style="display:inline-block;background:#fff;color:#4338ca;font-weight:800;padding:13px 26px;border-radius:11px;text-decoration:none">Testar grátis →</a>
        </div>
        ${relacionados ? `<div style="margin-top:48px"><h3 style="font-size:18px;font-weight:800;margin-bottom:14px">Leia também</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">${relacionados}</div></div>` : ""}
      </article>`,
  });
}

// Renderiza listagem completa do blog.
export async function renderizarListagem(baseUrl) {
  const posts = await listarArtigos();
  const itens = posts.map((p) => `
    <a href="/blog/${p.slug}" style="background:#fff;border:1px solid #E4E7F0;border-radius:14px;padding:22px;text-decoration:none;color:inherit;display:block;transition:transform .12s,box-shadow .12s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 28px rgba(15,23,42,.08)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">${p.date ? new Date(p.date).toLocaleDateString("pt-BR") : ""}</div>
      <h2 style="font-size:19px;font-weight:800;color:#0B1E3A;line-height:1.3;margin-bottom:8px">${escHtml(p.title)}</h2>
      <p style="font-size:14px;color:#475569;line-height:1.5">${escHtml(p.description)}</p>
      <div style="margin-top:14px;font-size:13.5px;color:#4338ca;font-weight:700">Ler artigo →</div>
    </a>`).join("");
  return template({
    title: "Blog ContrataX: guias práticos sobre licitações públicas",
    description: "Artigos sobre licitação pública: como participar, dúvidas comuns, lei 14.133, PNCP, habilitação e impugnação.",
    keywords: "blog licitação, como participar licitação, lei 14133, PNCP",
    url: `${baseUrl}/blog`,
    conteudo: `
      <header style="margin-bottom:30px">
        <h1 style="font-size:34px;font-weight:800;letter-spacing:-.6px;margin-bottom:8px">Blog ContrataX</h1>
        <p style="font-size:16px;color:#475569">Guias práticos sobre licitação pública, lei 14.133/2021, PNCP, habilitação e estratégias para fornecedores.</p>
      </header>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px">${itens || "<div style='color:#94a3b8'>Em breve, os primeiros artigos.</div>"}</div>`,
  });
}

// Lista de URLs do blog pra incluir no sitemap.xml
export async function urlsBlog(baseUrl) {
  const posts = await listarArtigos();
  return [
    { loc: `${baseUrl}/blog`, prioridade: "0.7" },
    ...posts.map((p) => ({ loc: `${baseUrl}/blog/${p.slug}`, prioridade: "0.6", lastmod: p.date })),
  ];
}

// HTML base reaproveitando a paleta do site
function template({ title, description, keywords, url, ld, conteudo, dataBR }) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}" />
${keywords ? `<meta name="keywords" content="${escHtml(keywords)}" />` : ""}
<link rel="canonical" href="${url}" />
<meta property="og:title" content="${escHtml(title)}" />
<meta property="og:description" content="${escHtml(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:type" content="article" />
<meta property="og:image" content="https://www.contratax.com.br/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/logo-favicon.png" type="image/png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Public+Sans:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&display=swap" rel="stylesheet" />
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ""}
<style>
  :root { --indigo:#4338ca; --tinta:#0B1E3A; --cinza:#475569; --cinza-c:#94a3b8; --linha:#E4E7F0; --fundo:#FAF9F5; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Public Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--fundo); color:var(--tinta); }
  h1,h2,h3 { font-family:'Manrope','Public Sans',sans-serif; }
  nav { background:rgba(250,249,245,.85); backdrop-filter:blur(10px); border-bottom:1px solid var(--linha); }
  nav .wrap { max-width:920px; margin:0 auto; display:flex; align-items:center; height:64px; gap:18px; padding:0 20px; }
  nav .logo { font-weight:900; color:var(--indigo); text-decoration:none; }
  nav .dir { margin-left:auto; display:flex; gap:22px; font-size:14.5px; font-weight:600; }
  nav .dir a { color:var(--cinza); text-decoration:none; }
  nav .dir a.cta { background:var(--indigo); color:#fff; padding:8px 16px; border-radius:9px; }
  .wrap-main { max-width:760px; margin:0 auto; padding:42px 20px 60px; }
  .post .conteudo-post { font-family:"Lora", Georgia, serif; font-size:17.5px; line-height:1.7; color:#1e293b; }
  .conteudo-post h2 { font-family:'Manrope',sans-serif; font-size:24px; font-weight:800; margin:32px 0 12px; letter-spacing:-.3px; color:#0B1E3A; }
  .conteudo-post h3 { font-family:'Manrope',sans-serif; font-size:19px; font-weight:800; margin:24px 0 8px; color:#0B1E3A; }
  .conteudo-post p { margin-bottom:16px; }
  .conteudo-post ul, .conteudo-post ol { margin:0 0 16px 24px; }
  .conteudo-post li { margin-bottom:6px; }
  .conteudo-post a { color:var(--indigo); }
  .conteudo-post code { background:#EEF0FF; color:#3730a3; padding:2px 7px; border-radius:5px; font-family:Monaco, Consolas, monospace; font-size:14.5px; }
  .conteudo-post strong { color:#0B1E3A; font-weight:700; }
  .conteudo-post blockquote { border-left:4px solid var(--indigo); padding:8px 16px; margin:18px 0; background:#EEF0FF; color:#3730a3; font-style:italic; border-radius:0 8px 8px 0; }
  footer { background:#fff; border-top:1px solid var(--linha); padding:28px 20px; text-align:center; color:var(--cinza-c); font-size:13px; }
  footer a { color:var(--cinza); text-decoration:none; margin:0 10px; }
</style>
</head>
<body>
  <nav><div class="wrap">
    <a class="logo" href="/"><img src="/logo-horizontal.png" alt="ContrataX" style="height:30px;width:auto;display:block" /></a>
    <div class="dir">
      <a href="/blog">Blog</a>
      <a href="/licitacoes">Licitações</a>
      <a href="/entrar">Entrar</a>
      <a class="cta" href="/cadastro">Testar grátis</a>
    </div>
  </div></nav>
  <main class="wrap-main">${conteudo}</main>
  <footer>
    <a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/licitacoes">Licitações</a> · <a href="/cadastro">Cadastro</a>
    <div style="margin-top:8px;font-size:12px">© ContrataX · Gestão Inteligente de Licitações · Dados públicos do PNCP</div>
  </footer>
</body>
</html>`;
  return injetarAnalytics(html);
}
