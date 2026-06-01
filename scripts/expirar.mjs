// Utilitario de teste: faz a assinatura de um cliente vencer (para ver o muro
// de pagamento). Tambem serve para suspender um cliente.
//
// Uso: node scripts/expirar.mjs <token>

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PERFIS = resolve(RAIZ, "perfis.json");

const token = process.argv[2];
if (!token) {
  console.log("Uso: node scripts/expirar.mjs <token>");
  process.exit(1);
}

const perfis = JSON.parse(await readFile(PERFIS, "utf8"));
const p = perfis.find((x) => x.token === token);
if (!p) {
  console.log(`Token ${token} nao encontrado.`);
  process.exit(1);
}
p.assinatura = { ...(p.assinatura || {}), status: "teste", expiraEm: new Date(Date.now() - 864e5).toISOString() };
await writeFile(PERFIS, JSON.stringify(perfis, null, 2), "utf8");
console.log(`Cliente "${p.nome}" agora esta VENCIDO. Abra /painel?c=${token} para ver o muro de pagamento.`);
