// Ingest dos contratos. Percorre os ultimos `meses` mes a mes (janelas menores,
// resiliente a quedas) e grava no banco. Base do radar de renovacao e do preco
// dos vencedores. Roda em background; e o crawl mais pesado do sistema.

import { paginarContratos } from "./pncp.mjs";
import { upsertContratos, estatisticasContratos } from "./db.mjs";

const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function ingerirContratos({ meses = 18, limitePaginasPorMes = Infinity, log = console.log } = {}) {
  let total = 0;
  const hoje = new Date();

  for (let m = 0; m < meses; m++) {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() - m + 1, 0); // ultimo dia do mes
    const dataInicial = fmt(ini);
    const dataFinal = fmt(fim);
    log(`\n== mes ${dataInicial}..${dataFinal} ==`);

    let ultima = 0;
    try {
      for await (const { contratos, pagina, totalPaginas } of paginarContratos({ dataInicial, dataFinal })) {
        upsertContratos(contratos);
        total += contratos.length;
        ultima = pagina;
        log(`  pag ${pagina}/${totalPaginas} (+${contratos.length})`);
        if (pagina >= limitePaginasPorMes) {
          log(`  [limite de ${limitePaginasPorMes} paginas/mes atingido]`);
          break;
        }
      }
    } catch (err) {
      log(`  interrompido na pagina ${ultima}: ${err.message}`);
    }
  }

  return { total, stats: estatisticasContratos() };
}
