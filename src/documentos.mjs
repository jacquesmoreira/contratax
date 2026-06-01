// Acesso aos documentos do edital via API do PNCP.
// O PNCP expoe os arquivos (edital, anexos) de cada contratacao. Isso e a
// materia-prima da Camada 3 (IA le o edital) e da Camada 4 (conferencia de aptidao).

import { extrairZip } from "./zip.mjs";

const API = "https://pncp.gov.br/api/pncp/v1";

const ehPdf = (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-";
const ehZip = (buf) => buf.subarray(0, 2).toString("latin1") === "PK";

// O numeroControlePNCP tem o formato CNPJ-1-SEQUENCIAL/ANO.
// Ex: "83899526000182-1-000337/2025".
export function parseId(id) {
  const m = (id ?? "").match(/^(\d{14})-1-(\d+)\/(\d{4})$/);
  if (!m) return null;
  return { cnpj: m[1], sequencial: parseInt(m[2], 10), ano: m[3] };
}

// Resolve os identificadores (cnpj, ano, sequencial) a partir do edital,
// usando os campos diretos e caindo para o parse do id quando faltarem.
function identificadores(edital) {
  const p = parseId(edital.id);
  return {
    cnpj: edital.orgaoCnpj ?? p?.cnpj,
    ano: edital.ano ?? p?.ano,
    sequencial: edital.sequencial ?? p?.sequencial,
  };
}

// Lista os arquivos (metadados) de um edital.
export async function listarArquivos(edital) {
  const { cnpj, ano, sequencial } = identificadores(edital);
  if (!cnpj || !ano || !sequencial) throw new Error(`Identificadores incompletos para ${edital.id}`);
  const url = `${API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`PNCP arquivos respondeu ${r.status}`);
  return await r.json();
}

// Baixa o documento principal do edital (o de tipo "Edital", ou o primeiro).
// Devolve { nome, tipo, tamanho, buffer } ou null se nao houver arquivos.
export async function baixarDocumentoPrincipal(edital) {
  const arquivos = await listarArquivos(edital);
  if (!arquivos.length) return null;

  // O edital de verdade tem "edital" no titulo e nao e a "capa".
  const principal =
    arquivos.find((a) => /edital/i.test(a.titulo ?? "") && !/capa/i.test(a.titulo ?? "")) ??
    arquivos.find((a) => /edital/i.test(a.titulo ?? "") || /edital/i.test(a.tipoDocumentoNome ?? "")) ??
    arquivos[0];
  const link = principal.url ?? principal.uri ?? principal.linkDownload;
  if (!link) return null;

  const r = await fetch(link, { headers: { Accept: "*/*" } });
  if (!r.ok) throw new Error(`Download respondeu ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());

  return {
    nome: principal.titulo ?? principal.nomeArquivo ?? "edital",
    tipo: r.headers.get("content-type") ?? "desconhecido",
    tamanho: buffer.length,
    buffer,
  };
}

// Lista os documentos do edital (metadados) para mostrar ao cliente.
export async function listarDocumentos(edital) {
  const arquivos = await listarArquivos(edital);
  return arquivos.map((a, i) => ({
    indice: i,
    titulo: a.titulo ?? `Documento ${i + 1}`,
    tipo: a.tipoDocumentoNome ?? "",
  }));
}

// Baixa um documento especifico do edital (pelo indice). Extrai de ZIP se preciso.
export async function baixarArquivo(edital, indice) {
  const arquivos = await listarArquivos(edital);
  const a = arquivos[indice];
  if (!a) return null;
  const r = await fetch(a.url ?? a.uri, { headers: { Accept: "*/*" } });
  if (!r.ok) throw new Error(`Download respondeu ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());

  if (ehZip(buffer)) {
    const pdfs = extrairZip(buffer)
      .filter((x) => /\.pdf$/i.test(x.nome) || ehPdf(x.dados))
      .sort((x, y) => y.dados.length - x.dados.length);
    if (pdfs.length) return { nome: pdfs[0].nome, buffer: pdfs[0].dados };
  }
  return { nome: (a.titulo || "documento") + (ehPdf(buffer) ? ".pdf" : ""), buffer };
}

// Obtem os PDFs de um edital prontos para enviar a IA. Lida com o caso comum do
// PNCP em que o "documento" e um ZIP contendo o edital e anexos.
// Devolve [{ nome, buffer }] ordenado do maior para o menor (o edital costuma ser o maior).
export async function obterPdfs(edital) {
  const doc = await baixarDocumentoPrincipal(edital);
  if (!doc) return [];

  let pdfs = [];
  if (ehPdf(doc.buffer)) {
    pdfs = [{ nome: `${doc.nome}.pdf`, buffer: doc.buffer }];
  } else if (ehZip(doc.buffer)) {
    pdfs = extrairZip(doc.buffer)
      .filter((a) => /\.pdf$/i.test(a.nome) || ehPdf(a.dados))
      .map((a) => ({ nome: a.nome, buffer: a.dados }));
  }

  return pdfs.sort((a, b) => b.buffer.length - a.buffer.length);
}
