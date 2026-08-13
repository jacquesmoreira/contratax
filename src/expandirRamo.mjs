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

// PROMPT v2 (13/08/2026), reescrito a partir de 4 falhas REAIS em producao. As
// duas primeiras o codigo ja barra depois (jargao, sigla de 2 letras); as duas
// ultimas passavam e foram parar no TOPO do painel de clientes pagantes:
//   "registro eletronico"   -> casou com "REGISTRO DE PRECOS" (jargao)
//   "consultoria it"        -> "it" some no matching, virou "consultoria" solta
//   "plataforma hospitalar" -> trouxe medicamento e mesa cirurgica
//   "informatica medica"    -> trouxe "equipamentos medicos e de informatica"
// O padrao das duas ultimas: PALAVRA GENERICA + SETOR. "hospitalar"/"medica"
// dizem ONDE se vende, nao O QUE se vende, entao o termo casa com o setor
// inteiro (equipamento, medicamento, insumo) e nao com o produto do cliente.
// Dai a regra central do prompt novo: o termo tem que nomear O QUE E COMPRADO.
const INSTRUCAO = `Voce ajuda uma empresa que vende para o governo brasileiro a nao perder licitacoes do ramo dela. Recebe o que a empresa vende e gera palavras-chave que apareceriam no OBJETO de editais comprando exatamente isso.

TESTE OBRIGATORIO para cada termo, antes de incluir:
"Se eu ler este termo no objeto de um edital, tenho certeza de que o comprador quer O QUE ESTA EMPRESA VENDE?"
Se a resposta for "talvez, depende do resto do edital", NAO inclua.

O termo deve nomear O QUE E COMPRADO, nunca so o SETOR onde a empresa atua.
- Empresa de SOFTWARE de saude: "prontuario eletronico", "gestao de leitos", "sistema de regulacao" SIM.
  "plataforma hospitalar", "informatica medica", "solucao para saude" NAO: casam com compra de
  maca, medicamento e equipamento, que a empresa nao vende.
- Empresa de MATERIAL ELETRICO: "cabo de cobre", "disjuntor", "luminaria led" SIM.
  "infraestrutura eletrica", "solucao energetica" NAO: casam com obra inteira.
- Empresa de TI: "licenca de software", "servidor de rede", "switch gerenciavel" SIM.
  "consultoria it", "transformacao digital", "solucao tecnologica" NAO: vagos demais.

Regras rigidas:
- 1 a 3 palavras por termo. Prefira o nome concreto do produto ou servico.
- No maximo ${MAX_TERMOS_IA} termos. Menos e melhor: 5 termos certeiros valem mais que 12 vagos.
- Portugues do Brasil, minusculas.
- NAO repita os termos que recebeu, nem variacao de plural deles.
- NAO use sigla de 2 letras (it, ti, bi, rh): some no nosso buscador e sobra so a outra palavra.
- NAO use palavra de processo de compra: registro, preco, pregao, licitacao, edital, ata, certame,
  aquisicao, contratacao, fornecimento, prestacao, objeto, proposta, habilitacao, eletronico.
  Elas aparecem em TODO edital do pais e destroem a busca.
- NAO use palavra guarda-chuva sozinha nem colada em setor: solucao, plataforma, sistema, servico,
  produto, material, equipamento, infraestrutura, gestao, tecnologia, consultoria, assessoria.
  So valem quando vierem com o produto concreto ("sistema de folha de pagamento", nao "sistema de saude").
- Se nao houver termo bom o suficiente, devolva MENOS termos. Lista curta e correta e o objetivo;
  nunca complete a lista com termos vagos so pra chegar em ${MAX_TERMOS_IA}.
- Se o ramo recebido for vago ou amplo demais ("tecnologia da informacao", "consultoria",
  "servicos gerais"), NAO peca esclarecimento e NAO faca perguntas: escolha por conta propria os
  itens mais comprados pelo governo dentro desse ramo e liste so eles.
- Responda SO com a lista separada por virgula. Sem numeracao, sem explicacao, sem perguntas, sem
  parenteses, sem reticencias, sem texto antes ou depois. Exemplo exato do formato esperado:
  cabo de cobre, disjuntor, luminaria led`;

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
    const candidatos = limparExpandidos(texto, limpos);
    // Ultimo portao: termo que nao existe no acervo nao ajuda ninguem.
    const { mantidos } = await filtrarPorAcervo(candidatos);
    return mantidos;
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

