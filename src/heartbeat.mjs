// Heartbeat diario de saude do sistema: 1 e-mail por dia pro admin com os sinais
// vitais, MESMO quando esta tudo bem. Motivo (incidente de 20/07/2026): o sistema
// ja avisa quando algo QUEBRA (cota, disco, memoria, bounce, loop que caiu), mas o
// digest ficou dias mandando "0 e-mails" sem ninguem saber, porque "nao recebi
// alerta" tanto significa "tudo ok" quanto "o proprio monitoramento parou". O
// heartbeat resolve essa ambiguidade: silencio vira confirmacao explicita de "verde".
//
// Nao substitui os alertas de problema (esses continuam disparando na hora); e a
// camada de "prova de vida" diaria. So roda com LICITA_HEARTBEAT=1.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";
import { lerPerfis } from "./perfis.mjs";
import { statusAtual } from "./assinatura.mjs";
import { usoDisco } from "./backup.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const ADMIN_EMAIL = process.env.LICITA_BACKUP_EMAIL || "licitacontratax@gmail.com";
const TETO_DIARIO = Number(process.env.LICITA_TETO_EMAIL_DIA || 100);
const TETO_MENSAL = Number(process.env.LICITA_TETO_EMAIL_MES || 3000);
const MEM_LIMITE_MB = Number(process.env.LICITA_MEM_LIMITE_MB || 450);

const hojeISO = () => new Date().toISOString().slice(0, 10);

// Le o contador global de envios (mesmo arquivo que email.mjs escreve). So leitura.
async function lerCotaEmail() {
  try {
    const c = JSON.parse(await readFile(resolve(DATA_DIR, "envios-contador.json"), "utf8"));
    const hoje = hojeISO();
    const mes = hoje.slice(0, 7);
    return {
      dia: c.dia === hoje ? (c.diaCount || 0) : 0,
      mes: c.mes === mes ? (c.mesCount || 0) : 0,
    };
  } catch { return { dia: 0, mes: 0 }; }
}

