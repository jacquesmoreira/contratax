// Loop de background que roda a campanha fria de e-mail DIRETO no servidor
// (Railway, 24h), sem depender do PC do Jacques ligado. Le a lista de leads
// do volume persistente (subida via /api/admin/campanha/upload-leads) e
// mantem o mesmo estado idempotente/retomavel do script CLI original
// (src/campanhaFria.mjs e a logica compartilhada entre os dois).
//
// Agenda: segunda a quinta as 14h (Brasilia), sexta as 9h (Brasilia), sem
// envio no fim de semana. Ative com LICITA_CAMPANHA=1 no Railway.
//
// Rampa da primeira semana (decisao do Jacques, 19/07/2026): comeca em 15
// novos/dia e sobe ate o teto sustentavel de 30/dia (limiteDiario/3 — ver
// raciocinio completo em src/campanhaFria.mjs). Depois da rampa, sempre 30.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";
import { parseCsv, processarLote } from "./campanhaFria.mjs";

const ARQ_LEADS = resolve(DATA_DIR, "leads-campanha.csv");
const ARQ_ESTADO = resolve(DATA_DIR, "campanha-envios.json");
const ARQ_CONTADOR = resolve(DATA_DIR, "campanha-contador.json");
const ARQ_SUPRIMIR = resolve(DATA_DIR, "suprimir-campanha.txt");

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const DIA_MS = 86400000;

function lerJson(caminho, padrao) {
  if (!existsSync(caminho)) return padrao;
  try { return JSON.parse(readFileSync(caminho, "utf8")); } catch { return padrao; }
}
function gravarJson(caminho, obj) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(caminho, JSON.stringify(obj, null, 2), "utf8");
}
function carregarSuprimidos() {
  if (!existsSync(ARQ_SUPRIMIR)) return new Set();
  return new Set(
    readFileSync(ARQ_SUPRIMIR, "utf8").split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"))
  );
}

// Rampa por data (YYYY-MM-DD). Fora dessas datas, usa o teto padrao (30).
const RAMPA = {
  "2026-07-20": 15,
  "2026-07-21": 20,
  "2026-07-22": 25,
  "2026-07-23": 30,
  "2026-07-24": 30,
};
function novosPorDiaHoje() {
  const chave = new Date().toISOString().slice(0, 10);
  const doEnv = process.env.LICITA_CAMPANHA_NOVOS_POR_DIA;
  if (doEnv) return Number(doEnv); // override manual, se precisar
  return RAMPA[chave] ?? 30;
}

// Horario alvo em Brasilia por dia da semana UTC (0=dom..6=sab). Seg-qui 14h,
// sex 9h, sab/dom sem envio. Os horarios-alvo (14h/9h BR) ficam bem longe da
// virada de dia UTC (Brasilia = UTC-3), entao usar getUTCDay() aqui e seguro
// — nao ha risco de "dia errado" por causa do fuso.
function horarioAlvoBR(diaSemanaUTC) {
  if (diaSemanaUTC >= 1 && diaSemanaUTC <= 4) return 14; // seg-qui
  if (diaSemanaUTC === 5) return 9; // sex
  return null; // sab/dom
}

function msAteProximoEnvio() {
  const agora = new Date();
  for (let dias = 0; dias < 8; dias++) {
    const candidato = new Date(agora.getTime() + dias * DIA_MS);
    const horaBR = horarioAlvoBR(candidato.getUTCDay());
    if (horaBR == null) continue;
    const horaUTC = (horaBR + 3) % 24; // Brasilia -> UTC
    const alvo = new Date(Date.UTC(
      candidato.getUTCFullYear(), candidato.getUTCMonth(), candidato.getUTCDate(), horaUTC, 0, 0, 0
    ));
    if (alvo > agora) return alvo - agora;
  }
  throw new Error("nao encontrou proximo horario de envio dentro de 8 dias (bug na agenda)");
}

// Uma passada de envio (chamavel tambem via admin, pra testar sem esperar
// o horario agendado). Le o CSV do volume, aplica o mesmo teto/rampa do
// script local, envia, e persiste o estado atualizado no volume.
export async function enviarCampanhaDoDia({ log = console.log } = {}) {
  if (!existsSync(ARQ_LEADS)) {
    log("[campanha] leads-campanha.csv nao encontrado no volume — suba com /api/admin/campanha/upload-leads. Pulando.");
    return { enviadosNestaExecucao: 0, motivo: "sem-leads" };
  }

  const { enviar, temEmailKey } = await import("./email.mjs");
  if (!temEmailKey()) {
    log("[campanha] RESEND_API_KEY ausente; pulando.");
    return { enviadosNestaExecucao: 0, motivo: "sem-chave" };
  }

  const leads = parseCsv(readFileSync(ARQ_LEADS, "utf8"));
  const suprimidos = carregarSuprimidos();
  const estado = lerJson(ARQ_ESTADO, {});
  const hoje = new Date().toISOString().slice(0, 10);
  const contador = lerJson(ARQ_CONTADOR, { data: hoje, enviados: 0, novos: 0 });
  if (contador.data !== hoje) { contador.data = hoje; contador.enviados = 0; contador.novos = 0; }
  contador.novos = contador.novos || 0;

  const novosPorDia = novosPorDiaHoje();
  const limiteDiario = Number(process.env.LICITA_CAMPANHA_LIMITE_DIARIO || 90);

  log(`[campanha] iniciando: ${leads.length} leads no CSV, novos/dia=${novosPorDia}, limite=${limiteDiario}, ja hoje=${contador.enviados}/${limiteDiario} (${contador.novos} novos)`);

  const resultado = await processarLote({
    leads, estado, contador, suprimidos, limiteDiario, novosPorDia,
    dryRun: false, enviarFn: enviar, log,
  });

  gravarJson(ARQ_ESTADO, resultado.estado);
  gravarJson(ARQ_CONTADOR, resultado.contador);

  log(`[campanha] concluido: ${resultado.enviadosNestaExecucao} enviados (${resultado.contador.novos} novos hoje), ${resultado.pulados} pulados, ${resultado.erros} erros.`);
  return resultado;
}

// Loop pra sempre: dorme ate o proximo horario valido, envia, repete.
export async function campanhaFriaLoop({ log = console.log } = {}) {
  for (;;) {
    const espera = msAteProximoEnvio();
    const horas = (espera / 3600000).toFixed(1);
    log(`[campanha] proximo envio em ${horas}h`);
    await dormir(espera);
    try {
      await enviarCampanhaDoDia({ log });
    } catch (e) {
      log(`[campanha] erro no ciclo: ${e.message}`);
    }
  }
}
