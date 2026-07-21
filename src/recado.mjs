// Recado (aviso/broadcast) do admin pros clientes. Dois tipos:
//   - GERAL: um recado pra todos os clientes (broadcast).
//   - INDIVIDUAL: um recado pra um cliente especifico (por token).
// O cliente ve o INDIVIDUAL com prioridade; se nao tiver, ve o GERAL.
//
// Guardado num JSON no volume de dados, sem banco:
//   { geral: <recado|null>, porCliente: { <token>: <recado> } }
// onde <recado> = { id, titulo, texto, criadoEm, ativo }.
//
// O `id` (timestamp da publicacao) faz o cliente ver o recado DE NOVO: o painel
// guarda no localStorage o id do ultimo visto; id diferente => modal reaparece.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";

const ARQ = resolve(DATA_DIR, "recado.json");

// Le o arquivo cru e normaliza pro formato novo. Migra o formato antigo (quando
// o arquivo era um unico recado no topo) pra { geral, porCliente }.
async function lerBruto() {
  let dados;
  try {
    dados = JSON.parse(await readFile(ARQ, "utf8"));
  } catch {
    return { geral: null, porCliente: {} };
  }
  if (dados && (dados.geral !== undefined || dados.porCliente !== undefined)) {
    return { geral: dados.geral || null, porCliente: dados.porCliente || {} };
  }
  // Formato antigo (recado unico) -> vira o geral.
  if (dados && dados.texto) return { geral: dados, porCliente: {} };
  return { geral: null, porCliente: {} };
}

async function gravar(estado) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ARQ, JSON.stringify(estado, null, 2), "utf8");
}

function ativo(r) {
  return r && r.ativo && r.texto ? r : null;
}

// Recado que ESTE cliente deve ver. Individual tem prioridade sobre o geral.
export async function lerRecadoPara(token) {
  const e = await lerBruto();
  return ativo(token ? e.porCliente[token] : null) || ativo(e.geral) || null;
}

// Estado completo pro painel admin: o geral + a lista de individuais ativos.
export async function estadoRecados() {
  const e = await lerBruto();
  const individuais = Object.entries(e.porCliente)
    .filter(([, r]) => r && r.ativo)
    .map(([token, r]) => ({ token, ...r }));
  return { geral: e.geral, individuais };
}

// Publica um recado. destino = "todos" (geral) ou o token de um cliente.
export async function salvarRecado({ titulo = "", texto = "", destino = "todos" } = {}) {
  const t = String(texto || "").trim();
  if (!t) throw new Error("O texto do recado nao pode ficar vazio.");
  const recado = {
    id: Date.now(),
    titulo: String(titulo || "").trim().slice(0, 120),
    // 6000: o teto anterior (2000) cortou de verdade um recado de 2.535
    // caracteres em 21/07/2026. Recado de suporte, explicando um problema com
    // passo a passo, passa dos 2000 com facilidade. O limite existe so pra
    // evitar abuso/arquivo gigante, entao pode ser folgado.
    texto: t.slice(0, 6000),
    criadoEm: new Date().toISOString(),
    ativo: true,
  };
  const e = await lerBruto();
  if (!destino || destino === "todos") e.geral = recado;
  else e.porCliente[destino] = recado;
  await gravar(e);
  return recado;
}

// Tira um recado do ar. destino = "todos" (geral) ou o token do cliente.
export async function limparRecado({ destino = "todos" } = {}) {
  const e = await lerBruto();
  if (!destino || destino === "todos") {
    if (e.geral) e.geral.ativo = false;
  } else if (e.porCliente[destino]) {
    delete e.porCliente[destino]; // individual some de vez (nao precisa guardar)
  }
  await gravar(e);
  return { ok: true };
}
