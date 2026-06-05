// Alertas automaticos por e-mail para CONTRATOS que estao se aproximando do fim.
//
// Marcos: 90, 60, 30 dias antes do data_fim. Cada contrato recebe no maximo 1
// e-mail por marco. Roda no atualizarLoop.

import { todosContratosAtivos, alertasEnviadosCt, registrarAlertaCt } from "./contratosMeus.mjs";
import { lerPerfis } from "./perfis.mjs";
import { enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { formatarBRL } from "./correcaoMonetaria.mjs";

const MARCOS = [90, 60, 30];

function diasParaFim(dataFim) {
  if (!dataFim) return null;
  const fim = new Date(dataFim);
  return Math.floor((fim - new Date()) / 864e5);
}

function htmlAlerta(perfil, contrato, marco, baseUrl) {
  const titulo = marco === 90 ? "Seu contrato vence em 90 dias - hora de pensar em prorrogacao"
              : marco === 60 ? "Seu contrato vence em 60 dias - prepare a minuta de prorrogacao"
              :                "Seu contrato vence em 30 dias - protocole o pedido de prorrogacao agora";

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:30px 24px;color:#0f172a">
    <h1 style="font-size:20px;font-weight:800;margin:0 0 14px">${titulo}</h1>
    <p>Seu contrato com o orgao <b>${contrato.orgao_nome || "publico"}</b> termina em <b>${marco} dias</b>. Quanto mais cedo voce protocola o pedido de prorrogacao ou negocia o aditivo, maior a chance de manter o faturamento sem interrupcao.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Contrato</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px"><b>${contrato.numero || "-"}</b></td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Objeto</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px">${contrato.objeto || "-"}</td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Valor total</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px"><b>${formatarBRL(contrato.valor_total)}</b></td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#475569">Termino</td><td style="padding:10px 14px;font-size:13px">${new Date(contrato.data_fim).toLocaleDateString("pt-BR")}</td></tr>
    </table>
    <a href="${baseUrl}/contratos?c=${perfil.token}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:700;margin:14px 0 0 0">Gerar minuta de prorrogacao</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">ContrataX - Gestao de Contratos Publicos</p>
  </div>`;
}

export async function verificarContratosVencendo({ log = console.log, baseUrl = "https://www.contratax.com.br" } = {}) {
  if (!temEmailKey()) {
    log("[contratos] RESEND_API_KEY ausente; pulando alertas.");
    return 0;
  }
  const perfis = await lerPerfis();
  const porToken = new Map(perfis.map((p) => [p.token, p]));
  const contratos = todosContratosAtivos();
  let enviados = 0;

  for (const c of contratos) {
    const perfil = porToken.get(c.perfil_token);
    if (!perfil || !perfil.email) continue;
    const st = statusAtual(perfil);
    if (!st.temAcesso) continue;

    const dias = diasParaFim(c.data_fim);
    if (dias === null || dias < 0) continue; // ja acabou

    const jaEnviados = new Set(alertasEnviadosCt(c));
    for (const marco of MARCOS) {
      if (dias > marco) continue;          // ainda longe
      if (jaEnviados.has(String(marco))) continue;
      try {
        await enviar({
          para: perfil.email,
          assunto: `Contrato ${c.numero || ""} vence em ${marco} dias - ${perfil.razaoSocial || perfil.nome}`,
          html: htmlAlerta(perfil, c, marco, baseUrl),
        });
        registrarAlertaCt(c.id, marco);
        enviados++;
        log(`[contratos] alerta marco=${marco} contrato=${c.id} para ${perfil.email}`);
      } catch (e) {
        log(`[contratos] erro alerta contrato=${c.id} ${perfil.email}: ${e.message}`);
      }
    }
  }
  if (enviados > 0) log(`[contratos] ${enviados} alerta(s) de contrato enviado(s).`);
  return enviados;
}
