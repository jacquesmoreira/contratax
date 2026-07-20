// Backfill CONTINUO e resumivel dos contratos do PNCP. Diferente do ingest simples,
// guarda o progresso (quais meses ja foram baixados por inteiro) em disco, para
// poder parar e retomar sem refazer tudo. Pacing gentil para nao tomar bloqueio do
// WAF do PNCP. Feito para rodar como worker sempre-ligado (ex: Railway).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { paginarContratos } from "./pncp.mjs";
import { upsertContratos, estatisticasContratos } from "./db.mjs";
import { DATA_DIR } from "./caminhos.mjs";

const DIR = DATA_DIR;
const PROG = resolve(DIR, "backfill-contratos.json");

const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const chaveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

async function lerProgresso() {
  try { return JSON.parse(await readFile(PROG, "utf8")); }
  catch { return { mesesCompletos: [], atualizadoEm: null, totalGravado: 0 }; }
}
async function salvarProgresso(p) {
  await mkdir(DIR, { recursive: true });
  await writeFile(PROG, JSON.stringify(p, null, 2), "utf8");
}

// Faz UMA passada do mais recente ao mais antigo (ate `meses`), pulando os meses
// ja completos. O mes corrente nunca e marcado como completo (ainda entram contratos).
// `sinal.parar` permite encerrar com elegancia entre paginas.
export async function backfillContratos({
  meses = 18, pausaPagina = 2000, pausaMes = 4000, limitePaginasPorMes = Infinity,
  margemDiasMesCorrente = 3, log = console.log, sinal = null,
} = {}) {
  const prog = await lerProgresso();
  const completos = new Set(prog.mesesCompletos);
  const hoje = new Date();

  for (let m = 0; m < meses; m++) {
    if (sinal?.parar) { log("[backfill] parado a pedido"); break; }

    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
    const chave = chaveMes(ref);
    const mesCorrente = m === 0;

    if (completos.has(chave) && !mesCorrente) { log(`[backfill] ${chave} ja completo, pulando`); continue; }

    // Mes corrente: dataInicial/dataFinal do PNCP filtram por DATA DE PUBLICACAO
    // (confirmado no OpenAPI oficial), que e imutavel uma vez publicada - nao existe
    // "contrato atrasado" reaparecendo com data anterior. Por isso, em vez de sempre
    // revarrer do dia 1 do mes (redundante: por volta do dia 20, revarria ~20 dias
    // de novo a cada passada de 6h so pra pegar as ultimas horas), comeca so
    // `margemDiasMesCorrente` dias atras (com folga de seguranca). Quando o mes vira,
    // o fechamento (bloco abaixo, ramo !mesCorrente) ainda faz UMA varredura completa
    // do mes inteiro antes de marca-lo como completo, entao qualquer lacuna dessa
    // janela estreita e coberta ali.
    let ini = ref;
    if (mesCorrente) {
      const limiteMargem = new Date(hoje);
      limiteMargem.setDate(limiteMargem.getDate() - margemDiasMesCorrente);
      if (limiteMargem > ref) ini = limiteMargem;
    }
    const fim = mesCorrente ? hoje : new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    log(`[backfill] == ${chave} (${fmt(ini)}..${fmt(fim)}) ==`);

    let okMes = true;
    let gravadoMes = 0;
    try {
      for await (const { contratos, pagina, totalPaginas } of paginarContratos({ dataInicial: fmt(ini), dataFinal: fmt(fim) })) {
        upsertContratos(contratos);
        gravadoMes += contratos.length;
        prog.totalGravado = (prog.totalGravado || 0) + contratos.length;
        log(`[backfill]   ${chave} pag ${pagina}/${totalPaginas} (+${contratos.length})`);
        if (pagina >= limitePaginasPorMes) { okMes = false; log(`[backfill]   [limite de ${limitePaginasPorMes} pag/mes]`); break; }
        await dormir(pausaPagina);
        if (sinal?.parar) { okMes = false; break; }
      }
    } catch (e) {
      okMes = false;
      log(`[backfill]   ${chave} interrompido: ${e.message}`);
    }

    // So marca o mes como concluido se varreu ate o fim sem erro (e nao e o corrente).
    if (okMes && !mesCorrente) completos.add(chave);
    prog.mesesCompletos = [...completos].sort();
    prog.atualizadoEm = new Date().toISOString();
    await salvarProgresso(prog);
    log(`[backfill]   ${chave} fechado (+${gravadoMes} no mes). Meses completos: ${completos.size}/${meses}`);

    await dormir(pausaMes);
  }

  return { stats: estatisticasContratos(), progresso: prog };
}

// Loop infinito: faz o backfill, depois dorme e refaz (re-pega o mes corrente para
// manter o frescor e tenta meses que ficaram pendentes por erro). Para com sinal.parar.
export async function backfillLoop({ meses = 18, intervaloHoras = 6, log = console.log, sinal = null, ...opts } = {}) {
  while (!sinal?.parar) {
    log(`\n[backfill] ===== passada iniciada ${new Date().toISOString()} =====`);
    const { stats, progresso } = await backfillContratos({ meses, log, sinal, ...opts });
    log(`[backfill] passada concluida. Acervo: ${stats.total.toLocaleString("pt-BR")} contratos | meses completos: ${progresso.mesesCompletos.length}/${meses}`);
    if (sinal?.parar) break;
    log(`[backfill] dormindo ${intervaloHoras}h ate a proxima passada...`);
    await dormir(intervaloHoras * 3600 * 1000);
  }
}
