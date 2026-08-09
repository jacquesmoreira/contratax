// Alertas automáticos por e-mail para NFs próximas do vencimento ou atrasadas.
//
// Marcos (dias desde emissão): 25 (vence em 5d), 30 (vence hoje), 45 (atraso de
// 15d), 60 (atraso de 30d). Cada NF recebe no máximo 1 e-mail por marco.
//
// Estratégia: roda dentro do atualizarLoop (a cada 6h). Para cada NF aberta,
// calcula dias desde emissão; se passou um marco e ainda não foi alertado,
// envia e marca como enviado na coluna alertas_enviados.
//
// CORREÇÃO 09/08/2026: o arquivo inteiro estava sem acentuação (bug antigo,
// não estilo) — num alerta sobre dinheiro atrasado do cliente, isso lê como
// descuido bem na hora errada.

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
              : marco === 45 ? "Sua NF está atrasada há 15 dias, hora de pressionar"
              :                "Sua NF está atrasada há 30 dias, escalone a cobrança";

  const corpo = marco === 25
    ? `<p>Falta <b>1 semana</b> pro órgão público cumprir o prazo legal de pagamento da sua NF nº ${nf.numero || "(sem número)"} (vence em ${venc.toLocaleDateString("pt-BR")}).</p>`
    : marco === 30
    ? `<p>Hoje <b>vence o prazo legal</b> de 30 dias (Lei 14.133, art. 141) pro órgão público pagar a NF nº ${nf.numero || "(sem número)"}. Se não receber nos próximos dias, comece a pressionar com um pedido via Lei de Acesso à Informação, que obriga o órgão a responder quando vai pagar.</p>`
    : marco === 45
    ? `<p>O órgão <b>${nf.orgao_nome || "público"}</b> está com sua NF nº ${nf.numero || "(sem número)"} em atraso há <b>${venceuHa} dias</b>.</p><p>Cobrar juros raramente funciona com prefeitura. O que destrava o pagamento é a <b>pressão administrativa</b>: registre um pedido na Ouvidoria e, se preciso, uma representação ao Tribunal de Contas. O painel gera essas peças prontas pra você.</p>`
    : `<p>Atraso passou de <b>30 dias</b> (NF nº ${nf.numero || "(sem número)"}, órgão <b>${nf.orgao_nome || "público"}</b>).</p><p>Considere a <b>representação ao Tribunal de Contas</b> (o que gestor público mais teme) ou <b>antecipar o recebível</b> pra receber a maior parte agora, em vez de seguir esperando.</p>`;

  const acao = marco >= 45
    ? `<a href="${baseUrl}/recebiveis?c=${empresa.token}#cobrar=${nf.id}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:700;margin:14px 0 0 0">Ver opções de cobrança</a>`
    : `<a href="${baseUrl}/recebiveis?c=${empresa.token}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:700;margin:14px 0 0 0">Ver no painel</a>`;

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:30px 24px;color:#0f172a">
    <h1 style="font-size:20px;font-weight:800;margin:0 0 14px">${titulo}</h1>
    ${corpo}
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">NF</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px"><b>${nf.numero || "-"}</b></td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Valor original</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px"><b>${formatarBRL(nf.valor)}</b></td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">Órgão</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px">${nf.orgao_nome || "-"}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#475569">Emissão</td><td style="padding:10px 14px;font-size:13px">${new Date(nf.data_emissao).toLocaleDateString("pt-BR")}</td></tr>
    </table>
    ${acao}
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">ContrataX, gestão de recebíveis públicos</p>
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
      if (dias < marco) continue;          // ainda não chegou no marco
      if (jaEnviados.has(marco)) continue; // já avisou
      const tituloAss = marco === 25 ? `NF vence em 5 dias, ${perfil.razaoSocial || perfil.nome}`
                      : marco === 30 ? `NF vence o prazo legal hoje, ${perfil.razaoSocial || perfil.nome}`
                      : marco === 45 ? `NF atrasada há 15 dias, hora de cobrar formalmente`
                      :                `NF atrasada há 30 dias, considere escalonar`;
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
