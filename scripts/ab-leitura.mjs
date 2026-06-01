// Teste A/B da LEITURA do edital: Sonnet vs Haiku no mesmo PDF.
// Compara qualidade (exigencias extraidas) e custo real (tokens -> R$).
// Uso: node scripts/ab-leitura.mjs <idEdital> [modeloHaiku]

import "../src/env.mjs";
import { buscarPorId } from "../src/db.mjs";
import { obterPdfs } from "../src/documentos.mjs";
import { montarCorpo, extrairJson } from "../src/ia.mjs";
import { custoChamada } from "../src/custo.mjs";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Chamador local que DEVOLVE texto + usage (o chamar() padrao so devolve texto).
async function chamarComUso(corpo, { tentativas = 4 } = {}) {
  const chave = process.env.ANTHROPIC_API_KEY;
  for (let t = 1; t <= tentativas; t++) {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (r.ok) { const j = await r.json(); return { texto: j.content?.find((b) => b.type === "text")?.text ?? "", usage: j.usage }; }
    if ((r.status === 429 || r.status === 529) && t < tentativas) {
      const espera = (Number(r.headers.get("retry-after")) || 30) + 2;
      console.log(`   (limite ${r.status}, esperando ${espera}s e tentando de novo...)`);
      await dormir(espera * 1000); continue;
    }
    throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

function conta(analise) {
  const e = analise.exigenciasHabilitacao || {};
  const n = (x) => Array.isArray(x) ? x.length : 0;
  return {
    juridica: n(e.habilitacaoJuridica),
    fiscal: n(e.regularidadeFiscalTrabalhista),
    tecnica: n(e.qualificacaoTecnica),
    economica: n(e.qualificacaoEconomicoFinanceira),
    alertas: n(analise.alertas),
    itens: n(analise.itensPrincipais),
  };
}

// Edital padrao = o mais leve entre os ja analisados (teste mais barato).
const id = process.argv[2] || "15126437000305-1-001912/2026";
const MODELO_SONNET = process.env.LICITA_MODELO || "claude-sonnet-4-6";
// Candidatos de Haiku (o id varia por conta/versao). Tenta na ordem ate um funcionar.
const HAIKU_CANDIDATOS = [...new Set([
  process.argv[3], process.env.LICITA_MODELO_HAIKU,
  "claude-haiku-4-5-20251001", "claude-haiku-4-6", "claude-3-5-haiku-latest",
].filter(Boolean))];

// Tenta ler com cada candidato de modelo ate um responder (ignora "modelo invalido").
async function lerComFallback(buffer, candidatos) {
  let ultimoErro = null;
  for (const modelo of candidatos) {
    try {
      const out = await chamarComUso(montarCorpo(buffer, { modelo }));
      return { ...out, modelo };
    } catch (e) {
      ultimoErro = e;
      if (/model|not.?found|404|invalid_request/i.test(e.message) && !/credit|balance/i.test(e.message)) {
        console.log(`   (modelo ${modelo} nao serve: ${e.message.slice(0, 60)}; tentando proximo)`);
        continue;
      }
      throw e; // erro real (saldo, rede): para aqui
    }
  }
  throw ultimoErro || new Error("nenhum modelo Haiku funcionou");
}

const edital = buscarPorId(id);
if (!edital) { console.log("Edital nao encontrado:", id); process.exit(1); }
console.log("Edital:", (edital.objeto || "").slice(0, 70));
console.log("Baixando PDF...");
const pdfs = await obterPdfs(edital);
const pdf = pdfs[0];
console.log(`PDF: ${pdf.nome} (${(pdf.buffer.length / 1024).toFixed(0)} KB)\n`);

const resultados = {};
for (const [nome, candidatos] of [["SONNET", [MODELO_SONNET]], ["HAIKU", HAIKU_CANDIDATOS]]) {
  console.log(`== ${nome} ==`);
  try {
    const t0 = Date.now();
    const { texto, usage, modelo } = await lerComFallback(pdf.buffer, candidatos);
    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    const analise = extrairJson(texto);
    const c = custoChamada(usage, modelo);
    console.log(`   modelo usado: ${modelo}`);
    resultados[nome] = { analise, custo: c, seg };
    const q = conta(analise);
    console.log(`   custo: R$ ${c.brl.toFixed(4)} | tokens ent/sai: ${c.tokensEntrada}/${c.tokensSaida} | ${seg}s`);
    console.log(`   exigencias -> juridica:${q.juridica} fiscal:${q.fiscal} tecnica:${q.tecnica} economica:${q.economica} | alertas:${q.alertas} itens:${q.itens}`);
    console.log(`   resumo: ${(analise.resumo || "").slice(0, 110)}`);
    console.log(`   prazo: ${analise.prazoEnvioProposta || "—"} | valor: ${analise.valorEstimado || "—"}\n`);
  } catch (e) {
    console.log(`   FALHOU: ${e.message}\n`);
    resultados[nome] = { erro: e.message };
  }
}

// Veredito de custo
if (resultados.SONNET?.custo && resultados.HAIKU?.custo) {
  const s = resultados.SONNET.custo.brl, h = resultados.HAIKU.custo.brl;
  const economia = ((1 - h / s) * 100).toFixed(0);
  console.log("================ VEREDITO ================");
  console.log(`Custo leitura  -> Sonnet R$ ${s.toFixed(4)} | Haiku R$ ${h.toFixed(4)}  (Haiku ${economia}% mais barato)`);
  console.log(`Conferencia (~R$0,17 fixa) entra por cima nos dois.`);
  console.log(`Analise completa estimada -> Sonnet ~R$ ${(s + 0.17).toFixed(2)} | Haiku ~R$ ${(h + 0.17).toFixed(2)}`);
  console.log(`\nCompare as exigencias acima: se o Haiku capturou numeros parecidos, vale trocar.`);
}

// Comparacao QUALITATIVA: mostra o conteudo real extraido por cada modelo.
function bloco(titulo, arr) {
  console.log(`  ${titulo}:`);
  (arr || []).forEach((x) => console.log(`     - ${typeof x === "string" ? x : JSON.stringify(x)}`));
  if (!arr || !arr.length) console.log("     (vazio)");
}
for (const nome of ["SONNET", "HAIKU"]) {
  const a = resultados[nome]?.analise;
  if (!a) continue;
  const e = a.exigenciasHabilitacao || {};
  console.log(`\n################ ${nome} — conteudo extraido ################`);
  console.log(`RESUMO: ${a.resumo || "—"}`);
  bloco("Habilitacao juridica", e.habilitacaoJuridica);
  bloco("Regularidade fiscal/trabalhista", e.regularidadeFiscalTrabalhista);
  bloco("Qualificacao tecnica", e.qualificacaoTecnica);
  bloco("Qualificacao economico-financeira", e.qualificacaoEconomicoFinanceira);
  bloco("Alertas", a.alertas);
}
