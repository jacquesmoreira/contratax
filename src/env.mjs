// Carrega variaveis do arquivo .env (se existir), dando prioridade a ele.
// A chave da IA fica so na maquina, num arquivo nao versionado, sem passar por
// linha de comando. Importar este modulo no topo de um script ja basta.
//
// Parser proprio (em vez de process.loadEnvFile) porque o loadEnvFile do Node nao
// sobrescreve variaveis ja presentes no ambiente, e alguns ambientes deixam a
// ANTHROPIC_API_KEY definida como vazia. Aqui o .env sempre vence.

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arquivo = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

if (existsSync(arquivo)) {
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith("#")) continue;
    const sep = texto.indexOf("=");
    if (sep < 0) continue;
    const chave = texto.slice(0, sep).trim();
    let valor = texto.slice(sep + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (chave) process.env[chave] = valor; // o .env tem prioridade
  }
}
