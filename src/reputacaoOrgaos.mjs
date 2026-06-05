// Reputacao de pagamento dos orgaos publicos.
//
// Cruza:
//   1) Dados PROPRIOS - NFs marcadas como pagas no modulo Recebiveis. Pra cada
//      orgao_cnpj, calcula media de (data_pagamento - data_emissao). Esses sao
//      os dados mais confiaveis, mas dependem de escala.
//   2) Estimativa heuristica por tipo/porte do orgao quando nao temos dados:
//      - Federal: 32d (rapido)
//      - Estados / TJs: 42d (regular)
//      - Capitais e grandes municipios (>500k hab): 48d (regular)
//      - Municipios medios (entre 100k e 500k): 58d (regular/lento)
//      - Municipios pequenos: 72d (lento)
//
// API publica: reputacaoDoOrgao({cnpj, nome}). Retorna:
//   { diasMedios, fonte, n, classificacao, contexto, fonteDetalhe }

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

function digitos(s) { return String(s || "").replace(/\D+/g, ""); }
function normalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Capitais brasileiras (todas) + grandes municipios > 500k habitantes (IBGE 2022).
// Estes pagam, em media, melhor que prefeituras pequenas.
const GRANDES_MUNICIPIOS = new Set([
  // Capitais
  "ARACAJU","BELEM","BELO HORIZONTE","BOA VISTA","BRASILIA","CAMPO GRANDE",
  "CUIABA","CURITIBA","FLORIANOPOLIS","FORTALEZA","GOIANIA","JOAO PESSOA",
  "MACAPA","MACEIO","MANAUS","NATAL","PALMAS","PORTO ALEGRE","PORTO VELHO",
  "RECIFE","RIO BRANCO","RIO DE JANEIRO","SALVADOR","SAO LUIS","SAO PAULO",
  "TERESINA","VITORIA",
  // > 500k habitantes (parcial, principais)
  "GUARULHOS","CAMPINAS","SAO GONCALO","DUQUE DE CAXIAS","NOVA IGUACU",
  "SAO BERNARDO DO CAMPO","SAO JOSE DOS CAMPOS","SANTO ANDRE","RIBEIRAO PRETO",
  "OSASCO","JABOATAO DOS GUARARAPES","CONTAGEM","SOROCABA","UBERLANDIA",
  "ARACAJU","FEIRA DE SANTANA","CUIABA","JOINVILLE","LONDRINA","JUIZ DE FORA",
  "ANANINDEUA","NITEROI","BELFORD ROXO","CAMPOS DOS GOYTACAZES","SAO JOAO DE MERITI",
  "APARECIDA DE GOIANIA","CAXIAS DO SUL","CARAPICUIBA","MAUA","OLINDA","SERRA",
  "MOGI DAS CRUZES","DIADEMA","PIRACICABA","JUNDIAI","BAURU","ITAQUAQUECETUBA",
  "CARIACICA","SAO JOSE","FRANCA","ANAPOLIS","PETROPOLIS","VITORIA DA CONQUISTA",
  "PAULISTA","PONTA GROSSA","VILA VELHA","CANOAS","UBERABA","BLUMENAU","RIBEIRAO DAS NEVES",
  "MARINGA","PORTO VELHO","CAUCAIA","MONTES CLAROS","VOLTA REDONDA","SANTOS",
  "CHAPECO","CRICIUMA","ITAJAI","BALNEARIO CAMBORIU","SAO JOSE DOS PINHAIS"
]);

// Municipios medios conhecidos (entre 100k e 500k habitantes), recorte pratico
// para nao deixar TODOS caindo no balde "pequenos = 72d". Lista nao exaustiva,
// mas com os principais.
const MEDIOS_MUNICIPIOS = new Set([
  "PALHOCA","SAO JOSE","TUBARAO","LAGES","JARAGUA DO SUL","RIO DO SUL",
  "BRUSQUE","BIGUACU","NAVEGANTES","CONCORDIA","SAO BENTO DO SUL",
  "SAO MIGUEL DO OESTE","INDAIAL","CAMBORIU","GASPAR",
  // muitos outros - lista pratica
]);

