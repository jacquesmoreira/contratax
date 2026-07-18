// Gera lista de emails de fornecedores que participaram de licitacoes no PNCP.
//
// Fluxo:
//   1. Busca contratos publicados no PNCP nos ultimos N meses (pagina a pagina)
//   2. Extrai CNPJs unicos dos fornecedores vencedores
//   3. Enriquece cada CNPJ via API publica da Receita Federal (publica.cnpj.ws)
//      - Limite: 3 req/min; o script usa 22s de intervalo para nao ser bloqueado
//   4. Filtra quem tem email cadastrado e exporta CSV
//
// Uso:
//   node scripts/gerar-lista-emails.mjs
//   node scripts/gerar-lista-emails.mjs --meses 3
//   node scripts/gerar-lista-emails.mjs --meses 1 --max-cnpjs 500 --saida leads.csv
//
// Parametros:
//   --meses N        janela de contratos a buscar (padrao: 3)
//   --limite-pag N   max paginas do PNCP (util para testes rapidos)
//   --max-cnpjs N    para o enriquecimento depois de N CNPJs (padrao: 1000)
//   --saida ARQ      arquivo de saida (padrao: leads-AAAAMM.csv)
//
// Estimativa de tempo:
//   500 CNPJs  ~ 3 horas | resultado esperado: ~120-180 emails
//   1000 CNPJs ~ 6 horas | resultado esperado: ~250-350 emails
//
// Roda por muitas horas sem supervisao (ex: fim de semana inteiro)? O script:
//   - pula CNPJs que ja aparecem em qualquer leads-*.csv existente na pasta
//     (nao desperdica consulta com quem voce ja tem)
//   - salva um checkpoint em data/ a cada poucas consultas; se cair a conexao,
//     travar ou o PC dormir no meio, rode o MESMO comando de novo (mesmo
//     --saida) que ele retoma dali, sem perder o que ja foi feito
//   - Ctrl+C tambem salva antes de sair

import { createWriteStream, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { paginarContratos } from "../src/pncp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");

