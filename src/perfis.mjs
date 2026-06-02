// Camada compartilhada de acesso a perfis.json. Cada perfil = uma EMPRESA (conta),
// que pode ter varios usuarios (equipe) sob o mesmo CNPJ.
//
// Centraliza a leitura/escrita e a migracao de contas antigas (que tinham um unico
// login no topo do perfil) para o novo modelo com lista de usuarios.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PERFIS } from "./caminhos.mjs";

export { PERFIS };

export async function lerPerfis() {
  try {
    return JSON.parse(await readFile(PERFIS, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      // Primeira execucao no Railway: cria o arquivo vazio no volume.
      await salvarPerfis([]);
      return [];
    }
    throw e;
  }
}

export async function salvarPerfis(perfis) {
  await mkdir(dirname(PERFIS), { recursive: true });
  await writeFile(PERFIS, JSON.stringify(perfis, null, 2), "utf8");
}

export const normEmail = (e) => (e || "").trim().toLowerCase();

// Migracao em memoria: garante que o perfil tem lista de usuarios e assentos.
// Conta legada (email/senhaHash no topo) vira o usuario admin da empresa.
export function garantirUsuarios(perfil) {
  if (!Array.isArray(perfil.usuarios) || perfil.usuarios.length === 0) {
    perfil.usuarios = [{
      id: "u-" + (perfil.id || "admin"),
      nome: perfil.nome || (perfil.email ? perfil.email.split("@")[0] : "Administrador"),
      email: perfil.email || null,
      senhaHash: perfil.senhaHash || null,
      papel: "admin",
      criadoEm: perfil.assinatura?.criadoEm || new Date().toISOString(),
    }];
  }
  if (typeof perfil.assentos !== "number" || perfil.assentos < 1) perfil.assentos = 1;
  return perfil;
}
