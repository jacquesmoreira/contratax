// E-mail diario: gera o resumo dos editais do cliente e (opcionalmente) envia.
// Envio plugavel via Resend (RESEND_API_KEY). Sem chave, so gera o HTML (preview).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";

const BASE = process.env.LICITA_BASE_URL || "http://localhost:3000";
const FROM = process.env.LICITA_EMAIL_FROM || "ContrataX <onboarding@resend.dev>";

// ---------- contador global de envios (protege o teto do plano Resend) ----------
//
// Todo e-mail do sistema passa por enviar() abaixo, seja campanha fria ou
// transacional pro cliente pagante (recibo, digest, renovacao). Os dois
// competem pela MESMA cota do Resend. No plano gratuito: 100/dia, 3.000/mes
// (ajuste TETO_DIARIO/TETO_MENSAL aqui se fizer upgrade de plano). Decisao do
// Jacques (19/07/2026): campanha usa ate 90/dia (limite proprio dela em
// scripts/enviar-campanha.mjs), deixando ~10/dia de folga pros e-mails de
// cliente. Este contador observa o TOTAL combinado e avisa o admin por email
// ANTES de bater no teto, pra dar tempo de agir (upgrade de plano) antes que
// um e-mail de cliente pagante falhe silenciosamente por falta de cota.
const TETO_DIARIO = Number(process.env.LICITA_TETO_EMAIL_DIA || 100);
const TETO_MENSAL = Number(process.env.LICITA_TETO_EMAIL_MES || 3000);
const ARQ_CONTADOR_GLOBAL = resolve(DATA_DIR, "envios-contador.json");

function lerContadorGlobal() {
  try { return JSON.parse(readFileSync(ARQ_CONTADOR_GLOBAL, "utf8")); } catch { return {}; }
}
function salvarContadorGlobal(c) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(ARQ_CONTADOR_GLOBAL, JSON.stringify(c, null, 2), "utf8");
  } catch (e) { console.error("[contador email] falha ao salvar:", e.message); }
}

// Best-effort: manda direto pela API (nao reusa enviar() pra nao contar o
// proprio aviso e nao entrar em recursao caso o aviso tambem falhe).
async function avisarAdminQuota(assunto, mensagem) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const adminEmail = process.env.LICITA_BACKUP_EMAIL || "licitacontratax@gmail.com";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: adminEmail, subject: assunto, html: `<p>${mensagem}</p>` }),
    });
  } catch (e) { console.error("[quota email] falha ao avisar admin:", e.message); }
}

// Chamado apos CADA envio bem-sucedido. Nunca lanca erro (o envio original ja
// aconteceu; um problema aqui nao pode derrubar quem chamou enviar()).
async function contabilizarEnvio() {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const mes = hoje.slice(0, 7);
    const c = lerContadorGlobal();
    if (c.dia !== hoje) { c.dia = hoje; c.diaCount = 0; c.diaAvisado90 = false; c.diaAvisadoCritico = false; }
    if (c.mes !== mes) { c.mes = mes; c.mesCount = 0; c.mesAvisado90 = false; c.mesAvisadoCritico = false; }
    c.diaCount = (c.diaCount || 0) + 1;
    c.mesCount = (c.mesCount || 0) + 1;
    salvarContadorGlobal(c);

    if (c.diaCount >= TETO_DIARIO && !c.diaAvisadoCritico) {
      c.diaAvisadoCritico = true; salvarContadorGlobal(c);
      await avisarAdminQuota(
        `[ContrataX] 🔴 Teto diario de e-mail atingido (${c.diaCount}/${TETO_DIARIO})`,
        `O envio de hoje bateu no teto diario do plano Resend (${TETO_DIARIO}/dia). A partir de agora, novos e-mails (campanha OU de cliente, recibo, digest, renovacao) podem comecar a falhar ate amanha. Considere pausar a campanha fria hoje ou fazer upgrade de plano.`
      );
    } else if (c.diaCount >= TETO_DIARIO * 0.9 && !c.diaAvisado90) {
      c.diaAvisado90 = true; salvarContadorGlobal(c);
      await avisarAdminQuota(
        `[ContrataX] ⚠ ${c.diaCount}/${TETO_DIARIO} e-mails hoje (perto do teto diario)`,
        `Ja foram ${c.diaCount} e-mails enviados hoje, contando campanha e clientes juntos (mesma cota do Resend). Teto do dia: ${TETO_DIARIO}.`
      );
    }

    if (c.mesCount >= TETO_MENSAL && !c.mesAvisadoCritico) {
      c.mesAvisadoCritico = true; salvarContadorGlobal(c);
      await avisarAdminQuota(
        `[ContrataX] 🔴 Teto mensal de e-mail atingido (${c.mesCount}/${TETO_MENSAL})`,
        `O envio deste mes bateu no teto mensal do plano Resend gratuito (${TETO_MENSAL}/mes). Novos e-mails podem comecar a falhar, incluindo recibos e alertas de clientes pagantes. Upgrade de plano recomendado com urgencia.`
      );
    } else if (c.mesCount >= TETO_MENSAL * 0.9 && !c.mesAvisado90) {
      c.mesAvisado90 = true; salvarContadorGlobal(c);
      await avisarAdminQuota(
        `[ContrataX] ⚠ ${c.mesCount}/${TETO_MENSAL} e-mails este mes (perto do teto mensal)`,
        `Ja foram ${c.mesCount} e-mails enviados este mes, contando campanha e clientes juntos. Teto do plano gratuito Resend: ${TETO_MENSAL}/mes. Vale planejar o upgrade antes que a cota acabe.`
      );
    }
  } catch (e) {
    console.error("[contador email] erro:", e.message);
  }
}

