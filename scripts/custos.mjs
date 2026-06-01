// Relatorio de custo de IA. Uso: node scripts/custos.mjs
// Le data/custos-ia.jsonl e mostra o custo real por analise e a taxa de cache.

import { resumoCustos } from "../src/custo.mjs";

const r = await resumoCustos();
if (!r || !r.chamadas) {
  console.log("Ainda nao ha chamadas de IA registradas. Rode algumas analises e volte aqui.");
  process.exit(0);
}

const brl = (n) => "R$ " + Number(n).toFixed(2).replace(".", ",");
console.log("\n=== CUSTO DE IA (dados reais) ===");
console.log(`Cotacao usada: 1 USD = R$ ${r.usdBrl}`);
console.log(`Chamadas de IA: ${r.chamadas}  |  Analises (conferencias): ${r.analises}`);
console.log(`Leituras de edital (PDF) reais: ${r.leiturasEdital}`);
if (r.cacheHitLeitura != null) {
  console.log(`Taxa de cache na leitura: ${(r.cacheHitLeitura * 100).toFixed(1)}% (quanto maior, mais barato)`);
}
console.log(`\nCusto total ate agora: ${brl(r.brlTotal)} (US$ ${r.usdTotal})`);
console.log(`CUSTO MEDIO POR ANALISE: ${brl(r.custoMedioPorAnaliseBRL)}`);

console.log("\nPor etapa:");
for (const [etapa, v] of Object.entries(r.porEtapa)) {
  console.log(`  ${etapa.padEnd(16)} ${String(v.chamadas).padStart(4)} chamadas | total ${brl(v.brl)} | media ${brl(v.medioBRL)}`);
}

// Projecao simples para calibrar limites.
const medio = r.custoMedioPorAnaliseBRL;
console.log("\nProjecao (ao custo medio atual):");
for (const n of [50, 100, 200, 300]) {
  console.log(`  ${String(n).padStart(3)} analises/mes => ${brl(medio * n)} de custo`);
}
console.log("");
