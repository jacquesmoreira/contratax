// CLI do ingest de contratos.
//
// Uso:
//   node scripts/ingest-contratos.mjs                 ultimos 18 meses (completo, horas)
//   node scripts/ingest-contratos.mjs --meses 1 --limite 4   teste curto

import { ingerirContratos } from "../src/ingestContratos.mjs";

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const meses = Number(arg("--meses", 18));
const limite = Number(arg("--limite", Infinity));
console.log(`Ingest de contratos | ${meses} meses | limite ${limite} pag/mes`);

const inicio = Date.now();
const { total, stats } = await ingerirContratos({ meses, limitePaginasPorMes: limite });
const seg = Math.round((Date.now() - inicio) / 1000);

console.log(`\n================ RESUMO ================`);
console.log(`Linhas gravadas/atualizadas: ${total.toLocaleString("pt-BR")}`);
console.log(`Acervo de contratos: ${stats.total.toLocaleString("pt-BR")} | vencendo em 6 meses: ${stats.vencendo6m.toLocaleString("pt-BR")}`);
console.log(`Por categoria:`);
for (const { categoria_nome, n } of stats.porCategoria) console.log(`  ${categoria_nome ?? "?"}: ${n.toLocaleString("pt-BR")}`);
console.log(`Tempo: ${seg}s`);
