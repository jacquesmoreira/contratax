// Memoria do que ja foi visto, por perfil de busca.
// Guarda os IDs de editais ja entregues para nao alertar a mesma coisa duas vezes.
// Persistencia simples em arquivo JSON (suficiente para o MVP; trocavel por banco depois).

import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";

const ARQUIVO = resolve(DATA_DIR, "vistos.json");
const ARQUIVO_RESULTADOS = resolve(DATA_DIR, "resultados.json");

// Leitura TOLERANTE a arquivo corrompido. Antes, um JSON truncado fazia o
// JSON.parse lancar e o erro subia, derrubando quem chamou. Como esses arquivos
// sao lidos no laco que percorre TODOS os clientes (digest, atualizador), um
// unico arquivo corrompido parava o servico inteiro pra todo mundo — foi
// exatamente o que aconteceu em 20/07/2026 (resultados.json de 8,5MB truncado,
// "[digest] concluido: 0 e-mail(s) enviado(s)" por dias, cliente pagante
// reclamando que nao recebia alerta).
//
// Agora: JSON invalido cai no padrao (como se o arquivo nao existisse) e o
// arquivo ruim e movido pra .corrompido, preservado pra diagnostico. Os dados
// desses arquivos sao CACHE regeneravel (o proximo ciclo do atualizador
// reescreve), entao seguir com o padrao e melhor que travar todo mundo.
async function lerJSON(caminho, padrao) {
  let bruto;
  try {
    bruto = await readFile(caminho, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return padrao;
    throw e;
  }
  try {
    return JSON.parse(bruto);
  } catch (e) {
    console.error(`[store] ${basename(caminho)} corrompido (${e.message}). Isolando e seguindo com valor padrao.`);
    try { await rename(caminho, `${caminho}.corrompido`); } catch {}
    return padrao;
  }
}

// Escrita ATOMICA: grava num temporario e so entao renomeia por cima. rename e
// atomico no mesmo sistema de arquivos, entao um leitor sempre ve o arquivo
// ANTIGO completo ou o NOVO completo, nunca um pela metade. Antes era writeFile
// direto: se o processo morresse no meio (restart de deploy, OOM kill do
// Railway), o arquivo ficava truncado — a causa raiz do incidente de 20/07/2026.
async function gravarJSON(caminho, obj) {
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
    await rename(tmp, caminho);
  } catch (e) {
    try { await unlink(tmp); } catch {}
    throw e;
  }
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

const ARQUIVO_NOTAS = resolve(DATA_DIR, "notas.json");

// Anotacoes do cliente por edital (bloco de notas privado da empresa). Estrutura:
// { [token]: { [editalId]: { texto, em } } }. Privado: so o dono ve/edita.
export async function salvarNota(token, editalId, texto) {
  if (!token || !editalId) return null;
  const tudo = await lerJSON(ARQUIVO_NOTAS, {});
  tudo[token] = tudo[token] || {};
  const t = String(texto || "").slice(0, 4000).trim();
  if (t) tudo[token][editalId] = { texto: t, em: new Date().toISOString() };
  else delete tudo[token][editalId]; // texto vazio = apaga a nota
  await gravarJSON(ARQUIVO_NOTAS, tudo);
  return tudo[token][editalId] || null;
}

export async function carregarNota(token, editalId) {
  if (!token || !editalId) return null;
  const tudo = await lerJSON(ARQUIVO_NOTAS, {});
  return tudo[token]?.[editalId] ?? null;
}

const ARQUIVO_ESTAGIOS = resolve(DATA_DIR, "estagios.json");

// Estagios do funil que o cliente decidiu perseguir (Kanban de Planejamento).
// Estrutura: { [token]: { [editalId]: { estagio, edital, criadoEm, atualizadoEm } } }.
// "edital" guarda um retrato (objeto, orgao, uf, valorEstimado, encerramento etc)
// no momento em que foi adicionado, pra o card continuar aparecendo no funil
// mesmo se o edital sair do resultado ao vivo da busca (encerrou, mudou de
// pagina etc). Privado: so o dono ve/edita, igual as notas.
const ESTAGIOS_VALIDOS = ["identificada", "em_analise", "elaborando_proposta", "enviada", "aguardando_resultado", "encerrada"];

export async function salvarEstagio(token, editalId, estagio, edital) {
  if (!token || !editalId || !ESTAGIOS_VALIDOS.includes(estagio)) return null;
  const tudo = await lerJSON(ARQUIVO_ESTAGIOS, {});
  tudo[token] = tudo[token] || {};
  const existente = tudo[token][editalId];
  tudo[token][editalId] = {
    estagio,
    edital: edital || existente?.edital || null,
    criadoEm: existente?.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
  await gravarJSON(ARQUIVO_ESTAGIOS, tudo);
  return tudo[token][editalId];
}

export async function removerEstagio(token, editalId) {
  if (!token || !editalId) return false;
  const tudo = await lerJSON(ARQUIVO_ESTAGIOS, {});
  if (!tudo[token] || !tudo[token][editalId]) return false;
  delete tudo[token][editalId];
  await gravarJSON(ARQUIVO_ESTAGIOS, tudo);
  return true;
}

// Devolve os editais planejados de um cliente, ja agrupados por estagio.
export async function carregarEstagios(token) {
  if (!token) return {};
  const tudo = await lerJSON(ARQUIVO_ESTAGIOS, {});
  const meus = tudo[token] || {};
  const grupos = Object.fromEntries(ESTAGIOS_VALIDOS.map((e) => [e, []]));
  for (const [editalId, item] of Object.entries(meus)) {
    if (!grupos[item.estagio]) continue; // estagio invalido/legado: ignora
    grupos[item.estagio].push({ id: editalId, ...item });
  }
  for (const lista of Object.values(grupos)) lista.sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));
  return grupos;
}

export { ESTAGIOS_VALIDOS };
