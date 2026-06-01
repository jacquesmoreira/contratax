// Medidor de custo das chamadas de IA. Registra os tokens de cada chamada (entrada,
// saida, escrita e leitura de cache), calcula o custo em USD/BRL e grava num log
// JSONL. Serve para sabermos o custo REAL por analise e calibrar os limites por dado.

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(RAIZ, "data");
const LOG = resolve(DIR, "custos-ia.jsonl");

// Cotacao do dolar (ajuste por env quando quiser precisao). Default conservador.
const USD_BRL = Number(process.env.LICITA_USD_BRL || 5.4);

// Precos por MILHAO de tokens (USD). Por modelo. Sonnet 4.x e o padrao.
const PRECOS = {
  "claude-sonnet-4-6": { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-6":  { in: 0.8, out: 4, cacheWrite: 1.0, cacheRead: 0.08 },
  _default:            { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 },
};

function tabela(modelo) {
  return PRECOS[modelo] || PRECOS._default;
}

// Calcula o custo (USD e BRL) de uma chamada a partir do objeto usage da API.
export function custoChamada(usage = {}, modelo = "claude-sonnet-4-6") {
  const t = tabela(modelo);
  const inp = usage.input_tokens || 0;
  const out = usage.output_tokens || 0;
  const cw = usage.cache_creation_input_tokens || 0;
  const cr = usage.cache_read_input_tokens || 0;
  const usd = (inp * t.in + out * t.out + cw * t.cacheWrite + cr * t.cacheRead) / 1e6;
  return {
    tokensEntrada: inp, tokensSaida: out, cacheEscrita: cw, cacheLeitura: cr,
    usd: Number(usd.toFixed(6)),
    brl: Number((usd * USD_BRL).toFixed(4)),
  };
}

// Grava uma linha no log. meta = { etapa, editalId, empresaId, token }.
export async function registrarCusto({ usage, modelo, ...meta }) {
  const c = custoChamada(usage, modelo);
  const linha = { ts: new Date().toISOString(), modelo, ...meta, ...c };
  try {
    await mkdir(DIR, { recursive: true });
    await appendFile(LOG, JSON.stringify(linha) + "\n", "utf8");
  } catch { /* nunca derruba a analise por causa do log */ }
  // Eco no console do servidor para feedback imediato.
  console.log(`[custo] ${meta.etapa || "ia"} ${modelo} | ent:${c.tokensEntrada} cacheR:${c.cacheLeitura} sai:${c.tokensSaida} | R$ ${c.brl.toFixed(4)}`);
  return c;
}

// Le o log e devolve um resumo agregado (para o script/painel de custos).
export async function resumoCustos() {
  let texto = "";
  try { texto = await readFile(LOG, "utf8"); } catch { return null; }
  const linhas = texto.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (!linhas.length) return { chamadas: 0 };

  const brlTotal = linhas.reduce((s, l) => s + (l.brl || 0), 0);
  const porEtapa = {};
  for (const l of linhas) {
    const e = l.etapa || "ia";
    (porEtapa[e] ||= { chamadas: 0, brl: 0 }).chamadas++;
    porEtapa[e].brl += l.brl || 0;
  }
  // Uma "analise" do ponto de vista do cliente = uma conferencia (cobra cota).
  // O custo medio por analise inclui a leitura do edital quando ela ocorreu.
  const leituras = porEtapa["leitura_edital"]?.chamadas || 0;
  const conferencias = porEtapa["conferencia"]?.chamadas || 0;
  const analises = conferencias || linhas.length;

  return {
    chamadas: linhas.length,
    brlTotal: Number(brlTotal.toFixed(2)),
    usdTotal: Number((brlTotal / USD_BRL).toFixed(2)),
    analises,
    leiturasEdital: leituras,
    custoMedioPorAnaliseBRL: Number((brlTotal / Math.max(1, analises)).toFixed(4)),
    cacheHitLeitura: conferencias ? Number((1 - leituras / Math.max(1, conferencias)).toFixed(3)) : null,
    porEtapa: Object.fromEntries(Object.entries(porEtapa).map(([k, v]) => [k, {
      chamadas: v.chamadas, brl: Number(v.brl.toFixed(2)),
      medioBRL: Number((v.brl / v.chamadas).toFixed(4)),
    }])),
    usdBrl: USD_BRL,
  };
}
