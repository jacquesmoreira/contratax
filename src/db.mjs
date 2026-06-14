// Camada de banco (SQLite embutido do Node, sem dependencia externa).
// Guarda o acervo nacional de editais e responde consultas por perfil de cliente.

import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { normalizar, aplicarFiltro } from "./filtro.mjs";
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

  return db;
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
       publicacao, link, srp, ano, sequencial, visto_em)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      valor = excluded.valor,
      encerramento = excluded.encerramento,
      situacao = excluded.situacao,
      link = excluded.link
  `);

  d.exec("BEGIN");
  try {
    for (const e of editais) {
      stmt.run(
        e.id, e.orgao, e.orgaoCnpj, e.unidade, e.uf, e.municipio, e.objeto,
        normalizar(e.objeto), e.modalidade, e.modalidadeId, e.valorEstimado,
        e.abertura, e.encerramento, e.situacao, e.publicacao, e.link,
        e.srp ? 1 : 0, e.ano, e.sequencial, agora
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
  };
}

// Remove editais ja encerrados ha mais de `graceDias` dias, para o acervo nao
// crescer para sempre. A folga evita apagar algo que acabou de encerrar.
export function removerExpirados({ graceDias = 3 } = {}) {
  const d = abrir();
  const limite = new Date(Date.now() - graceDias * 864e5).toISOString();
  const r = d.prepare("DELETE FROM editais WHERE encerramento < ?").run(limite);
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

// Busca publica da landing page: por UF e termo livre, devolve o total, a soma
// dos valores e uma amostra dos editais abertos. Sem perfil, sem login.
export function buscaPublica({ uf = null, termo = "", limite = 15 } = {}) {
  const candidatos = consultar({ ufs: uf ? [uf] : [], apenasAbertos: true });
  const termos = termo && termo.trim() ? [termo.trim()] : [];
  let casaram = aplicarFiltro(candidatos, { termos });

  // Ordena por relevancia: editais onde o termo aparece mais cedo no objeto
  // (assunto central) vem antes dos que so mencionam de passagem. Empate = prazo.
  const termoNorm = termos.length ? normalizar(termos[0]) : "";
  const posicao = (e) => { if (!termoNorm) return 0; const i = normalizar(e.objeto).indexOf(termoNorm); return i < 0 ? 1e9 : i; };
  casaram.sort((a, b) => posicao(a) - posicao(b) || (a.encerramento || "").localeCompare(b.encerramento || ""));
  casaram = dedupEditais(casaram);

  const somaValor = casaram.reduce((s, e) => s + (e.valorEstimado || 0), 0);
  // Range temporal: ajuda o cliente a entender de QUE periodo sao os resultados
  // (vai desde o que encerra hoje ate o mais distante)
  const datas = casaram.map((e) => e.encerramento).filter(Boolean).sort();
  const range = datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null;
  const comValor = casaram.filter((e) => e.valorEstimado > 0).length;
  const amostra = casaram.slice(0, limite).map((e) => ({
    municipio: e.municipio, uf: e.uf, orgao: e.orgao, objeto: e.objeto,
    valorEstimado: e.valorEstimado, encerramento: e.encerramento, modalidade: e.modalidade, link: e.link,
  }));
  return { total: casaram.length, somaValor, comValor, range, amostra };
}

// Busca livre no acervo (usada pelo painel): por termo, UF e modalidade.
// Devolve a lista de editais (nao so estatisticas), ranqueada por relevancia.
export function buscarEditais({ uf = null, ufs = null, termo = "", termos: termosParam = null, modalidades = [], cidade = "", prazoDias = null, dataDe = null, dataAte = null, limite = 60, pagina = null, porPag = null } = {}) {
  // Aceita ufs (array) ou uf (string simples, retrocompativel).
  const ufsArr = ufs && ufs.length ? ufs : (uf ? [uf] : []);
  const candidatos = consultar({ ufs: ufsArr, modalidades, apenasAbertos: true });
  // Aceita termos (array, usado pelo export do painel) ou termo (string, busca livre).
  const termos = termosParam?.length ? termosParam : (termo && termo.trim() ? [termo.trim()] : []);
  let casaram = aplicarFiltro(candidatos, { termos });

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

  // Ordenacao: PRAZO primeiro (urgencia), relevancia como desempate.
  // Editais que encerram antes vem antes — o cliente quer correr atras dos
  // mais urgentes. Editais sem data ficam no fim.
  const termoNorm = termos.length ? normalizar(termos[0]).replace(/"/g, "") : "";
  const posicao = (e) => { if (!termoNorm) return 0; const i = normalizar(e.objeto).indexOf(termoNorm); return i < 0 ? 1e9 : i; };
  casaram.sort((a, b) => {
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
