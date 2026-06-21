// Indexador de ITENS dos editais ABERTOS — a busca universal por produto.
//
// O objeto do edital e de alto nivel ("material hospitalar"); o produto
// especifico ("atadura", "cimento") mora nos itens. Indexando os itens, a busca
// acha qualquer produto/servico de qualquer nicho SEM lista curada de sinonimos.
//
// Caminho B (incremental, leve e seguro):
//   - Roda no ciclo do atualizador, so se LICITA_ITENS_INDEX=1 (gated).
//   - Pega um lote pequeno de editais abertos ainda nao indexados.
//   - Busca os itens no PNCP (listarItens), grava descricao normalizada.
//   - Throttle entre chamadas; CAP de linhas pra nao estourar o volume.
//   - A poda (editais expirados) e feita pelo removerExpirados.

import { listarItens } from "./documentos.mjs";
import { editaisPraIndexarItens, upsertItensEdital, marcarItensIndexados, totalItensEdital } from "./db.mjs";

const PAUSA = Number(process.env.LICITA_ITENS_PAUSA || 350);
const TETO = Number(process.env.LICITA_ITENS_MAX || 1_200_000); // ~300MB de teto
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function colheitaItensCiclo({ limite = 40, log = console.log } = {}) {
  if (!process.env.LICITA_ITENS_INDEX) return { processados: 0, itens: 0 };

  const total = totalItensEdital();
  if (total >= TETO) {
    log(`[itens] indice no teto (${total} >= ${TETO}); pulando ciclo.`);
    return { processados: 0, itens: 0, teto: true };
  }

  let eds = [];
  try { eds = editaisPraIndexarItens({ limite }); } catch { return { processados: 0, itens: 0 }; }
  if (!eds.length) return { processados: 0, itens: 0 };

  let itens = 0, processados = 0;
  for (const ed of eds) {
    try {
      const lista = await listarItens(ed);
      itens += upsertItensEdital(ed.id, lista);
    } catch {
      // Sem itens no PNCP (ou erro): marca como indexado pra nao reprocessar sempre.
      try { marcarItensIndexados(ed.id); } catch {}
    }
    processados++;
    await dormir(PAUSA);
  }
  log(`[itens] indexados ${itens} itens de ${processados} editais (total no indice: ${totalItensEdital()}).`);
  return { processados, itens };
}
