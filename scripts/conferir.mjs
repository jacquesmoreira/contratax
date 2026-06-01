// CLI da Camada 4: confere se a empresa esta apta a um edital.
//
// Uso:
//   node scripts/conferir.mjs <id-do-edital>   confere um edital especifico
//   node scripts/conferir.mjs                  confere o primeiro edital do painel
//
// A saude documental da empresa roda sempre. O cruzamento edital x empresa via IA
// roda se houver ANTHROPIC_API_KEY; sem chave, fica em modo de prontidao.

import "../src/env.mjs"; // carrega .env antes de tudo
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buscarPorId } from "../src/db.mjs";
import { conferir, simular } from "../src/aptidao.mjs";
import { temChave } from "../src/ia.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONE = { valida: "OK ", atende: "OK ", vencida: "!! ", ausente: "?? ", nao_atende: "XX ", confirmar: ".. " };

process.on("unhandledRejection", (e) => {
  console.error(`\nErro: ${e.message}`);
  process.exit(1);
});

async function resolverEdital(id) {
  if (id) {
    const e = buscarPorId(id);
    if (!e) throw new Error(`Edital ${id} nao encontrado`);
    return e;
  }
  const dados = JSON.parse(await readFile(resolve(RAIZ, "data", "resultados.json"), "utf8"));
  const primeiro = Object.values(dados)[0]?.editais?.[0];
  if (!primeiro) throw new Error("Nenhum edital no painel. Rode npm run buscar antes.");
  return primeiro;
}

const empresa = JSON.parse(await readFile(resolve(RAIZ, "empresa.json"), "utf8"));
const edital = await resolverEdital(process.argv[2]);

console.log(`Empresa: ${empresa.razaoSocial} (${empresa.porte})`);
console.log(`Edital:  ${edital.id} - ${(edital.objeto || "").slice(0, 60)}\n`);

// Parte 1: saude documental da empresa (sempre roda, sem chave).
console.log("== SAUDE DOCUMENTAL DA EMPRESA (sem IA) ==");
const { saude } = simular(empresa);
for (const i of saude.itens) {
  console.log(` ${ICONE[i.situacao] ?? "   "}${i.documento}${i.validade ? ` (vence ${i.validade})` : ""} -> ${i.situacao}`);
}
console.log(saude.regular ? "\nDocumentacao em dia." : `\n${saude.pendencias.length} pendencia(s) a regularizar antes de qualquer disputa.`);

// Parte 2: cruzamento com o edital (precisa de chave).
console.log("\n== APTIDAO NESTE EDITAL (cruzamento via IA) ==");
if (!temChave()) {
  console.log("Modo de prontidao: defina ANTHROPIC_API_KEY para o veredito apto/nao-apto.");
  console.log('PowerShell:  $env:ANTHROPIC_API_KEY = "sua-chave"');
} else {
  const { aptidao, cache } = await conferir(edital, empresa);
  console.log(cache ? "(do cache)" : "(novo)");
  console.log(`\nVEREDITO: ${aptidao.veredito.toUpperCase()}`);
  console.log(aptidao.resumo + "\n");
  for (const it of aptidao.itens ?? []) {
    console.log(` ${ICONE[it.situacao] ?? "   "}${it.exigencia}: ${it.observacao}`);
  }
  if (aptidao.pendencias?.length) console.log("\nPendencias:\n - " + aptidao.pendencias.join("\n - "));
  if (aptidao.proximosPassos?.length) console.log("\nProximos passos:\n - " + aptidao.proximosPassos.join("\n - "));
}
