// Atualizacao dos EDITAIS (oportunidades abertas), in-process, para o Railway:
// ingere o acervo nacional, recalcula a lista de cada cliente e limpa os vencidos.
// Roda na inicializacao e a cada N horas. Compartilha o mesmo volume/banco do
// servidor (volumes nao sao compartilhados entre servicos no Railway).

import { ingerirNacional } from "./ingest.mjs";
import { monitorar } from "./monitor.mjs";
import { removerExpirados, estatisticas } from "./db.mjs";
import { lerPerfis } from "./perfis.mjs";
import { verificarCertidoesVencendo } from "./alertasCertidoes.mjs";
import { disparosOnboarding } from "./onboardingEmails.mjs";
import { verificarRecebiveisAtrasados } from "./alertasRecebiveis.mjs";
import { verificarContratosVencendo } from "./alertasContratos.mjs";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function atualizarEditais({ limitePaginas = Infinity, log = console.log } = {}) {
  log("[atualizar] ingest nacional de editais...");
  const { totalGravado } = await ingerirNacional({ limitePaginas, log: () => {} });
  log(`[atualizar] ${totalGravado} linhas processadas; recalculando perfis...`);

  const perfis = await lerPerfis();
  for (const p of perfis) {
    try { await monitorar(p); } catch (e) { log(`[atualizar] perfil ${p.nome || p.id}: ${e.message}`); }
  }
  const removidos = removerExpirados({ graceDias: 3 });
  // Alertas automaticos de certidoes vencendo (so se e-mail configurado)
  try { await verificarCertidoesVencendo({ log }); } catch (e) { log(`[alertas] erro: ${e.message}`); }
  // Sequencia de onboarding (3 e-mails nos primeiros 6 dias do cadastro)
  try { await disparosOnboarding({ log }); } catch (e) { log(`[onboarding] erro: ${e.message}`); }
  try { await verificarRecebiveisAtrasados({ log }); } catch (e) { log(`[recebiveis] erro: ${e.message}`); }
  try { await verificarContratosVencendo({ log }); } catch (e) { log(`[contratos] erro: ${e.message}`); }
  const s = estatisticas();
  log(`[atualizar] concluido. Acervo: ${s.total} editais (${s.abertos} abertos); ${removidos} removidos.`);
  return s;
}

export async function atualizarLoop({ intervaloHoras = 6, log = console.log, ...opts } = {}) {
  for (;;) {
    try { await atualizarEditais({ log, ...opts }); }
    catch (e) { log(`[atualizar] erro: ${e.message}`); }
    log(`[atualizar] proxima atualizacao em ${intervaloHoras}h.`);
    await dormir(intervaloHoras * 3600 * 1000);
  }
}
