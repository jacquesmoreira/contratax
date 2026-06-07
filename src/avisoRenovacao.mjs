// Avisos de renovacao da assinatura por e-mail.
//
// Roda 1x por dia (engatado no loop do digestDiario.mjs). Para cada assinante
// ativo:
//   - 7 dias antes do vencimento -> e-mail "renova em 7 dias"
//   - 1 dia antes  -> e-mail "renova amanha, confirme o pagamento"
//
// Como nao reenviar: marca _avisoRenov7Em e _avisoRenov1Em com o ISO do
// expiraEm corrente. Se na proxima execucao o expiraEm for o mesmo, nao
// dispara de novo. Quando o cliente paga e renova, expiraEm muda e o
// marcador automaticamente fica defasado, voltando a disparar no proximo
// ciclo.
//
// Reduz churn por cartao recusado (cliente atualiza antes de ser cortado).

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { planoDe } from "./planos.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function fmtBR(iso) {
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return ""; }
}

function emailTemplate({ titulo, corCabec, mensagem, perfil, dataRenova, valor, link, ctaTxt }) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:${corCabec.bg};padding:20px 26px;border-bottom:1px solid ${corCabec.borda}">
<div style="font-size:13px;color:${corCabec.fg};font-weight:700;letter-spacing:.5px">RENOVACAO</div>
<div style="font-size:18px;color:${corCabec.tit};font-weight:800;margin-top:4px">${titulo}</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#0f172a;font-size:15px;line-height:1.6">
<p>Ola, ${perfil.nome || "cliente"}.</p>
${mensagem}
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
<tr><td style="padding:10px 14px;background:#f8fafc;width:55%;color:#64748b">Data da proxima cobranca</td><td style="padding:10px 14px;font-weight:700">${dataRenova}</td></tr>
<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Valor</td><td style="padding:10px 14px;font-weight:700">R$ ${valor}</td></tr>
</table>
<table cellpadding="0" cellspacing="0" border="0" style="margin:18px 0"><tr><td align="center">
<a href="${link}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:11px">${ctaTxt}</a>
</td></tr></table>
<p style="font-size:13.5px;color:#64748b">Se quiser cancelar ou trocar de plano antes da renovacao, e so usar essa mesma pagina.</p>
<p style="font-size:13.5px;color:#64748b">Duvidas? Responda este e-mail.</p>
</td></tr>
<tr><td style="background:#f8fafc;padding:16px 26px;text-align:center;border-top:1px solid #e2e8f0">
<div style="color:#64748b;font-size:12.5px">ContrataX, monitor de licitacoes publicas</div>
</td></tr></table></td></tr></table></body></html>`;
}

// Loop principal: percorre perfis e dispara avisos no momento certo.
export async function enviarAvisosRenovacaoDoDia({ log = console.log } = {}) {
  if (!temEmailKey()) {
    log("[renov] RESEND_API_KEY ausente; pulando.");
    return { aviso7: 0, aviso1: 0, motivo: "sem-chave" };
  }
  const perfis = await lerPerfis();
  let aviso7 = 0, aviso1 = 0, salvar = false;
  for (const p of perfis) {
    try {
      if (!p.email) continue;
      const st = statusAtual(p);
      if (st.status !== "ativo") continue;
      if (st.diasRestantes == null) continue;
      const expira = p.assinatura?.expiraEm;
      if (!expira) continue;
      const dataRenova = fmtBR(expira);
      const plano = planoDe(p);
      const link = `${BASE}/conta?c=${encodeURIComponent(p.token)}`;

      // 7 dias antes
      if (st.diasRestantes === 7 && p._avisoRenov7Em !== expira) {
        const html = emailTemplate({
          titulo: "Sua mensalidade renova em 7 dias",
          corCabec: { bg: "#eef2ff", borda: "#c7d2fe", fg: "#3730a3", tit: "#1e1b4b" },
          mensagem: `<p>So passando para avisar: <b>em 7 dias</b> sua assinatura do ContrataX (plano <b>${plano.nome}</b>) sera renovada automaticamente. Se o seu cartao ainda estiver em dia, voce nao precisa fazer nada.</p>`,
          perfil: p, dataRenova, valor: plano.preco, link,
          ctaTxt: "Gerenciar plano",
        });
        await enviar({ para: p.email, assunto: `Sua mensalidade do ContrataX renova em 7 dias`, html });
        p._avisoRenov7Em = expira;
        salvar = true; aviso7++;
        log(`[renov] aviso 7d -> ${p.email}`);
      }
      // 1 dia antes
      else if (st.diasRestantes === 1 && p._avisoRenov1Em !== expira) {
        const html = emailTemplate({
          titulo: "Sua mensalidade renova amanha",
          corCabec: { bg: "#fef3c7", borda: "#fde68a", fg: "#92400e", tit: "#78350f" },
          mensagem: `<p><b>Sua assinatura sera renovada automaticamente amanha.</b> Confirme que o seu metodo de pagamento esta em dia (cartao com saldo, Pix funcional) para nao ter o acesso pausado.</p><p>Se preferir nao renovar, voce pode cancelar ate hoje pelo link abaixo, sem multa.</p>`,
          perfil: p, dataRenova, valor: plano.preco, link,
          ctaTxt: "Conferir e gerenciar",
        });
        await enviar({ para: p.email, assunto: `Sua mensalidade do ContrataX renova amanha`, html });
        p._avisoRenov1Em = expira;
        salvar = true; aviso1++;
        log(`[renov] aviso 1d -> ${p.email}`);
      }
    } catch (e) {
      log(`[renov] ${p.nome || p.token}: ERRO ${e.message}`);
    }
  }
  if (salvar) {
    const atual = await lerPerfis();
    for (const p of atual) {
      const fonte = perfis.find((x) => x.token === p.token);
      if (!fonte) continue;
      if (fonte._avisoRenov7Em) p._avisoRenov7Em = fonte._avisoRenov7Em;
      if (fonte._avisoRenov1Em) p._avisoRenov1Em = fonte._avisoRenov1Em;
    }
    await salvarPerfis(atual);
  }
  log(`[renov] concluido: ${aviso7} aviso(s) 7d, ${aviso1} aviso(s) 1d.`);
  return { aviso7, aviso1 };
}
