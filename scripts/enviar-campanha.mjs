// Dispara a sequencia de 3 emails (dia 0, +3, +6) para os leads do CSV gerado
// por gerar-lista-emails.mjs, usando o Resend (o mesmo provedor ja usado em
// producao pelo ContrataX, dominio contratax.com.br ja verificado).
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

// Import dinamico: precisa vir DEPOIS do carregarEnv(), porque src/email.mjs
// le process.env.LICITA_EMAIL_FROM no topo do modulo, na hora do import.
const { enviar } = await import("../src/email.mjs");

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

// ---------- parser de CSV (RFC4180 simples) ----------

function parseCsv(texto) {
  const linhas = [];
  let campo = "", linha = [], dentroAspas = false;
  const s = texto.replace(/^﻿/, ""); // remove BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dentroAspas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') dentroAspas = false;
      else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ",") { linha.push(campo); campo = ""; }
      else if (c === "\r") continue;
      else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
      else campo += c;
    }
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }

  const cabecalho = linhas[0];
  return linhas.slice(1).filter((l) => l.length === cabecalho.length && l.some((v) => v)).map((l) => {
    const obj = {};
    cabecalho.forEach((chave, i) => { obj[chave] = l[i]; });
    return obj;
  });
}

// ---------- templates dos 3 emails ----------

function nomeCurto(razaoSocial) {
  return (razaoSocial || "")
    .replace(/\s+(LTDA|LTDA\.|ME|EPP|EIRELI|S\/A|S\.A\.?|SA)\.?$/i, "")
    .trim() || "equipe";
}

// Extrai uma categoria de produto curta e segura para citar dentro da frase
// do email (ex: "vocês que vendem materiais esportivos..."). Os dados vêm de
// PNCP/planilhas de empenho e boa parte é texto de edital cortado no meio ou
// juridiquês longo — por isso o filtro é conservador: prefere devolver null
// (o email cai no texto genérico) a arriscar uma frase quebrada.
const SIGLAS_CONHECIDAS = new Set(["EPI", "TI", "GLP", "EPP", "CPU", "GPS", "PPE"]);

// Fragmentos especificos vistos na planilha de empenhos, cortados no meio da
// palavra (ex: "audi" de "audiovisuais", "ambula" de "ambulatoriais") e que
// nenhuma regra generica abaixo pega. Lista fechada, revisada a mao contra
// a base de leads atual.
const CATEGORIAS_BLOQUEADAS = new Set([
  "eletrodomesticos, audi",
  "insumos ambula",
  "insumos compl + copa",
]);

