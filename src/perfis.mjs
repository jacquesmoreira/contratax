// Camada compartilhada de acesso aos perfis (contas dos clientes). Cada perfil =
// uma EMPRESA (conta), que pode ter varios usuarios (equipe) sob o mesmo CNPJ.
//
// ARMAZENAMENTO: SQLite (tabela `perfis`, um blob JSON por token), migrado do
// antigo perfis.json. Vantagem sobre o arquivo unico: escrita POR LINHA (sem
// reescrever o arquivo inteiro a cada mudanca, sem clobber/lost-update). A API
// publica (lerPerfis/salvarPerfis/atualizarPerfil) e IDENTICA a antes — o resto
// do sistema nao muda. O perfis.json fica preservado como backup pre-migracao.

import { readFile } from "node:fs/promises";
import { PERFIS } from "./caminhos.mjs";
import { abrir } from "./db.mjs";

export { PERFIS };

// Mesmo separador de ramos usado no cadastro (inline aqui pra evitar import
// circular com cadastro.mjs). Auto-cura perfis cujos termos foram salvos como
// 1 string gigante com bullets (cliente colou lista com • em vez de virgula).
const SEP_RAMOS = /[,;•·|\n\r]+/;
// Mesmo teto do cadastro (MAX_TERMOS em cadastro.mjs), repetido aqui pelo mesmo
// motivo do separador: evitar import circular.
const MAX_TERMOS_LEITURA = Number(process.env.LICITA_MAX_TERMOS || 50);
function normalizarTermos(perfis) {
  for (const p of perfis) {
    const t = p?.filtro?.termos;
    if (Array.isArray(t) && t.some((x) => SEP_RAMOS.test(x))) {
      p.filtro.termos = t.flatMap((x) => String(x).split(SEP_RAMOS)).map((s) => s.trim()).filter(Boolean);
    }
    // Teto tambem na LEITURA. O cadastro e a edicao ja barram acima de
    // MAX_TERMOS, mas perfis legados escaparam: quando o separador so quebrava
    // em virgula, uma lista colada com bullets virava 1 termo gigante (passava
    // na trava contando como 1) e so era quebrada aqui, DEPOIS, sem teto nenhum.
    // Resultado real visto em producao: perfil com 200+ ramos casando ~2.900
    // editais, ou seja, "tudo", que e o mesmo que filtro nenhum. Sem esse corte,
    // esses perfis nunca voltam pro limite a menos que o cliente reedite.
    if (Array.isArray(p?.filtro?.termos) && p.filtro.termos.length > MAX_TERMOS_LEITURA) {
      p.filtro.termos = p.filtro.termos.slice(0, MAX_TERMOS_LEITURA);
    }
  }
  return perfis;
}

// Migracao UNICA: na 1a vez, se a tabela estiver vazia, importa do perfis.json.
// O arquivo NAO e apagado (fica como backup). Roda so uma vez por processo.
let _importado = false;
async function garantirImportacao() {
  if (_importado) return;
  _importado = true;
  try {
    const d = abrir();
    const n = d.prepare("SELECT COUNT(*) AS c FROM perfis").get().c;
    if (n > 0) return; // ja migrado
    let arr;
    try { arr = JSON.parse(await readFile(PERFIS, "utf8")); }
    catch (e) { if (e.code !== "ENOENT") console.error("[perfis] leitura do json:", e.message); return; }
    if (!Array.isArray(arr) || !arr.length) return;
    const stmt = d.prepare("INSERT OR REPLACE INTO perfis (token, dados, atualizado_em) VALUES (?, ?, ?)");
    const agora = new Date().toISOString();
    d.exec("BEGIN");
    try {
      let ok = 0;
      for (const p of arr) {
        if (!p || !p.token) { console.warn("[perfis] perfil sem token ignorado na migracao"); continue; }
        stmt.run(p.token, JSON.stringify(p), agora); ok++;
      }
      d.exec("COMMIT");
      console.log(`[perfis] migracao perfis.json -> SQLite: ${ok} contas importadas.`);
    } catch (e) { d.exec("ROLLBACK"); throw e; }
  } catch (e) { console.error("[perfis] migracao falhou:", e.message); }
}

export async function lerPerfis() {
  await garantirImportacao();
  const linhas = abrir().prepare("SELECT dados FROM perfis").all();
  const perfis = [];
  for (const l of linhas) {
    try { perfis.push(JSON.parse(l.dados)); } catch {}
  }
  return normalizarTermos(perfis);
}

// Fila de escrita: serializa as gravacoes pra duas requisicoes nao se
// intercalarem nos awaits (Node single-thread, mas await pode interleave).
let _fila = Promise.resolve();

// Sincroniza a tabela com o ARRAY passado: remove os que sumiram, grava os
// presentes. Mantem a semantica do antigo salvarPerfis(array completo).
export async function salvarPerfis(perfis) {
  const tarefa = _fila.then(async () => {
    await garantirImportacao();
    const d = abrir();
    const tokens = new Set((perfis || []).map((p) => p && p.token).filter(Boolean));
    const agora = new Date().toISOString();
    const up = d.prepare("INSERT OR REPLACE INTO perfis (token, dados, atualizado_em) VALUES (?, ?, ?)");
    d.exec("BEGIN");
    try {
      for (const { token } of d.prepare("SELECT token FROM perfis").all()) {
        if (!tokens.has(token)) d.prepare("DELETE FROM perfis WHERE token = ?").run(token);
      }
      for (const p of (perfis || [])) {
        if (p && p.token) up.run(p.token, JSON.stringify(p), agora);
      }
      d.exec("COMMIT");
    } catch (e) { d.exec("ROLLBACK"); throw e; }
  });
  _fila = tarefa.catch(() => {});
  return tarefa;
}

// Atualizacao RACE-SAFE de UM perfil: le SO essa linha, muta e grava SO essa
// linha. Sem reescrever o conjunto -> sem lost-update entre requisicoes.
// mutador(perfil) altera in-place; devolve o perfil atualizado, ou null.
export async function atualizarPerfil(token, mutador) {
  let resultado = null;
  const tarefa = _fila.then(async () => {
    await garantirImportacao();
    const d = abrir();
    const row = d.prepare("SELECT dados FROM perfis WHERE token = ?").get(token);
    if (!row) return;
    let p;
    try { p = JSON.parse(row.dados); } catch { return; }
    normalizarTermos([p]);
    mutador(p);
    resultado = p;
    d.prepare("INSERT OR REPLACE INTO perfis (token, dados, atualizado_em) VALUES (?, ?, ?)")
      .run(token, JSON.stringify(p), new Date().toISOString());
  });
  _fila = tarefa.catch(() => {});
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
