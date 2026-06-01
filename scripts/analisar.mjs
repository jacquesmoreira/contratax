// CLI da Camada 3: analisa um edital com IA.
//
// Uso:
//   node scripts/analisar.mjs <id-do-edital>   analisa um edital especifico
//   node scripts/analisar.mjs                  analisa o primeiro edital do painel
//
// Sem ANTHROPIC_API_KEY no ambiente, roda em modo SIMULACAO (valida tudo menos a chamada).

import "../src/env.mjs"; // carrega .env antes de tudo
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buscarPorId } from "../src/db.mjs";
import { analisarEdital, simular } from "../src/analise.mjs";
import { temChave } from "../src/ia.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

process.on("unhandledRejection", (e) => {
  console.error(`\nErro: ${e.message}`);
  process.exit(1);
});

async function resolverEdital(id) {
  if (id) {
    const e = buscarPorId(id);
    if (!e) throw new Error(`Edital ${id} nao encontrado no banco`);
    return e;
  }
  const dados = JSON.parse(await readFile(resolve(RAIZ, "data", "resultados.json"), "utf8"));
  const primeiro = Object.values(dados)[0]?.editais?.[0];
  if (!primeiro) throw new Error("Nenhum edital no painel. Rode npm run buscar antes.");
  return primeiro;
}

const edital = await resolverEdital(process.argv[2]);
console.log(`Edital: ${edital.id}`);
console.log(`Objeto: ${(edital.objeto || "").slice(0, 80)}\n`);

if (!temChave()) {
  console.log("== MODO SIMULACAO (sem ANTHROPIC_API_KEY) ==");
  const s = await simular(edital);
  console.log(`PDF do edital: ${s.pdf.nome}`);
  console.log(`Tamanho: ${(s.pdf.bytes / 1024).toFixed(1)} KB (${s.base64KB} KB em base64)`);
  console.log(`Modelo configurado: ${s.modelo}`);
  console.log(`\nTudo pronto. Defina ANTHROPIC_API_KEY e rode de novo para a analise real.`);
  console.log(`PowerShell:  $env:ANTHROPIC_API_KEY = "sua-chave"`);
} else {
  console.log("Analisando com IA...");
  const { analise, cache, pdf } = await analisarEdital(edital);
  if (pdf) console.log(`(PDF ${pdf.nome}, ${(pdf.bytes / 1024).toFixed(1)} KB)`);
  console.log(cache ? "(resultado do cache)\n" : "\n");
  console.log(JSON.stringify(analise, null, 2));
}
