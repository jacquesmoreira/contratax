// Admin: ativa (ou renova) a assinatura de um cliente apos confirmar o Pix.
//
// Uso:
//   node scripts/ativar.mjs <token>          ativa por 30 dias
//   node scripts/ativar.mjs <token> 60       ativa por 60 dias

import "../src/env.mjs";
import { ativarPorToken } from "../src/assinatura.mjs";

const token = process.argv[2];
const dias = Number(process.argv[3] || 30);
if (!token) {
  console.log("Uso: node scripts/ativar.mjs <token> [dias]");
  process.exit(1);
}

try {
  const p = await ativarPorToken(token, dias);
  const ate = new Date(p.assinatura.expiraEm).toLocaleDateString("pt-BR");
  console.log(`Cliente "${p.nome}" ATIVADO por ${dias} dias (ate ${ate}).`);
} catch (e) {
  console.log("Erro:", e.message);
  process.exit(1);
}
