// Digest diario automatico: 1x por dia, manda para cada cliente ativo
// um resumo dos editais NOVOS do ramo dele. Roda in-process no Railway.
//
// - Spara so se RESEND_API_KEY estiver configurada (senao loga e pula).
// - Evita reenvio no mesmo dia (guarda _ultimoDigest no perfil).
// - Pula clientes sem assinatura ativa, sem e-mail ou sem editais novos.
//
// Ative com LICITA_DIGEST=1 no Railway. Horario alvo configuravel via
// LICITA_DIGEST_HORA (default 8 = 08:00 Brasilia / 11:00 UTC).

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { gerarDigest, enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { monitorar } from "./monitor.mjs";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Container roda em UTC. Brasilia = UTC-3.
// LICITA_DIGEST_HORA = hora de Brasilia (0-23) em que o digest deve sair.
function msAteProximoHorario(horaBR = 8) {
  const horaUTC = (horaBR + 3) % 24; // Brasilia -> UTC
  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setUTCHours(horaUTC, 0, 0, 0);
  if (alvo <= agora) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo - agora;
}

const ordenarPorPrazo = (arr) =>
  [...arr].sort((a, b) => (a.encerramento || "").localeCompare(b.encerramento || ""));

export async function enviarDigestDoDia({ log = console.log } = {}) {
  if (!temEmailKey()) {
    log("[digest] RESEND_API_KEY ausente; pulando envio do dia.");
    return { enviados: 0, motivo: "sem-chave" };
  }

  const perfis = await lerPerfis();
  const hoje = new Date().toDateString();
  let enviados = 0;
  let salvar = false;

  for (const p of perfis) {
    try {
      if (!p.email) continue;
      const st = statusAtual(p);
      if (!st.temAcesso) continue;
      if (p._ultimoDigest === hoje) continue;

      // Recalcula os editais do ramo (sem marcar como vistos ainda)
      const { filtrados, novos } = await monitorar(p, { marcar: false });
      if (!novos.length) {
        log(`[digest] ${p.nome}: sem editais novos hoje.`);
        continue;
      }

      const top = ordenarPorPrazo(novos).slice(0, 10);
      const { assunto, html } = gerarDigest(p, top);
      await enviar({ para: p.email, assunto, html });

      // Marca todos os vistos atuais para nao reenviar amanha
      await monitorar(p, { marcar: true });
      p._ultimoDigest = hoje;
      salvar = true;
      enviados++;
      log(`[digest] ${p.nome}: enviado para ${p.email} (${novos.length} novos).`);
    } catch (e) {
      log(`[digest] ${p.nome || p.id}: ERRO ${e.message}`);
    }
  }

  if (salvar) {
    const perfisAtual = await lerPerfis();
    for (const p of perfisAtual) {
      const fonte = perfis.find((x) => x.token === p.token);
      if (fonte?._ultimoDigest) p._ultimoDigest = fonte._ultimoDigest;
    }
    await salvarPerfis(perfisAtual);
  }

  log(`[digest] concluido: ${enviados} e-mail(s) enviado(s).`);
  return { enviados };
}

// Loop diario: dorme ate o horario alvo, envia, repete a cada 24h.
export async function digestLoop({ horaBR = 8, log = console.log } = {}) {
  for (;;) {
    const ms = msAteProximoHorario(horaBR);
    const horas = (ms / 3600000).toFixed(1);
    log(`[digest] proximo envio em ${horas}h (alvo: ${horaBR}h Brasilia).`);
    await dormir(ms);
    try { await enviarDigestDoDia({ log }); }
    catch (e) { log(`[digest] erro no ciclo: ${e.message}`); }
  }
}