function detectarTipo(nome) {
  const n = normalizar(nome);
  if (!n) return { tipo: "desconhecido" };
  // Federal
  if (/\b(MINISTERIO|UNIAO|PRESIDENCIA|FEDERAL\b|MARINHA|EXERCITO|AERONAUTICA|FORCAS ARMADAS|INSS|RECEITA FEDERAL|FAZENDA NACIONAL|TRIBUNAL SUPERIOR|STF|STJ|TST|TSE|EMPRESA BRASILEIRA|EMBRAPA|FIOCRUZ|IBGE|IBAMA|ICMBIO|ANEEL|ANVISA|UNIVERSIDADE FEDERAL|INSTITUTO FEDERAL|HOSPITAL UNIVERSITARIO|EBSERH|CORREIOS)\b/.test(n))
    return { tipo: "federal" };
  // Estadual
  if (/\b(GOVERNO DO ESTADO|SECRETARIA DE ESTADO|TRIBUNAL DE JUSTICA|TJ-|TJ |ASSEMBLEIA LEGISLATIVA|POLICIA MILITAR|POLICIA CIVIL|CORPO DE BOMBEIROS|UNIVERSIDADE ESTADUAL|DEFENSORIA PUBLICA DO ESTADO|MINISTERIO PUBLICO DO ESTADO|MP-|FUNDACAO ESTADUAL)\b/.test(n))
    return { tipo: "estadual" };
  // Municipal - tenta extrair o nome do municipio depois de "DE"
  if (/\b(PREFEITURA|MUNICIPIO|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL|GUARDA MUNICIPAL)\b/.test(n)) {
    const cidadeMatch = n.match(/(?:DE|DO|DA)\s+([A-Z][A-Z\s]+?)(?:\s*[\/\-,]|$)/);
    const cidade = cidadeMatch ? cidadeMatch[1].trim() : "";
    if (cidade && GRANDES_MUNICIPIOS.has(cidade)) return { tipo: "capital_grande", cidade };
    if (cidade && MEDIOS_MUNICIPIOS.has(cidade)) return { tipo: "municipio_medio", cidade };
    return { tipo: "municipio_pequeno", cidade };
  }
  return { tipo: "desconhecido" };
}

function heuristica(nome) {
  const det = detectarTipo(nome);
  const por = {
    federal:           { dias: 32, classe: "rapido",  ctx: "Esfera federal tende a pagar em 30 a 35 dias." },
    estadual:          { dias: 42, classe: "regular", ctx: "Esfera estadual tende a pagar em 35 a 50 dias." },
    capital_grande:    { dias: 48, classe: "regular", ctx: "Capitais e municipios com mais de 500 mil habitantes pagam em media em 40 a 55 dias." },
    municipio_medio:   { dias: 58, classe: "regular", ctx: "Municipios medios (100 a 500 mil habitantes) pagam em media em 50 a 70 dias." },
    municipio_pequeno: { dias: 72, classe: "lento",   ctx: "Prefeituras pequenas costumam atrasar entre 60 e 90 dias. Atrasos maiores acontecem em municipios com receita mais limitada." },
    desconhecido:      { dias: 55, classe: "regular", ctx: "Sem amostra suficiente para classificar. Usamos a media nacional do setor publico." },
  }[det.tipo];
  return {
    diasMedios: por.dias,
    classificacao: por.classe,
    contexto: por.ctx,
    fonteDetalhe: {
      tipo: det.tipo,
      cidade: det.cidade || null,
    },
  };
}

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
    return null;
  }
}

function classificar(dias) {
  if (dias <= 35) return "rapido";
  if (dias <= 55) return "regular";
  return "lento";
}

export function reputacaoDoOrgao({ cnpj, nome }) {
  const propria = mediaPropria(cnpj);
  if (propria) {
    return {
      diasMedios: propria.diasMedios,
      fonte: "dados_proprios",
      n: propria.n,
      classificacao: classificar(propria.diasMedios),
      contexto: `Baseado em ${propria.n} notas fiscais pagas registradas por outros clientes do ContrataX nesse mesmo orgao (CNPJ ${cnpj}).`,
      fonteDetalhe: { tipo: "dados_proprios", cnpj },
    };
  }
  const h = heuristica(nome);
  return {
    diasMedios: h.diasMedios,
    fonte: "estimativa",
    n: 0,
    classificacao: h.classificacao,
    contexto: h.contexto,
    fonteDetalhe: h.fonteDetalhe,
  };
}
