// Camada de banco (SQLite embutido do Node, sem dependencia externa).
// Guarda o acervo nacional de editais e responde consultas por perfil de cliente.

import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { normalizar, aplicarFiltro, tokenSignificativo, termosAmplos, contemPalavra } from "./filtro.mjs";
import { expandirTermos, excluirTermos } from "./sinonimos.mjs";

// Monta condicoes SQL exigindo TODOS os tokens significativos do termo (mesma
// regra do painel: "papel A4" pede papel E a4, nao a frase colada). Mantem a
// busca de Precos/PCA consistente com o resto do site.
function condTokens(termo, coluna, cond, args) {
  const tokens = normalizar(termo).split(/[^a-z0-9]+/).filter(tokenSignificativo);
  for (const tk of tokens) { cond.push(`${coluna} LIKE ?`); args.push("%" + tk + "%"); }
  return tokens.length;
}

// O LIKE acima e SUBSTRING (prefiltro rapido) — casaria "cimento" em
// "fornecimento". Este confirma por PALAVRA INTEIRA nas linhas ja trazidas,
// igual a busca de editais. Mantem Precos/PCA consistentes com o resto.
function confirmaTokens(linhas, termo, col = "descricao_norm") {
  const tokens = normalizar(termo || "").split(/[^a-z0-9]+/).filter(tokenSignificativo);
  if (!tokens.length) return linhas;
  return linhas.filter((l) => tokens.every((t) => contemPalavra(t, l[col] || "")));
}
import { DATA_DIR } from "./caminhos.mjs";

const DIR_DADOS = DATA_DIR;
const CAMINHO = resolve(DIR_DADOS, "licita.db");

let db = null;

