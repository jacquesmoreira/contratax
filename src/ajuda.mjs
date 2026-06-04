// Central de Ajuda (/ajuda) e pagina de Contato (/contato).
// /ajuda  renderiza o markdown em content/ajuda/central-de-ajuda.md
// /contato e formulario que envia mensagem por e-mail (via Resend) para o suporte.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mdParaHtml } from "./blog.mjs";
import { injetarAnalytics } from "./analytics.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO_AJUDA = resolve(AQUI, "..", "content", "ajuda", "central-de-ajuda.md");

function escHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
}

const SUPORTE = process.env.LICITA_SUPORTE_EMAIL || "suporte@contratax.com.br";

// E-mail de destino para mensagens de suporte do formulario /contato.
// Se nao tiver LICITA_SUPORTE_FORWARD, manda pro proprio suporte@.
const SUPORTE_FORWARD = process.env.LICITA_SUPORTE_FORWARD || SUPORTE;

function frontMatter(texto) {
  const m = texto.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { meta: {}, corpo: texto };
  const meta = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const mm = linha.match(/^(\w+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim();
  }
  return { meta, corpo: m[2] };
}

export async function renderizarAjuda(baseUrl) {
  const texto = await readFile(ARQUIVO_AJUDA, "utf8");
  const { meta, corpo } = frontMatter(texto);
  const html = mdParaHtml(corpo);
  return template({
    title: (meta.title || "Central de Ajuda") + " — ContrataX",
    description: meta.description || "Tudo o que você precisa saber para usar o ContrataX.",
    canonical: `${baseUrl}/ajuda`,
    conteudo: `
      <header style="margin-bottom:32px">
        <h1 style="font-size:36px;letter-spacing:-.8px;margin-bottom:8px">${escHtml(meta.title || "Central de Ajuda")}</h1>
        <p style="font-size:16px;color:#475569">${escHtml(meta.description || "")}</p>
      </header>
      <article class="post"><div class="conteudo-post">${html}</div></article>
      <div style="background:linear-gradient(135deg,#4338ca,#2563eb);color:#fff;border-radius:16px;padding:24px;margin-top:36px;text-align:center">
        <div style="font-size:18px;font-weight:800;margin-bottom:6px">Não achou a resposta?</div>
        <p style="color:#c7d2fe;font-size:14.5px;margin-bottom:14px">Fale com a gente — respondemos em até 1 dia útil.</p>
        <a href="/contato" style="display:inline-block;background:#fff;color:#4338ca;font-weight:800;padding:11px 22px;border-radius:11px;text-decoration:none">Abrir contato →</a>
      </div>`,
  });
}

export async function renderizarContato(baseUrl, { token = "", erro = "", sucesso = false } = {}) {
  return template({
    title: "Fale com a gente — ContrataX",
    description: "Envie sua mensagem para o suporte do ContrataX. Respondemos em até 1 dia útil.",
    canonical: `${baseUrl}/contato`,
    conteudo: sucesso ? `
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:30px;text-align:center;max-width:540px;margin:0 auto">
        <div style="font-size:48px;margin-bottom:10px">✓</div>
        <h1 style="font-size:24px;font-weight:800;color:#047857;margin-bottom:8px">Mensagem enviada!</h1>
        <p style="color:#475569;font-size:15px;margin-bottom:18px">Recebemos sua mensagem e vamos responder em até 1 dia útil no e-mail que você informou.</p>
        <a href="/" style="display:inline-block;background:#4338ca;color:#fff;font-weight:700;padding:11px 22px;border-radius:11px;text-decoration:none">Voltar para o início</a>
      </div>
    ` : `
      <header style="margin-bottom:24px;text-align:center">
        <h1 style="font-size:34px;letter-spacing:-.8px;margin-bottom:8px">Fale com a gente</h1>
        <p style="font-size:16px;color:#475569;max-width:560px;margin:0 auto">Respondemos em até <b>1 dia útil</b> no e-mail que você informar. Pra dúvidas comuns, dá uma olhada antes na <a href="/ajuda" style="color:#4338ca;font-weight:700">Central de Ajuda</a>.</p>
      </header>
      ${erro ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:12px 16px;border-radius:10px;margin:0 auto 18px;max-width:560px;font-size:14px;font-weight:600">${escHtml(erro)}</div>` : ""}
      <form method="POST" action="/contato" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;max-width:560px;margin:0 auto;box-shadow:0 12px 36px rgba(15,23,42,.06)">
        <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Seu e-mail</label>
        <input name="email" type="email" required placeholder="voce@empresa.com.br" style="width:100%;padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;font-family:inherit;outline:none;margin-bottom:18px" />

        <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Assunto</label>
        <select name="assunto" required style="width:100%;padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;font-family:inherit;outline:none;margin-bottom:18px;background:#fff">
          <option value="">Selecione...</option>
          <option value="Dúvida sobre plano ou pagamento">Dúvida sobre plano ou pagamento</option>
          <option value="Problema técnico">Problema técnico</option>
          <option value="Dúvida sobre um edital">Dúvida sobre um edital</option>
          <option value="Sugestão de melhoria">Sugestão de melhoria</option>
          <option value="Quero falar com vocês">Quero falar com vocês</option>
        </select>

        <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Mensagem</label>
        <textarea name="mensagem" required rows="6" placeholder="Conte o que está acontecendo..." style="width:100%;padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;font-family:inherit;outline:none;resize:vertical;margin-bottom:18px"></textarea>

        ${token ? `<input type="hidden" name="token" value="${escHtml(token)}" />` : ""}
        <button type="submit" style="width:100%;background:#4338ca;color:#fff;border:none;padding:14px;border-radius:11px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">Enviar mensagem</button>
        <div style="font-size:12px;color:#94a3b8;margin-top:12px;text-align:center">Ao enviar, você concorda em receber nossa resposta no e-mail informado.</div>
      </form>
    `,
  });
}

// Recebe o POST /contato e dispara o e-mail pro suporte
export async function processarContato({ email, assunto, mensagem, token, meta = {} }) {
  if (!email || !/.+@.+\..+/.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!assunto?.trim()) return { ok: false, erro: "Selecione um assunto." };
  if (!mensagem?.trim() || mensagem.trim().length < 10) return { ok: false, erro: "Escreva uma mensagem com pelo menos 10 caracteres." };

  if (!temEmailKey()) {
    // Sem RESEND configurado: nao da pra enviar; reporta sucesso mas loga (modo dev/preview)
    console.log("[contato] (sem RESEND_API_KEY) De:", email, "| Assunto:", assunto);
    console.log("[contato] Mensagem:", mensagem);
    return { ok: true, modo: "preview" };
  }

  const linhasMeta = [];
  if (token) linhasMeta.push(`Token do cliente: ${token}`);
  if (meta.painel) linhasMeta.push(`Origem: painel`);
  if (meta.userAgent) linhasMeta.push(`Navegador: ${meta.userAgent}`);
  if (meta.url) linhasMeta.push(`URL: ${meta.url}`);

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:20px">
      <h2 style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:12px">Novo contato — ContrataX</h2>
      <p style="font-size:14px;color:#475569;margin-bottom:8px"><b>De:</b> ${escHtml(email)}</p>
      <p style="font-size:14px;color:#475569;margin-bottom:14px"><b>Assunto:</b> ${escHtml(assunto)}</p>
      <div style="background:#f8fafc;border-left:4px solid #4338ca;padding:14px 18px;border-radius:0 8px 8px 0;white-space:pre-wrap;font-size:14.5px;color:#1e293b;line-height:1.55">${escHtml(mensagem)}</div>
      ${linhasMeta.length ? `<div style="font-size:12px;color:#94a3b8;margin-top:16px">${linhasMeta.map(l => escHtml(l)).join("<br>")}</div>` : ""}
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">Para responder, basta clicar em Responder no seu e-mail — o endereço de retorno é do cliente.</p>
    </div>`;

  try {
    await enviar({
      para: SUPORTE_FORWARD,
      assunto: `[ContrataX] ${assunto} — ${email}`,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[contato] erro ao enviar:", e.message);
    return { ok: false, erro: "Não conseguimos enviar agora. Tente novamente em alguns minutos." };
  }
}

function template({ title, description, canonical, conteudo }) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:title" content="${escHtml(title)}" />
<meta property="og:description" content="${escHtml(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://www.contratax.com.br/og-image.png" />
<link rel="icon" href="/logo-favicon.png" type="image/png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Lora:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { --indigo:#4338ca; --tinta:#0f172a; --cinza:#475569; --cinza-c:#94a3b8; --linha:#e2e8f0; --fundo:#f8fafc; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--fundo); color:var(--tinta); }
  nav { background:#fff; border-bottom:1px solid var(--linha); }
  nav .wrap { max-width:920px; margin:0 auto; display:flex; align-items:center; height:64px; gap:18px; padding:0 20px; }
  nav .logo img { height:30px; display:block; }
  nav .dir { margin-left:auto; display:flex; gap:22px; font-size:14.5px; font-weight:600; }
  nav .dir a { color:var(--cinza); text-decoration:none; }
  nav .dir a.cta { background:var(--indigo); color:#fff; padding:8px 16px; border-radius:9px; }
  .wrap-main { max-width:760px; margin:0 auto; padding:42px 20px 60px; }
  .post .conteudo-post { font-family:"Lora", Georgia, serif; font-size:16.5px; line-height:1.7; color:#1e293b; }
  .conteudo-post h2 { font-family:"Inter",sans-serif; font-size:22px; font-weight:800; margin:34px 0 10px; letter-spacing:-.2px; color:#0f172a; padding-bottom:8px; border-bottom:2px solid #eef2ff; }
  .conteudo-post h3 { font-family:"Inter",sans-serif; font-size:17px; font-weight:800; margin:22px 0 6px; color:#0f172a; }
  .conteudo-post p { margin-bottom:14px; }
  .conteudo-post ul, .conteudo-post ol { margin:0 0 14px 22px; }
  .conteudo-post li { margin-bottom:5px; }
  .conteudo-post a { color:var(--indigo); font-weight:600; }
  .conteudo-post strong { color:#0f172a; font-weight:700; }
  footer { background:#fff; border-top:1px solid var(--linha); padding:24px 20px; text-align:center; color:var(--cinza-c); font-size:13px; }
  footer a { color:var(--cinza); text-decoration:none; margin:0 10px; }
</style>
</head>
<body>
  <nav><div class="wrap">
    <a class="logo" href="/"><img src="/logo-horizontal.png" alt="ContrataX" /></a>
    <div class="dir">
      <a href="/blog">Blog</a>
      <a href="/ajuda">Ajuda</a>
      <a href="/entrar">Entrar</a>
      <a class="cta" href="/cadastro">Testar grátis</a>
    </div>
  </div></nav>
  <main class="wrap-main">${conteudo}</main>
  <footer>
    <a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/ajuda">Ajuda</a> · <a href="/contato">Contato</a> · <a href="/cadastro">Cadastro</a>
    <div style="margin-top:8px;font-size:12px">© ContrataX · Dados públicos do PNCP</div>
  </footer>
</body>
</html>`;
  return injetarAnalytics(html);
}
