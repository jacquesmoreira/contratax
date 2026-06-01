// Caminhos dos dados graváveis, num lugar só. Por padrão ficam dentro do projeto
// (data/ e perfis.json na raiz), igual ao desenvolvimento local. Em produção
// (Railway), aponte para um VOLUME PERSISTENTE com as variáveis:
//   LICITA_DATA_DIR=/data            (banco, caches, progresso, custos)
//   LICITA_PERFIS=/data/perfis.json  (contas dos clientes)
// Assim o disco não zera a cada deploy.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = process.env.LICITA_DATA_DIR || resolve(RAIZ, "data");
export const PERFIS = process.env.LICITA_PERFIS || resolve(RAIZ, "perfis.json");
