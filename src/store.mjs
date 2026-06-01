// Memoria do que ja foi visto, por perfil de busca.
// Guarda os IDs de editais ja entregues para nao alertar a mesma coisa duas vezes.
// Persistencia simples em arquivo JSON (suficiente para o MVP; trocavel por banco depois).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";

const ARQUIVO = resolve(DATA_DIR, "vistos.json");
const ARQUIVO_RESULTADOS = resolve(DATA_DIR, "resultados.json");

async function lerJSON(caminho, padrao) {
  try {
    return JSON.parse(await readFile(caminho, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return padrao;
    throw e;
  }
}

async function gravarJSON(caminho, obj) {
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, JSON.stringify(obj, null, 2), "utf8");
}

async function lerArquivo() {
  return lerJSON(ARQUIVO, {});
}

async function gravarArquivo(obj) {
  await gravarJSON(ARQUIVO, obj);
}

// Devolve um Set com os IDs ja vistos para um perfil.
export async function carregarVistos(perfilId) {
  const tudo = await lerArquivo();
  return new Set(tudo[perfilId]?.vistos ?? []);
}

// Marca uma lista de IDs como vistos para um perfil (uniao com os anteriores).
export async function marcarVistos(perfilId, ids) {
  const tudo = await lerArquivo();
  const anteriores = new Set(tudo[perfilId]?.vistos ?? []);
  for (const id of ids) anteriores.add(id);
  tudo[perfilId] = {
    vistos: [...anteriores],
    atualizadoEm: new Date().toISOString(),
  };
  await gravarArquivo(tudo);
}

// Salva os editais que casaram com um perfil, para o painel web ler depois.
// Sobrescreve sempre com a foto mais recente daquele perfil.
export async function salvarResultados(perfil, editais) {
  const tudo = await lerJSON(ARQUIVO_RESULTADOS, {});
  tudo[perfil.id] = {
    nome: perfil.nome,
    uf: perfil.uf,
    atualizadoEm: new Date().toISOString(),
    editais,
  };
  await gravarJSON(ARQUIVO_RESULTADOS, tudo);
}

// Le os resultados de todos os perfis (consumido pelo painel web).
export async function carregarResultados() {
  return lerJSON(ARQUIVO_RESULTADOS, {});
}

const ARQUIVO_ANALISES = resolve(DATA_DIR, "analises.json");

// Guarda a analise de IA de um edital (cache para nao reprocessar nem repagar).
export async function salvarAnalise(id, analise) {
  const tudo = await lerJSON(ARQUIVO_ANALISES, {});
  tudo[id] = { analise, geradaEm: new Date().toISOString() };
  await gravarJSON(ARQUIVO_ANALISES, tudo);
}

// Recupera a analise de um edital, se ja existir.
export async function carregarAnalise(id) {
  const tudo = await lerJSON(ARQUIVO_ANALISES, {});
  return tudo[id] ?? null;
}

const ARQUIVO_CONFERENCIAS = resolve(DATA_DIR, "conferencias.json");

// Guarda a conferencia de aptidao de um edital para uma empresa especifica.
export async function salvarConferencia(editalId, empresaId, dados) {
  const tudo = await lerJSON(ARQUIVO_CONFERENCIAS, {});
  tudo[`${editalId}::${empresaId}`] = { dados, geradaEm: new Date().toISOString() };
  await gravarJSON(ARQUIVO_CONFERENCIAS, tudo);
}

// Recupera a conferencia de um edital para uma empresa, se ja existir.
export async function carregarConferencia(editalId, empresaId) {
  const tudo = await lerJSON(ARQUIVO_CONFERENCIAS, {});
  return tudo[`${editalId}::${empresaId}`] ?? null;
}

const ARQUIVO_LEADS = resolve(DATA_DIR, "leads.json");

// Guarda um interessado capturado pela landing page (e-mail + contexto da busca).
export async function salvarLead(lead) {
  const lista = await lerJSON(ARQUIVO_LEADS, []);
  lista.push({ ...lead, em: new Date().toISOString() });
  await gravarJSON(ARQUIVO_LEADS, lista);
  return lista.length;
}
