// Alertas automaticos de vencimento de certidoes. Roda junto com o atualizarLoop.
// Verifica todos os perfis e envia e-mail quando uma certidao esta prestes a vencer.

import { lerPerfis } from "./perfis.mjs";
import { enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";

const DIAS_AVISO = [30, 15, 7, 3]; // avisar quando faltam esses dias

const NOMES = {
  federalConjunta: "Certidão Negativa Federal (Receita/PGFN)",
  fgts: "Certificado de Regularidade do FGTS",
  trabalhistaCNDT: "Certidão de Débitos Trabalhistas (CNDT)",
  estadual: "Certidão Negativa Estadual",
  municipal: "Certidão Negativa Municipal",
};

function diasAte(dataStr) {
  if (!dataStr) return null;
  const d = new Date(dataStr);
  return isNaN(d) ? null : Math.ceil((d - new Date()) / 864e5);
}

function htmlAlerta(nome, certidoes) {
  const linhas = certidoes.map(c => {
    const dias = c.dias;
    const urgencia = dias <= 3 ? "🔴" : dias <= 7 ? "🟠" : "🟡";
    const txt = dias <= 0 ? "VENCIDA HOJE" : `vence em ${dias} dia${dias !== 1 ? "s" : ""}`;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${urgencia} <b>${c.nome}</b></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:700">${txt}</td>
    </tr>`;
  }).join("");
  return `
  <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px"><tr>
      <td style="background:#312e81;border-radius:10px;padding:8px 12px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#fff;border-radius:6px;padding:5px 8px;">
          <img src="https://www.contratax.com.br/logo-horizontal.png" alt="ContrataX" height="20" style="display:block;height:20px;width:auto;border:0" />
        </td></tr></table>
      </td>
    </tr></table>
    <h2 style="color:#0f172a;font-size:20px;margin-bottom:8px">Certidões próximas do vencimento — ${nome}</h2>
    <p style="color:#475569;font-size:15px;margin-bottom:20px">Renove antes que vençam para não ser inabilitada em licitações.</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#94a3b8;text-transform:uppercase">Certidão</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#94a3b8;text-transform:uppercase">Situação</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p style="color:#475569;font-size:13px;margin-top:20px">
      <a href="https://www.contratax.com.br/documentos" style="color:#4338ca;font-weight:700">Atualizar meus documentos →</a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">ContrataX — Gestão Inteligente de Licitações</p>
  </div>`;
}

export async function verificarCertidoesVencendo({ log = console.log } = {}) {
  if (!temEmailKey()) {
    log("[alertas] RESEND_API_KEY ausente; pulando verificacao de certidoes.");
    return 0;
  }
  const perfis = await lerPerfis();
  let alertasEnviados = 0;
  const hoje = new Date().toDateString();

  for (const p of perfis) {
    // Só envia para assinantes ativos com e-mail
    const st = statusAtual(p);
    if (!st.temAcesso || !p.email) continue;

    const certidoes = p.empresa?.certidoes;
    if (!certidoes) continue;

    const alertar = [];
    for (const [chave, cert] of Object.entries(certidoes)) {
      if (!cert?.validade) continue;
      const dias = diasAte(cert.validade);
      if (dias === null) continue;
      // Avisa nos dias configurados (tolerância de ±0 dias exatos)
      if (DIAS_AVISO.includes(dias) || dias === 0) {
        alertar.push({ nome: NOMES[chave] || chave, dias });
      }
    }

    if (!alertar.length) continue;

    // Evita reenvio no mesmo dia (guarda no perfil)
    const ultimoAlerta = p._ultimoAlertaCertidao;
    if (ultimoAlerta === hoje) continue;

    try {
      await enviar({
        para: p.email,
        assunto: `Atenção: ${alertar.length} ${alertar.length > 1 ? "certidões" : "certidão"} vencendo — ${p.razaoSocial || p.nome}`,
        html: htmlAlerta(p.razaoSocial || p.nome, alertar),
      });
      // Marca que já foi enviado hoje
      const perfisAtual = await lerPerfis();
      const pf = perfisAtual.find(x => x.token === p.token);
      if (pf) {
        pf._ultimoAlertaCertidao = hoje;
        const { salvarPerfis } = await import("./perfis.mjs");
        await salvarPerfis(perfisAtual);
      }
      alertasEnviados++;
      log(`[alertas] e-mail enviado para ${p.email}: ${alertar.map(a => a.nome).join(", ")}`);
    } catch (e) {
      log(`[alertas] erro ao enviar para ${p.email}: ${e.message}`);
    }
  }

  if (alertasEnviados > 0) log(`[alertas] ${alertasEnviados} alerta(s) de certidao enviado(s).`);
  return alertasEnviados;
}
