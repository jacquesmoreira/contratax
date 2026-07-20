// Logica central da campanha fria de e-mail (3 etapas: dia 0, +3, +6).
// Compartilhado entre o script CLI local (scripts/enviar-campanha.mjs, uso
// manual/teste) e o loop que roda 24h no servidor (src/campanhaLoop.mjs,
// Railway). Este modulo NAO faz I/O de arquivo: quem chama decide onde ler
// o CSV de leads e onde persistir o estado (disco local ou volume do
// Railway), pra a mesma logica funcionar nos dois lugares sem duplicar
// nem divergir.

// ---------- parser de CSV (RFC4180 simples) ----------

export function parseCsv(texto) {
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

  const cabecalho = linhas[0] || [];
  return linhas.slice(1).filter((l) => l.length === cabecalho.length && l.some((v) => v)).map((l) => {
    const obj = {};
    cabecalho.forEach((chave, i) => { obj[chave] = l[i]; });
    return obj;
  });
}

// ---------- templates dos 3 emails ----------

export function nomeCurto(razaoSocial) {
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

export function extrairCategoria(bruto) {
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

// UTM por etapa: permite ver no GA4 (Aquisicao > Origem/Midia) quanto trafego
// e cadastro vieram da campanha fria, e qual dos 3 e-mails converteu mais.
// utm_source=email, utm_medium=cold-email (nao confundir com o digest de
// cliente, que nao usa UTM), utm_campaign fixo pra essa leva, utm_content
// varia por etapa (email1/email2/email3).
export const CTA_URL = "https://www.contratax.com.br/cadastro";
export function ctaUrl(etapa) {
  return `${CTA_URL}?utm_source=email&utm_medium=cold-email&utm_campaign=campanha-fria-jul2026&utm_content=email${etapa}`;
}

// Nome de quem assina os emails de prospeccao. Troque aqui se quiser usar
// outro nome (precisa ser alguem que de fato acompanha as respostas em
// contato@contratax.com.br, pra nao ficar estranho quando o lead responder).
export const NOME_REMETENTE = "Marina";

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

export function montarEmail(etapa, lead) {
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

Ver quanto meus concorrentes venderam: ${ctaUrl(1)}

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

A ContrataX separa automaticamente os que combinam com o que vocês vendem, sem vocês caçarem em portal nenhum: objeto, valor estimado e prazo já chegam prontos no seu email.

Quando um edital chamar atenção, é só abrir no painel: aí a ContrataX.IA lê o PDF inteiro e mostra as exigências de habilitação e o veredito, se vocês estão aptos ou não.

Vocês continuam ganhando as mesmas licitações, gastando menos tempo procurando.

Ver os editais do meu ramo: ${ctaUrl(2)}

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

Rodar o teste em paralelo: ${ctaUrl(3)}

Um abraço,
${NOME_REMETENTE}
ContrataX`;
  }

  return { assunto, texto, html: htmlSimples(texto) };
}

// ---------- logica de agendamento ----------

const DIA_MS = 86400000;
export const INTERVALO_ETAPA2_DIAS = 3;
export const INTERVALO_ETAPA3_DIAS = 3; // 3 dias apos a etapa 2 (total dia +6 desde o inicio)

export function proximaEtapaDevida(registro) {
  if (!registro) return 1; // nunca recebeu nada -> manda a 1
  if (registro.pausado) return null;

  const diasDesde = (Date.now() - new Date(registro.dataUltimoEnvio).getTime()) / DIA_MS;

  if (registro.ultimaEtapa === 1 && diasDesde >= INTERVALO_ETAPA2_DIAS) return 2;
  if (registro.ultimaEtapa === 2 && diasDesde >= INTERVALO_ETAPA3_DIAS) return 3;
  return null; // ja mandou a 3, ou ainda nao chegou a hora da proxima
}

// ---------- passada de envio (usada pelo CLI local E pelo loop do servidor) ----------
//
// Recebe leads/estado/contador/suprimidos ja carregados (quem chama decide
// ONDE ficam esses dados: disco local ou volume do Railway) e devolve tudo
// atualizado, pronto pra quem chamou persistir do jeito que preferir.
// `enviarFn` e injetado: no CLI real chama Resend, em dry-run so loga.
export async function processarLote({
  leads,
  estado,
  contador,
  suprimidos,
  limiteDiario,
  novosPorDia,
  dryRun = false,
  enviarFn,
  pausaMs = 600,
  testeCom = Infinity,
  log = console.log,
}) {
  let enviadosNestaExecucao = 0;
  let pulados = 0;
  let erros = 0;

  for (const lead of leads) {
    const email = (lead.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;

    if (enviadosNestaExecucao >= testeCom) break;
    if (contador.enviados >= limiteDiario) {
      log(`Limite diario de ${limiteDiario} envios atingido. Parando.`);
      break;
    }

    if (suprimidos.has(email)) { pulados++; continue; }

    const registro = estado[email];
    const etapa = proximaEtapaDevida(registro);
    if (etapa === null) { pulados++; continue; }
    // Reenvios (etapa 2/3) tem prioridade e nao entram nesse teto -- sao
    // sempre gente que ja esta na conversa. So a ENTRADA de gente nova
    // (etapa 1) e racionada, pra nao criar uma leva que trava os proximos
    // dias sozinha (ver historico no commit que introduziu novosPorDia).
    if (etapa === 1 && contador.novos >= novosPorDia) { pulados++; continue; }

    const { assunto, html } = montarEmail(etapa, lead);

    if (dryRun) {
      log(`[dry-run] etapa ${etapa} -> ${email} (${lead.razao_social})`);
    } else {
      try {
        await enviarFn({ para: email, assunto, html });
        log(`  OK  etapa ${etapa} -> ${email}`);
      } catch (e) {
        log(`  ERRO etapa ${etapa} -> ${email} | ${e.message?.slice(0, 150)}`);
        erros++;
        continue; // nao avanca o estado se falhou
      }
    }

    estado[email] = { ultimaEtapa: etapa, dataUltimoEnvio: new Date().toISOString(), razaoSocial: lead.razao_social };
    enviadosNestaExecucao++;
    contador.enviados++;
    if (etapa === 1) contador.novos++;

    if (!dryRun && pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));
  }

  return { estado, contador, enviadosNestaExecucao, pulados, erros };
}