function extrairCategoria(bruto) {
  let s = (bruto || "").trim();
  if (!s || s.length >= 115) return null; // provavelmente cortado (PNCP trunca em 120)
  if (/\n/.test(s)) return null;

  s = s.replace(/^\d{4}\s*-\s*/, ""); // prefixo de ano, ex: "2025- ELETRICO"
  s = s.replace(/\s*-\s*LEI\s*14\.?133\/?2021\)?\.?\s*$/i, "");
  s = s.replace(/\s*\(RENOVADO\)\s*$/i, "");
  s = s.replace(/^MAT\.\s*/i, "Material ");
  s = s.replace(/^PREST\.\s*/i, "Prestação ");
  s = s.replace(/\s+\d+$/, ""); // codigo de lote/item solto no final, ex: "GENEROS 01"
  s = s.replace(/["'ʺ]/g, ""); // aspas soltas de trechos de edital colados
  s = s.trim().replace(/[.,;:-]+$/, "").trim();

  if (s.length < 5 || s.length > 45) return null;
  if (/\d/.test(s)) return null; // qualquer digito restante = codigo de processo/lote/item
  if (/[()]/.test(s)) return null;
  if (/\.(?!\s*$)/.test(s)) return null; // ponto no meio = abreviacao colada (ex: "manut.veiculos")

  const inicioGenerico = /^(AQUISI|CONTRATA[ÇC][ÃA]O|CONTRATACAO|PRESTA[ÇC][ÃA]O|O OBJETO|CONSTITUI|REGISTRO DE PRE[ÇC]OS|VALOR QUE|ATENDER|PROCESSO|DISPENSA|LOTE\s|ATA\s|ITEM\s|PE\s|PP\s|SRP|PEP|ID\d|N[º°O]\s*\d)/i;
  if (inicioGenerico.test(s)) return null;

  const palavras = s.split(/\s+/);
  const ultima = palavras[palavras.length - 1].toLowerCase().replace(/[^\p{L}]/gu, "");
  const ehSigla = SIGLAS_CONHECIDAS.has(ultima.toUpperCase());
  if (!ehSigla) {
    if (ultima.length <= 2) return null; // palavra solta no final (ex: "... agric e")
    // marca de acento numa silaba final seguida de so mais uma letra, ou
    // final em "n" sem til/acento, costumam ser corte no meio da palavra
    // (ex: "veterinár" de "veterinários", "fertilizan" de "fertilizantes")
    if (/[áéíóúâêôãõ][a-zç]$/i.test(ultima)) return null;
    if (/[a-z]n$/i.test(ultima)) return null;
  }

  const categoria = palavras
    .map((p) => {
      const limpo = p.replace(/[^\p{L}]/gu, "").toUpperCase();
      return SIGLAS_CONHECIDAS.has(limpo) ? p : p.toLowerCase();
    })
    .join(" ");

  if (CATEGORIAS_BLOQUEADAS.has(categoria)) return null;

  return categoria;
}

const CTA_URL = "https://www.contratax.com.br/cadastro";

// Nome de quem assina os emails de prospeccao. Troque aqui se quiser usar
// outro nome (precisa ser alguem que de fato acompanha as respostas em
// contato@contratax.com.br, pra nao ficar estranho quando o lead responder).
const NOME_REMETENTE = "Marina";

// Converte o corpo em texto simples (paragrafos separados por linha em
// branco) num HTML minimo, com o link do CTA virando botao clicavel.
function htmlSimples(texto) {
  const paragrafos = texto
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;color:#1e293b;font-size:15px;line-height:1.6;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;background:#eef2f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:22px 12px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe3ee;">
      <tr><td style="background:linear-gradient(135deg,#312e81,#2563eb);padding:18px 26px;">
        <div style="color:#fff;font-size:16px;font-weight:800;">ContrataX</div>
      </td></tr>
      <tr><td style="padding:22px 26px 6px;">
        ${paragrafos}
      </td></tr>
      <tr><td style="padding:14px 26px 22px;text-align:center;">
        <div style="font-size:12px;color:#94a3b8;">ContrataX · dados oficiais do PNCP · <a href="mailto:contato@contratax.com.br" style="color:#94a3b8;">contato@contratax.com.br</a></div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function montarEmail(etapa, lead) {
  const empresa = nomeCurto(lead.razao_social || lead.nome_fantasia);
  const categoria = extrairCategoria(lead.exemplo_produto_licitado);

  let assunto, texto;

  if (etapa === 1) {
    assunto = "Por quanto seus concorrentes venderam pro governo?";
    const abertura = categoria
      ? `Vocês já vendem ${categoria} para o governo, então já conhecem a parte difícil.`
      : `Vocês já vendem para o governo, então já conhecem a parte difícil.`;
    texto = `Oi, pessoal da ${empresa},

Meu nome é ${NOME_REMETENTE}, trabalho na ContrataX.

${abertura}

Sempre que uma empresa vende pro governo, um dado importante fica público: quanto ela vendeu, e pra qual órgão. Quase ninguém chega a olhar isso, porque juntar essa informação manualmente, edital por edital, leva horas.

A ContrataX organiza tudo isso pra vocês. Em segundos, dá pra pesquisar qualquer concorrente ou qualquer órgão comprador e ver o histórico completo de contratos.

Separei um acesso de 7 dias grátis pra vocês testarem, sem cartão.

Ver quanto meus concorrentes venderam: ${CTA_URL}

Se não fizer sentido pra vocês agora, é só responder "sair" que eu não escrevo de novo.

Um abraço,
${NOME_REMETENTE}
ContrataX`;
  } else if (etapa === 2) {
    assunto = "O robô que lê os editais no lugar de vocês";
    const linhaEditais = categoria
      ? `Ler tudo e achar os editais de ${categoria} que a ${empresa} pode atender é trabalho de horas.`
      : `Ler tudo e achar o que combina com o que a ${empresa} fornece é trabalho de horas.`;
    texto = `Oi de novo,

Deixa eu te mostrar a parte que economiza mais tempo.

Todo dia saem centenas de editais novos no PNCP. ${linhaEditais}

A ContrataX.IA faz essa leitura pra vocês: lê o edital inteiro, entende o que vocês vendem e separa só o que vale a pena, com prazo, valor estimado e link direto pra participar. Chega pronto no seu email, sem vocês abrirem um PDF sequer.

Vocês continuam ganhando as mesmas licitações, gastando menos tempo procurando.

Ver os editais do meu ramo: ${CTA_URL}

Um abraço,
${NOME_REMETENTE}
ContrataX`;
  } else {
    assunto = "Não precisa cancelar a que você já usa";
    texto = `Oi, pessoal da ${empresa},

Se vocês já usam alguma ferramenta de licitação, esse email não é pra pedir pra trocar.

Muita empresa perde dinheiro de dois jeitos: vende barato demais porque não sabe o preço que o mercado está pagando, ou nem participa de uma licitação que poderia ganhar.

Eu só queria pedir uma coisa: testem a nossa por 7 dias, em paralelo, sem tirar a que vocês já usam de lado. No fim, comparem.

A diferença que quase todo mundo nota: além dos alertas de edital, a gente mostra por quanto os concorrentes venderam e o histórico de preços do órgão. É a informação que ajuda a precificar melhor, e que a maioria das plataformas não entrega.

A partir de R$59 por mês, sem fidelidade. Se no teste não superar o que vocês já têm, é só seguir com a ferramenta atual, sem custo nenhum.

Rodar o teste em paralelo: ${CTA_URL}

Um abraço,
${NOME_REMETENTE}
ContrataX`;
  }

  return { assunto, texto, html: htmlSimples(texto) };
}

// ---------- logica de agendamento ----------

const DIA_MS = 86400000;
const INTERVALO_ETAPA2_DIAS = 3;
const INTERVALO_ETAPA3_DIAS = 3; // 3 dias apos a etapa 2 (total dia +6 desde o inicio)

function proximaEtapaDevida(registro) {
  if (!registro) return 1; // nunca recebeu nada -> manda a 1
  if (registro.pausado) return null;

  const diasDesde = (Date.now() - new Date(registro.dataUltimoEnvio).getTime()) / DIA_MS;

  if (registro.ultimaEtapa === 1 && diasDesde >= INTERVALO_ETAPA2_DIAS) return 2;
  if (registro.ultimaEtapa === 2 && diasDesde >= INTERVALO_ETAPA3_DIAS) return 3;
  return null; // ja mandou a 3, ou ainda nao chegou a hora da proxima
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
  const contador = lerJson(ARQ_CONTADOR, { data: hoje, enviados: 0 });
  if (contador.data !== hoje) { contador.data = hoje; contador.enviados = 0; }

  let enviadosNestaExecucao = 0;
  let pulados = 0;
  let erros = 0;

  for (const lead of leads) {
    const email = (lead.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;

    if (testeCom !== Infinity && enviadosNestaExecucao >= testeCom) break;
    if (contador.enviados >= limiteDiario) {
      console.log(`\nLimite diario de ${limiteDiario} envios atingido. Parando (retome amanha ou aumente --limite-diario).`);
      break;
    }

    if (suprimidos.has(email)) { pulados++; continue; }

    const registro = estado[email];
    const etapa = proximaEtapaDevida(registro);
    if (etapa === null) { pulados++; continue; }

    const { assunto, html } = montarEmail(etapa, lead);

    if (dryRun) {
      console.log(`[dry-run] etapa ${etapa} -> ${email} (${lead.razao_social})`);
    } else {
      try {
        await enviar({ para: email, assunto, html });
        console.log(`  OK  etapa ${etapa} -> ${email}`);
      } catch (e) {
        console.log(`  ERRO etapa ${etapa} -> ${email} | ${e.message?.slice(0, 150)}`);
        erros++;
        continue; // nao avanca o estado se falhou
      }
    }

    estado[email] = { ultimaEtapa: etapa, dataUltimoEnvio: new Date().toISOString(), razaoSocial: lead.razao_social };
    enviadosNestaExecucao++;
    contador.enviados++;

    if (!dryRun) await new Promise((r) => setTimeout(r, 600)); // ritmo educado com a API
  }

  if (!dryRun) {
    gravarJson(ARQ_ESTADO, estado);
    gravarJson(ARQ_CONTADOR, contador);
  }

  console.log(`\n================ RESULTADO ================`);
  console.log(`Enviados nesta execucao : ${enviadosNestaExecucao}`);
  console.log(`Pulados (fora do prazo/suprimidos) : ${pulados}`);
  console.log(`Erros : ${erros}`);
  console.log(`Total enviado hoje (${hoje}) : ${contador.enviados}/${limiteDiario}`);
  console.log(`=============================================`);
}

main().catch((e) => {
  console.error("Erro fatal:", e.message);
  process.exit(1);
});
