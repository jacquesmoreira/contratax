// Atualizacao dos EDITAIS (oportunidades abertas), in-process, para o Railway:
// ingere o acervo nacional, recalcula a lista de cada cliente e limpa os vencidos.
// Roda na inicializacao e a cada N horas. Compartilha o mesmo volume/banco do
// servidor (volumes nao sao compartilhados entre servicos no Railway).

import { ingerirNacional } from "./ingest.mjs";
import { monitorar } from "./monitor.mjs";
import { removerExpirados, estatisticas } from "./db.mjs";
import { lerPerfis, atualizarPerfil } from "./perfis.mjs";
import { expandirRamo } from "./expandirRamo.mjs";
import { verificarCertidoesVencendo } from "./alertasCertidoes.mjs";
import { disparosOnboarding } from "./onboardingEmails.mjs";
import { verificarRecebiveisAtrasados } from "./alertasRecebiveis.mjs";
import { verificarContratosVencendo } from "./alertasContratos.mjs";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Backfill da expansao semantica (termosIA). Clientes cadastrados ANTES da
// expansao por IA existir ficaram so com os termos crus (ex: "material
// hospitalar"), que casam de forma estrita (todas as palavras juntas) e
// deixam o painel quase vazio. Aqui, uma unica vez por perfil, geramos os
// termos relacionados pra ampliar a busca pro ramo inteiro. So roda quando
// termosIA esta vazio/ausente E ha termos crus, entao nao recobra IA toda hora.
async function garantirTermosIA(perfis, log) {
  for (const p of perfis) {
    const f = p.filtro || {};
    const termos = f.termos || [];
    const jaTem = Array.isArray(f.termosIA) && f.termosIA.length > 0;
    if (!termos.length || jaTem || f._semExpansao) continue;
    try {
      const ia = await expandirRamo(termos);
      await atualizarPerfil(p.token, (x) => {
        x.filtro = x.filtro || {};
        // Marca pra nao reprocessar em loop quando a IA devolve vazio (sem
        // chave/falha): evita gastar chamada toda rodada.
        if (ia.length) x.filtro.termosIA = ia;
        else x.filtro._semExpansao = true;
      });
      if (ia.length) {
        // Reflete no objeto em memoria pra o monitor desta rodada ja usar.
        p.filtro = p.filtro || {}; p.filtro.termosIA = ia;
        log(`[expansao] ${p.nome || p.id}: +${ia.length} termos relacionados (${ia.slice(0,4).join(", ")}...)`);
      }
    } catch (e) { log(`[expansao] ${p.nome || p.id}: ${e.message}`); }
  }
}

export async function atualizarEditais({ limitePaginas = Infinity, log = console.log } = {}) {
  log("[atualizar] ingest nacional de editais...");
  const { totalGravado } = await ingerirNacional({ limitePaginas, log: () => {} });
  log(`[atualizar] ${totalGravado} linhas processadas; recalculando perfis...`);

  const perfis = await lerPerfis();
  // Garante expansao semantica nos perfis antigos ANTES de recalcular a lista.
  try { await garantirTermosIA(perfis, log); } catch (e) { log(`[expansao] erro geral: ${e.message}`); }
  for (const p of perfis) {
    try { await monitorar(p); } catch (e) { log(`[atualizar] perfil ${p.nome || p.id}: ${e.message}`); }
  }
  // Colheita de precos homologados ANTES de remover os encerrados (a base de
  // Pesquisa de Precos cresce a cada ciclo). Teto pequeno + pausa = leve.
  try {
    const { colheitaCiclo } = await import("./colheitaPrecos.mjs");
    await colheitaCiclo({ limite: Number(process.env.LICITA_PRECOS_LOTE || 25), log });
  } catch (e) { log(`[precos] erro: ${e.message}`); }
  // Ingestao incremental do PCA (oportunidades antecipadas), capada por disco.
  try {
    const { ingerirPcaCiclo } = await import("./ingestPca.mjs");
    await ingerirPcaCiclo({ log });
  } catch (e) { log(`[pca] erro: ${e.message}`); }
  const removidos = removerExpirados({ graceDias: 3 });
  // Poda contratos antigos pra manter o banco (e o volume de 5GB) limitado. O
  // backfill cresce sem teto; o historico so usa os ultimos 18 meses. Re-coletavel.
  try {
    const { podarContratosAntigos } = await import("./db.mjs");
    const podados = podarContratosAntigos();
    if (podados) log(`[atualizar] ${podados} contratos antigos podados (fora da janela).`);
  } catch (e) { log(`[poda] erro: ${e.message}`); }
  // Alertas automaticos de certidoes vencendo (so se e-mail configurado)
  try { await verificarCertidoesVencendo({ log }); } catch (e) { log(`[alertas] erro: ${e.message}`); }
  // Sequencia de onboarding (3 e-mails nos primeiros 6 dias do cadastro)
  try { await disparosOnboarding({ log }); } catch (e) { log(`[onboarding] erro: ${e.message}`); }
  // Reengajamento diario dos nao-convertidos roda no digestLoop (1x/dia,
  // horario controlado), nao aqui no loop de 6h.
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
