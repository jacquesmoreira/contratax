// Dispara a sequencia de 3 emails (dia 0, +3, +6) para os leads do CSV gerado
// por gerar-lista-emails.mjs, usando o Resend (o mesmo provedor ja usado em
// producao pelo ContrataX, dominio contratax.com.br ja verificado).
//
// Wrapper CLI fino sobre src/campanhaFria.mjs (logica compartilhada com o
// loop que roda 24h no servidor via Railway, src/campanhaLoop.mjs). Uso
// deste script agora: testes locais, envio manual avulso, ou fallback se o
// loop do servidor estiver desligado.
//
// Idempotente e retomavel: guarda o progresso de cada lead em
// data/campanha-envios.json, entao pode rodar este script todo dia (via
// agendador de tarefas do Windows) que ele so envia quem estiver "no prazo".
//
// Uso:
//   node scripts/enviar-campanha.mjs --csv leads-202607.csv
//   node scripts/enviar-campanha.mjs --csv leads-202607.csv --teste-com 3   (manda so 3, para validar)
//   node scripts/enviar-campanha.mjs --csv leads-202607.csv --dry-run       (simula, nao envia nada)
//   node scripts/enviar-campanha.mjs --teste-email seu@email.com [--teste-etapa 1|2|3]
//
// Suspensao manual: se um lead responder pedindo para parar, adicione o
// email dele (uma linha por email) em data/suprimir.txt. O script pula
// qualquer email que estiver nesse arquivo, em qualquer etapa da sequencia.
//
// Atencao: este Resend/dominio e o MESMO usado pelos emails transacionais
// reais do produto (digest, alertas). Nao mande volume alto demais aqui a
// ponto de competir com o trafego dos clientes pagantes.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");

// Carrega .env manualmente (sem dependencia externa)
function carregarEnv() {
  const caminho = join(RAIZ, ".env");
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i === -1) continue;
    const chave = l.slice(0, i).trim();
    const valor = l.slice(i + 1).trim();
    if (!process.env[chave]) process.env[chave] = valor;
  }
}
carregarEnv();

// Imports dinamicos: precisam vir DEPOIS do carregarEnv(), porque src/email.mjs
// le process.env.LICITA_EMAIL_FROM no topo do modulo, na hora do import.
const { enviar } = await import("../src/email.mjs");
const { parseCsv, montarEmail, processarLote } = await import("../src/campanhaFria.mjs");

// ---------- args ----------

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}
const temFlag = (nome) => process.argv.includes(nome);

const arquivoCsv = arg("--csv", null);
const testeCom = Number(arg("--teste-com", Infinity));
const dryRun = temFlag("--dry-run");
const limiteDiario = Number(arg("--limite-diario", 90)); // margem de seguranca; ajuste conforme seu plano Resend
// Teto de gente NOVA (etapa 1) por dia. Sem isso, o script manda etapa 1 pra
// quem puder ate encher o limiteDiario, cria uma leva enorme de uma vez, e
// 3 dias depois essa leva inteira "trava" o dia so com reenvios de etapa 2,
// sem sobrar espaco pra ninguem novo — e de novo na etapa 3, 3 dias depois.
// Cada lead passa por 3 etapas ao longo de 6 dias, entao o teto sustentavel
// pra sempre e limiteDiario/3 (com 90/dia, 30 novos/dia -> em regime
// permanente: 30 na etapa 1 + 30 na etapa 2 + 30 na etapa 3 = 90/dia,
// constante, sem picos nem vales).
const novosPorDia = Number(arg("--novos-por-dia", Math.floor(limiteDiario / 3)));
const testeEmail = arg("--teste-email", null);
const testeEtapa = Number(arg("--teste-etapa", 1));

if (!testeEmail && !arquivoCsv) {
  console.error("Uso: node scripts/enviar-campanha.mjs --csv <arquivo.csv>");
  console.error("  ou: node scripts/enviar-campanha.mjs --teste-email seu@email.com [--teste-etapa 1|2|3]");
  process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
  console.error("Falta RESEND_API_KEY no arquivo .env");
  process.exit(1);
}