// TERMO DEGRADADO (12/08/2026, caso real do DEVCONS): o matching ignora tokens
// de 2 letras sem numero (tokenSignificativo em filtro.mjs), entao a sigla some.
// A IA gerou "consultoria it" pro ramo de Tecnologia da Informacao; na hora de
// casar, "it" e descartado e sobra "consultoria" SOZINHA -- que casou com
// "CONSULTORIA E ASSESSORIA AMBIENTAL" no painel dele. O termo prometia ser
// especifico (2 palavras) e virou generico (1). Regra: se um termo composto
// perde palavra no filtro e sobra so uma, ele nao entrega o que prometia e e
// descartado. Termos com sigla+numero ("papel a4", "software 3d") nao caem
// aqui, porque token com digito continua significativo.
function ehTokenSignificativo(w) {
  return w.length >= 3 || (w.length >= 2 && /\d/.test(w));
}
function termoDegradado(termo) {
  const palavras = norm(termo).split(/[^a-z0-9]+/).filter(Boolean);
  if (palavras.length < 2) return false; // termo de 1 palavra ja e o que e
  return palavras.filter(ehTokenSignificativo).length < 2;
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
    // FRAGMENTO DE PROSA (13/08/2026): com o ramo vago "Tecnologia da
    // Informacao" o modelo devolveu perguntas em vez de lista ("Vende hardware?
    // (servidores, switches...)"), e o split por virgula picou isso em pedacos
    // como "escritorio...)" e "Faz consultoria?", que viravam termo de busca.
    // O prompt agora proibe esse formato; isto e a rede de seguranca, porque
    // termo legitimo nunca tem ?, (), reticencias ou dois-pontos.
    if (/[?():]|\.\.\./.test(t)) { console.log(`[expandir-ramo] descartado (fragmento de prosa): ${t}`); continue; }
    if (t.split(/\s+/).length > 3) continue; // muito longo, vira ruido
    const n = norm(t);
    if (n.length < 3 || jaTem.has(n) || vistos.has(n)) continue;
    if (temJargaoLicitacao(t)) { console.log(`[expandir-ramo] descartado (jargao): ${t}`); continue; }
    if (termoDegradado(t)) { console.log(`[expandir-ramo] descartado (vira palavra solta): ${t}`); continue; }
    vistos.add(n);
    out.push(t);
    if (out.length >= MAX_TERMOS_IA) break;
  }
  return out;
}

// Saneamento dos termos JA salvos: os clientes existentes tem termosIA gerados
// antes destes filtros (a SM Assessoria tinha "registro eletronico"; o DEVCONS
// tem "consultoria it"). Serve pro endpoint de admin limpar sem precisar
// refazer a expansao (que custaria IA e poderia gerar outros termos).
export function filtrarJargao(termosIA = []) {
  return (termosIA || []).filter((t) => !temJargaoLicitacao(t) && !termoDegradado(t));
}

// VALIDACAO CONTRA O ACERVO (13/08/2026). O prompt v2 passou a gerar termos
// conceitualmente corretos, mas a IA nao tem como saber que VOCABULARIO os
// pregoeiros usam de verdade. Medido ao aplicar no SM Assessoria: "gestao de
// leitos", "sistema de regulacao" e "faturamento hospitalar" sao exatamente o
// que a empresa vende e deram ZERO edital no acervo inteiro; ao mesmo tempo a
// troca derrubou "telemedicina", que achava 4. O painel foi de 11 pra 7 sem
// nada entrar. Precisao conceitual sem lastro na realidade nao serve.
//
// Agora todo termo sugerido e testado contra o acervo antes de ser oferecido:
// termo que nao acha nada e descartado, e a contagem vai junto pro admin ver.
// Roda 1 query e filtra em memoria (o custo esta no aplicarFiltro por termo,
// nao no banco). So no cadastro e no botao de sugerir, nunca em hot path.
export async function contarNoAcervo(termos = []) {
  const lista = (termos || []).filter(Boolean);
  if (!lista.length) return [];
  try {
    const { consultar } = await import("./db.mjs");
    const { aplicarFiltro } = await import("./filtro.mjs");
    const candidatos = consultar({ apenasAbertos: true });
    return lista.map((t) => ({ termo: t, n: aplicarFiltro(candidatos, { termos: [t] }).length }));
  } catch (e) {
    // Sem banco (ex: script solto), devolve todos como "nao verificado" pra
    // nunca descartar termo bom por falha de infra.
    console.error("[expandir-ramo] validacao no acervo falhou:", e.message);
    return lista.map((t) => ({ termo: t, n: null }));
  }
}

// Mantem so os termos que aparecem no acervo. n === null = nao deu pra medir,
// mantem (melhor um termo a mais do que perder por falha de leitura).
export async function filtrarPorAcervo(termos = [], { minimo = 1 } = {}) {
  const medidos = await contarNoAcervo(termos);
  const mantidos = [], descartados = [];
  for (const { termo, n } of medidos) {
    if (n === null || n >= minimo) mantidos.push(termo);
    else descartados.push(termo);
  }
  if (descartados.length) console.log(`[expandir-ramo] descartados (0 editais no acervo): ${descartados.join(", ")}`);
  return { mantidos, descartados, medidos };
}