export function temEmailKey() {
  return Boolean(process.env.RESEND_API_KEY);
}

// URL de descadastro (opt-out) de 1 clique. Usa o token do perfil, ja presente
// em todos os links dos e-mails. Compartilhada por digest/onboarding/winback.
export const urlDescadastro = (token) => `${BASE}/descadastrar?c=${token}`;

const brl = (v) => (v == null ? "valor não informado" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
const diasAte = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.ceil((d - new Date()) / 864e5); };
const dataBR = (iso) => { if (!iso) return "?"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("pt-BR"); };

function prazoTexto(iso) {
  const d = diasAte(iso);
  if (d == null) return "";
  if (d < 0) return "encerrado";
  if (d === 0) return "encerra hoje";
  return `encerra em ${d} dia${d > 1 ? "s" : ""}`;
}

function cardEmail(e) {
  const cor = (() => { const d = diasAte(e.encerramento); return d != null && d <= 2 ? "#dc2626" : d != null && d <= 7 ? "#d97706" : "#059669"; })();
  return `
  <tr><td style="padding:0 0 12px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:12px;color:#64748b;font-weight:600;">${e.municipio ?? "?"}/${e.uf ?? "?"} · ${e.orgao ?? "Órgão público"}
          ${e.novo ? '<span style="background:#059669;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;margin-left:6px;">NOVO</span>' : ""}</div>
        <div style="font-size:15px;color:#0f172a;margin:8px 0;">${(e.objeto || "").slice(0, 130)}</div>
        <div style="font-size:13px;color:#475569;">
          <span style="font-weight:700;color:#0f172a;">${brl(e.valorEstimado)}</span>
          &nbsp;·&nbsp; <span style="color:${cor};font-weight:700;">${prazoTexto(e.encerramento)}</span>
          &nbsp;·&nbsp; ${dataBR(e.encerramento)}
        </div>
      </td></tr>
    </table>
  </td></tr>`;
}

// --- Formato "Boletim" (chassi institucional compartilhado por digest e
// reengajamento). Detalhes que dao cara de empresa estabelecida: numero de
// edicao, data de processamento, bloco de identificacao do cliente com vigencia
// da assinatura, saudacao formal e politica de uso no rodape. ---

