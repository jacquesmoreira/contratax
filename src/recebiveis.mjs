// Modulo de Recebiveis: gestao das notas fiscais que o cliente emitiu para orgaos
// publicos, com calculo automatico de prazo legal (30 dias, Lei 14.133 art. 141),
// correcao monetaria (INPC + mora 0.5%/mes) e geracao de oficio de cobranca.
//
// Banco: tabela `notas_fiscais` no mesmo SQLite do projeto (licita.db).

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./caminhos.mjs";

const ARQUIVO = resolve(DATA_DIR, "licita.db");
let _db;
function abrir() {
  if (_db) return _db;
  _db = new DatabaseSync(ARQUIVO);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      perfil_token   TEXT NOT NULL,
      numero         TEXT,
      serie          TEXT,
      chave_nfe      TEXT,
      data_emissao   TEXT NOT NULL,
      valor          REAL NOT NULL,
      orgao_cnpj     TEXT,
      orgao_nome     TEXT,
      descricao      TEXT,
      contrato_id    TEXT,
      data_pagamento TEXT,
      status         TEXT NOT NULL DEFAULT 'pendente',
      observacoes    TEXT,
      criado_em      TEXT NOT NULL,
      atualizado_em  TEXT
    );
  `);
  _db.exec("CREATE INDEX IF NOT EXISTS idx_nfe_perfil ON notas_fiscais(perfil_token);");
  _db.exec("CREATE INDEX IF NOT EXISTS idx_nfe_status ON notas_fiscais(status);");
  return _db;
}

// Prazo legal de pagamento na licitacao publica: 30 dias da liquidacao
// (Lei 14.133/2021, art. 141). Algumas categorias tem prazos especificos mas
// 30 dias eh o padrao geral.
const PRAZO_LEGAL_DIAS = 30;

// Calcula situacao da NF (status visivel pro cliente) a partir da data de emissao.
//   pendente   -> ainda dentro dos 30 dias legais
//   vencendo   -> faltam <= 5 dias pra completar 30 dias
//   atrasada   -> ja passou dos 30 dias
//   paga       -> tem data_pagamento registrada
export function situacao(nf) {
  if (nf.data_pagamento) return "paga";
  const emissao = new Date(nf.data_emissao);
  if (isNaN(emissao)) return "pendente";
  const limite = new Date(emissao.getTime() + PRAZO_LEGAL_DIAS * 864e5);
  const hoje = new Date();
  const diasAteLimite = Math.ceil((limite - hoje) / 864e5);
  if (diasAteLimite < 0) return "atrasada";
  if (diasAteLimite <= 5) return "vencendo";
  return "pendente";
}

// Dias de atraso (positivo = atrasada, 0 ou negativo = ainda no prazo).
export function diasAtraso(nf) {
  if (nf.data_pagamento) return 0;
  const emissao = new Date(nf.data_emissao);
  if (isNaN(emissao)) return 0;
  const limite = new Date(emissao.getTime() + PRAZO_LEGAL_DIAS * 864e5);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje - limite) / 864e5));
}

// Lista todas as NFs de um perfil. Atualiza status automatico baseado em datas.
export function listarNotas(token) {
  const db = abrir();
  const linhas = db.prepare("SELECT * FROM notas_fiscais WHERE perfil_token = ? ORDER BY data_emissao DESC").all(token);
  return linhas.map((l) => ({
    ...l,
    situacao: situacao(l),
    diasAtraso: diasAtraso(l),
  }));
}

export function obterNota(token, id) {
  const db = abrir();
  const linha = db.prepare("SELECT * FROM notas_fiscais WHERE perfil_token = ? AND id = ?").get(token, id);
  if (!linha) return null;
  return { ...linha, situacao: situacao(linha), diasAtraso: diasAtraso(linha) };
}

export function cadastrarNota(token, dados) {
  const db = abrir();
  const agora = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO notas_fiscais
      (perfil_token, numero, serie, chave_nfe, data_emissao, valor,
       orgao_cnpj, orgao_nome, descricao, contrato_id, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const r = stmt.run(
    token,
    dados.numero ?? null,
    dados.serie ?? null,
    dados.chaveNfe ?? null,
    dados.dataEmissao,
    Number(dados.valor) || 0,
    dados.orgaoCnpj ?? null,
    dados.orgaoNome ?? null,
    dados.descricao ?? null,
    dados.contratoId ?? null,
    agora,
  );
  return obterNota(token, Number(r.lastInsertRowid));
}

export function marcarPaga(token, id, dataPagamento = null) {
  const db = abrir();
  const data = dataPagamento || new Date().toISOString().slice(0, 10);
  db.prepare(`
    UPDATE notas_fiscais SET data_pagamento = ?, status = 'paga', atualizado_em = ?
    WHERE perfil_token = ? AND id = ?
  `).run(data, new Date().toISOString(), token, id);
  return obterNota(token, id);
}

export function removerNota(token, id) {
  const db = abrir();
  const r = db.prepare("DELETE FROM notas_fiscais WHERE perfil_token = ? AND id = ?").run(token, id);
  return r.changes > 0;
}

// Estatisticas pro dashboard
export function estatisticasRecebiveis(token) {
  const notas = listarNotas(token);
  const total = notas.length;
  const valorPendente = notas
    .filter((n) => n.situacao !== "paga")
    .reduce((s, n) => s + (n.valor || 0), 0);
  const atrasadas = notas.filter((n) => n.situacao === "atrasada").length;
  const valorAtrasado = notas
    .filter((n) => n.situacao === "atrasada")
    .reduce((s, n) => s + (n.valor || 0), 0);
  const vencendo = notas.filter((n) => n.situacao === "vencendo").length;
  return { total, valorPendente, atrasadas, valorAtrasado, vencendo };
}
