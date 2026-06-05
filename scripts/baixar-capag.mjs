// Baixa a planilha CAPAG (Capacidade de Pagamento) do Tesouro Nacional,
// parseia e gera data/capag-municipios.json - leitura instantanea em runtime.
//
// Rodar 1x por ano (CAPAG e anual). Em junho/2026 o file mais recente eh
// "capag-municipios-posicao-2025-nov-09".
//
// Uso:
//   node scripts/baixar-capag.mjs [URL_XLSX]
//
// O resultado tem o formato:
//   { atualizadoEm, anoBase, registros: [{uf, ibge, nome, capag}, ...] }
//
// CAPAG = "A" / "B" / "C" / "D" / "D-"  (vazio = nao avaliado)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "node:zlib"; // not used directly; usaremos inflateRawSync

// === Mini-parser de XLSX (zero deps) ===
// XLSX e ZIP de XMLs. Pra ler precisamos:
//   1) extrair sharedStrings.xml e a sheet1.xml do ZIP
//   2) parsear o XML, dereferenciando indices da SST
// Implementacao minima que cobre as celulas comuns (sem formatos custom).

import { createInflateRaw } from "node:zlib";

// Le um ZIP "stored" ou "deflated" puro e devolve { [filename]: Buffer }.
// Implementacao baseada no formato APPNOTE.TXT do PKZIP. Cobre os casos do
// XLSX padrao (compressao deflate = method 8 ou stored = method 0).
async function lerZip(buf) {
  const arquivos = {};
  // Procura End of Central Directory (assinatura 0x06054b50) buscando do fim
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP invalido: EOCD nao encontrado");
  const totalEntradas = buf.readUInt16LE(eocd + 10);
  let cdOff = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < totalEntradas; n++) {
    if (buf.readUInt32LE(cdOff) !== 0x02014b50) throw new Error("Central directory invalido");
    const metodo = buf.readUInt16LE(cdOff + 10);
    const tamCompr = buf.readUInt32LE(cdOff + 20);
    const tamSemCompr = buf.readUInt32LE(cdOff + 24);
    const nLen = buf.readUInt16LE(cdOff + 28);
    const eLen = buf.readUInt16LE(cdOff + 30);
    const cLen = buf.readUInt16LE(cdOff + 32);
    const lhOff = buf.readUInt32LE(cdOff + 42);
    const nome = buf.slice(cdOff + 46, cdOff + 46 + nLen).toString("utf8");
    // Local file header
    const lhNLen = buf.readUInt16LE(lhOff + 26);
    const lhELen = buf.readUInt16LE(lhOff + 28);
    const dataOff = lhOff + 30 + lhNLen + lhELen;
    const dataComp = buf.slice(dataOff, dataOff + tamCompr);
    if (metodo === 0) {
      arquivos[nome] = Buffer.from(dataComp);
    } else if (metodo === 8) {
      // deflate raw -> precisa stream pra evitar limite de tamanho
      arquivos[nome] = await new Promise((resolveP, rejectP) => {
        const chunks = [];
        const z = createInflateRaw();
        z.on("data", (c) => chunks.push(c));
        z.on("end", () => resolveP(Buffer.concat(chunks)));
        z.on("error", rejectP);
        z.end(dataComp);
      });
    } else {
      throw new Error("Metodo de compressao nao suportado: " + metodo);
    }
    cdOff += 46 + nLen + eLen + cLen;
  }
  return arquivos;
}

// Parser leve de sharedStrings.xml
function parsearSharedStrings(xml) {
  const strings = [];
  // Cada <si> pode ter <t> direto ou varios <r><t> (rich text). Capturo todos os <t>.
  const reSi = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = reSi.exec(xml))) {
    const conteudo = m[1];
    const textos = [...conteudo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    strings.push(textos.join("").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"));
  }
  return strings;
}

// Parser leve de sheet1.xml. Devolve array de linhas, cada linha = array de strings.
function parsearSheet(xml, sst) {
  const linhas = [];
  const reRow = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let mRow;
  while ((mRow = reRow.exec(xml))) {
    const linha = [];
    const conteudo = mRow[1];
    const reCell = /<c\s+([^>/]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mCell;
    while ((mCell = reCell.exec(conteudo))) {
      const attrs = mCell[1];
      const inner = mCell[2] ?? "";
      const tipoMatch = attrs.match(/\bt="([^"]+)"/);
      const tipo = tipoMatch ? tipoMatch[1] : null;
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const colLetras = refMatch ? refMatch[1] : null;
      // Converte letra -> indice (A=0, B=1, ...)
      let col = -1;
      if (colLetras) {
        col = 0; for (const ch of colLetras) col = col * 26 + (ch.charCodeAt(0) - 64);
        col -= 1;
      }
      let valor = "";
      if (tipo === "s") {
        const v = (inner.match(/<v>([^<]*)<\/v>/) || [])[1];
        if (v != null) valor = sst[Number(v)] ?? "";
      } else if (tipo === "inlineStr") {
        valor = (inner.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/) || [])[1] ?? "";
      } else {
        valor = (inner.match(/<v>([^<]*)<\/v>/) || [])[1] ?? "";
      }
      while (linha.length < col) linha.push("");
      linha.push(valor);
    }
    linhas.push(linha);
  }
  return linhas;
}

// === Normalizadores e classificadores ===
function normalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().trim();
}

