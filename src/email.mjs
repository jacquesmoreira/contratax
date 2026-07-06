// E-mail diario: gera o resumo dos editais do cliente e (opcionalmente) envia.
// Envio plugavel via Resend (RESEND_API_KEY). Sem chave, so gera o HTML (preview).

const BASE = process.env.LICITA_BASE_URL || "http://localhost:3000";
const FROM = process.env.LICITA_EMAIL_FROM || "ContrataX <onboarding@resend.dev>";

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
  const assunto = `Boletim ${edicaoNumero()}: ${n} ${n === 1 ? "licitação" : "licitações"} do seu ramo`;
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
  return await r.json();
}
