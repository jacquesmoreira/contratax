// Admin: lista todos os clientes e o estado da assinatura de cada um.
//
// Uso: node scripts/clientes.mjs

import "../src/env.mjs";
import { listarClientes } from "../src/assinatura.mjs";

const cs = await listarClientes();
console.log(`\n${cs.length} cliente(s):\n`);
for (const c of cs) {
  const exp = c.expiraEm ? new Date(c.expiraEm).toLocaleDateString("pt-BR") : "-";
  const dias = c.diasRestantes != null ? ` (${c.diasRestantes}d)` : "";
  const marca = c.temAcesso ? "[ ATIVO ]" : "[VENCIDO]";
  console.log(`${marca} ${c.nome}`);
  console.log(`          status: ${c.status}${dias} | expira: ${exp} | ${c.email || "sem email"}`);
  console.log(`          token: ${c.token}\n`);
}
