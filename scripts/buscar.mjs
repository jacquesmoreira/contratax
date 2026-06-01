// CLI do motor de dados.
// Le perfis.json, roda o monitoramento de cada perfil e imprime os editais novos.
//
// Uso:
//   node scripts/buscar.mjs            roda todos os perfis (marca como vistos)
//   node scripts/buscar.mjs --preview  nao marca como vistos (so olha)

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { monitorar } from "../src/monitor.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preview = process.argv.includes("--preview");

const brl = (v) =>
  v == null ? "nao informado" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const dataBR = (iso) => {
  if (!iso) return "?";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

function imprimirEdital(e, i) {
  console.log(`  ${i + 1}. ${e.municipio ?? "?"}/${e.uf ?? "?"} - ${e.orgao ?? e.unidade ?? "?"}`);
  console.log(`     Objeto: ${e.objeto.slice(0, 110)}`);
  console.log(`     ${e.modalidade ?? "?"} | Estimado: ${brl(e.valorEstimado)} | Encerra: ${dataBR(e.encerramento)}`);
  if (e.link) console.log(`     Link: ${e.link}`);
  console.log("");
}

async function main() {
  const perfis = JSON.parse(await readFile(resolve(RAIZ, "perfis.json"), "utf8"));
  console.log(`\nMotor de dados Licita - ${perfis.length} perfil(is)${preview ? " [PREVIEW: nao marca vistos]" : ""}\n`);

  for (const perfil of perfis) {
    console.log("=".repeat(70));
    const regiao = (perfil.ufs ?? (perfil.uf ? [perfil.uf] : [])).join(", ") || "Brasil";
    console.log(`PERFIL: ${perfil.nome}  (${regiao})`);
    console.log("=".repeat(70));

    try {
      const { total, filtrados, novos } = await monitorar(perfil, { marcar: !preview });
      console.log(`${total} candidatos no acervo | ${filtrados.length} casaram com o filtro | ${novos.length} NOVOS\n`);
      if (novos.length === 0) {
        console.log("  (nenhum edital novo desde a ultima rodada)\n");
      } else {
        novos.forEach(imprimirEdital);
      }
    } catch (err) {
      console.log(`  ERRO ao processar perfil: ${err.message}\n`);
    }
  }
}

main().catch((e) => {
  console.error("Falha geral:", e);
  process.exit(1);
});
