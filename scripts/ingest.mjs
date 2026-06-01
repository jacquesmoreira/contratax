// CLI do ingest nacional.
//
// Uso:
//   node scripts/ingest.mjs                 crawl nacional completo (todas as modalidades)
//   node scripts/ingest.mjs --limite 3      no maximo 3 paginas por modalidade (teste)
//   node scripts/ingest.mjs --mods 6,8      so essas modalidades
//   node scripts/ingest.mjs --dias 15       editais que encerram nos proximos 15 dias

import { ingerirNacional, MODALIDADES_INGEST } from "../src/ingest.mjs";

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const limite = Number(arg("--limite", Infinity));
const dias = Number(arg("--dias", 30));
const modsArg = arg("--mods", "");
const modalidades = modsArg ? modsArg.split(",").map(Number) : MODALIDADES_INGEST;

console.log(`Ingest nacional | modalidades ${modalidades.join(",")} | encerra em ${dias}d | limite ${limite} pag/mod`);

const inicio = Date.now();
const { totalGravado, stats } = await ingerirNacional({ diasAFrente: dias, modalidades, limitePaginas: limite });
const seg = Math.round((Date.now() - inicio) / 1000);

console.log(`\n================ RESUMO ================`);
console.log(`Linhas gravadas/atualizadas nesta rodada: ${totalGravado.toLocaleString("pt-BR")}`);
console.log(`Acervo total no banco: ${stats.total.toLocaleString("pt-BR")} editais (${stats.abertos.toLocaleString("pt-BR")} ainda abertos)`);
console.log(`Top UFs:`);
for (const { uf, n } of stats.porUf) console.log(`  ${uf ?? "?"}: ${n.toLocaleString("pt-BR")}`);
console.log(`Tempo: ${seg}s`);
