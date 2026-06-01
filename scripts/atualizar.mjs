// Job UNICO de atualizacao da plataforma. E ISTO que sera agendado para rodar
// sozinho todos os dias (cron no servidor, ou Agendador de Tarefas no Windows).
//
// Faz, em ordem:
//   1. INGEST nacional   (busca editais novos e atualiza os existentes no banco)
//   2. MATCHING           (recalcula a lista de cada cliente e marca os novos)
//   3. LIMPEZA            (remove editais ja encerrados ha dias)
//
// Uso:
//   node scripts/atualizar.mjs              ciclo completo (producao)
//   node scripts/atualizar.mjs --limite 3   ingest curto, para teste

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingerirNacional } from "../src/ingest.mjs";
import { monitorar } from "../src/monitor.mjs";
import { removerExpirados, estatisticas } from "../src/db.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--limite");
const limite = i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : Infinity;

const carimbo = () => new Date().toLocaleString("pt-BR");
console.log(`\n[${carimbo()}] === INICIANDO ATUALIZACAO ===\n`);

// 1. Ingest nacional
console.log("1/3 Ingest nacional...");
const { totalGravado } = await ingerirNacional({ limitePaginas: limite });
console.log(`    ${totalGravado.toLocaleString("pt-BR")} linhas processadas.`);

// 2. Matching de todos os perfis
console.log("\n2/3 Recalculando perfis dos clientes...");
const perfis = JSON.parse(await readFile(resolve(RAIZ, "perfis.json"), "utf8"));
for (const perfil of perfis) {
  const { filtrados, novos } = await monitorar(perfil);
  console.log(`    ${perfil.nome}: ${filtrados.length} editais (${novos.length} novos)`);
}

// 3. Limpeza dos vencidos
console.log("\n3/3 Removendo editais encerrados...");
const removidos = removerExpirados({ graceDias: 3 });
console.log(`    ${removidos.toLocaleString("pt-BR")} editais vencidos removidos.`);

const s = estatisticas();
console.log(`\n[${carimbo()}] === CONCLUIDO ===`);
console.log(`Acervo: ${s.total.toLocaleString("pt-BR")} editais (${s.abertos.toLocaleString("pt-BR")} abertos)`);