function formatarCNPJ(cnpj) {
  const d = String(cnpj || "").replace(/\D/g, "");
  if (d.length !== 14) return cnpj || "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Codigo de cliente estavel (6 digitos) derivado do token. Da um "numero de
// cadastro" fixo por cliente, sem expor o token.
function codigoCliente(token) {
  let h = 0;
  for (const ch of String(token || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String((h % 900000) + 100000);
}

// Numero da edicao: dias desde o lancamento. Global (igual pra todos no dia),
// como num boletim de verdade. Cresce sozinho, passa ideia de servico continuo.
export function edicaoNumero() {
  const epoch = Date.UTC(2026, 4, 1); // 2026-05-01
  return String(Math.max(1, Math.floor((Date.now() - epoch) / 864e5))).padStart(4, "0");
}

function dataProcessamento() {
  const now = new Date();
  const opt = { timeZone: "America/Sao_Paulo" };
  const data = now.toLocaleDateString("pt-BR", { ...opt, day: "2-digit", month: "long" });
  const hora = now.toLocaleTimeString("pt-BR", { ...opt, hour: "2-digit", minute: "2-digit" });
  return `${data}, ${hora}`;
}

// Monta o e-mail no formato Boletim. Os chamadores passam so o miolo (intro +
// corpoHtml + CTA + vigenciaTexto); o chassi institucional e sempre igual.
export function boletimLayout({ perfil, vigenciaTexto = "", intro = "", corpoHtml = "", ctaLink = "", ctaTexto = "", avisoTopo = "" }) {
  const nome = (perfil.nome || "cliente").split(" ")[0];
  const empresa = perfil.cnpj
    ? `${formatarCNPJ(perfil.cnpj)} ${(perfil.razaoSocial || perfil.nome || "").toUpperCase()}`.trim()
    : (perfil.razaoSocial || perfil.nome || "");
  const filtro = (perfil.filtro?.termos || []).join(", ") || "Todos os ramos";
  const desc = `${BASE}/descadastrar?c=${perfil.token}`;
  return `<!DOCTYPE html><html><body style="margin:0;background:#eef2f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:22px 12px;"><tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe3ee;">
      <tr><td style="padding:18px 26px;border-bottom:1px solid #eef2f7;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;"><img src="${BASE}/logo-horizontal.png" alt="ContrataX" height="26" style="height:26px;width:auto;border:0;display:block;" /></td>
          <td align="right" style="vertical-align:middle;font-size:12px;color:#64748b;font-weight:600;">www.contratax.com.br</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:linear-gradient(135deg,#312e81,#2563eb);padding:16px 26px;">
        <div style="color:#fff;font-size:17px;font-weight:800;">Boletim de Oportunidades</div>
        <div style="color:#c7d2fe;font-size:12.5px;margin-top:2px;">Licitações públicas do seu ramo, com dados oficiais do PNCP</div>
      </td></tr>
      <tr><td style="padding:12px 26px;border-bottom:1px solid #eef2f7;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:12.5px;color:#475569;">Edição nº <b style="color:#0f172a;">${edicaoNumero()}</b></td>
          <td align="right" style="font-size:12.5px;color:#475569;">Processado em ${dataProcessamento()}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 26px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:13px 16px;font-size:13px;color:#334155;line-height:1.75;">
          <div>Identificação do cliente: <b>${codigoCliente(perfil.token)}</b></div>
          ${empresa ? `<div>Empresa: <b>${empresa}</b></div>` : ""}
          <div>Filtro: <b>${filtro}</b></div>
          ${vigenciaTexto ? `<div>${vigenciaTexto}</div>` : ""}
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:14px 26px 4px;">
        <div style="font-size:15px;color:#0f172a;margin-bottom:14px;">Aos cuidados de <b>${nome}</b>,</div>
        ${avisoTopo}
        ${intro}
        ${corpoHtml}
        ${ctaLink ? `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:14px 0 6px;">
          <a href="${ctaLink}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 30px;border-radius:11px;">${ctaTexto}</a>
        </td></tr></table>` : ""}
      </td></tr>
      <tr><td style="padding:16px 26px 6px;">
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
          <div style="font-size:11.5px;font-weight:800;color:#475569;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px;">Política de uso e responsabilidade de conteúdo</div>
          <div style="font-size:12px;color:#64748b;line-height:1.6;">
            1) O ContrataX não substitui a publicação oficial. A fonte primária é o PNCP e, em caso de divergência, o edital oficial prevalece.<br>
            2) O serviço de informação é obrigação de meio, não de resultado, independentemente do desfecho dos certames.<br>
            3) Uso restrito ao cliente identificado acima. É vedado redistribuir, revender ou transferir o conteúdo a terceiros.
          </div>
        </div>
      </td></tr>
      <tr><td style="padding:14px 26px 22px;text-align:center;">
        <div style="font-size:12px;color:#94a3b8;">ContrataX · dados oficiais do PNCP · <a href="mailto:contato@contratax.com.br" style="color:#94a3b8;">contato@contratax.com.br</a></div>
        <div style="margin-top:7px;"><a href="${desc}" style="color:#94a3b8;font-size:11px;text-decoration:underline;">Descadastrar deste boletim</a></div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Gera o e-mail do cliente ativo (digest), no formato Boletim. { assunto, html }.
export function gerarDigest(perfil, editais, { semUf = false, vigenciaTexto = "" } = {}) {
  const link = `${BASE}/painel?c=${perfil.token}`;
  const n = editais.length;
  // Assunto lidera com URGENCIA quando ha prazo curto (o que mais move abertura).
  // Sem urgencia, mantem o boletim numerado. So conta prazos reais e futuros.
  const diasAteEnc = (iso) => { if (!iso) return null; const d = Math.ceil((new Date(iso) - Date.now()) / 864e5); return d; };
  let urg = null;
  for (const e of editais) { const d = diasAteEnc(e.encerramento); if (d != null && d >= 0 && (urg == null || d < urg)) urg = d; }
  const rotuloN = `${n} ${n === 1 ? "licitação" : "licitações"} do seu ramo`;
  const assunto = (urg != null && urg <= 5)
    ? `${rotuloN} · 1 encerra ${urg === 0 ? "hoje" : urg === 1 ? "amanhã" : "em " + urg + " dias"}`
    : `Boletim ${edicaoNumero()}: ${rotuloN}`;
  // Cliente sem estado cadastrado: aviso pra completar (senao ve editais nacionais).
  const avisoUf = semUf ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;">
          <div style="font-size:13.5px;color:#92400e;line-height:1.5;">Você ainda não cadastrou seu <b>estado</b>, então mostramos editais do <b>Brasil todo</b>. <a href="${BASE}/conta?c=${perfil.token}" style="color:#b45309;font-weight:700;">Cadastre seu estado</a> pra receber só a sua região.</div>
        </td></tr></table>` : "";
  const intro = `<div style="font-size:14.5px;color:#334155;margin-bottom:14px;">Encontramos <b>${n} ${n === 1 ? "licitação" : "licitações"}</b> compatíveis com o seu ramo desde o último boletim. As mais urgentes primeiro:</div>`;
  const corpoHtml = `<table width="100%" cellpadding="0" cellspacing="0">${editais.map(cardEmail).join("")}</table>`;
  const html = boletimLayout({ perfil, vigenciaTexto, avisoTopo: avisoUf, intro, corpoHtml, ctaLink: link, ctaTexto: "Acessar o boletim completo" });
  return { assunto, html };
}

// Envia via Resend (precisa de RESEND_API_KEY e dominio verificado para producao).
// anexos (opcional): [{ filename, content }] onde content e um Buffer ou base64.
// Usado pelo backup off-site (manda o dump de clientes anexado no e-mail).
export async function enviar({ para, assunto, html, anexos = null, listaDescadastroUrl = null }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY nao definida");
  const corpo = { from: FROM, to: para, subject: assunto, html };
  // List-Unsubscribe: exigido pra e-mail de marketing em volume. Habilita o
  // botao nativo de descadastro no Gmail/Outlook e o one-click do RFC 8058.
  // So nos e-mails de regua; transacionais (senha, pagamento) nao passam a URL.
  if (listaDescadastroUrl) {
    corpo.headers = {
      "List-Unsubscribe": `<${listaDescadastroUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  if (anexos?.length) {
    corpo.attachments = anexos.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
    }));
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await contabilizarEnvio(); // conta contra o teto do plano e avisa o admin se estiver perto
  return await r.json();
}
