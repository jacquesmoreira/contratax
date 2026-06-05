// Acesso runtime aos dados de CAPAG (Capacidade de Pagamento) do Tesouro
// Nacional. A planilha XLSX e baixada e convertida via scripts/baixar-capag.mjs
// (rodar 1x por ano - CAPAG e anual). Em runtime apenas lemos data/capag-
// municipios.json e indexamos em memoria por UF + nome normalizado.
//
// Notas CAPAG (do mais positivo ao mais negativo):
//   A+, A, B+, B, C, D, D-
// E ainda existem rotulos administrativos quando o municipio nao entregou
// dados ou nao foi avaliado:
//   "n.d." (nao disponivel), "n.e." (nao enviou), "#N/A"
//
// Mapeamento da nota CAPAG -> dias medios estimados ate pagamento:
//   A+ -> 22d  (paga rapido)
//   A  -> 28d
//   B+ -> 35d
//   B  -> 45d  (paga em dia, mas no limite)
//   C  -> 65d  (atrasos frequentes, fluxo apertado)
//   D  -> 95d  (atraso recorrente, capacidade comprometida)
//   D- -> 125d (situacao critica)
//
// Esse mapeamento e uma heuristica que correlaciona capacidade de pagamento
// com tempo medio observado. A literatura do Tesouro mostra que municipios
// A+ tem capacidade folgada para honrar compromissos no prazo legal de 30
// dias, enquanto C/D acumulam restos a pagar (despesas liquidadas e nao
// quitadas), gerando atrasos crescentes.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = resolve(fileURLToPath(import.meta.url), "..");
const ARQ = resolve(AQUI, "dados", "capag-municipios.json");

const DIAS_POR_NOTA = {
  "A+": 22, A: 28, "B+": 35, B: 45, C: 65, D: 95, "D-": 125,
};

function classe(dias) {
  if (dias <= 35) return "rapido";
  if (dias <= 55) return "regular";
  return "lento";
}

function normalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().trim();
}

let _idx = null;       // Map<"UF|NOME_NORM" -> registro>
let _meta = null;      // { atualizadoEm, totalRegistros }

async function carregar() {
  if (_idx) return _idx;
  try {
    const cru = JSON.parse(await readFile(ARQ, "utf8"));
    const map = new Map();
    for (const r of cru.registros) {
      map.set(r.uf + "|" + normalizar(r.nome), r);
    }
    _idx = map;
    _meta = { atualizadoEm: cru.atualizadoEm, totalRegistros: cru.totalRegistros };
  } catch (e) {
    // Sem arquivo CAPAG: tudo cai pra fallback
    _idx = new Map();
    _meta = { atualizadoEm: null, totalRegistros: 0 };
  }
  return _idx;
}

// Tenta extrair o nome do municipio do nome do orgao.
//   "PREFEITURA MUNICIPAL DE FLORIANOPOLIS" -> "FLORIANOPOLIS"
//   "CAMARA MUNICIPAL DE BALNEARIO CAMBORIU" -> "BALNEARIO CAMBORIU"
//   "FUNDO MUNICIPAL DE SAUDE DE PALHOCA" -> "PALHOCA"
// Devolve null se nao parecer ser um orgao municipal.
export function extrairMunicipioDoOrgao(nomeOrgao) {
  const n = normalizar(nomeOrgao);
  if (!n) return null;
  if (/MINISTERIO|\bUNIAO\b|\bFEDERAL\b|UNIVERSIDADE FEDERAL|\bINSS\b|TRIBUNAL SUPERIOR|\bMARINHA\b|\bEXERCITO\b|AERONAUTICA/.test(n)) return null;
  if (/GOVERNO DO ESTADO|TRIBUNAL DE JUSTICA|ASSEMBLEIA LEGISLATIVA|UNIVERSIDADE ESTADUAL|POLICIA MILITAR|MINISTERIO PUBLICO DO ESTADO/.test(n)) return null;
  // So opera em nomes que comecam (ou contem cedo) por um qualificador municipal.
  if (!/\b(PREFEITURA|MUNICIPIO|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL|GUARDA MUNICIPAL|FUNDACAO MUNICIPAL|HOSPITAL MUNICIPAL|AUTARQUIA MUNICIPAL)\b/.test(n)) return null;
  // Remove sufixo "/UF" ou " - UF" no final.
  const limpo = n.replace(/\s*[\/\-]\s*[A-Z]{2}\s*$/, "");
  // Split por " DE | DO | DA " - o ULTIMO segmento e quase sempre o municipio.
  // Funciona pra: "PREFEITURA MUNICIPAL DE X", "FUNDO MUNICIPAL DE SAUDE DE X",
  // "SECRETARIA MUNICIPAL DE EDUCACAO DE X", etc.
  const partes = limpo.split(/\s+(?:DE|DO|DA|DOS|DAS)\s+/);
  if (partes.length < 2) return null;
  const cidade = partes[partes.length - 1].trim();
  if (!cidade || cidade.length < 3) return null;
  return cidade;
}

// API publica: capag(uf, municipio) ou capagPorNomeOrgao(uf, nomeOrgao)
export async function capagDoMunicipio(uf, municipio) {
  if (!uf || !municipio) return null;
  const idx = await carregar();
  return idx.get(normalizar(uf) + "|" + normalizar(municipio)) || null;
}

export async function capagPorNomeOrgao(uf, nomeOrgao) {
  if (!uf) return null;
  const muni = extrairMunicipioDoOrgao(nomeOrgao);
  if (!muni) return null;
  return await capagDoMunicipio(uf, muni);
}

// Traducao da nota CAPAG em estimativa de dias / classificacao
export function estimarPorCapag(registro) {
  if (!registro) return null;
  const nota = registro.capag;
  const dias = DIAS_POR_NOTA[nota];
  if (!dias) return null; // n.d., n.e., #N/A nao convertem
  return {
    diasMedios: dias,
    classificacao: classe(dias),
    nota,
    municipio: registro.nome,
    uf: registro.uf,
  };
}

export async function metaCapag() {
  await carregar();
  return { ..._meta, notas: Object.keys(DIAS_POR_NOTA) };
}