// ---------- caminhos de estado ----------

const DIR_DADOS = join(RAIZ, "data");
if (!existsSync(DIR_DADOS)) mkdirSync(DIR_DADOS, { recursive: true });
const ARQ_ESTADO = join(DIR_DADOS, "campanha-envios.json");
const ARQ_CONTADOR = join(DIR_DADOS, "campanha-contador.json");
const ARQ_SUPRIMIR = join(DIR_DADOS, "suprimir.txt");

function lerJson(caminho, padrao) {
  if (!existsSync(caminho)) return padrao;
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return padrao;
  }
}
function gravarJson(caminho, obj) {
  writeFileSync(caminho, JSON.stringify(obj, null, 2), "utf8");
}

function carregarSuprimidos() {
  if (!existsSync(ARQ_SUPRIMIR)) {
    writeFileSync(ARQ_SUPRIMIR, "# um email por linha, para nunca mais receber\n", "utf8");
    return new Set();
  }
  return new Set(
    readFileSync(ARQ_SUPRIMIR, "utf8")
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"))
  );
}

// ---------- main ----------

async function main() {
  console.log("=== Disparo de Campanha — ContrataX (Resend) ===");

  // Modo teste avulso: manda 1 email para um endereco especifico, sem CSV e
  // sem gravar estado da campanha. Uso: --teste-email seu@email.com
  if (testeEmail) {
    const leadFicticio = { razao_social: "Empresa Teste LTDA" };
    const { assunto, html } = montarEmail(testeEtapa, leadFicticio);
    console.log(`Enviando email de TESTE (etapa ${testeEtapa}) para ${testeEmail}...`);
    try {
      await enviar({ para: testeEmail, assunto, html });
      console.log("OK — email de teste enviado. Confira a caixa de entrada (e o spam).");
    } catch (e) {
      console.log(`ERRO ao enviar teste: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  console.log(`CSV: ${arquivoCsv} | dry-run: ${dryRun} | limite diario: ${limiteDiario}`);

  const csvTexto = readFileSync(join(RAIZ, arquivoCsv), "utf8");
  const leads = parseCsv(csvTexto);
  console.log(`Leads no CSV: ${leads.length}`);

  const suprimidos = carregarSuprimidos();
  console.log(`Suprimidos (nunca contatar): ${suprimidos.size}`);

  const estado = lerJson(ARQ_ESTADO, {});
  const hoje = new Date().toISOString().slice(0, 10);
  const contador = lerJson(ARQ_CONTADOR, { data: hoje, enviados: 0, novos: 0 });
  if (contador.data !== hoje) { contador.data = hoje; contador.enviados = 0; contador.novos = 0; }
  contador.novos = contador.novos || 0; // retrocompativel com contador antigo sem esse campo

  console.log(`Novos por dia (etapa 1): ${novosPorDia} | ja enviados hoje: ${contador.novos}/${novosPorDia}`);

  const resultado = await processarLote({
    leads,
    estado,
    contador,
    suprimidos,
    limiteDiario,
    novosPorDia,
    dryRun,
    testeCom,
    enviarFn: enviar,
    log: console.log,
  });

  if (!dryRun) {
    gravarJson(ARQ_ESTADO, resultado.estado);
    gravarJson(ARQ_CONTADOR, resultado.contador);
  }

  console.log(`\n================ RESULTADO ================`);
  console.log(`Enviados nesta execucao : ${resultado.enviadosNestaExecucao}`);
  console.log(`Pulados (fora do prazo/suprimidos/teto de novos) : ${resultado.pulados}`);
  console.log(`Erros : ${resultado.erros}`);
  console.log(`Total enviado hoje (${hoje}) : ${resultado.contador.enviados}/${limiteDiario}`);
  console.log(`  dos quais novos (etapa 1) : ${resultado.contador.novos}/${novosPorDia}`);
  console.log(`=============================================`);
}

main().catch((e) => {
  console.error("Erro fatal:", e.message);
  process.exit(1);
});
