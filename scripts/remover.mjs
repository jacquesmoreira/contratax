// Admin: remove um cliente (pelo token). Util para limpar testes ou cancelar.
//
// Uso: node scripts/remover.mjs <token>

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PERFIS = resolve(RAIZ, "perfis.json");

const token = process.argv[2];
if (!token) {
  console.log("Uso: node scripts/remover.mjs <token>");
  process.exit(1);
}

const perfis = JSON.parse(await readFile(PERFIS, "utf8"));
const alvo = perfis.find((p) => p.token === token);
if (!alvo) {
  console.log(`Token ${token} nao encontrado.`);
  process.exit(1);
}

const restantes = perfis.filter((p) => p.token !== token);
await writeFile(PERFIS, JSON.stringify(restantes, null, 2), "utf8");
console.log(`Cliente "${alvo.nome}" removido. Restam ${restantes.length} cliente(s).`);
