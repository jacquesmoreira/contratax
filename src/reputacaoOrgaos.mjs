// Reputacao de pagamento dos orgaos publicos.
//
// Cruza:
//   1) Dados PROPRIOS - NFs marcadas como pagas no modulo Recebiveis. Pra cada
//      orgao_cnpj, calcula media de (data_pagamento - data_emissao). Esses sao
//      os dados mais confiaveis, mas dependem de escala.
//   2) Estimativa heuristica por tipo/porte do orgao quando nao temos dados:
//      - Uniao (CNPJ comeca com xxxxxxxx0001-xx + listados): 30-35d
//      - Estados (sao 27 CNPJs conhecidos): 35-45d
//      - Capitais (>500k hab): 40-50d
//      - Municipios medios: 50-65d
//      - Municipios pequenos: 60-90d
//
// API publica: getReputacao(cnpj, orgaoNome). Retorna {diasMedios, fonte, n,
// classificacao}, onde classificacao e "rapido" / "regular" / "lento".

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./caminhos.mjs";

const ARQUIVO = resolve(DATA_DIR, "licita.db");
let _db;
function abrir() {
  if (_db) return _db;
  _db = new DatabaseSync(ARQUIVO);
  return _db;
}

// Apenas digitos
function digitos(s) { return String(s || "").replace(/\D+/g, ""); }

// Heuristica por palavras-chave no nome do orgao.
function estimarHeuristica(orgaoNome) {
  const n = String(orgaoNome || "").toUpperCase();
  if (/\b(MINIST[ÉE]RIO|UNI[ÃA]O|PRESID[ÊE]NCIA|FEDERAL|MARINHA|EX[ÉE]RCITO|AERON[ÁA]UTICA|INSS|RECEITA|TRIBUNAL SUPERIOR|STF|STJ)\b/.test(n))
    return { diasMedios: 32, classificacao: "rapido", contexto: "Esfera federal tende a pagar em 30-35 dias." };
  if (/\bESTADO|GOVERNO DO ESTADO|SECRETARIA DE ESTADO|TRIBUNAL DE JUSTI[ÇC]A|TJ |TJ-|ALESC|ALE-|ASSEMBLEIA LEGISLATIVA\b/.test(n))
    return { diasMedios: 42, classificacao: "regular", contexto: "Esfera estadual tende a pagar em 35-50 dias." };
  if (/\bCAPITAL|FLORIAN[OÓ]POLIS|S[AÃ]O PAULO|RIO DE JANEIRO|BELO HORIZONTE|CURITIBA|PORTO ALEGRE|SALVADOR|RECIFE|FORTALEZA|BRAS[IÍ]LIA|MANAUS|BEL[EÉ]M\b/.test(n))
    return { diasMedios: 48, classificacao: "regular", contexto: "Capitais tendem a pagar em 40-55 dias." };
  if (/\bPREFEITURA|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL\b/.test(n))
    return { diasMedios: 65, classificacao: "lento", contexto: "Prefeituras de pequeno/medio porte costumam atrasar 60-90 dias." };
  return { diasMedios: 55, classificacao: "regular", contexto: "Sem historico suficiente. Estimativa media geral do setor publico." };
}

// Busca dados proprios (NFs pagas dos clientes).
function mediaPropria(cnpj) {
  const d = digitos(cnpj);
  if (!d) return null;
  try {
    const linha = abrir().prepare(`
      SELECT COUNT(*) AS n,
             AVG(julianday(data_pagamento) - julianday(data_emissao)) AS media
      FROM notas_fiscais
      WHERE orgao_cnpj = ? AND data_pagamento IS NOT NULL
    `).get(d);
    if (!linha || !linha.n || linha.n < 2) return null;
    return { diasMedios: Math.round(linha.media), n: linha.n };
  } catch {
    // Tabela ainda nao existe (recebiveis.mjs nao foi importado neste processo).
    return null;
  }
}

function classificar(dias) {
  if (dias <= 35) return "rapido";
  if (dias <= 55) return "regular";
  return "lento";
}

// API publica
export function reputacaoDoOrgao({ cnpj, nome }) {
  const propria = mediaPropria(cnpj);
  if (propria) {
    return {
      diasMedios: propria.diasMedios,
      fonte: "dados_proprios",
      n: propria.n,
      classificacao: classificar(propria.diasMedios),
      contexto: `Baseado em ${propria.n} NF(s) que outros clientes do ContrataX receberam desse orgao.`,
    };
  }
  const h = estimarHeuristica(nome);
  return {
    diasMedios: h.diasMedios,
    fonte: "estimativa",
    n: 0,
    classificacao: h.classificacao,
    contexto: h.contexto,
  };
}
