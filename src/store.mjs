// Memoria do que ja foi visto, por perfil de busca.
// Guarda os IDs de editais ja entregues para nao alertar a mesma coisa duas vezes.
// Persistencia simples em arquivo JSON (suficiente para o MVP; trocavel por banco depois).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
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

const ARQUIVO_TLDRS = resolve(DATA_DIR, "tldrs.json");

// TL;DR do edital (5 linhas geradas por IA). Cache global por edital — mesmo
// resumo serve para todos os clientes que abrirem o mesmo edital.
export async function salvarTldr(id, tldr) {
  const tudo = await lerJSON(ARQUIVO_TLDRS, {});
  tudo[id] = { tldr, geradoEm: new Date().toISOString() };
  await gravarJSON(ARQUIVO_TLDRS, tudo);
}

export async function carregarTldr(id) {
  const tudo = await lerJSON(ARQUIVO_TLDRS, {});
  return tudo[id] ?? null;
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

const ARQUIVO_IMPUGNACOES = resolve(DATA_DIR, "impugnacoes.json");

// Dossie de impugnacao de um edital (mesmo para todos: as clausulas restritivas
// independem da empresa). Cache compartilhado, igual a analise.
export async function salvarImpugnacao(editalId, dados) {
  const tudo = await lerJSON(ARQUIVO_IMPUGNACOES, {});
  tudo[editalId] = { dados, geradaEm: new Date().toISOString() };
  await gravarJSON(ARQUIVO_IMPUGNACOES, tudo);
}
export async function carregarImpugnacao(editalId) {
  const tudo = await lerJSON(ARQUIVO_IMPUGNACOES, {});
  return tudo[editalId] ?? null;
}

const ARQUIVO_LEADS = resolve(DATA_DIR, "leads.json");

// Guarda um interessado capturado pela landing page (e-mail + contexto da busca).
export async function salvarLead(lead) {
  const lista = await lerJSON(ARQUIVO_LEADS, []);
  lista.push({ ...lead, em: new Date().toISOString() });
  await gravarJSON(ARQUIVO_LEADS, lista);
  return lista.length;
}

// Lista os interessados capturados (para o painel admin).
export async function carregarLeads() {
  return lerJSON(ARQUIVO_LEADS, []);
}

const ARQUIVO_FEEDBACK = resolve(DATA_DIR, "feedbacks.json");

// Voz do cliente: sugestoes de melhoria e duvidas/suporte enviadas de dentro do
// painel. Cada item: { id, token, empresa, email, tipo, mensagem, em, lido }.
// tipo = "sugestao" | "suporte". Fica visivel no admin pra Jacques analisar.
export async function salvarFeedback(fb) {
  const lista = await lerJSON(ARQUIVO_FEEDBACK, []);
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    token: fb.token ?? null,
    empresa: fb.empresa ?? null,
    email: fb.email ?? null,
    tipo: fb.tipo === "suporte" ? "suporte" : "sugestao",
    mensagem: String(fb.mensagem || "").slice(0, 4000),
    em: new Date().toISOString(),
    lido: false,
  };
  lista.push(item);
  await gravarJSON(ARQUIVO_FEEDBACK, lista);
  return item;
}

export async function carregarFeedbacks() {
  return lerJSON(ARQUIVO_FEEDBACK, []);
}

// Marca um feedback como lido/nao-lido (toggle) no admin.
export async function alternarFeedbackLido(id) {
  const lista = await lerJSON(ARQUIVO_FEEDBACK, []);
  const it = lista.find((x) => x.id === id);
  if (!it) return null;
  it.lido = !it.lido;
  await gravarJSON(ARQUIVO_FEEDBACK, lista);
  return it;
}