// ---------- args ----------

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const meses       = Number(arg("--meses", 3));
const limitePag   = Number(arg("--limite-pag", Infinity));
const maxCnpjs    = Number(arg("--max-cnpjs", 1000));
const hoje        = new Date();
const tag         = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}`;
const arquivoSaida = join(RAIZ, arg("--saida", `leads-${tag}.csv`));

// ---------- dedup contra leads ja coletados + checkpoint de retomada ----------

// Le todo leads-*.csv da pasta (exceto o proprio arquivo de saida) e extrai os
// CNPJs ja conhecidos via regex de 14 digitos (mais simples e robusto que um
// parser de CSV completo, e nenhum outro campo da planilha tem 14 digitos seguidos).
function carregarCnpjsConhecidos() {
  const conhecidos = new Set();
  let arquivos = [];
  try {
    arquivos = readdirSync(RAIZ).filter(
      (f) => /^leads-.*\.csv$/i.test(f) && join(RAIZ, f) !== arquivoSaida && !f.includes(".bak.")
    );
  } catch {}
  for (const arq of arquivos) {
    try {
      const matches = readFileSync(join(RAIZ, arq), "utf8").match(/\b\d{14}\b/g) || [];
      for (const cnpj of matches) conhecidos.add(cnpj);
    } catch {}
  }
  if (conhecidos.size) console.log(`Ja conhecidos (de ${arquivos.length} arquivo(s) leads-*.csv): ${conhecidos.size} CNPJs — serao pulados.`);
  return conhecidos;
}

const DIR_DADOS = join(RAIZ, "data");
if (!existsSync(DIR_DADOS)) mkdirSync(DIR_DADOS, { recursive: true });
const ARQ_CHECKPOINT = join(DIR_DADOS, `coleta-tentados-${arg("--saida", `leads-${tag}.csv`).replace(/[^a-z0-9]/gi, "_")}.json`);

function carregarCheckpoint() {
  if (!existsSync(ARQ_CHECKPOINT)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(ARQ_CHECKPOINT, "utf8")));
  } catch {
    return new Set();
  }
}
function salvarCheckpoint(set) {
  writeFileSync(ARQ_CHECKPOINT, JSON.stringify([...set]), "utf8");
}

// ---------- util ----------

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtData(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function ehCnpj(ni) {
  return ni && ni.replace(/\D/g, "").length === 14;
}

function escaparCsv(val) {
  if (val == null) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function linhaCSV(...cols) {
  return cols.map(escaparCsv).join(",") + "\n";
}

// ---------- fase 1: coletar CNPJs do PNCP ----------

async function coletarCnpjs(conhecidos) {
  const cnpjs = new Map(); // cnpj => { razaoSocial, uf, municipio, exemploProduto }
  let totalContratos = 0;
  let pag = 0;

  const dataFinal   = fmtData(hoje);
  const dataInicial = fmtData(new Date(hoje.getFullYear(), hoje.getMonth() - meses, hoje.getDate()));

  console.log(`\nFase 1 — Coletando fornecedores do PNCP (${dataInicial} a ${dataFinal})...`);

  // O PNCP as vezes devolve um 500 transitorio; paginarContratos ja tenta 3x
  // por pagina, mas se mesmo assim falhar nao pode derrubar o processo
  // inteiro (rodando sem supervisao por horas). Melhor seguir pra fase 2
  // com o que ja foi coletado do que perder tudo por causa de uma pagina.
  try {
    for await (const { contratos, pagina, totalPaginas } of paginarContratos({ dataInicial, dataFinal })) {
      pag++;
      process.stdout.write(`\r  pag ${pagina}/${totalPaginas} | CNPJs novos coletados: ${cnpjs.size}`);

      for (const c of contratos) {
        if (!ehCnpj(c.fornecedorNi)) continue;
        // Ignora alienacao de bens e leiloes: esses vencedores nao sao
        // fornecedores regulares de pregoes e raramente tem email cadastrado
        if (c.categoriaId === 11) continue; // Alienacao de bens moveis/imoveis
        const cnpj = c.fornecedorNi.replace(/\D/g, "");
        if (conhecidos.has(cnpj)) continue; // ja temos esse fornecedor num leads-*.csv
        if (!cnpjs.has(cnpj)) {
          cnpjs.set(cnpj, {
            razaoSocial:    c.fornecedor ?? "",
            uf:             c.uf ?? "",
            municipio:      c.municipio ?? "",
            exemploProduto: (c.objeto ?? "").slice(0, 120),
          });
        }
      }

      totalContratos += contratos.length;
      if (pag >= limitePag) break;
      // Para quando tiver CNPJs novos suficientes para o enriquecimento. O
      // dedup contra leads-*.csv ja garante que cnpjs so tem CNPJs que ainda
      // nao processamos, entao uma margem pequena (1.3x) basta pra cobrir
      // quem ja foi tentado num checkpoint de retomada; nao precisa de 3x —
      // isso so gastava tempo de paginacao (fase 1) que podia ir pro rate
      // limit da Receita (fase 2, que e o gargalo real).
      if (cnpjs.size >= maxCnpjs * 1.3) break;
    }
  } catch (e) {
    console.log(`\n  [!] Fase 1 interrompida por erro (${e.message}). Seguindo pra fase 2 com os ${cnpjs.size} CNPJs ja coletados.`);
  }

  console.log(`\n  Contratos lidos: ${totalContratos.toLocaleString("pt-BR")} | CNPJs unicos: ${cnpjs.size}`);
  return cnpjs;
}

// ---------- fase 2: enriquecer com email via Receita Federal ----------

async function buscarCnpjWs(cnpj) {
  const resp = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    headers: { Accept: "application/json", "User-Agent": "ContrataX/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (resp.status === 429 || resp.status >= 500) return { bloqueado: true };
  if (!resp.ok) return { erro: resp.status };
  const d = await resp.json();
  const est = d.estabelecimento ?? {};
  return {
    email:        est.email?.trim() || null,        // campo correto: estabelecimento.email
    nomeFantasia: est.nome_fantasia?.trim() || null,
    razaoSocial:  d.razao_social?.trim() ?? null,
    uf:           est.estado?.sigla ?? null,
    municipio:    est.cidade?.nome ?? null,
    situacao:     est.situacao_cadastral ?? null,
  };
}

async function enriquecerCnpj(cnpj) {
  try {
    return await buscarCnpjWs(cnpj);
  } catch {
    return { erro: "timeout" };
  }
}

// ---------- main ----------

async function main() {
  console.log("=== Gerador de Leads por Email — Fornecedores PNCP + Receita Federal ===");
  console.log(`Parametros: meses=${meses} | max-cnpjs=${maxCnpjs} | saida=${arquivoSaida}`);

  const conhecidos = carregarCnpjsConhecidos();
  const tentados = carregarCheckpoint();
  // Rede de seguranca: o checkpoint so salva a cada 5 tentativas, entao um
  // processo morto antes disso (crash, taskkill, etc.) pode deixar leads no
  // CSV que o checkpoint ainda nao sabe. Completa com o que ja esta gravado
  // no proprio arquivo de saida, senao a proxima execucao reprocessaria
  // (e duplicaria) esses CNPJs.
  if (existsSync(arquivoSaida)) {
    const doCsv = readFileSync(arquivoSaida, "utf8").match(/\b\d{14}\b/g) || [];
    for (const cnpj of doCsv) tentados.add(cnpj);
  }
  if (tentados.size) console.log(`Checkpoint (+ CSV existente): ${tentados.size} CNPJs ja tentados nesta coleta — serao pulados (retomando run anterior).`);

  // Fase 1
  const cnpjsTodos = await coletarCnpjs(conhecidos);
  const cnpjsParaEnriquecer = [...cnpjsTodos.entries()].filter(([cnpj]) => !tentados.has(cnpj)).slice(0, maxCnpjs);
  const total = cnpjsParaEnriquecer.length;
  console.log(`Tempo estimado desta execucao: ~${Math.round(total * 22 / 3600 * 10) / 10} horas`);

  // Prepara CSV — se o arquivo de saida ja existe (com conteudo), continua
  // nele em vez de sobrescrever. Importante: NAO depender so do checkpoint
  // ter entradas — se o processo morreu antes do primeiro save periodico
  // (a cada 5 tentativas), o checkpoint pode estar vazio mesmo com leads
  // ja gravados no CSV, e sobrescrever perderia esses leads.
  const retomando = existsSync(arquivoSaida) && statSync(arquivoSaida).size > 0;
  const stream = createWriteStream(arquivoSaida, { encoding: "utf8", flags: retomando ? "a" : "w" });
  if (!retomando) {
    stream.write("﻿"); // BOM UTF-8 para o Excel abrir corretamente
    stream.write(linhaCSV(
      "email",
      "razao_social",
      "nome_fantasia",
      "cnpj",
      "uf",
      "municipio",
      "situacao_cadastral",
      "exemplo_produto_licitado",
    ));
  }

  let processados = 0, comEmail = 0, semEmail = 0, erros = 0, bloqueios = 0;
  let encerrando = false;

  // Evita empilhar um listener novo a cada retomada do supervisor
  process.removeAllListeners("SIGINT");
  process.on("SIGINT", () => {
    if (encerrando) process.exit(1); // segundo Ctrl+C forca saida
    encerrando = true;
    console.log("\n\n[!] Interrompido. Salvando checkpoint e fechando o arquivo (aguarde)...");
  });

  console.log(`\nFase 2 — Enriquecendo ${total} CNPJs (22s entre cada consulta para respeitar rate limit)...`);
  console.log(`Iniciado em: ${new Date().toLocaleTimeString("pt-BR")}`);
  const previsao = new Date(Date.now() + total * 22000);
  console.log(`Previsao de termino: ${previsao.toLocaleTimeString("pt-BR")} (${previsao.toLocaleDateString("pt-BR")})`);
  console.log(`Se precisar parar, Ctrl+C salva o progresso. Rode o mesmo comando de novo depois para retomar.\n`);

  for (const [cnpj, dadosPncp] of cnpjsParaEnriquecer) {
    if (encerrando) break;
    processados++;
    process.stdout.write(
      `\r  ${processados}/${total} | emails: ${comEmail} | sem email: ${semEmail} | erros: ${erros} | bloqueios: ${bloqueios}`
    );

    let rf = await enriquecerCnpj(cnpj);

    // Se bloqueado, aguarda 90s e tenta de novo
    if (rf.bloqueado && !encerrando) {
      bloqueios++;
      process.stdout.write(`\n  [!] Rate limit. Aguardando 90s... (${new Date().toLocaleTimeString("pt-BR")})`);
      await dormir(90000);
      rf = await enriquecerCnpj(cnpj);
    }

    if (rf.erro) {
      erros++;
    } else if (rf.email?.includes("@")) {
      // Aceita empresa ativa ou sem situacao definida
      const ativa = !rf.situacao || rf.situacao === "Ativa" || rf.situacao === "2";
      if (ativa) {
        stream.write(linhaCSV(
          rf.email,
          rf.razaoSocial  ?? dadosPncp.razaoSocial,
          rf.nomeFantasia ?? "",
          cnpj,
          rf.uf       ?? dadosPncp.uf,
          rf.municipio ?? dadosPncp.municipio,
          rf.situacao ?? "",
          dadosPncp.exemploProduto,
        ));
        comEmail++;
      } else {
        semEmail++;
      }
    } else {
      semEmail++;
    }

    tentados.add(cnpj);
    if (processados % 5 === 0) salvarCheckpoint(tentados);

    // 22s de intervalo = confortavelmente abaixo do limite de 3 req/min
    if (processados < total && !encerrando) await dormir(22000);
  }

  salvarCheckpoint(tentados);
  await new Promise((res) => stream.end(res));

  const taxaEmail = processados > 0 ? Math.round((comEmail / processados) * 100) : 0;

  console.log(`\n\n================ RESULTADO ================`);
  console.log(`CNPJs processados  : ${processados.toLocaleString("pt-BR")}${encerrando ? " (interrompido)" : ""}`);
  console.log(`Emails encontrados : ${comEmail.toLocaleString("pt-BR")} (${taxaEmail}% de preenchimento)`);
  console.log(`Sem email          : ${semEmail.toLocaleString("pt-BR")}`);
  console.log(`Erros/timeouts     : ${erros.toLocaleString("pt-BR")}`);
  console.log(`Bloqueios de rate  : ${bloqueios.toLocaleString("pt-BR")}`);
  console.log(`Arquivo gerado     : ${arquivoSaida}`);
  console.log(`===========================================`);

  if (encerrando) {
    console.log(`\nProgresso salvo. Rode o mesmo comando de novo pra continuar de onde parou.`);
  }

  if (comEmail === 0 && !encerrando) {
    console.log(`\nAviso: nenhum email encontrado. Possivel causa: os CNPJs desta amostra`);
    console.log(`pertencem a leiloes/alienacoes onde os vencedores sao pessoas fisicas.`);
    console.log(`Tente aumentar o numero de meses com --meses 6.`);
  }
}

// Supervisor: roda main() e, se ela cair por qualquer motivo nao previsto
// (rede, API fora do ar, etc.), espera um pouco e chama de novo em vez de
// derrubar o processo — essencial rodando sem supervisao por muitas horas.
// O checkpoint + dedup ja garantem que reprocessar nao duplica nem
// desperdica consultas com quem ja foi tentado.
async function rodarComSupervisor() {
  let tentativa = 0;
  while (true) {
    tentativa++;
    try {
      await main();
      break; // terminou normalmente
    } catch (e) {
      console.error(`\n[!] Erro nao tratado (tentativa ${tentativa}): ${e.message}`);
      console.error(`    Aguardando 2 min e retomando (checkpoint preserva o progresso)...`);
      await dormir(120000);
    }
  }
}

rodarComSupervisor();