// Monta os dados + o HTML. Recebe os stats do PROCESSO (uptime/memoria) de quem
// chama, porque so o processo do servidor conhece esses numeros.
export async function montarHeartbeat({ uptimeS = 0, rssMb = 0, heapMb = 0 } = {}) {
  const alertas = []; // linhas de atencao (amarelas); vazio = tudo verde

  // Clientes por status.
  let ativos = 0, teste = 0, expirados = 0, bouncesHoje = 0;
  try {
    const perfis = await lerPerfis();
    const hoje = hojeISO();
    for (const p of perfis) {
      const st = statusAtual(p).status;
      if (st === "ativo" || st === "atrasado") ativos++;
      else if (st === "teste") teste++;
      else if (["teste_expirado", "vencido", "inativo"].includes(st)) expirados++;
      if (p._emailBounce?.em && String(p._emailBounce.em).slice(0, 10) === hoje) bouncesHoje++;
    }
  } catch (e) { alertas.push(`Nao consegui ler os perfis: ${e.message}`); }

  // Cota de e-mail (Resend).
  const cota = await lerCotaEmail();
  if (cota.dia >= TETO_DIARIO * 0.9) alertas.push(`E-mail perto do teto diario: ${cota.dia}/${TETO_DIARIO}.`);
  if (cota.mes >= TETO_MENSAL * 0.9) alertas.push(`E-mail perto do teto mensal: ${cota.mes}/${TETO_MENSAL}.`);

  // Disco (volume Railway).
  let disco = null;
  try {
    disco = await usoDisco();
    if (disco.pct >= 0.8) alertas.push(`Volume em ${disco.pctTexto} (perto de encher).`);
  } catch (e) { alertas.push(`Nao consegui medir o disco: ${e.message}`); }

  // Memoria: alerta se passou de 80% do limite configurado.
  if (rssMb >= MEM_LIMITE_MB * 0.8) alertas.push(`Memoria alta: ${rssMb}MB de ${MEM_LIMITE_MB}MB.`);

  if (bouncesHoje > 0) alertas.push(`${bouncesHoje} e-mail(s) de cliente voltaram (bounce) hoje.`);

  const tudoVerde = alertas.length === 0;
  const upH = (uptimeS / 3600).toFixed(1);
  const linha = (rotulo, valor) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px">${rotulo}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:13px">${valor}</td></tr>`;

  const assunto = tudoVerde
    ? `[ContrataX] ✅ Tudo no ar, ${new Date().toLocaleDateString("pt-BR")}`
    : `[ContrataX] ⚠ ${alertas.length} ponto(s) de atencao, ${new Date().toLocaleDateString("pt-BR")}`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 20px;color:#0f172a">
    <div style="background:${tudoVerde ? "#059669" : "#b45309"};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;font-weight:800;letter-spacing:.5px">SAUDE DO SISTEMA, RESUMO DIARIO</div>
      <div style="font-size:20px;font-weight:800;margin-top:3px">${tudoVerde ? "Tudo funcionando" : alertas.length + " ponto(s) pra olhar"}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:6px 0 4px">
      <table style="width:100%;border-collapse:collapse">
        ${linha("No ar ha", `${upH} horas`)}
        ${linha("Memoria", `${rssMb} MB (limite ${MEM_LIMITE_MB})`)}
        ${disco ? linha("Volume", `${disco.usado} / ${disco.total} (${disco.pctTexto})`) : ""}
        ${linha("E-mails hoje", `${cota.dia} / ${TETO_DIARIO}`)}
        ${linha("E-mails no mes", `${cota.mes} / ${TETO_MENSAL}`)}
        ${linha("Clientes", `${ativos} pagantes, ${teste} em teste, ${expirados} expirados`)}
        ${linha("Bounces hoje", bouncesHoje === 0 ? "nenhum" : String(bouncesHoje))}
      </table>
    </div>
    ${tudoVerde
      ? `<p style="font-size:13px;color:#475569;margin:16px 4px 0">Nenhum ponto de atencao. Este e-mail chega todo dia so pra confirmar que o monitoramento esta vivo, se ele parar de chegar, e sinal de que algo travou.</p>`
      : `<div style="margin:14px 0 0"><div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:6px">Pontos de atencao:</div>
         <ul style="margin:0 0 0 18px;color:#92400e;font-size:13px;line-height:1.6">${alertas.map((a) => `<li>${a}</li>`).join("")}</ul></div>`}
    <p style="font-size:11px;color:#94a3b8;margin-top:22px">ContrataX, monitoramento interno. Os alertas de problema (cota, disco, memoria, bounce) continuam chegando na hora, independente deste resumo.</p>
  </div>`;

  return { assunto, html, tudoVerde, alertas, dados: { upH, rssMb, disco, cota, ativos, teste, expirados, bouncesHoje } };
}

// Envia o heartbeat agora. Best-effort: nunca lanca (nao pode derrubar o loop).
export async function enviarHeartbeat({ uptimeS, rssMb, heapMb, log = console.log } = {}) {
  if (!temEmailKey()) { log("[heartbeat] RESEND_API_KEY ausente; pulando."); return { enviado: false }; }
  try {
    const { assunto, html, tudoVerde } = await montarHeartbeat({ uptimeS, rssMb, heapMb });
    await enviar({ para: ADMIN_EMAIL, assunto, html });
    log(`[heartbeat] enviado (${tudoVerde ? "tudo verde" : "com atencao"}).`);
    return { enviado: true, tudoVerde };
  } catch (e) {
    log(`[heartbeat] falha: ${e.message}`);
    return { enviado: false, erro: e.message };
  }
}

// Loop diario. getStats() devolve os numeros do processo (uptime/memoria), que
// so o servidor conhece. Alvo padrao 7h BR, antes do digest das 8h, pra o Jacques
// ver a saude antes dos envios do dia sairem.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function msAteHora(horaBR) {
  const horaUTC = (horaBR + 3) % 24; // Brasilia -> UTC
  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setUTCHours(horaUTC, 0, 0, 0);
  if (alvo <= agora) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo - agora;
}

export async function heartbeatLoop({ horaBR = 7, getStats = () => ({}), log = console.log } = {}) {
  log(`[heartbeat] loop ativado (alvo: ${horaBR}h Brasilia)`);
  for (;;) {
    await dormir(msAteHora(horaBR));
    const { uptimeS = 0, rssMb = 0, heapMb = 0 } = getStats() || {};
    await enviarHeartbeat({ uptimeS, rssMb, heapMb, log });
  }
}
