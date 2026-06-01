// E-mail diario: gera o resumo dos editais do cliente e (opcionalmente) envia.
// Envio plugavel via Resend (RESEND_API_KEY). Sem chave, so gera o HTML (preview).

const BASE = process.env.LICITA_BASE_URL || "http://localhost:3000";
const FROM = process.env.LICITA_EMAIL_FROM || "Licita <onboarding@resend.dev>";

export function temEmailKey() {
  return Boolean(process.env.RESEND_API_KEY);
}

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

// Gera o e-mail. Devolve { assunto, html }.
export function gerarDigest(perfil, editais) {
  const link = `${BASE}/painel?c=${perfil.token}`;
  const n = editais.length;
  const assunto = `${n} ${n === 1 ? "licitação" : "licitações"} do seu ramo ${n === 1 ? "está" : "estão"} esperando você`;

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="background:linear-gradient(135deg,#312e81,#2563eb);border-radius:16px 16px 0 0;padding:26px 28px;">
        <div style="color:#fff;font-size:22px;font-weight:800;">Licita</div>
        <div style="color:#c7d2fe;font-size:14px;margin-top:2px;">Seus editais de hoje, ${perfil.nome}</div>
      </td></tr>
      <tr><td style="background:#fff;padding:24px 28px;">
        <div style="font-size:16px;color:#0f172a;margin-bottom:18px;">
          Encontramos <b>${n} ${n === 1 ? "licitação" : "licitações"}</b> que combinam com o seu ramo. As mais urgentes primeiro:
        </div>
        <table width="100%" cellpadding="0" cellspacing="0">${editais.map(cardEmail).join("")}</table>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:10px 0 4px;">
          <a href="${link}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:11px;">Ver tudo no meu painel</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="background:#312e81;border-radius:0 0 16px 16px;padding:20px 28px;text-align:center;">
        <div style="color:#c7d2fe;font-size:13px;">Dados oficiais do PNCP. Você recebe este resumo porque criou um painel no Licita.</div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  return { assunto, html };
}

// Envia via Resend (precisa de RESEND_API_KEY e dominio verificado para producao).
export async function enviar({ para, assunto, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY nao definida");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: para, subject: assunto, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}
