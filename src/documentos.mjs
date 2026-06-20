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

// Lista os ITENS da contratacao (o que esta sendo comprado: descricao,
// quantidade, unidade, valor unitario/total). Pedido de cliente "Ver itens".
// PNCP: /orgaos/{cnpj}/compras/{ano}/{sequencial}/itens
export async function listarItens(edital) {
  const { cnpj, ano, sequencial } = identificadores(edital);
  if (!cnpj || !ano || !sequencial) throw new Error(`Identificadores incompletos para ${edital.id}`);
  const url = `${API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`PNCP itens respondeu ${r.status}`);
  const bruto = await r.json();
  const lista = Array.isArray(bruto) ? bruto : (bruto?.itens ?? []);
  return lista.map((i) => ({
    numero: i.numeroItem ?? null,
    descricao: i.descricao ?? i.materialOuServicoNome ?? "Item sem descrição",
    quantidade: i.quantidade ?? null,
    unidade: i.unidadeMedida ?? null,
    valorUnitario: i.valorUnitarioEstimado ?? null,
    valorTotal: i.valorTotal ?? null,
    tipo: i.materialOuServicoNome ?? (i.materialOuServico === "S" ? "Serviço" : i.materialOuServico === "M" ? "Material" : null),
    beneficioMeEpp: i.tipoBeneficioNome ?? null,
    temResultado: Boolean(i.temResultado),
    categoria: i.itemCategoriaNome ?? null,
  }));
}

// Resultados HOMOLOGADOS de um item (vencedor + preco unitario real). Usado pela
// colheita de precos. So existe quando o item ja foi homologado (temResultado).
export async function listarResultadosItem(edital, numeroItem) {
  const { cnpj, ano, sequencial } = identificadores(edital);
  if (!cnpj || !ano || !sequencial) return [];
  const url = `${API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${numeroItem}/resultados`;
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) return [];
  const j = await r.json();
  const arr = Array.isArray(j) ? j : (j?.resultados ?? []);
  return arr.map((x) => ({
    sequencial: x.sequencialResultado ?? 1,
    valorUnitario: x.valorUnitarioHomologado ?? null,
    quantidade: x.quantidadeHomologada ?? null,
    fornecedor: x.nomeRazaoSocialFornecedor ?? null,
    fornecedorNi: x.niFornecedor ?? null,
    porte: x.porteFornecedorNome ?? null,
    dataResultado: x.dataResultado ?? x.dataInclusao ?? null,
  }));
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
  let arquivos = [];
  try { arquivos = await listarArquivos(edital); } catch { return []; }
  if (!Array.isArray(arquivos) || !arquivos.length) return [];

  // Ordena: arquivos com "edital" no titulo primeiro (mais provavel ser o PDF
  // certo), capa por ultimo. Antes so tentava 1 arquivo (o "principal"); se ele
  // nao fosse PDF (orgao que publica no BLL/Comprasnet e so linka), retornava
  // vazio. Agora varre ate achar PDF, com teto pra nao baixar o acervo inteiro.
  const ordenados = [...arquivos].sort((a, b) => {
    const ed = (x) => /edital/i.test(x.titulo ?? "") || /edital/i.test(x.tipoDocumentoNome ?? "");
    const capa = (x) => /capa/i.test(x.titulo ?? "");
    return (capa(a) - capa(b)) || (ed(b) - ed(a));
  });

  const MAX_TENTATIVAS = Number(process.env.LICITA_MAX_ARQUIVOS_EDITAL || 5);
  for (const a of ordenados.slice(0, MAX_TENTATIVAS)) {
    const link = a.url ?? a.uri ?? a.linkDownload;
    if (!link) continue;
    let buffer;
    try {
      const r = await fetch(link, { headers: { Accept: "*/*" } });
      if (!r.ok) continue;
      buffer = Buffer.from(await r.arrayBuffer());
    } catch { continue; }

    if (ehPdf(buffer)) {
      return [{ nome: `${a.titulo ?? "edital"}.pdf`, buffer }];
    }
    if (ehZip(buffer)) {
      const pdfs = extrairZip(buffer)
        .filter((x) => /\.pdf$/i.test(x.nome) || ehPdf(x.dados))
        .map((x) => ({ nome: x.nome, buffer: x.dados }))
        .sort((x, y) => y.buffer.length - x.buffer.length);
      if (pdfs.length) return pdfs;
    }
    // Nao e PDF nem ZIP (provavel HTML/link da plataforma de origem): tenta o proximo.
  }
  return [];
}
