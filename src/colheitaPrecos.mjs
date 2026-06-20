// Colheita de PRECOS HOMOLOGADOS (Caminho B: incremental e seguro).
//
// Quando um edital ENCERRA (mas ainda esta no banco, dentro da carencia antes de
// ser apagado), buscamos os itens com resultado e o preco UNITARIO real do
// vencedor, guardando numa base que CRESCE com o tempo. Diferente de um crawl
// nacional de uma vez (Caminho A), isso e aditivo, leve e nao martela o PNCP:
// processa um lote pequeno por ciclo, com pausa entre chamadas.

import { listarItens, listarResultadosItem } from "./documentos.mjs";
import { editaisPraColher, upsertPrecos, marcarPrecosColhidos } from "./db.mjs";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSA = Number(process.env.LICITA_PRECOS_PAUSA || 350); // ms entre chamadas (educado com o PNCP)

// Colhe os precos de UM edital encerrado. Best-effort: erro num item nao derruba
// os demais. Devolve quantos precos novos foram gravados.
async function colherEdital(ed) {
  let itens = [];
  try { itens = await listarItens(ed); } catch { return 0; }
  const linhas = [];
  for (const it of itens) {
    if (!it.temResultado) continue;
    await dormir(PAUSA);
    let resultados = [];
    try { resultados = await listarResultadosItem(ed, it.numero); } catch { continue; }
    for (const r of resultados) {
      if (!(Number(r.valorUnitario) > 0)) continue; // ignora preco 0 (credenciamento etc)
      linhas.push({
        chave: `${ed.id}#${it.numero}#${r.sequencial}`,
        editalId: ed.id,
        descricao: it.descricao,
        valorUnitario: r.valorUnitario,
        quantidade: r.quantidade,
        unidade: it.unidade,
        orgao: ed.orgao,
        orgaoCnpj: ed.orgao_cnpj ?? ed.orgaoCnpj ?? null,
        uf: ed.uf,
        municipio: ed.municipio,
        fornecedor: r.fornecedor,
        fornecedorNi: r.fornecedorNi,
        porte: r.porte,
        categoria: it.categoria,
        dataResultado: r.dataResultado,
      });
    }
  }
  try { marcarPrecosColhidos(ed.id); } catch {}
  if (!linhas.length) return 0;
  try { return upsertPrecos(linhas); } catch { return 0; }
}

// Um ciclo de colheita: pega um lote de editais encerrados ainda nao colhidos e
// processa. Chamado pelo atualizador (apos a ingestao), com teto pequeno.
export async function colheitaCiclo({ limite = 25, log = console.log } = {}) {
  let eds = [];
  try { eds = editaisPraColher({ limite }); } catch { return { processados: 0, precos: 0 }; }
  if (!eds.length) return { processados: 0, precos: 0 };
  let precos = 0;
  for (const ed of eds) {
    await dormir(PAUSA);
    try { precos += await colherEdital(ed); } catch {}
  }
  log(`[precos] colheita: ${eds.length} editais processados, +${precos} precos homologados.`);
  return { processados: eds.length, precos };
}
