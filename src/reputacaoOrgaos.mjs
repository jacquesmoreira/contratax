// Reputacao de pagamento dos orgaos publicos.
//
// Tres camadas, da mais precisa para a menos:
//   1) Dados PROPRIOS - NFs marcadas como pagas no modulo Recebiveis.
//      Quando temos >=2 amostras para o mesmo CNPJ do orgao, usamos a media
//      real entre data de emissao e data de pagamento.
//   2) CAPAG (Capacidade de Pagamento) do Tesouro Nacional - classificacao
//      oficial anual A+/A/B+/B/C/D/D- de cada municipio brasileiro.
//      Mapeada em dias medios estimados.
//   3) Heuristica por tipo de orgao (federal/estadual/municipal) como fallback
//      final quando nao temos amostra propria nem CAPAG mapeado.
//
// API publica:
//   reputacaoDoOrgao({ cnpj, nome, uf, municipio }) -> Promise<reputacao>
//
//   reputacao = {
//     diasMedios, fonte, classificacao, contexto, fonteDetalhe, n
//   }

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./caminhos.mjs";
import { capagPorNomeOrgao, capagDoMunicipio, estimarPorCapag } from "./capag.mjs";

const ARQUIVO = resolve(DATA_DIR, "licita.db");
let _db;
function abrir() { if (_db) return _db; _db = new DatabaseSync(ARQUIVO); return _db; }

function digitos(s) { return String(s || "").replace(/\D+/g, ""); }
function normalizar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function detectarTipo(nome) {
  const n = normalizar(nome);
  if (!n) return { tipo: "desconhecido" };
  if (/\b(MINISTERIO|UNIAO|PRESIDENCIA|FEDERAL\b|MARINHA|EXERCITO|AERONAUTICA|INSS|RECEITA FEDERAL|TRIBUNAL SUPERIOR|STF|STJ|TST|TSE|EMBRAPA|FIOCRUZ|IBGE|IBAMA|UNIVERSIDADE FEDERAL|INSTITUTO FEDERAL|HOSPITAL UNIVERSITARIO|EBSERH|CORREIOS)\b/.test(n))
    return { tipo: "federal" };
  if (/\b(GOVERNO DO ESTADO|SECRETARIA DE ESTADO|TRIBUNAL DE JUSTICA|TJ-|ASSEMBLEIA LEGISLATIVA|POLICIA MILITAR|POLICIA CIVIL|CORPO DE BOMBEIROS|UNIVERSIDADE ESTADUAL|DEFENSORIA PUBLICA DO ESTADO|MINISTERIO PUBLICO DO ESTADO|FUNDACAO ESTADUAL)\b/.test(n))
    return { tipo: "estadual" };
  if (/\b(PREFEITURA|MUNICIPIO|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL|GUARDA MUNICIPAL)\b/.test(n))
    return { tipo: "municipal" };
  return { tipo: "desconhecido" };
}

function heuristicaFinal(nome) {
  const det = detectarTipo(nome);
  const por = {
    federal:     { dias: 32, classe: "rapido",  ctx: "Esfera federal tende a pagar em 30 a 35 dias." },
    estadual:    { dias: 42, classe: "regular", ctx: "Esfera estadual tende a pagar em 35 a 50 dias." },
    municipal:   { dias: 55, classe: "regular", ctx: "Sem CAPAG mapeado para esse municipio. Usamos a media nacional de prefeituras (40 a 70 dias)." },
    desconhecido:{ dias: 55, classe: "regular", ctx: "Sem amostra suficiente para classificar." },
  }[det.tipo];
  return {
    diasMedios: por.dias,
    classificacao: por.classe,
    contexto: por.ctx,
    fonteDetalhe: { tipo: det.tipo },
  };
}

function mediaPropria(cnpj) {
  const d = digitos(cnpj);
  if (!d) return null;
  try {
    const l = abrir().prepare(`
      SELECT COUNT(*) AS n,
             AVG(julianday(data_pagamento) - julianday(data_emissao)) AS media
      FROM notas_fiscais
      WHERE orgao_cnpj = ? AND data_pagamento IS NOT NULL
    `).get(d);
    if (!l || !l.n || l.n < 2) return null;
    return { diasMedios: Math.round(l.media), n: l.n };
  } catch { return null; }
}

function classificar(dias) {
  if (dias <= 35) return "rapido";
  if (dias <= 55) return "regular";
  return "lento";
}

const CONTEXTOS_CAPAG = {
  "A+": "CAPAG A+ - capacidade de pagamento alta. Municipio honra compromissos no prazo legal, com folga.",
  "A":  "CAPAG A - capacidade de pagamento boa. Pagamento dentro do prazo na maior parte dos casos.",
  "B+": "CAPAG B+ - capacidade adequada. Pagamento costuma sair em ate 35 dias.",
  "B":  "CAPAG B - capacidade no limite. Pagamento costuma sair em ate 45 dias.",
  "C":  "CAPAG C - capacidade fraca. Atrasos frequentes; orcamento apertado.",
  "D":  "CAPAG D - incapacidade de pagamento. Atrasos recorrentes e restos a pagar acumulados.",
  "D-": "CAPAG D- - situacao critica. Inadimplencia recorrente, recomenda-se cautela ao disputar.",
};

// API publica (assincrona por causa do CAPAG, que e lazy-loaded)
export async function reputacaoDoOrgao({ cnpj, nome, uf, municipio }) {
  // 1) Dados proprios (>=2 NFs pagas registradas)
  const propria = mediaPropria(cnpj);
  if (propria) {
    return {
      diasMedios: propria.diasMedios,
      fonte: "dados_proprios",
      n: propria.n,
      classificacao: classificar(propria.diasMedios),
      contexto: `Baseado em ${propria.n} notas fiscais pagas registradas por clientes do ContrataX nesse orgao (CNPJ ${cnpj}).`,
      fonteDetalhe: { tipo: "dados_proprios", cnpj },
    };
  }

  // 2) CAPAG Tesouro Nacional
  let capagRegistro = null;
  if (uf && municipio) capagRegistro = await capagDoMunicipio(uf, municipio);
  if (!capagRegistro && uf) capagRegistro = await capagPorNomeOrgao(uf, nome);
  const cap = estimarPorCapag(capagRegistro);
  if (cap) {
    return {
      diasMedios: cap.diasMedios,
      fonte: "capag",
      n: 0,
      classificacao: cap.classificacao,
      contexto: CONTEXTOS_CAPAG[cap.nota] || `CAPAG ${cap.nota}`,
      fonteDetalhe: {
        tipo: "capag",
        nota: cap.nota,
        municipio: cap.municipio,
        uf: cap.uf,
        notaDerivada: cap.fonteNota === "derivada",
        fonteOficial: "Tesouro Nacional - Capacidade de Pagamento (anual)",
      },
    };
  }

  // 3) Heuristica final
  const h = heuristicaFinal(nome);
  return {
    diasMedios: h.diasMedios,
    fonte: "estimativa",
    n: 0,
    classificacao: h.classificacao,
    contexto: h.contexto,
    fonteDetalhe: h.fonteDetalhe,
  };
}
