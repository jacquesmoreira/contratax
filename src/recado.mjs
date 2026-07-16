// Recado (aviso/broadcast) que o admin publica pra todos os clientes verem no
// painel. Um recado ativo por vez (o mais recente vence). Guardado num JSON no
// volume de dados, sem dependencia externa.
//
// O `id` (timestamp da publicacao) e o que faz o cliente ver o recado DE NOVO:
// o painel guarda no localStorage o id do ultimo recado visto; se o id atual for
// diferente, o modal reaparece. Assim um recado novo sempre e mostrado, mas o
// mesmo recado nao fica incomodando depois de lido.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";

const ARQ = resolve(DATA_DIR, "recado.json");

// Le o arquivo cru (ativo ou nao). Uso interno + admin (pra pre-preencher o form).
async function lerBruto() {
  try {
    return JSON.parse(await readFile(ARQ, "utf8"));
  } catch {
    return null;
  }
}

// Recado ATIVO pra entregar ao cliente. null se nao ha nada pra mostrar.
export async function lerRecado() {
  const r = await lerBruto();
  return r && r.ativo && r.texto ? r : null;
}

// Versao pro admin: devolve o ultimo recado gravado mesmo que esteja fora do ar,
// pra ele ver/editar o texto anterior.
export async function lerRecadoAdmin() {
  return await lerBruto();
}

// Publica um recado novo (vira o ativo, com id novo => todos veem de novo).
export async function salvarRecado({ titulo = "", texto = "" } = {}) {
  const t = String(texto || "").trim();
  if (!t) throw new Error("O texto do recado nao pode ficar vazio.");
  const recado = {
    id: Date.now(),
    titulo: String(titulo || "").trim().slice(0, 120),
    texto: t.slice(0, 2000),
    criadoEm: new Date().toISOString(),
    ativo: true,
  };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ARQ, JSON.stringify(recado, null, 2), "utf8");
  return recado;
}

// Tira o recado do ar (mantem o texto no arquivo, so marca ativo=false).
export async function limparRecado() {
  const r = await lerBruto();
  if (r) {
    r.ativo = false;
    await writeFile(ARQ, JSON.stringify(r, null, 2), "utf8");
  }
  return { ativo: false };
}