// Abre (e cria, se preciso) o banco. Reaproveita a conexao na mesma execucao.
export function abrir() {
  if (db) return db;
  mkdirSync(DIR_DADOS, { recursive: true });
  db = new DatabaseSync(CAMINHO);
  db.exec("PRAGMA journal_mode = WAL;");
  // Cap do WAL: sem journal_size_limit o arquivo cresce no backfill (1.7GB) e
  // NUNCA encolhe, mesmo apos o checkpoint aplicar as mudancas. Com o limite, o
  // WAL e truncado a ~64MB depois de cada checkpoint. autocheckpoint garante
  // checkpoints frequentes (a cada ~4MB de escrita) pra nao deixar acumular.
  db.exec("PRAGMA wal_autocheckpoint = 1000;");
  db.exec("PRAGMA journal_size_limit = 67108864;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS editais (
      id            TEXT PRIMARY KEY,
      orgao         TEXT,
      orgao_cnpj    TEXT,
      unidade       TEXT,
      uf            TEXT,
      municipio     TEXT,
      objeto        TEXT,
      objeto_norm   TEXT,
      modalidade    TEXT,
      modalidade_id INTEGER,
      valor         REAL,
      abertura      TEXT,
      encerramento  TEXT,
      situacao      TEXT,
      publicacao    TEXT,
      link          TEXT,
      srp           INTEGER,
      ano           INTEGER,
      sequencial    INTEGER,
      visto_em      TEXT
    );
  `);
  // Migracao: numero "amigavel" do edital do orgao (ex: 3/2026), pra busca por Nº.
  try { db.exec("ALTER TABLE editais ADD COLUMN numero_compra TEXT;"); } catch {}
  // Marca quando os precos homologados deste edital ja foram colhidos (Caminho B).
  try { db.exec("ALTER TABLE editais ADD COLUMN precos_em TEXT;"); } catch {}
  // Marca quando os ITENS deste edital ja foram indexados pra busca (item index).
  try { db.exec("ALTER TABLE editais ADD COLUMN itens_em TEXT;"); } catch {}

  // Pesquisa de Precos: precos HOMOLOGADOS (reais, do vencedor) colhidos item a
  // item das licitacoes que encerram. Base que CRESCE com o tempo (incremental).
  db.exec(`
    CREATE TABLE IF NOT EXISTS precos_itens (
      chave          TEXT PRIMARY KEY,
      edital_id      TEXT,
      descricao      TEXT,
      descricao_norm TEXT,
      valor_unitario REAL,
      quantidade     REAL,
      unidade        TEXT,
      orgao          TEXT,
      orgao_cnpj     TEXT,
      uf             TEXT,
      municipio      TEXT,
      fornecedor     TEXT,
      fornecedor_ni  TEXT,
      porte          TEXT,
      categoria      TEXT,
      data_resultado TEXT,
      criado_em      TEXT
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_precos_norm ON precos_itens(descricao_norm);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_precos_uf ON precos_itens(uf);");

  // INDICE DE ITENS dos editais ABERTOS: a busca UNIVERSAL. O objeto do edital e
  // alto nivel ("material hospitalar"); o produto especifico ("atadura") mora
  // nos itens. Indexando os itens, qualquer produto/servico de qualquer nicho e
  // achavel SEM precisar curar sinonimo. Base capada + podada quando o edital
  // expira (nao incha o volume). Preenchida pelo colheitaItens (gated por env).
  db.exec(`
    CREATE TABLE IF NOT EXISTS itens_edital (
      chave          TEXT PRIMARY KEY,
      edital_id      TEXT NOT NULL,
      numero         INTEGER,
      descricao      TEXT,
      descricao_norm TEXT
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_itens_edital ON itens_edital(edital_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_itens_norm ON itens_edital(descricao_norm);");

  // PCA - Plano de Contratacao Anual: compras que os orgaos JA planejaram (com
  // data desejada) = oportunidade ANTECIPADA, antes do edital sair. Base
  // incremental e CAPADA (protege o disco). Caminho B aqui tambem.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pca_itens (
      chave          TEXT PRIMARY KEY,
      descricao      TEXT,
      descricao_norm TEXT,
      categoria      TEXT,
      quantidade     REAL,
      unidade        TEXT,
      valor_unitario REAL,
      valor_total    REAL,
      data_desejada  TEXT,
      orgao          TEXT,
      orgao_cnpj     TEXT,
      unidade_orgao  TEXT,
      ano_pca        INTEGER,
      criado_em      TEXT
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_pca_norm ON pca_itens(descricao_norm);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_pca_data ON pca_itens(data_desejada);");

  // Contas dos clientes (migracao de perfis.json -> SQLite). Cada perfil e
  // guardado como blob JSON por token: preserva o schema flexivel (filtro,
  // assinatura, usuarios...) e troca a escrita do ARQUIVO INTEIRO por escrita
  // POR LINHA (sem clobber/lost-update, sem rewrite gigante). perfis.mjs cuida.
  db.exec(`
    CREATE TABLE IF NOT EXISTS perfis (
      token         TEXT PRIMARY KEY,
      dados         TEXT NOT NULL,
      atualizado_em TEXT
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_uf ON editais(uf);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_encerramento ON editais(encerramento);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_modalidade ON editais(modalidade_id);");

  // Contratos: base do radar de renovacao e do preco dos vencedores.
  db.exec(`
    CREATE TABLE IF NOT EXISTS contratos (
      id             TEXT PRIMARY KEY,
      orgao          TEXT,
      orgao_cnpj     TEXT,
      uf             TEXT,
      municipio      TEXT,
      objeto         TEXT,
      objeto_norm    TEXT,
      fornecedor     TEXT,
      fornecedor_ni  TEXT,
      valor          REAL,
      vigencia_inicio TEXT,
      vigencia_fim   TEXT,
      categoria_id   INTEGER,
      categoria_nome TEXT,
      ano            INTEGER,
      publicacao     TEXT,
      visto_em       TEXT
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_contr_uf ON contratos(uf);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contr_vigfim ON contratos(vigencia_fim);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contr_cat ON contratos(categoria_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contr_forn ON contratos(fornecedor_ni);"); // analise de concorrentes

  return db;
}

// ===== Pesquisa de Precos (Caminho B: colheita incremental) =====

// Editais ja ENCERRADOS e ainda no banco (dentro da carencia) que ainda nao
// tiveram os precos colhidos. O colhedor processa esses antes de serem apagados.
export function editaisPraColher({ limite = 30 } = {}) {
  const d = abrir();
  return d.prepare(
    `SELECT id, orgao, orgao_cnpj, uf, municipio, ano, sequencial
     FROM editais WHERE encerramento < ? AND precos_em IS NULL
     ORDER BY encerramento DESC LIMIT ?`
  ).all(new Date().toISOString(), limite);
}

export function marcarPrecosColhidos(editalId) {
  abrir().prepare("UPDATE editais SET precos_em = ? WHERE id = ?").run(new Date().toISOString(), editalId);
}

// ===== Indice de itens dos editais ABERTOS (busca universal) =====

// Editais ABERTOS ainda nao indexados (itens_em IS NULL). O colhedor pega esses.
export function editaisPraIndexarItens({ limite = 40 } = {}) {
  const d = abrir();
  return d.prepare(
    `SELECT id, orgao, orgao_cnpj, uf, municipio, ano, sequencial
     FROM editais WHERE encerramento >= ? AND itens_em IS NULL
     ORDER BY encerramento ASC LIMIT ?`
  ).all(new Date().toISOString(), limite);
}

export function marcarItensIndexados(editalId) {
  abrir().prepare("UPDATE editais SET itens_em = ? WHERE id = ?").run(new Date().toISOString(), editalId);
}

// Substitui os itens indexados de um edital. itens = [{numero, descricao}].
export function upsertItensEdital(editalId, itens = []) {
  const d = abrir();
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM itens_edital WHERE edital_id = ?").run(editalId);
    const stmt = d.prepare("INSERT OR IGNORE INTO itens_edital (chave, edital_id, numero, descricao, descricao_norm) VALUES (?,?,?,?,?)");
    for (const it of itens) {
      const desc = String(it.descricao || "").slice(0, 400);
      if (!desc) continue;
      stmt.run(`${editalId}#${it.numero ?? 0}`, editalId, it.numero ?? null, desc, normalizar(desc));
    }
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
  marcarItensIndexados(editalId);
  return itens.length;
}

export function totalItensEdital() {
  try { return abrir().prepare("SELECT COUNT(*) AS n FROM itens_edital").get().n; } catch { return 0; }
}

// Apaga itens de editais que sairam do acervo (expiraram). Mantem o indice
// limitado ao conjunto de abertos. Chamado junto do removerExpirados.
export function podarItensOrfaos() {
  try {
    const r = abrir().prepare("DELETE FROM itens_edital WHERE edital_id NOT IN (SELECT id FROM editais)").run();
    return Number(r.changes ?? 0);
  } catch { return 0; }
}

// BUSCA UNIVERSAL: ids de editais cujos ITENS casam TODOS os tokens do termo.
// SQL faz o prefiltro (LIKE substring, rapido); o JS confirma por PALAVRA
// INTEIRA (mesma regra do objeto) pra nao casar "cimento" em "fornecimento".
// Devolve um Map(edital_id -> descricao do item que casou) — pro card mostrar
// "achado nos itens: <item>". Match por palavra inteira (confirma o prefiltro).
export function editaisIdsPorItem(termo, { teto = 4000 } = {}) {
  const tokens = normalizar(termo || "").split(/[^a-z0-9]+/).filter(tokenSignificativo);
  if (!tokens.length) return new Map();
  const d = abrir();
  const cond = tokens.map(() => "descricao_norm LIKE ?").join(" AND ");
  const args = tokens.map((t) => "%" + t + "%");
  const linhas = d.prepare(
    `SELECT edital_id, descricao, descricao_norm FROM itens_edital WHERE ${cond} LIMIT ?`
  ).all(...args, teto);
  const mapa = new Map();
  for (const l of linhas) {
    if (!mapa.has(l.edital_id) && tokens.every((t) => contemPalavra(t, l.descricao_norm))) {
      mapa.set(l.edital_id, l.descricao);
    }
  }
  return mapa;
}

// Grava um lote de precos homologados colhidos.
export function upsertPrecos(linhas) {
  if (!linhas.length) return 0;
  const d = abrir();
  const stmt = d.prepare(`
    INSERT INTO precos_itens
      (chave, edital_id, descricao, descricao_norm, valor_unitario, quantidade,
       unidade, orgao, orgao_cnpj, uf, municipio, fornecedor, fornecedor_ni,
       porte, categoria, data_resultado, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO NOTHING
  `);
  const agora = new Date().toISOString();
  let n = 0;
  d.exec("BEGIN");
  try {
    for (const l of linhas) {
      const r = stmt.run(
        l.chave, l.editalId, l.descricao, normalizar(l.descricao || ""),
        l.valorUnitario, l.quantidade, l.unidade, l.orgao, l.orgaoCnpj, l.uf,
        l.municipio, l.fornecedor, l.fornecedorNi, l.porte, l.categoria,
        l.dataResultado, agora,
      );
      n += r.changes;
    }
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
  return n;
}

// Pesquisa de precos por descricao do item. Devolve estatisticas (faixa, mediana)
// + a lista + agregados por orgao e por empresa. Filtra outliers de valor 0.
export function pesquisarPrecos({ termo = "", uf = null, limite = 80 } = {}) {
  const d = abrir();
  const cond = ["valor_unitario > 0"];
  const args = [];
  condTokens(termo, "descricao_norm", cond, args);
  if (uf) { cond.push("uf = ?"); args.push(uf); }
  const where = "WHERE " + cond.join(" AND ");
  const totalPre = d.prepare(`SELECT COUNT(*) n FROM precos_itens ${where}`).get(...args).n;
  if (!totalPre) return { total: 0, termo, valores: null, itens: [], porOrgao: [], porEmpresa: [] };
  const linhas = confirmaTokens(d.prepare(`SELECT * FROM precos_itens ${where} ORDER BY data_resultado DESC LIMIT 2000`).all(...args), termo);
  if (!linhas.length) return { total: 0, termo, valores: null, itens: [], porOrgao: [], porEmpresa: [] };
  const total = totalPre <= 2000 ? linhas.length : totalPre; // exato quando coube no lote
  const valores = linhas.map((l) => l.valor_unitario).filter((v) => v > 0).sort((a, b) => a - b);
  const mediana = valores.length ? valores[Math.floor(valores.length / 2)] : null;
  const min = valores[0], max = valores[valores.length - 1];
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  const empresas = new Map();
  for (const l of linhas) {
    const k = l.fornecedor_ni || l.fornecedor;
    const r = empresas.get(k) || { fornecedor: l.fornecedor, ni: l.fornecedor_ni, qtd: 0 };
    r.qtd += 1; empresas.set(k, r);
  }
  return {
    total, termo,
    valores: { min, max, media, mediana, n: valores.length },
    itens: linhas.slice(0, limite).map((l) => ({
      descricao: l.descricao, valorUnitario: l.valor_unitario, unidade: l.unidade,
      quantidade: l.quantidade, orgao: l.orgao, uf: l.uf, municipio: l.municipio,
      fornecedor: l.fornecedor, porte: l.porte, data: l.data_resultado,
    })),
    porEmpresa: [...empresas.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 8),
  };
}

// Quantos precos ja foram colhidos (pro disclaimer "base em crescimento").
export function totalPrecos() {
  try { return abrir().prepare("SELECT COUNT(*) n FROM precos_itens").get().n; } catch { return 0; }
}

// ===== PCA - Plano de Contratacao Anual (oportunidade antecipada) =====
export function totalPca() {
  try { return abrir().prepare("SELECT COUNT(*) n FROM pca_itens").get().n; } catch { return 0; }
}

export function upsertPca(linhas) {
  if (!linhas.length) return 0;
  const d = abrir();
  const stmt = d.prepare(`
    INSERT INTO pca_itens
      (chave, descricao, descricao_norm, categoria, quantidade, unidade,
       valor_unitario, valor_total, data_desejada, orgao, orgao_cnpj,
       unidade_orgao, ano_pca, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO NOTHING
  `);
  const agora = new Date().toISOString();
  let n = 0;
  d.exec("BEGIN");
  try {
    for (const l of linhas) {
      const r = stmt.run(
        l.chave, l.descricao, normalizar(l.descricao || ""), l.categoria,
        l.quantidade, l.unidade, l.valorUnitario, l.valorTotal, l.dataDesejada,
        l.orgao, l.orgaoCnpj, l.unidadeOrgao, l.anoPca, agora,
      );
      n += r.changes;
    }
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
  return n;
}

// Busca no PCA por descricao. Prioriza data desejada futura (oportunidade que
// ainda vai acontecer). Devolve lista + agregado por orgao.
export function pesquisarPca({ termo = "", limite = 80 } = {}) {
  const d = abrir();
  const cond = []; const args = [];
  condTokens(termo, "descricao_norm", cond, args);
  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const totalPre = d.prepare(`SELECT COUNT(*) n FROM pca_itens ${where}`).get(...args).n;
  if (!totalPre) return { total: 0, termo, itens: [], valorTotal: 0 };
  // Futuras primeiro (data desejada >= hoje), depois por valor.
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = confirmaTokens(d.prepare(
    `SELECT * FROM pca_itens ${where} ORDER BY (data_desejada >= '${hoje}') DESC, data_desejada ASC LIMIT 2000`
  ).all(...args), termo);
  if (!linhas.length) return { total: 0, termo, itens: [], valorTotal: 0 };
  const total = totalPre <= 2000 ? linhas.length : totalPre;
  const valorTotal = linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0);
  return {
    total, termo, valorTotal,
    itens: linhas.slice(0, limite).map((l) => ({
      descricao: l.descricao, categoria: l.categoria, quantidade: l.quantidade,
      unidade: l.unidade, valorUnitario: l.valor_unitario, valorTotal: l.valor_total,
      dataDesejada: l.data_desejada, orgao: l.orgao, unidadeOrgao: l.unidade_orgao,
    })),
  };
}

// Analise de um concorrente pelo CNPJ: contratos que ELE ganhou (qualquer ramo,
// qualquer UF). Dado publico do PNCP. Aceita CNPJ completo (14 digitos) ou a
// raiz (8 digitos = todas as filiais).
export function analiseConcorrente({ cnpj, limite = 60 } = {}) {
  const ni = String(cnpj || "").replace(/\D/g, "");
  if (ni.length < 8) return null;
  const d = abrir();
  const cond = ni.length >= 14 ? "fornecedor_ni = ?" : "fornecedor_ni LIKE ?";
  const arg = ni.length >= 14 ? ni : ni.slice(0, 8) + "%";
  const linhas = d.prepare(
    `SELECT * FROM contratos WHERE ${cond} ORDER BY vigencia_inicio DESC LIMIT 3000`
  ).all(arg);
  if (!linhas.length) return { ni, encontrado: false, nome: null, total: 0, valorTotal: 0, porOrgao: [], porAno: [], contratos: [] };

  const nome = linhas.find((l) => l.fornecedor && !/^\d/.test(l.fornecedor))?.fornecedor || linhas[0].fornecedor;
  let valorTotal = 0;
  const orgaos = new Map();
  const anos = new Map();
  for (const l of linhas) {
    const v = Number(l.valor) || 0;
    valorTotal += v;
    const o = l.orgao || "Órgão não informado";
    const ro = orgaos.get(o) || { orgao: o, uf: l.uf, qtd: 0, valor: 0 };
    ro.qtd += 1; ro.valor += v; orgaos.set(o, ro);
    const ano = l.ano || (l.vigencia_inicio || "").slice(0, 4) || "?";
    anos.set(ano, (anos.get(ano) || 0) + v);
  }
  return {
    ni, encontrado: true, nome,
    total: linhas.length, valorTotal,
    porOrgao: [...orgaos.values()].sort((a, b) => b.valor - a.valor).slice(0, 10),
    porAno: [...anos.entries()].map(([ano, valor]) => ({ ano, valor })).sort((a, b) => String(b.ano).localeCompare(String(a.ano))).slice(0, 6),
    contratos: linhas.slice(0, limite).map((l) => ({
      objeto: l.objeto, orgao: l.orgao, uf: l.uf, municipio: l.municipio,
      valor: l.valor, vigenciaInicio: l.vigencia_inicio, vigenciaFim: l.vigencia_fim, id: l.id,
    })),
  };
}

// Insere ou atualiza um lote de editais. Dedupe pela chave id (numeroControlePNCP).
// Preserva o visto_em original (primeira vez que o edital entrou no acervo).
export function upsertEditais(editais) {
  if (!editais.length) return 0;
  const d = abrir();
  const agora = new Date().toISOString();
  const stmt = d.prepare(`
    INSERT INTO editais
      (id, orgao, orgao_cnpj, unidade, uf, municipio, objeto, objeto_norm,
       modalidade, modalidade_id, valor, abertura, encerramento, situacao,
       publicacao, link, srp, ano, sequencial, numero_compra, visto_em)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      valor = excluded.valor,
      encerramento = excluded.encerramento,
      situacao = excluded.situacao,
      link = excluded.link,
      numero_compra = COALESCE(excluded.numero_compra, editais.numero_compra)
  `);

  d.exec("BEGIN");
  try {
    for (const e of editais) {
      stmt.run(
        e.id, e.orgao, e.orgaoCnpj, e.unidade, e.uf, e.municipio, e.objeto,
        normalizar(e.objeto), e.modalidade, e.modalidadeId, e.valorEstimado,
        e.abertura, e.encerramento, e.situacao, e.publicacao, e.link,
        e.srp ? 1 : 0, e.ano, e.sequencial, e.numeroCompra ?? null, agora
      );
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
  return editais.length;
}

// Busca um edital pelo id (numeroControlePNCP). Devolve no formato interno ou null.
export function buscarPorId(id) {
  const d = abrir();
  const l = d.prepare("SELECT * FROM editais WHERE id = ?").get(id);
  if (!l) return null;
  return {
    id: l.id, orgao: l.orgao, orgaoCnpj: l.orgao_cnpj, unidade: l.unidade,
    uf: l.uf, municipio: l.municipio, objeto: l.objeto, modalidade: l.modalidade,
    modalidadeId: l.modalidade_id, valorEstimado: l.valor, abertura: l.abertura,
    encerramento: l.encerramento, situacao: l.situacao, publicacao: l.publicacao,
    link: l.link, srp: Boolean(l.srp), ano: l.ano, sequencial: l.sequencial,
    numeroCompra: l.numero_compra,
  };
}

// Remove editais ja encerrados ha mais de `graceDias` dias, para o acervo nao
// crescer para sempre. A folga evita apagar algo que acabou de encerrar.
export function removerExpirados({ graceDias = 3 } = {}) {
  const d = abrir();
  const limite = new Date(Date.now() - graceDias * 864e5).toISOString();
  const r = d.prepare("DELETE FROM editais WHERE encerramento < ?").run(limite);
  // Poda os itens indexados de editais que sairam do acervo (mantem o indice
  // limitado aos abertos, sem inchar o volume).
  try { podarItensOrfaos(); } catch {}
  return Number(r.changes ?? 0);
}

// Poda contratos antigos pra MANTER O BANCO LIMITADO (o backfill cresce sem
// teto, 1.2M+ registros, e enche o volume de 5GB do Railway). O historico so
// consulta os ultimos 18 meses (consultarContratos), entao guardar mais que
// isso e so peso morto. Default 24 meses = folga de 6 meses sobre a janela de
// consulta. Re-coletavel do PNCP a qualquer momento, entao podar e seguro.
export function podarContratosAntigos({ mesesAtras = Number(process.env.LICITA_CONTRATOS_MESES || 24) } = {}) {
  const d = abrir();
  const corte = new Date();
  corte.setMonth(corte.getMonth() - mesesAtras);
  const corteISO = corte.toISOString().slice(0, 10);
  // Considera o MAIS RECENTE entre vigencia_inicio e publicacao; so apaga quando
  // ambos sao anteriores ao corte (ou ausentes). COALESCE evita que um NULL
  // some o MAX inteiro e apague um contrato que ainda esta na janela.
  const r = d.prepare(`
    DELETE FROM contratos
    WHERE MAX(COALESCE(vigencia_inicio,''), COALESCE(publicacao,'')) < ?
  `).run(corteISO);
  return Number(r.changes ?? 0);
}

// Insere/atualiza um lote de contratos. Dedupe por id (numeroControlePNCP).
export function upsertContratos(contratos) {
  if (!contratos.length) return 0;
  const d = abrir();
  const agora = new Date().toISOString();
  const stmt = d.prepare(`
    INSERT INTO contratos
      (id, orgao, orgao_cnpj, uf, municipio, objeto, objeto_norm, fornecedor,
       fornecedor_ni, valor, vigencia_inicio, vigencia_fim, categoria_id,
       categoria_nome, ano, publicacao, visto_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      valor = excluded.valor,
      vigencia_fim = excluded.vigencia_fim,
      fornecedor = excluded.fornecedor
  `);

  d.exec("BEGIN");
  try {
    for (const c of contratos) {
      stmt.run(
        c.id, c.orgao, c.orgaoCnpj, c.uf, c.municipio, c.objeto, normalizar(c.objeto),
        c.fornecedor, c.fornecedorNi, c.valorGlobal, c.vigenciaInicio, c.vigenciaFim,
        c.categoriaId, c.categoriaNome, c.ano, c.publicacao, agora
      );
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
  return contratos.length;
}

function mapearContrato(l) {
  return {
    id: l.id, orgao: l.orgao, orgaoCnpj: l.orgao_cnpj, uf: l.uf, municipio: l.municipio,
    objeto: l.objeto, fornecedor: l.fornecedor, valor: l.valor,
    vigenciaInicio: l.vigencia_inicio, vigenciaFim: l.vigencia_fim,
    categoriaId: l.categoria_id, categoriaNome: l.categoria_nome, publicacao: l.publicacao,
  };
}

// Consulta contratos por UF, categoria e janela de tempo (meses atras). O filtro
// fino por palavra-chave roda depois (forgiving), igual aos editais.
export function consultarContratos({ uf = null, categorias = [], mesesAtras = 18 } = {}) {
  const d = abrir();
  const cond = [];
  const args = [];
  if (uf) { cond.push("uf = ?"); args.push(uf); }
  if (categorias.length) {
    cond.push(`categoria_id IN (${categorias.map(() => "?").join(",")})`);
    args.push(...categorias);
  }
  const desde = new Date();
  desde.setMonth(desde.getMonth() - mesesAtras);
  const desdeISO = desde.toISOString().slice(0, 10);
  cond.push("(vigencia_inicio >= ? OR publicacao >= ?)");
  args.push(desdeISO, desdeISO);

  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  // LIMIT defensivo: tabela contratos tem 1.2M+ registros em producao. Sem
  // limite, qualquer consulta sem UF estoura memoria (OOM em Railway).
  // 10k contratos cobre uso real (matching por ramo + UF). Para volumes
  // maiores, usar paginacao explicita.
  return d.prepare(`SELECT * FROM contratos ${where} ORDER BY vigencia_inicio DESC LIMIT 10000`).all(...args).map(mapearContrato);
}

// Contratos que vencem dentro de `dentroMeses` meses (base do radar de renovacao).
export function contratosVencendo({ uf = null, categorias = [], dentroMeses = 12 } = {}) {
  const d = abrir();
  const hoje = new Date().toISOString().slice(0, 10);
  const ate = new Date();
  ate.setMonth(ate.getMonth() + dentroMeses);
  const cond = ["vigencia_fim >= ?", "vigencia_fim <= ?"];
  const args = [hoje, ate.toISOString().slice(0, 10)];
  if (uf) { cond.push("uf = ?"); args.push(uf); }
  if (categorias.length) {
    cond.push(`categoria_id IN (${categorias.map(() => "?").join(",")})`);
    args.push(...categorias);
  }
  return d
    .prepare(`SELECT * FROM contratos WHERE ${cond.join(" AND ")} ORDER BY vigencia_fim ASC`)
    .all(...args)
    .map(mapearContrato);
}

// Estatisticas do acervo de contratos.
export function estatisticasContratos() {
  const d = abrir();
  const total = d.prepare("SELECT COUNT(*) AS n FROM contratos").get().n;
  const porCategoria = d.prepare(
    "SELECT categoria_nome, COUNT(*) AS n FROM contratos GROUP BY categoria_nome ORDER BY n DESC"
  ).all();
  const hoje = new Date().toISOString();
  const em6m = new Date(Date.now() + 180 * 864e5).toISOString();
  const vencendo6m = d.prepare(
    "SELECT COUNT(*) AS n FROM contratos WHERE vigencia_fim >= ? AND vigencia_fim <= ?"
  ).get(hoje, em6m).n;
  return { total, porCategoria, vencendo6m };
}

// Une aos resultados (casaram) os editais cujos ITENS casam o termo, dentre os
// `candidatos` (ja filtrados por UF/valor). Acha qualquer produto/servico mesmo
// fora dos ramos curados. No-op se o termo for vazio ou o indice estiver vazio.
function unirPorItem(casaram, candidatos, termo, excluirList = []) {
  if (!termo || !termo.trim()) return casaram;
  const itensCasados = editaisIdsPorItem(termo); // Map(id -> descricao do item)
  if (!itensCasados.size) return casaram;
  const jaTem = new Set(casaram.map((e) => e.id));
  let extra = candidatos.filter((c) => itensCasados.has(c.id) && !jaTem.has(c.id));
  if (excluirList.length) extra = aplicarFiltro(extra, { termosExcluir: excluirList });
  for (const e of extra) { e._viaItem = true; e._itemCasado = itensCasados.get(e.id); }
  return casaram.concat(extra);
}

// Limiar pra acionar a expansao de ramo. Se o PRECISO (objeto literal + itens)
// ja traz >= LIMIAR, mostra so o preciso; senao, amplia pro ramo pra nao ficar
// vazio. Default 8 funciona como CHAVE AUTOMATICA conforme o indice de itens:
//   - Indice VAZIO (hoje): produto especifico tem poucos literais -> expande ->
//     RECALL (varias licitacoes), como o cliente espera.
//   - Indice CHEIO: o produto casa em muitos itens -> passa do limiar -> NAO
//     expande -> PRECISAO (luva traz so luva). Se auto-ajusta sozinho.
const LIMIAR_EXPANSAO = Number(process.env.LICITA_LIMIAR_EXPANSAO || 8);

// Quantos itens indexados pra considerar o indice "pronto" e confiar na
// PRECISAO. Abaixo disso, o objeto (alto nivel) e a unica fonte e nao da pra
// ser preciso -> sempre amplia pro ramo (recall). Configuravel.
const ITENS_PRONTO_MIN = Number(process.env.LICITA_ITENS_PRONTO || 200000);

// Casa em duas camadas: 1) PRECISO = objeto literal + itens do edital; 2) ABRE
// pro ramo (expansao) quando faltar precisao. ADAPTATIVO: enquanto o indice de
// itens nao esta pronto, sempre amplia (recall — painel cheio); quando o indice
// enche, o proprio volume de itens alimenta o "preciso" e a expansao so entra
// se realmente vier pouco. Assim nunca fica vazio agora, e fica preciso depois.
function casarComExpansao(candidatos, termos, termo, expandido, excluirList, { preferePreciso = false } = {}) {
  let preciso = aplicarFiltro(candidatos, { termos, termosExcluir: excluirList });
  preciso = unirPorItem(preciso, candidatos, termo, excluirList);
  // Marca os PRECISOS (objeto literal + itens) pra rankearem ACIMA dos do ramo.
  for (const e of preciso) e._preciso = true;
  // preferePreciso (PAINEL): so amplia pro ramo se NAO houver nenhum preciso —
  // quem busca "luva" ve luva, nunca o ramo saude (medicamento). Volume volta
  // com o indice de itens. Sem isso (LP): adaptativo ao indice (recall agora).
  if (preferePreciso) {
    if (preciso.length > 0 || !expandido.length) return preciso;
  } else {
    const indicePronto = totalItensEdital() >= ITENS_PRONTO_MIN;
    if (indicePronto && preciso.length >= LIMIAR_EXPANSAO) return preciso;
    if (!expandido.length) return preciso;
  }
  const amplo = aplicarFiltro(candidatos, { termos, termosIA: expandido, termosExcluir: excluirList });
  const ids = new Set(preciso.map((e) => e.id));
  for (const e of amplo) if (!ids.has(e.id)) { e._preciso = false; preciso.push(e); }
  return preciso;
}

// Busca publica da landing page: por UF e termo livre, devolve o total, a soma
// dos valores e uma amostra dos editais abertos. Sem perfil, sem login.
export function buscaPublica({ uf = null, termo = "", limite = 15 } = {}) {
  // Sem filtro nem UF: contador nacional da LP. Usa COUNT direto pra evitar o
  // LIMIT 8000 de consultar() — esse limite serve pra protecao OOM em buscas
  // amplas, mas o contador da home tem que mostrar o numero real do acervo.
  if (!uf && (!termo || !termo.trim())) {
    const d = abrir();
    const agora = new Date().toISOString();
    const total = d.prepare("SELECT COUNT(*) AS n FROM editais WHERE encerramento >= ?").get(agora).n;
    const somaValor = d.prepare("SELECT COALESCE(SUM(valor),0) AS s FROM editais WHERE encerramento >= ?").get(agora).s;
    const comValor = d.prepare("SELECT COUNT(*) AS n FROM editais WHERE encerramento >= ? AND valor > 0").get(agora).n;
    const range = d.prepare("SELECT MIN(encerramento) AS de, MAX(encerramento) AS ate FROM editais WHERE encerramento >= ?").get(agora);
    return { total, somaValor, comValor, range: range.de ? range : null, amostra: [] };
  }
  const candidatos = consultar({ ufs: uf ? [uf] : [], apenasAbertos: true });
  const termos = termo && termo.trim() ? [termo.trim()] : [];
  // Expande produto -> ramo: quem busca "atadura" ve os editais de "material
  // hospitalar" (o produto mora nos itens, nao no objeto). Sem isso a LP dava
  // zero e matava cadastro. termosAmplos cobre o caso de termo de 2 palavras.
  const expandido = [...termosAmplos(termos), ...expandirTermos(termos)];
  // Exclui obra/servico quando o termo e um produto de ramo que pede isso (ex:
  // "cimento" nao deve trazer licitacao de OBRA, so a compra do material).
  const excluirList = excluirTermos(termos);
  // Precisao primeiro (objeto literal + itens); so abre pro ramo se vier pouco.
  let casaram = casarComExpansao(candidatos, termos, termo, expandido, excluirList);

  // Ordena por relevancia: editais onde o termo aparece mais cedo no objeto
  // (assunto central) vem antes dos que so mencionam de passagem. Empate = prazo.
  const termoNorm = termos.length ? normalizar(termos[0]) : "";
  const posicao = (e) => { if (!termoNorm) return 0; const i = normalizar(e.objeto).indexOf(termoNorm); return i < 0 ? 1e9 : i; };
  // PRECISOS (objeto/itens) primeiro; depois os do ramo. Dentro de cada tier,
  // por relevancia (posicao do termo) e prazo. Evita medicamento (so ramo) vir
  // antes de um edital que tem luva de verdade.
  casaram.sort((a, b) => (b._preciso ? 1 : 0) - (a._preciso ? 1 : 0) || posicao(a) - posicao(b) || (a.encerramento || "").localeCompare(b.encerramento || ""));
  casaram = dedupEditais(casaram);

  const somaValor = casaram.reduce((s, e) => s + (e.valorEstimado || 0), 0);
  // Range temporal: ajuda o cliente a entender de QUE periodo sao os resultados
  // (vai desde o que encerra hoje ate o mais distante)
  const datas = casaram.map((e) => e.encerramento).filter(Boolean).sort();
  const range = datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null;
  const comValor = casaram.filter((e) => e.valorEstimado > 0).length;
  const amostra = casaram.slice(0, limite).map((e) => ({
    id: e.id, municipio: e.municipio, uf: e.uf, orgao: e.orgao, objeto: e.objeto,
    valorEstimado: e.valorEstimado, encerramento: e.encerramento, modalidade: e.modalidade, link: e.link,
    itemCasado: e._itemCasado || null,
  }));
  return { total: casaram.length, somaValor, comValor, range, amostra };
}

// Busca livre no acervo (usada pelo painel): por termo, UF e modalidade.
// Devolve a lista de editais (nao so estatisticas), ranqueada por relevancia.
export function buscarEditais({ uf = null, ufs = null, termo = "", termos: termosParam = null, modalidades = [], cidade = "", prazoDias = null, dataDe = null, dataAte = null, pubDe = null, pubAte = null, numeroEdital = null, valorMin = null, valorMax = null, srp = null, excluir = [], limite = 60, pagina = null, porPag = null } = {}) {
  // Aceita ufs (array) ou uf (string simples, retrocompativel).
  const ufsArr = ufs && ufs.length ? ufs : (uf ? [uf] : []);
  const candidatos = consultar({ ufs: ufsArr, modalidades, valorMin, valorMax, apenasAbertos: true });
  // Aceita termos (array, usado pelo export do painel) ou termo (string, busca livre).
  const termos = termosParam?.length ? termosParam : (termo && termo.trim() ? [termo.trim()] : []);
  // Expande produto -> ramo (atadura -> hospitalar), igual a LP. So na busca
  // LIVRE (string digitada); quando vem termosParam (export do perfil) o perfil
  // ja traz seus proprios termosIA, entao nao reexpande.
  // Palavras a excluir = filtros avancados do cliente + exclusoes de ramo (obra/
  // servico) quando a busca livre e por produto. Nao reexpande quando vem perfil.
  const excluirRamoAuto = termosParam?.length ? [] : excluirTermos(termos);
  const excluirList = [...excluir, ...excluirRamoAuto];
  let casaram;
  if (termosParam?.length) {
    // Perfil/export: usa os termos como vieram (ja sao o ramo do cliente).
    casaram = aplicarFiltro(candidatos, { termos, termosExcluir: excluirList });
  } else {
    // Busca livre do PAINEL: recall (painel cheio), com os PRECISOS (objeto +
    // itens) ranqueados no topo. O ramo vem abaixo. Sem o indice de itens nao da
    // pra ter "cheio" E "sem ramo errado" ao mesmo tempo (so o titulo e visivel).
    const expandido = [...termosAmplos(termos), ...expandirTermos(termos)];
    casaram = casarComExpansao(candidatos, termos, termo, expandido, excluirList);
  }
  // Registro de Precos (SRP): "sim" so atas, "nao" sem ata.
  if (srp === "sim") casaram = casaram.filter((e) => e.srp);
  else if (srp === "nao") casaram = casaram.filter((e) => !e.srp);

  // Filtro por cidade (compara sem acento/caixa; aceita parte do nome).
  if (cidade && cidade.trim()) {
    const cn = normalizar(cidade.trim());
    casaram = casaram.filter((e) => normalizar(e.municipio || "").includes(cn));
  }

  // Filtro por prazo: editais que encerram nos proximos N dias.
  if (prazoDias) {
    const ate = new Date(Date.now() + Number(prazoDias) * 864e5).toISOString();
    casaram = casaram.filter((e) => e.encerramento && e.encerramento <= ate);
  }
  // Filtro por intervalo de datas (encerramento entre dataDe e dataAte, inclusivo).
  if (dataDe) casaram = casaram.filter((e) => e.encerramento && e.encerramento >= dataDe);
  if (dataAte) {
    const fim = dataAte.length === 10 ? dataAte + "T23:59:59.999Z" : dataAte;
    casaram = casaram.filter((e) => e.encerramento && e.encerramento <= fim);
  }
  // Filtro por DATA DE PUBLICACAO/INCLUSAO (quando o edital entrou no PNCP), nao
  // o prazo. Pedido de cliente: achar editais "publicados hoje/ontem/no periodo".
  if (pubDe) casaram = casaram.filter((e) => e.publicacao && e.publicacao >= pubDe);
  if (pubAte) {
    const fim = pubAte.length === 10 ? pubAte + "T23:59:59.999Z" : pubAte;
    casaram = casaram.filter((e) => e.publicacao && e.publicacao <= fim);
  }
  // Filtro por Nº do edital do orgao (ex: "3/2026"). Casa no numero amigavel e,
  // como reforco, no numero de controle PNCP (id) — cobre acervo antigo sem o
  // numero_compra preenchido ainda.
  if (numeroEdital && numeroEdital.trim()) {
    const q = normalizar(numeroEdital.trim()).replace(/\s+/g, "");
    casaram = casaram.filter((e) =>
      normalizar(e.numeroCompra || "").replace(/\s+/g, "").includes(q) ||
      String(e.id || "").toLowerCase().includes(q)
    );
  }

  // Ordenacao: PRAZO primeiro (urgencia), relevancia como desempate.
  // Editais que encerram antes vem antes — o cliente quer correr atras dos
  // mais urgentes. Editais sem data ficam no fim.
  const termoNorm = termos.length ? normalizar(termos[0]).replace(/"/g, "") : "";
  const posicao = (e) => { if (!termoNorm) return 0; const i = normalizar(e.objeto).indexOf(termoNorm); return i < 0 ? 1e9 : i; };
  casaram.sort((a, b) => {
    const p = (b._preciso ? 1 : 0) - (a._preciso ? 1 : 0); // precisos (objeto/itens) primeiro
    if (p) return p;
    const ea = a.encerramento || "9999-12-31";
    const eb = b.encerramento || "9999-12-31";
    return ea.localeCompare(eb) || posicao(a) - posicao(b);
  });

  const unicos = dedupEditais(casaram);
  const total = unicos.length;
  // Modo paginado (pagina + porPag): devolve a fatia da pagina + metadados.
  // Modo legado (so limite): devolve os primeiros `limite` (export do painel usa).
  if (pagina && porPag) {
    const pp = Math.max(1, Number(porPag));
    const paginas = Math.max(1, Math.ceil(total / pp));
    const p = Math.min(Math.max(1, Number(pagina)), paginas);
    return { total, paginas, pagina: p, porPag: pp, editais: unicos.slice((p - 1) * pp, p * pp) };
  }
  return { total, editais: unicos.slice(0, limite) };
}

// Colapsa editais quase-identicos (mesma compra republicada no PNCP com sequenciais
// diferentes ou sob duas unidades): mesmo orgao + mesmo objeto + mesmo valor.
// Mantem o primeiro (ja ordenado por prazo/relevancia) e descarta as repeticoes.
//
// Pra absorver variacoes minimas ("preco" vs "precos", "+textil" no fim, etc):
// 1. Normaliza acentos/caixa
// 2. Remove "s" final de cada palavra (plurais simples)
// 3. Tira pontuacao e espacos extras
// 4. Usa so os primeiros 40 caracteres como chave + orgao + valor
function chaveDedupe(obj) {
  return normalizar(obj || "")
    .replace(/[^a-z0-9 ]/g, " ")  // tira pontuacao
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ""))  // remove "s" final (plurais)
    .filter(Boolean)
    .join(" ")
    .slice(0, 40);  // primeiros 40 chars normalizados
}

export function dedupEditais(lista) {
  const vistos = new Set();
  const out = [];
  for (const e of lista) {
    const org = e.orgaoCnpj || e.orgao || "";
    const val = e.valorEstimado;
    // Com valor confiavel: mesmo orgao + valor + inicio normalizado do objeto.
    // Sem valor: inicio do objeto inteiro (mais conservador).
    const ini = chaveDedupe(e.objeto);
    const chave = val && val > 0
      ? `${org}|${Math.round(val * 100)}|${ini}`
      : `${org}|0|${ini}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(e);
  }
  return out;
}

// Estatisticas rapidas do acervo (para diagnostico).
export function estatisticas() {
  const d = abrir();
  const total = d.prepare("SELECT COUNT(*) AS n FROM editais").get().n;
  const porUf = d.prepare(
    "SELECT uf, COUNT(*) AS n FROM editais GROUP BY uf ORDER BY n DESC LIMIT 10"
  ).all();
  const abertos = d.prepare(
    "SELECT COUNT(*) AS n FROM editais WHERE encerramento >= ?"
  ).get(new Date().toISOString()).n;
  return { total, abertos, porUf };
}

// Consulta o acervo para um perfil. Faz o recorte grosso no SQL (UF, modalidade,
// valor, ainda aberto) e devolve as linhas; o filtro de palavra-chave roda depois.
export function consultar({ ufs = [], modalidades = [], valorMin = null, valorMax = null, apenasAbertos = true } = {}) {
  const d = abrir();
  const cond = [];
  const args = [];

  if (ufs.length) {
    cond.push(`uf IN (${ufs.map(() => "?").join(",")})`);
    args.push(...ufs);
  }
  if (modalidades.length) {
    cond.push(`modalidade_id IN (${modalidades.map(() => "?").join(",")})`);
    args.push(...modalidades);
  }
  if (valorMin != null) {
    cond.push("valor >= ?");
    args.push(valorMin);
  }
  if (valorMax != null) {
    cond.push("valor <= ?");
    args.push(valorMax);
  }
  if (apenasAbertos) {
    cond.push("encerramento >= ?");
    args.push(new Date().toISOString());
    // Nao mostra edital MORTO (revogado/anulado) como oportunidade viva. Suspensa
    // fica (pode voltar) e recebe selo de aviso no card.
    cond.push("(situacao IS NULL OR situacao NOT IN ('Revogada', 'Anulada'))");
  }

  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  // LIMIT defensivo: protege contra OOM em consultas amplas (Brasil + multiplas
  // modalidades pode retornar 27k+ editais). Usuarios reais nao processam alem
  // de algumas centenas - o filtro fino e feito depois em JS via aplicarFiltro.
  const linhas = d.prepare(`SELECT * FROM editais ${where} ORDER BY encerramento ASC LIMIT 8000`).all(...args);

  // Reconverte para o formato interno usado pelo resto do sistema.
  return linhas.map((l) => ({
    id: l.id,
    orgao: l.orgao,
    orgaoCnpj: l.orgao_cnpj,
    unidade: l.unidade,
    uf: l.uf,
    municipio: l.municipio,
    objeto: l.objeto,
    modalidade: l.modalidade,
    modalidadeId: l.modalidade_id,
    valorEstimado: l.valor,
    abertura: l.abertura,
    encerramento: l.encerramento,
    situacao: l.situacao,
    publicacao: l.publicacao,
    link: l.link,
    srp: Boolean(l.srp),
    ano: l.ano,
    sequencial: l.sequencial,
    numeroCompra: l.numero_compra,
  }));
}

// ===== Consultas para paginas SEO de orgaos =====

// Lista os orgaos com mais editais/contratos no acervo (top N), agregando por
// CNPJ do orgao (mais confiavel que nome). Usado pra gerar paginas /orgaos/<slug>.
export function topOrgaos({ limite = 800, minimoContratos = 5 } = {}) {
  const d = abrir();
  // Une editais abertos + contratos historicos pra ranking de cobertura SEO.
  // Agrupamos pelo CNPJ (estavel) e pegamos o nome mais frequente.
  const linhas = d.prepare(`
    SELECT orgao_cnpj AS cnpj, orgao AS nome, uf, municipio,
           COUNT(*) AS contratos
    FROM contratos
    WHERE orgao_cnpj IS NOT NULL AND orgao_cnpj <> ''
    GROUP BY orgao_cnpj
    HAVING contratos >= ?
    ORDER BY contratos DESC
    LIMIT ?
  `).all(minimoContratos, limite);
  return linhas;
}

// Busca um orgao especifico pelo CNPJ (limpo, 14 digitos).
export function orgaoPorCnpj(cnpj) {
  const d = abrir();
  const limpo = String(cnpj || "").replace(/\D+/g, "");
  if (limpo.length !== 14) return null;
  const linha = d.prepare(`
    SELECT orgao_cnpj AS cnpj, orgao AS nome, uf, municipio,
           COUNT(*) AS contratos,
           MIN(publicacao) AS desde
    FROM contratos WHERE orgao_cnpj = ?
    GROUP BY orgao_cnpj
  `).get(limpo);
  if (!linha) return null;
  // editais abertos do mesmo orgao
  const editais = d.prepare(`
    SELECT id, objeto, modalidade, valor AS valorEstimado,
           encerramento, uf, municipio, link
    FROM editais WHERE orgao_cnpj = ? AND encerramento >= ?
    ORDER BY encerramento ASC LIMIT 20
  `).all(limpo, new Date().toISOString());
  // contratos recentes
  const contratos = d.prepare(`
    SELECT id, objeto, valor, fornecedor, vigencia_inicio AS vigenciaInicio
    FROM contratos WHERE orgao_cnpj = ?
    ORDER BY publicacao DESC LIMIT 20
  `).all(limpo);
  return { ...linha, editais, contratos };
}

// ===== Consultas para paginas SEO de CNAE =====

// Editais que casam com palavras-chave do CNAE (na pratica, redirecionamos pro
// mesmo motor de filtro de termos). Esta funcao apenas conta + retorna os ids
// pra paginacao - a renderizacao usa as funcoes existentes.
export function editaisPorTermos({ termos = [], uf = null, limite = 24 } = {}) {
  const d = abrir();
  // LIMIT defensivo: editais abertos podem chegar a 27k no Brasil. Carregar
  // todos em memoria em cada request causa OOM (visto em logs Railway).
  // 5000 editais cobre 99% dos casos reais de filtro por termo, e o JS depois
  // filtra ainda mais (.filter). Caso usuario precise navegar alem disso, ja
  // ha paginacao via "limite" no JS.
  const cand = d.prepare(`
    SELECT id, orgao, orgao_cnpj AS orgaoCnpj, uf, municipio, objeto,
           modalidade, valor AS valorEstimado, encerramento, link
    FROM editais
    WHERE encerramento >= ? ${uf ? "AND uf = ?" : ""}
    ORDER BY encerramento ASC
    LIMIT 5000
  `).all(new Date().toISOString(), ...(uf ? [uf] : []));
  // Filtro de termos: cobre acentos/maiusculas (normaliza).
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const termosN = termos.map((t) => norm(t)).filter(Boolean);
  if (!termosN.length) return { total: cand.length, editais: cand.slice(0, limite) };
  const casaram = cand.filter((e) => {
    const txt = norm(e.objeto + " " + e.orgao);
    return termosN.some((t) => txt.includes(t));
  });
  return { total: casaram.length, editais: casaram.slice(0, limite) };
}
