// Chat assincrono de suporte na LP. Responde perguntas comuns lendo a
// Central de Ajuda como contexto cacheado (Haiku 4.5 + prompt caching).
// Quando nao sabe, orienta pro /contato. Zero interrupcao pro founder.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registrarCusto } from "./custo.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO_AJUDA = resolve(AQUI, "..", "content", "ajuda", "central-de-ajuda.md");
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODELO = process.env.LICITA_MODELO_CHAT || "claude-haiku-4-5-20251001";

let CACHE_AJUDA = null;
async function carregarAjuda() {
  if (CACHE_AJUDA) return CACHE_AJUDA;
  CACHE_AJUDA = await readFile(ARQUIVO_AJUDA, "utf8");
  return CACHE_AJUDA;
}

const SYSTEM_BASE = `Voce e o assistente virtual do ContrataX (contratax.com.br), um SaaS brasileiro de monitoramento de licitacoes publicas via PNCP.

REGRAS RIGIDAS:
1. Responda APENAS com base na Central de Ajuda fornecida abaixo. Nao invente precos, prazos, recursos ou politicas que nao estao la.
2. Se a pergunta nao estiver coberta na Central, diga educadamente que nao tem essa informacao e oriente o cliente a escrever para contato@contratax.com.br ou usar /contato. Resposta em 1 dia util.
3. Tom: claro, direto, portugues brasileiro informal mas profissional. Sem emojis. Sem ponto de exclamacao excessivo. Sem em-dash (—).
4. Voce se chama "ContrataX.IA". NUNCA mencione que e Claude, Anthropic, ou que e uma LLM externa.
5. Respostas curtas: 2-5 frases. Use markdown simples (negrito, listas) quando ajudar a legibilidade.
6. Nao prometa descontos, brindes, SLA personalizado, demos comerciais ou ligacoes. ContrataX e self-service 100%.
7. Quando o cliente quiser cancelar, downgrade, reembolso ou disputa de cobranca: oriente a usar o painel /conta ou escrever para contato@contratax.com.br.
8. Para duvidas tecnicas profundas sobre Lei 14.133, impugnacao, etc, indique os artigos do blog (/blog) alem do que esta na Central.

CENTRAL DE AJUDA:
`;

export async function responder({ pergunta, historico = [] }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { resposta: "Estou com instabilidade aqui no momento. Manda sua duvida para contato@contratax.com.br que respondemos em 1 dia util.", erro: "sem-chave" };
  }
  const ajuda = await carregarAjuda();
  const system = [
    {
      type: "text",
      text: SYSTEM_BASE + ajuda,
      cache_control: { type: "ephemeral" },
    },
  ];

  const messages = [
    ...historico.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: pergunta },
  ];

  const corpo = {
    model: MODELO,
    max_tokens: 400,
    system,
    messages,
  };

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 200);
    console.error("[chat-ajuda] erro", r.status, txt);
    return { resposta: "Tive um problema agora. Tenta de novo em alguns minutos ou manda pra contato@contratax.com.br.", erro: `api-${r.status}` };
  }

  const j = await r.json();
  const texto = j.content?.find((b) => b.type === "text")?.text?.trim() || "";
  if (j.usage) {
    try { await registrarCusto({ usage: j.usage, modelo: MODELO, contexto: "chat-ajuda" }); } catch {}
  }
  return { resposta: texto, usage: j.usage };
}
