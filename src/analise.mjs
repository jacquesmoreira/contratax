// Orquestra a Camada 3: dado um edital, baixa o PDF, manda para a IA e guarda a analise.
// Roda sob demanda (so nos editais que o cliente abre) e usa cache para nao repagar.

import { obterPdfs } from "./documentos.mjs";
import { analisarPdf, montarCorpo, temChave } from "./ia.mjs";
import { salvarAnalise, carregarAnalise } from "./store.mjs";

// Analisa um edital. Se ja houver analise em cache, devolve ela (a menos que force).
// Retorna { analise, cache, pdf: {nome, bytes} }.
export async function analisarEdital(edital, { forcar = false } = {}) {
  if (!forcar) {
    const cache = await carregarAnalise(edital.id);
    if (cache) return { analise: cache.analise, cache: true };
  }

  const pdfs = await obterPdfs(edital);
  if (!pdfs.length) throw new Error("Nenhum PDF encontrado para este edital");
  const principal = pdfs[0]; // o maior costuma ser o edital

  const analise = await analisarPdf(principal.buffer, { meta: { etapa: "leitura_edital", editalId: edital.id } });
  await salvarAnalise(edital.id, analise);

  return { analise, cache: false, pdf: { nome: principal.nome, bytes: principal.buffer.length } };
}

// Simulacao: valida todo o caminho ate a borda da API, sem chamar (nem precisar de chave).
// Util para confirmar que a Camada 3 esta pronta para plugar a chave.
export async function simular(edital) {
  const pdfs = await obterPdfs(edital);
  if (!pdfs.length) throw new Error("Nenhum PDF encontrado para este edital");
  const principal = pdfs[0];
  const corpo = montarCorpo(principal.buffer);
  return {
    pdf: { nome: principal.nome, bytes: principal.buffer.length },
    modelo: corpo.model,
    base64KB: Math.round(corpo.messages[0].content[0].source.data.length / 1024),
    temChave: temChave(),
  };
}
