// TL;DR do edital: leitura ENXUTA por IA (Haiku) que devolve em 5 linhas
// o que importa pra decidir em 10 segundos se vale a pena olhar o edital.
//
// Diferente de analisarEdital (analise.mjs), que extrai TODAS as exigencias
// de habilitacao pra conferir contra os documentos do cliente, o TL;DR e:
//   - mais barato (prompt e resposta muito menores)
//   - mais rapido (cliente nao espera)
//   - cache GLOBAL por edital (mesmo edital, mesmo TL;DR pra todo cliente)
//
// Roda 1x por edital, fica em cache. Custo medio por edital quente: ~R$0,02.

import { obterPdfs } from "./documentos.mjs";
import { registrarCusto } from "./custo.mjs";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODELO = process.env.LICITA_MODELO_TLDR || "claude-haiku-4-5-20251001";

const PROMPT = `Voce esta lendo um edital de licitacao publica brasileira (Lei 14.133/2021).
Devolva APENAS um JSON valido nesta estrutura, sem texto fora dele:

{
  "objeto": "1 frase curta do que esta sendo contratado (max 120 chars)",
  "valor": "valor estimado em texto (R$ X) ou null",
  "prazo": "data e hora limite para envio de proposta (DD/MM/AAAA HH:mm) ou null",
  "exigencias": ["3 exigencias-chave de habilitacao mais relevantes, cada uma com no maximo 60 chars"],
  "veredito": "apto" ou "apto_pendencias" ou "nao_apto" ou "indefinido",
  "motivo": "1 frase explicando o veredito (max 140 chars)"
}

Regras para o veredito:
- "apto": exigencias padrao (certidoes, FGTS, CNDT, capital social baixo), qualquer empresa formal participa
- "apto_pendencias": exige atestados especificos, equipe tecnica, capital social alto, ou ME/EPP especifico
- "nao_apto": claramente restrito (cooperativa exclusiva, registro especifico, regiao limitada)
- "indefinido": objeto muito vago ou edital nao conclusivo

Seja objetivo. Nao inclua texto fora do JSON.`;

export function temChaveIA() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function extrairJSON(texto) {
  if (!texto) throw new Error("Resposta vazia da IA");
  // Tenta JSON puro primeiro
  try { return JSON.parse(texto); } catch {}
  // Senao, extrai o primeiro bloco {...}
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("JSON nao encontrado na resposta");
  return JSON.parse(m[0]);
}

// Gera o TL;DR a partir do PDF do edital. Retorna o JSON estruturado.
//
// NOTA: NAO truncamos PDF binario aqui — PDF tem cross-references no FIM do
// arquivo; cortar no meio corrompe a estrutura e a API rejeita ("PDF not valid").
// Cache global por edital (data/tldrs.json) ja protege contra custo repetido:
// 1a chamada paga, todas as outras vem de cache.

export async function gerarTldr(edital, { perfilToken = null } = {}) {
  if (!temChaveIA()) throw new Error("ANTHROPIC_API_KEY ausente");

  const pdfs = await obterPdfs(edital);
  if (!pdfs.length) throw new Error("Nenhum PDF disponivel para este edital");
  const principal = pdfs[0];

  const corpo = {
    model: MODELO,
    max_tokens: 800,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: principal.buffer.toString("base64") } },
        { type: "text", text: PROMPT },
      ],
    }],
  };

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(corpo),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Anthropic ${r.status}: ${txt.slice(0, 200)}`);
  }
  const resp = await r.json();
  const texto = resp.content?.[0]?.text ?? "";
  const tldr = extrairJSON(texto);

  // Registra custo (Haiku eh barato; ainda assim contabiliza pra o admin saber)
  try {
    await registrarCusto({
      usage: resp.usage,
      modelo: MODELO,
      etapa: "tldr",
      editalId: edital.id,
      perfilToken,
      pdfKB: Math.round(principal.buffer.length / 1024),
    });
  } catch {}

  return tldr;
}
