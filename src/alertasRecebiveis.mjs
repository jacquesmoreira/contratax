// Alertas automaticos por e-mail para NFs proximas do vencimento ou atrasadas.
//
// Marcos (dias desde emissao): 25 (vence em 5d), 30 (vence hoje), 45 (atraso de
// 15d), 60 (atraso de 30d). Cada NF recebe no maximo 1 e-mail por marco.
//
// Estrategia: roda dentro do atualizarLoop (a cada 6h). Para cada NF aberta,
// calcula dias desde emissao; se passou um marco e ainda nao foi alertado,
// envia e marca como enviado na coluna alertas_enviados.

import { todasNotasPendentes, alertasEnviadosDe, registrarAlertaEnviado } from "./recebiveis.mjs";
import { lerPerfis } from "./perfis.mjs";
import { enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { calcularCorrecao, formatarBRL } from "./correcaoMonetaria.mjs";

const MARCOS = [25, 30, 45, 60];

function diasDesde(dataIso) {
  const d = new Date(dataIso);
  if (isNaN(d)) return 0;
  return Math.floor((Date.now() - d.getTime()) / 864e5);
}

function htmlAlerta(empresa, nf, marco, baseUrl) {
  const venc = new Date(new Date(nf.data_emissao).getTime() + 30 * 864e5);
  const calc = calcularCorrecao({ valorOriginal: nf.valor, dataVencimento: venc.toISOString().slice(0,10) });
  const venceuHa = calc.diasAtraso;

  const titulo = marco === 25 ? "Sua NF vence em 5 dias"
              : marco === 30 ? "Sua NF venceu o prazo de pagamento hoje"
              : marco === 45 ? "Sua NF esta atrasada ha 15 dias"
              :                "Sua NF esta atrasada ha 30 dias - hora de cobrar formalmente";

  const corpo = marco === 25
    ? `<p>Falta <b>1 semana</b> pro orgao publico cumprir o prazo legal de pagamento da sua NF nº ${nf.numero || "(sem numero)"}. Se passar do dia ${venc.toLocaleDateString("pt-BR")}, voce ja tem direito a correcao monetaria e juros.</p>`
    : marco === 30
    ? `<p>Hoje <b>vence o prazo legal</b> de 30 dias (Lei 14.133, art. 141) pro orgao publico pagar a NF nº ${nf.numero || "(sem numero)"}. Se nao receber, ja pode cobrar com juros e correcao.</p>`
    : marco === 45
    ? `<p>O orgao <b>${nf.orgao_nome || "publico"}</b> esta com sua NF nº ${nf.numero || "(sem numero)"} em atraso ha <b>${venceuHa} dias</b>. Recomendamos enviar oficio formal de cobranca para preservar o seu direito de cobrar juros e correcao.</p><p>Total devido com correcao e juros: <b>${formatarBRL(calc.totalDevido)}</b>.</p>`
    : `<p>Atraso passou de <b>30 dias</b> alem do prazo legal (NF nº ${nf.numero || "(sem numero)"}, orgao <b>${nf.orgao_nome || "publico"}</b>). E hora de considerar escalonar para um advogado parceiro especialista em contratos administrativos.</p><p>Total devido: <b>${formatarBRL(calc.totalDevido)}</b>.</p>`;

  const acao = marco >= 45
    ? `<a href="${baseUrl}/recebiveis?c=${empresa.token}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:700;margin:14px 8px 0 0">Gerar oficio de cobranca</a>${marco === 60 ? `<a href="${baseUrl}/recebiveis?c=${empresa.token}#escalar=${nf.id}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:700;margin:14px 0 0 0">Falar com advogado parceiro</a>` : ""}`
    : `<a href="${baseUrl}/recebiveis?c=${empresa.token}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:700;margin:14px 0 0 0">Ver no painel</a>`;

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:30px 24px;color:#0f172a">
    <h1 style="font-size:20px;font-weight:800;margin:0 0 14px">${titulo}</h1>
    ${corpo}
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">NF</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px"><b>${nf.numero || "-"}</b></td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Valor original</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px"><b>${formatarBRL(nf.valor)}</b></td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Orgao</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px">${nf.orgao_nome || "-"}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#475569">Emissao</td><td style="padding:10px 14px;font-size:13px">${new Date(nf.data_emissao).toLocaleDateString("pt-BR")}</td></tr>
    </table>
    ${acao}
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">ContrataX - Gestao de Recebiveis Publicos</p>
  </div>`;
}

export async function verificarRecebiveisAtrasados({ log = console.log, baseUrl = "https://www.contratax.com.br" } = {}) {
  if (!temEmailKey()) {
    log("[recebiveis] RESEND_API_KEY ausente; pulando alertas.");
    return 0;
  }
  const perfis = await lerPerfis();
  const porToken = new Map(perfis.map((p) => [p.token, p]));
  const notas = todasNotasPendentes();
  let enviados = 0;

  for (const nf of notas) {
    const perfil = porToken.get(nf.perfil_token);
    if (!perfil || !perfil.email) continue;
    const st = statusAtual(perfil);
    if (!st.temAcesso) continue;

    const dias = diasDesde(nf.data_emissao);
    const jaEnviados = new Set(alertasEnviadosDe(nf));

    for (const marco of MARCOS) {
      if (dias < marco) continue;       // ainda nao chegou no marco
      if (jaEnviados.has(marco)) continue; // ja avisou
      const tituloAss = marco === 25 ? `NF vence em 5 dias - ${perfil.razaoSocial || perfil.nome}`
                      : marco === 30 ? `NF vence o prazo legal hoje - ${perfil.razaoSocial || perfil.nome}`
                      : marco === 45 ? `NF atrasada ha 15 dias - hora de cobrar formalmente`
                      :                `NF atrasada ha 30 dias - considere escalonar`;
      try {
        await enviar({
          para: perfil.email,
          assunto: tituloAss,
          html: htmlAlerta({ token: perfil.token }, nf, marco, baseUrl),
        });
        registrarAlertaEnviado(nf.id, marco);
        enviados++;
        log(`[recebiveis] alerta marco=${marco} NF=${nf.id} para ${perfil.email}`);
      } catch (e) {
        log(`[recebiveis] erro alerta NF=${nf.id} ${perfil.email}: ${e.message}`);
      }
    }
  }

  if (enviados > 0) log(`[recebiveis] ${enviados} alerta(s) de NF enviado(s).`);
  return enviados;
}
