// "Pergunte ao Edital": o cliente faz uma pergunta livre sobre um edital e a
// ContrataX.IA responde com base no PDF do edital. Fecha o gap competitivo
// (ConLicitacao e Licitei tem isso). Reusa o download de PDF (obterPdfs) e a
// chamada de IA (chamar), com prompt caching pra perguntas repetidas no mesmo
// edital sairem baratas.

import { obterPdfs } from "./documentos.mjs";
import { chamar, temChave } from "./ia.mjs";

const MODELO = process.env.LICITA_MODELO_PERGUNTA || "claude-haiku-4-5-20251001";

const INSTRUCAO = `Voce e a ContrataX.IA respondendo a pergunta de um fornecedor sobre um EDITAL de licitacao publica brasileira, com base APENAS no conteudo do PDF anexado.

Regras:
- Responda de forma DIRETA e objetiva (2 a 6 frases). Va ao ponto.
- Quando possivel, cite o item/clausula/secao do edital onde a resposta esta (ex: "conforme item 7.2").
- Se a informacao NAO estiver no edital, diga com honestidade: "O edital nao deixa isso explicito. Recomendo conferir o documento completo ou perguntar ao orgao." NAO invente.
- Nunca afirme algo que nao esteja no documento. Sem suposicao.
- Portugues do Brasil, tom profissional e claro. Sem markdown pesado.
- Voce e a ContrataX.IA. Nunca mencione Claude, Anthropic ou outra IA.`;

// Recebe o edital (com id/identificadores p/ baixar o PDF) e a pergunta.
// Devolve { resposta } ou lanca erro (codigo 'sem_pdf' quando o edital nao tem
// PDF legivel no PNCP, 'pdf_muito_grande' quando estoura o contexto).
export async function perguntarEdital(edital, pergunta, { perfilToken } = {}) {
  if (!temChave()) throw new Error("Leitura por IA nao configurada");
  const p = String(pergunta || "").trim().slice(0, 500);
  if (p.length < 3) throw new Error("Escreva uma pergunta um pouco mais completa");

  const pdfs = await obterPdfs(edital);
  if (!pdfs.length) {
    const e = new Error("Nao foi possivel ler o PDF deste edital automaticamente (alguns orgaos so publicam na plataforma de origem). Abra o edital no portal pra consultar.");
    e.codigo = "sem_pdf";
    throw e;
  }
  const pdf = pdfs[0]; // o maior (costuma ser o edital principal)

  const corpo = {
    model: MODELO,
    max_tokens: 700,
    system: INSTRUCAO,
    messages: [{
      role: "user",
      content: [
        { type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdf.buffer.toString("base64") },
          cache_control: { type: "ephemeral" } },
        { type: "text", text: "Pergunta do fornecedor: " + p },
      ],
    }],
  };

  const resposta = await chamar(corpo, {
    meta: { perfilToken: perfilToken || "_pergunta", editalId: edital.id, etapa: "pergunta_edital" },
  });
  return { resposta: String(resposta || "").trim() };
}
