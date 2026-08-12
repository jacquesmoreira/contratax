// Expansao semantica do ramo via ContrataX.IA. Quando o cliente cadastra o que
// vende, a IA deduz o DOMINIO e gera palavras-chave relacionadas/sinonimos que
// apareceriam em editais do mesmo ramo. Assim quem cadastra "materiais
// ambulatoriais e insumos hospitalares" tambem recebe "material hospitalar",
// "insumo cirurgico", "equipamento medico", etc, sem ter que adivinhar os
// termos certos. Resultado fica em filtro.termosIA (separado dos termos do
// cliente, pra ele poder ver e remover).

import { registrarCusto } from "./custo.mjs";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODELO = process.env.LICITA_MODELO_EXPANSAO || "claude-haiku-4-5-20251001";
const MAX_TERMOS_IA = Number(process.env.LICITA_MAX_TERMOS_IA || 12);

const INSTRUCAO = `Voce recebe os ramos de atuacao de uma empresa que vende para o governo brasileiro (licitacoes). Gere palavras-chave RELACIONADAS e SINONIMOS que apareceriam em editais do MESMO ramo, para ampliar a busca SEM fugir do dominio.

Regras rigidas:
- 1 a 2 palavras por termo (ex: "material hospitalar", "seringa", "equipamento medico").
- No maximo ${MAX_TERMOS_IA} termos.
- Portugues do Brasil, minusculas, sem acento opcional.
- NAO repita os termos originais que recebeu.
- NAO use termos genericos demais que casariam com qualquer edital (ex: "aquisicao", "servico", "contratacao", "fornecimento", "material" sozinho, "produto", "equipamento" sozinho).
- Foco no que IDENTIFICA o ramo. Se o ramo for amplo, escolha os sub-itens mais comuns.
- Responda SO com a lista separada por virgula, nada mais. Sem numeracao, sem explicacao.`;

// Recebe a lista de termos do cliente. Devolve array de termos relacionados
// (pode ser vazio em falha/sem chave: o sistema segue com os termos do cliente).
export async function expandirRamo(termos = []) {
  const limpos = (termos || []).map((t) => String(t).trim()).filter(Boolean);
  if (!limpos.length || !process.env.ANTHROPIC_API_KEY) return [];

  const corpo = {
    model: MODELO,
    max_tokens: 200,
    system: INSTRUCAO,
    messages: [{ role: "user", content: `Ramos da empresa: ${limpos.join(", ")}` }],
  };

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(Number(process.env.LICITA_EXPANSAO_TIMEOUT || 8000)),
    });
    if (!r.ok) {
      console.error("[expandir-ramo] erro", r.status, (await r.text()).slice(0, 160));
      return [];
    }
    const j = await r.json();
    if (j.usage) { try { await registrarCusto({ usage: j.usage, modelo: MODELO, contexto: "expandir-ramo" }); } catch {} }
    const texto = j.content?.find((b) => b.type === "text")?.text || "";
    return limparExpandidos(texto, limpos);
  } catch (e) {
    console.error("[expandir-ramo]", e.message);
    return [];
  }
}

// Normaliza pra comparar/deduplicar (sem acento, minusculo, trim).
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// JARGAO DE LICITACAO: palavras que aparecem no cabecalho/boilerplate de quase
// TODO edital brasileiro, independente do ramo. Um termo da IA que contenha
// qualquer uma delas casa com o vocabulario padrao e nao com o negocio do
// cliente. Caso real (12/08/2026): pro ramo "PRONTUARIO ELETRONICO" a IA gerou
// "registro eletronico" -- correto em portugues, desastroso aqui, porque
// "PREGAO ELETRONICO PARA REGISTRO DE PRECOS" e a frase mais comum do sistema
// de compras publicas. O painel de uma empresa de software medico enchia de
// madeira, areia, brita e placa de sinalizacao. Exigir proximidade nao resolve
// (nessa frase as palavras estao coladas): o termo tem que morrer na origem.
const JARGAO_LICITACAO = new Set([
  "registro", "registros", "preco", "precos", "pregao", "pregoes", "licitacao",
  "licitacoes", "edital", "editais", "ata", "atas", "certame", "certames",
  "aquisicao", "aquisicoes", "contratacao", "contratacoes", "fornecimento",
  "prestacao", "srp", "eletronico", "eletronica", "presencial", "lote", "lotes",
  "item", "itens", "objeto", "proposta", "propostas", "habilitacao",
]);

// Um termo e descartado se QUALQUER palavra dele for jargao. Conservador de
// proposito: e melhor perder um sinonimo bom ("pregao de informatica") do que
// deixar entrar um que casa com todo edital do pais. Os termos que o CLIENTE
// digita nao passam por aqui (intencao explicita dele e sempre respeitada).
function temJargaoLicitacao(termo) {
  return norm(termo).split(/[^a-z0-9]+/).filter(Boolean).some((w) => JARGAO_LICITACAO.has(w));
}

// Limpa a saida da IA: separa por virgula, tira numeracao/lixo, remove termos
// vazios, longos demais (> 3 palavras), duplicados, os que o cliente ja tem e
// os que contem jargao de licitacao (ver acima).
function limparExpandidos(texto, originais) {
  const jaTem = new Set(originais.map(norm));
  const vistos = new Set();
  const out = [];
  for (let t of String(texto).split(/[,;\n]+/)) {
    t = t.replace(/^[\s\-*\d.)]+/, "").trim(); // tira bullet/numeracao no inicio
    if (!t) continue;
    if (t.split(/\s+/).length > 3) continue; // muito longo, vira ruido
    const n = norm(t);
    if (n.length < 3 || jaTem.has(n) || vistos.has(n)) continue;
    if (temJargaoLicitacao(t)) { console.log(`[expandir-ramo] descartado (jargao): ${t}`); continue; }
    vistos.add(n);
    out.push(t);
    if (out.length >= MAX_TERMOS_IA) break;
  }
  return out;
}

// Saneamento dos termos JA salvos: os clientes existentes tem termosIA gerados
// antes deste filtro (a SM Assessoria tem "registro eletronico" gravado). Serve
// pro endpoint de admin limpar sem precisar refazer a expansao (que custaria IA
// e poderia gerar outros termos).
export function filtrarJargao(termosIA = []) {
  return (termosIA || []).filter((t) => !temJargaoLicitacao(t));
}