// === Pipeline principal ===
const URL_PADRAO = "https://www.tesourotransparente.gov.br/ckan/dataset/9ff93162-409e-48b5-91d9-cf645a47fdfc/resource/046f7fcf-a742-4787-9768-dbb10747d55d/download/capag-municipios-posicao-2025-nov-09---processamento-2025-nov-10.xlsx";
const url = process.argv[2] || URL_PADRAO;
const RAIZ = resolve(import.meta.dirname, "..");
// XLSX bruto fica em data/ (gitignored). O JSON convertido (~1MB) fica em
// src/dados/ pra ser servido em producao com o codigo.
const ARQ_XLSX = resolve(RAIZ, "data/capag-municipios.xlsx");
const ARQ_JSON = resolve(RAIZ, "src/dados/capag-municipios.json");

console.log("[capag] baixando", url);
const r = await fetch(url);
if (!r.ok) { console.error("falhou:", r.status); process.exit(1); }
const arrayBuf = await r.arrayBuffer();
const buf = Buffer.from(arrayBuf);
await mkdir(resolve(RAIZ, "data"), { recursive: true });
await mkdir(resolve(RAIZ, "src/dados"), { recursive: true });
await writeFile(ARQ_XLSX, buf);
console.log("[capag] salvo", ARQ_XLSX, buf.length, "bytes");

console.log("[capag] descompactando...");
const arquivos = await lerZip(buf);
const sstXml = arquivos["xl/sharedStrings.xml"]?.toString("utf8") || "";
const sheetXml = arquivos["xl/worksheets/sheet1.xml"]?.toString("utf8") || "";
if (!sheetXml) throw new Error("sheet1.xml nao encontrado no XLSX");

const sst = parsearSharedStrings(sstXml);
const linhas = parsearSheet(sheetXml, sst);

console.log("[capag] linhas brutas:", linhas.length);

// Acha o cabecalho. Procuramos linha que contenha "UF" ou "Município"/"Municipio" e "CAPAG"
let idxCabecalho = -1;
for (let i = 0; i < Math.min(linhas.length, 50); i++) {
  const t = linhas[i].map(normalizar);
  if (t.some((c) => /^UF$/.test(c)) && t.some((c) => /MUNIC|CIDADE/.test(c))) {
    idxCabecalho = i; break;
  }
}
if (idxCabecalho < 0) throw new Error("Cabecalho nao encontrado");

const cab = linhas[idxCabecalho].map(normalizar);
console.log("[capag] cabecalho na linha", idxCabecalho, ":", cab);

// Mapeia colunas que vamos extrair
function acharCol(rxs) {
  for (let i = 0; i < cab.length; i++) {
    if (rxs.some((rx) => rx.test(cab[i]))) return i;
  }
  return -1;
}
const cUf = acharCol([/^UF$/]);
// "NOME_MUNICIPIO" tem prioridade sobre "MUNICIPIO" generico pra nao casar em
// "CODIGO MUNICIPIO COMPLETO".
const cMun = acharCol([/^NOME[_\s]*MUNIC/, /^NOME$/, /^MUNICIPIO$|^MUNICÍPIO$/, /CIDADE/]);
const cIbge = acharCol([/^CODIGO[_\s]*MUNIC/, /IBGE/, /^CODIGO/]);
const cCapag = acharCol([/^CAPAG$|CAPAG.*FINAL|NOTA.*FINAL/]);
const cIndic1 = acharCol([/ENDIVIDAMENTO|INDICADOR\s*1|^I1\b/]);
const cIndic2 = acharCol([/POUPANCA|POUPANÇA|INDICADOR\s*2|^I2\b/]);
const cIndic3 = acharCol([/LIQUIDEZ|INDICADOR\s*3|^I3\b/]);

console.log("[capag] colunas: uf=", cUf, "mun=", cMun, "ibge=", cIbge, "capag=", cCapag);

if (cUf < 0 || cMun < 0 || cCapag < 0) throw new Error("Colunas obrigatorias (UF, Municipio, CAPAG) nao localizadas");

const registros = [];
for (let i = idxCabecalho + 1; i < linhas.length; i++) {
  const l = linhas[i];
  const uf = normalizar(l[cUf]);
  const nome = String(l[cMun] || "").trim();
  if (!uf || !nome || uf.length > 2) continue;
  const capag = String(l[cCapag] || "").trim();
  const ibge = cIbge >= 0 ? String(l[cIbge] || "").trim() : null;
  if (!capag) continue;
  registros.push({
    uf,
    ibge: ibge || null,
    nome,
    capag,
    indicadores: {
      endividamento: cIndic1 >= 0 ? (String(l[cIndic1] || "").trim() || null) : null,
      poupanca:      cIndic2 >= 0 ? (String(l[cIndic2] || "").trim() || null) : null,
      liquidez:      cIndic3 >= 0 ? (String(l[cIndic3] || "").trim() || null) : null,
    },
  });
}

const saida = {
  atualizadoEm: new Date().toISOString().slice(0, 10),
  fonte: "Tesouro Nacional - CAPAG Municipios",
  url,
  totalRegistros: registros.length,
  registros,
};

await writeFile(ARQ_JSON, JSON.stringify(saida));
console.log("[capag] gerado", ARQ_JSON, "com", registros.length, "registros");

// Estatisticas rapidas
const porNota = {};
for (const r of registros) porNota[r.capag] = (porNota[r.capag] || 0) + 1;
console.log("[capag] distribuicao:", porNota);
