// Camada compartilhada de acesso a perfis.json. Cada perfil = uma EMPRESA (conta),
// que pode ter varios usuarios (equipe) sob o mesmo CNPJ.
//
// Centraliza a leitura/escrita e a migracao de contas antigas (que tinham um unico
// login no topo do perfil) para o novo modelo com lista de usuarios.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { PERFIS } from "./caminhos.mjs";

export { PERFIS };

// Mesmo separador de ramos usado no cadastro (inline aqui pra evitar import
// circular com cadastro.mjs). Auto-cura perfis cujos termos foram salvos como
// 1 string gigante com bullets (cliente colou lista com • em vez de virgula).
const SEP_RAMOS = /[,;•·|\n\r]+/;
function normalizarTermos(perfis) {
  for (const p of perfis) {
    const t = p?.filtro?.termos;
    if (Array.isArray(t) && t.some((x) => SEP_RAMOS.test(x))) {
      p.filtro.termos = t.flatMap((x) => String(x).split(SEP_RAMOS)).map((s) => s.trim()).filter(Boolean);
    }
  }
  return perfis;
}

export async function lerPerfis() {
  try {
    return normalizarTermos(JSON.parse(await readFile(PERFIS, "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") {
      // Arquivo nao existe ainda (primeiro uso). Retorna lista vazia SEM criar
      // o arquivo — so salvarPerfis() cria o arquivo quando ha dados reais.
      return [];
    }
    throw e;
  }
}

// Fila de escrita: serializa salvarPerfis pra duas requisicoes nao escreverem
// o arquivo ao mesmo tempo (interleave de await). Node e single-thread, mas os
// awaits podem se intercalar; a fila garante uma escrita por vez.
let _filaEscrita = Promise.resolve();

// Escrita ATOMICA: grava num .tmp e renomeia. O rename e atomico no SO, entao
// o perfis.json nunca fica truncado/corrompido se o processo cair no meio da
// escrita (era o risco catastrofico: arquivo corrompido = todas as contas).
export async function salvarPerfis(perfis) {
  const tarefa = _filaEscrita.then(async () => {
    await mkdir(dirname(PERFIS), { recursive: true });
    const tmp = `${PERFIS}.tmp`;
    await writeFile(tmp, JSON.stringify(perfis, null, 2), "utf8");
    await rename(tmp, PERFIS);
  });
  // Mantem a fila viva mesmo se uma escrita falhar (nao trava as proximas).
  _filaEscrita = tarefa.catch(() => {});
  return tarefa;
}

// Atualizacao RACE-SAFE de UM perfil: le, muta so esse e grava, tudo dentro da
// fila serializada. Use isto em caminhos quentes (digest, webhook, edicao) pra
// evitar lost-update (um salvarPerfis(array) sobrescrevendo o de outra request).
// mutador(perfil) recebe o perfil encontrado e o altera in-place; retorna o
// proprio perfil atualizado, ou null se nao achou.
export async function atualizarPerfil(token, mutador) {
  let resultado = null;
  const tarefa = _filaEscrita.then(async () => {
    const perfis = await lerPerfis();
    const p = perfis.find((x) => x.token === token);
    if (!p) return;
    mutador(p);
    resultado = p;
    await mkdir(dirname(PERFIS), { recursive: true });
    const tmp = `${PERFIS}.tmp`;
    await writeFile(tmp, JSON.stringify(perfis, null, 2), "utf8");
    await rename(tmp, PERFIS);
  });
  _filaEscrita = tarefa.catch(() => {});
  await tarefa;
  return resultado;
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
