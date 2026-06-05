// Gestao dos CONTRATOS ativos do cliente (alem das NFs individuais).
//
// Diferenca:
//   - notas_fiscais (modulo Recebiveis): cobra pagamento pontual de cada NF.
//   - contratos_meus (este modulo): contrato com vigencia (data_inicio,
//     data_fim), indice de reajuste, alertas de prorrogacao e reequilibrio.
//
// Por que separar:
//   - Um contrato pode ter N notas fiscais.
//   - Aditivos (Lei 14.133, art. 124+) sao discutidos no NIVEL DO CONTRATO.
//   - Reequilibrio economico-financeiro tambem.

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./caminhos.mjs";

const ARQUIVO = resolve(DATA_DIR, "licita.db");
let _db;
function abrir() {
  if (_db) return _db;
  _db = new DatabaseSync(ARQUIVO);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS contratos_meus (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      perfil_token    TEXT NOT NULL,
      numero          TEXT,
      orgao_nome      TEXT,
      orgao_cnpj      TEXT,
      objeto          TEXT,
      valor_total     REAL,
      data_inicio     TEXT,
      data_fim        TEXT,
      indice_reajuste TEXT,
      observacoes     TEXT,
      alertas_enviados TEXT,
      criado_em       TEXT NOT NULL,
      atualizado_em   TEXT
    );
  `);
  _db.exec("CREATE INDEX IF NOT EXISTS idx_ct_perfil ON contratos_meus(perfil_token);");
  _db.exec("CREATE INDEX IF NOT EXISTS idx_ct_fim ON contratos_meus(data_fim);");
  return _db;
}

// Quantos dias faltam pra terminar (negativo = ja terminou).
export function diasParaFim(c) {
  if (!c.data_fim) return null;
  const fim = new Date(c.data_fim);
  if (isNaN(fim)) return null;
  return Math.floor((fim - new Date()) / 864e5);
}

export function situacaoContrato(c) {
  const d = diasParaFim(c);
  if (d === null) return "indefinida";
  if (d < 0) return "encerrado";
  if (d <= 30) return "fim_em_30d";
  if (d <= 90) return "fim_em_90d";
  return "ativo";
}

export function listarContratos(token) {
  const db = abrir();
  const linhas = db.prepare("SELECT * FROM contratos_meus WHERE perfil_token = ? ORDER BY data_fim ASC")
    .all(token);
  return linhas.map((c) => ({
    ...c,
    diasParaFim: diasParaFim(c),
    situacao: situacaoContrato(c),
  }));
}

export function obterContrato(token, id) {
  const db = abrir();
  const linha = db.prepare("SELECT * FROM contratos_meus WHERE perfil_token = ? AND id = ?").get(token, id);
  if (!linha) return null;
  return { ...linha, diasParaFim: diasParaFim(linha), situacao: situacaoContrato(linha) };
}

export function cadastrarContrato(token, d) {
  const db = abrir();
  const stmt = db.prepare(`
    INSERT INTO contratos_meus
      (perfil_token, numero, orgao_nome, orgao_cnpj, objeto, valor_total,
       data_inicio, data_fim, indice_reajuste, observacoes, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const r = stmt.run(
    token,
    d.numero ?? null,
    d.orgaoNome ?? null,
    d.orgaoCnpj ?? null,
    d.objeto ?? null,
    Number(d.valorTotal) || 0,
    d.dataInicio ?? null,
    d.dataFim ?? null,
    d.indiceReajuste ?? null,
    d.observacoes ?? null,
    new Date().toISOString(),
  );
  return obterContrato(token, Number(r.lastInsertRowid));
}

export function removerContrato(token, id) {
  const db = abrir();
  const r = db.prepare("DELETE FROM contratos_meus WHERE perfil_token = ? AND id = ?").run(token, id);
  return r.changes > 0;
}

export function alertasEnviadosCt(c) {
  if (!c.alertas_enviados) return [];
  return String(c.alertas_enviados).split(",");
}

export function registrarAlertaCt(id, marco) {
  const db = abrir();
  const linha = db.prepare("SELECT alertas_enviados FROM contratos_meus WHERE id = ?").get(id);
  if (!linha) return;
  const set = new Set(alertasEnviadosCt(linha));
  set.add(marco);
  db.prepare("UPDATE contratos_meus SET alertas_enviados = ? WHERE id = ?")
    .run([...set].join(","), id);
}

export function todosContratosAtivos() {
  const db = abrir();
  return db.prepare("SELECT * FROM contratos_meus WHERE data_fim IS NOT NULL").all();
}
