// Job de ingestao nacional. Percorre as modalidades no Brasil inteiro (sem filtro
// de UF) e grava cada pagina no banco. Roda em background, devagar, uma vez por dia.

import { paginarEditais, MODALIDADES } from "./pncp.mjs";
import { upsertEditais, estatisticas } from "./db.mjs";

// Modalidades disputaveis online + compra direta (lances e dispensa/inexigibilidade).
export const MODALIDADES_INGEST = [6, 8, 9, 4, 12, 1];

// Ingere o acervo nacional. `limitePaginas` permite rodadas curtas de teste.
export async function ingerirNacional({
  diasAFrente = 30,
  modalidades = MODALIDADES_INGEST,
  limitePaginas = Infinity,
  log = console.log,
} = {}) {
  let totalGravado = 0;

  for (const modalidade of modalidades) {
    const nome = MODALIDADES[modalidade] ?? `modalidade ${modalidade}`;
    log(`\n== ${nome} (cod ${modalidade}) ==`);
    let ultimaPagina = 0;
    try {
      for await (const { editais, pagina, totalPaginas } of paginarEditais({ diasAFrente, modalidade, uf: null })) {
        upsertEditais(editais);
        totalGravado += editais.length;
        ultimaPagina = pagina;
        log(`  pagina ${pagina}/${totalPaginas} (+${editais.length})`);
        if (pagina >= limitePaginas) {
          log(`  [limite de ${limitePaginas} paginas atingido para teste]`);
          break;
        }
      }
    } catch (err) {
      // Uma modalidade que falha (ex: bloqueio do WAF) nao derruba as demais.
      log(`  interrompido na pagina ${ultimaPagina}: ${err.message}`);
    }
  }

  return { totalGravado, stats: estatisticas() };
}
