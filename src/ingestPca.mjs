// Ingestao do PCA (Plano de Contratacao Anual): compras que os orgaos JA
// planejaram, com data desejada = oportunidade ANTECIPADA (antes do edital).
//
// Caminho B (seguro): incremental, com TETO de disco e pausa entre chamadas.
// Para de ingerir quando a tabela atinge o teto; um cursor (arquivo) avanca as
// paginas entre os ciclos. Sem crawl nacional de uma vez.

import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { DATA_DIR } from "./caminhos.mjs";
import { upsertPca, totalPca } from "./db.mjs";

const BASE = "https://pncp.gov.br/api/consulta/v1/pca/atualizacao";
const CURSOR = resolve(DATA_DIR, "pca-cursor.json");

const TETO = Number(process.env.LICITA_PCA_MAX || 150000);       // teto de itens (disco)
const PAGINAS_CICLO = Number(process.env.LICITA_PCA_PAGINAS || 12); // paginas por rodada
const TAMANHO = 50;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function janelaAno() {
  const ano = new Date().getFullYear();
  return { ano, ini: `${ano}0101`, fim: `${ano}1231` };
}

async function lerCursor(ano) {
  try {
    const c = JSON.parse(await readFile(CURSOR, "utf8"));
    if (c && c.ano === ano) return c;
  } catch {}
  return { ano, pagina: 1, fim: false };
}
async function salvarCursor(c) { try { await writeFile(CURSOR, JSON.stringify(c)); } catch {} }

function achatar(registros) {
  const out = [];
  for (const reg of registros) {
    for (const it of (reg.itens || [])) {
      const vt = Number(it.valorTotal) || 0;
      if (vt <= 0 && !(Number(it.valorUnitario) > 0)) continue; // sem valor util
      out.push({
        chave: `${reg.idPcaPncp}#${it.numeroItem}`,
        descricao: it.descricaoItem || "Item sem descrição",
        categoria: it.categoriaItemPcaNome || it.classificacaoSuperiorNome || null,
        quantidade: it.quantidadeEstimada ?? null,
        unidade: it.unidadeFornecimento ?? null,
        valorUnitario: it.valorUnitario ?? null,
        valorTotal: it.valorTotal ?? null,
        dataDesejada: (it.dataDesejada || "").slice(0, 10) || null,
        orgao: reg.orgaoEntidadeRazaoSocial || null,
        orgaoCnpj: reg.orgaoEntidadeCnpj || null,
        unidadeOrgao: reg.nomeUnidade || null,
        anoPca: reg.anoPca ?? null,
      });
    }
  }
  return out;
}

// Um ciclo de ingestao. Chamado pelo atualizador. Best-effort.
export async function ingerirPcaCiclo({ log = console.log } = {}) {
  if (totalPca() >= TETO) { log(`[pca] teto de ${TETO} itens atingido; nao ingere mais.`); return { itens: 0, teto: true }; }
  const { ano, ini, fim } = janelaAno();
  let cursor = await lerCursor(ano);
  if (cursor.fim) return { itens: 0, fim: true };
  let novos = 0;
  for (let i = 0; i < PAGINAS_CICLO; i++) {
    if (totalPca() >= TETO) break;
    await dormir(400); // educado com o PNCP
    let json;
    try {
      const url = `${BASE}?dataInicio=${ini}&dataFim=${fim}&pagina=${cursor.pagina}&tamanhoPagina=${TAMANHO}`;
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) break;
      json = await r.json();
    } catch { break; }
    const registros = json.data || json.itens || [];
    if (!registros.length) { cursor.fim = true; break; }
    try { novos += upsertPca(achatar(registros)); } catch {}
    cursor.pagina += 1;
    if (json.totalPaginas && cursor.pagina > json.totalPaginas) { cursor.fim = true; break; }
  }
  await salvarCursor(cursor);
  log(`[pca] +${novos} itens planejados (pagina ${cursor.pagina}, total na base: ${totalPca()}).`);
  return { itens: novos };
}
