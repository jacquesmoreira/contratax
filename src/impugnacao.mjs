// Dossie de impugnacao: a IA le a analise do edital (Camada 3) e aponta possiveis
// CLAUSULAS RESTRITIVAS que ferem a competitividade/legalidade (Lei 14.133/2021),
// com fundamento, e entrega uma MINUTA de impugnacao pronta para o cliente adaptar.
// Reaproveita a analise ja cacheada (texto), entao e barato e nao rele o PDF.

import { chamar, extrairJson, MODELO } from "./ia.mjs";
import { analisarEdital } from "./analise.mjs";
import { salvarImpugnacao, carregarImpugnacao } from "./store.mjs";

const INSTRUCAO = `Voce e advogado especialista em licitacoes publicas (Lei 14.133/2021).
Recebe a ANALISE estruturada de um edital (resumo, exigencias de habilitacao e alertas).
Sua tarefa: identificar possiveis CLAUSULAS RESTRITIVAS ou ILEGAIS que restrinjam
indevidamente a competitividade (ex: exigencias excessivas de qualificacao tecnica,
atestados desproporcionais, marcas especificas, prazos exiguos, exigencias sem amparo
legal) e redigir uma MINUTA de impugnacao.

Responda SOMENTE com JSON valido, sem texto fora dele, nesta estrutura:
{
  "temPontos": true ou false,
  "resumo": "1 a 2 frases sobre se o edital tem pontos impugnaveis",
  "clausulas": [
    { "ponto": "a exigencia/clausula problematica", "porque": "por que restringe ou e ilegal", "fundamento": "dispositivo legal ou principio (ex: art. 37, XXI CF; art. 5 da Lei 14.133)" }
  ],
  "minuta": "texto corrido de uma impugnacao formal, com enderecamento (A Comissao/Pregoeiro), os fatos, o direito (citando os pontos acima) e o pedido. Use [COLCHETES] para dados que o cliente deve preencher (empresa, data, etc.)."
}

Seja tecnico e conservador: so aponte o que realmente tem fundamento. Se o edital
parecer regular, retorne temPontos=false e clausulas vazias.`;

export function montarCorpoImpugnacao(analise, { modelo = MODELO } = {}) {
  const texto = `${INSTRUCAO}

ANALISE DO EDITAL (JSON):
${JSON.stringify({
  resumo: analise.resumo,
  exigenciasHabilitacao: analise.exigenciasHabilitacao,
  alertas: analise.alertas,
}, null, 2)}`;
  return { model: modelo, max_tokens: 8000, messages: [{ role: "user", content: [{ type: "text", text: texto }] }] };
}

// Gera (ou recupera do cache) o dossie de impugnacao de um edital.
export async function gerarImpugnacao(edital, { forcar = false, perfilToken = null } = {}) {
  if (!forcar) {
    const cache = await carregarImpugnacao(edital.id);
    if (cache) return { ...cache.dados, cache: true };
  }
  const { analise } = await analisarEdital(edital, { perfilToken }); // usa o cache da Camada 3 se houver
  const dossie = extrairJson(await chamar(montarCorpoImpugnacao(analise), {
    meta: { etapa: "impugnacao", editalId: edital.id, perfilToken },
  }));
  await salvarImpugnacao(edital.id, dossie);
  return { ...dossie, cache: false };
}
