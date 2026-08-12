// Filtragem de editais por palavras-chave e faixa de valor.
// O PNCP nao filtra por texto, entao isso e feito aqui, do nosso lado.

// Remove acentos e baixa a caixa, para casar "conservacao" com "Conservacao".
export function normalizar(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Raiz simples de uma palavra (ja normalizada, sem acento): remove plurais e
// variacoes comuns do portugues, para "materiais" casar com "material" e
// "hospitalares" com "hospitalar".
export function raiz(p) {
  return p
    .replace(/oes$/, "ao")
    .replace(/ais$/, "al")
    .replace(/eis$/, "el")
    .replace(/ois$/, "ol")
    .replace(/ns$/, "m")
    .replace(/(es|s)$/, "");
}

// Token significativo: >= 3 letras OU curto mas com numero (ex: "a4", "h2o",
// "aro13"). So tokens curtos puramente alfabeticos ("de", "da") sao ignorados.
// Sem isso, "papel A4" virava so "papel" e trazia papel higienico.
export function tokenSignificativo(w) {
  return w.length >= 3 || (w.length >= 2 && /\d/.test(w));
}

// Conjunto das raizes das palavras significativas de um texto normalizado.
function raizesDe(textoNorm) {
  return new Set(textoNorm.split(/[^a-z0-9]+/).filter(tokenSignificativo).map(raiz));
}

// Conectivos coordenativos que separam ITENS distintos numa frase: "A e B",
// "A ou B", "A, B", "A/B", "A & B". Subordinativos (de, da, do, com, para, em)
// NAO entram de proposito: mantem frases como "maquina de lavar" inteiras.
const CONECTIVOS = /\s+e\/ou\s+|\s+(?:e|ou)\s+|\s*[,/&]\s*/;

// Verdadeiro se `w` aparece como PALAVRA INTEIRA em objetoNorm (com fronteiras),
// nao como pedaco de outra palavra. Critico: "cimento" NAO pode casar dentro de
// "fornecimento"/"reconhecimento", senao quase todo edital (que tem
// "fornecimento") casaria. O conjunto de raizes ja e por palavra; isto cobre o
// caso em que a raiz difere mas a palavra aparece igual.
export function contemPalavra(w, objetoNorm) {
  let i = objetoNorm.indexOf(w);
  while (i !== -1) {
    const antes = i === 0 ? "" : objetoNorm[i - 1];
    const depois = objetoNorm[i + w.length] || "";
    if (!/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(depois)) return true;
    i = objetoNorm.indexOf(w, i + 1);
  }
  return false;
}

// Folga de proximidade pra termo multi-palavra NOS ITENS (descricao curta de cada
// item do edital). A janela exigida = nº de palavras do termo + esta folga. Ex:
// "material hospitalar" (2 palavras) + folga 2 = janela 4: as duas palavras
// precisam aparecer num trecho de no maximo 4 posicoes uma da outra dentro do
// MESMO item. Deixa passar "material hospitalar", "material medico hospitalar",
// "material de consumo hospitalar", mas BARRA "material de alta resistencia (...)
// atendimento pre-hospitalar" (bolsa de resgate: 15+ palavras entre elas, contextos
// sem relacao). So se aplica aos itens; no objeto (prosa longa) nao ha proximidade.
const JANELA_PROX = Number(process.env.LICITA_JANELA_PROX || 2);

// Menor distancia (em posicoes de palavra) de uma janela que contenha TODAS as
// palavras-alvo no texto, tolerando plural/genero (raiz). Infinity se faltar alguma.
// Varredura por ponteiros: textos sao curtos (objeto/item ~ dezenas de palavras).
export function menorJanela(palavras, textoNorm) {
  const tokens = textoNorm.split(/[^a-z0-9]+/).filter(Boolean);
  const alvos = palavras.map(raiz);
  const posicoes = alvos.map(() => []);
  for (let i = 0; i < tokens.length; i++) {
    const r = raiz(tokens[i]);
    for (let k = 0; k < alvos.length; k++) {
      if (r === alvos[k] || tokens[i] === alvos[k]) posicoes[k].push(i);
    }
  }
  if (posicoes.some((p) => p.length === 0)) return Infinity;
  const ponteiros = alvos.map(() => 0);
  let melhor = Infinity;
  for (;;) {
    let min = Infinity, max = -Infinity, kMin = 0;
    for (let k = 0; k < alvos.length; k++) {
      const p = posicoes[k][ponteiros[k]];
      if (p < min) { min = p; kMin = k; }
      if (p > max) max = p;
    }
    if (max - min < melhor) melhor = max - min;
    if (melhor === 0) break;
    ponteiros[kMin]++;
    if (ponteiros[kMin] >= posicoes[kMin].length) break;
  }
  return melhor;
}

// Verdadeiro se todas as `palavras` significativas aparecem PROXIMAS no texto.
export function palavrasProximas(palavras, textoNorm) {
  if (palavras.length <= 1) return true;
  return menorJanela(palavras, textoNorm) <= palavras.length + JANELA_PROX;
}

// Casa um sub-termo: TODAS as suas palavras (>= 3 letras) aparecem no objeto,
// tolerando plural e genero. Match por PALAVRA INTEIRA (nunca substring).
// OBS: no OBJETO nao exigimos proximidade de proposito. O objeto e prosa longa
// ("aquisicao de Orteses, Proteses e Materiais Especiais (...) para as Unidades
// Hospitalares") onde as palavras de uma compra legitima ficam a 8-10 palavras de
// distancia. A proximidade so vale nos ITENS (texto curto), onde palavras
// espalhadas indicam contextos sem relacao de verdade (ver editaisIdsPorItem).
// exigirProximidade: usado SO pros termos gerados pela IA (ver aplicarFiltro).
// Motivo (12/08/2026, caso real diagnosticado com a tela nova de termos): pra o
// ramo "PRONTUARIO ELETRONICO" a IA gerou o sinonimo "registro eletronico", que
// e legitimo em portugues, mas "registro" e a palavra de "REGISTRO DE PRECOS" —
// a modalidade de compra mais comum do Brasil. Resultado: "Registro de precos
// para aquisicao de eletronicos, eletrodomesticos" (TVs e geladeiras) casava e
// ia pro TOPO do painel de uma empresa de software medico. As duas palavras
// estavam la, mas a 6 palavras de distancia e sem nenhuma relacao. Exigir que
// elas apareçam PROXIMAS mata esse falso positivo sem perder o caso legitimo
// ("sistema de registro eletronico de saude", onde ficam coladas). Verificado
// nos dois textos reais antes de aplicar.
// SINONIMOS INTERCAMBIAVEIS em nivel de PALAVRA (diferente do sinonimos.mjs,
// que mapeia produto -> ramo). Caso real medido em 12/08/2026: uma empresa de
// software de saude cadastrou "SOFTWARE DE GESTAO EM SAUDE PUBLICA" e o painel
// dela PERDIA "Contratacao de SISTEMA de gestao em saude" e "Aquisicao de
// SISTEMA informatizado de gestao da saude" -- porque o edital usa "sistema"
// onde ela escreveu "software". Sao a mesma coisa no vocabulario de compra
// publica. Mercado real medido no acervo: 72 editais de "sistema de saude" e
// 42 de "software de gestao"; ela via 7. O risco de ruido e baixo porque o
// termo composto continua exigindo TODAS as outras palavras (gestao, saude).
// Lista curta e conservadora de proposito: so grupos onde a troca e de fato
// neutra em edital. Nao inclui "servico"/"produto" (genericos demais).
const SINONIMOS_PALAVRA = new Map();
function registrarGrupoSinonimos(palavras) {
  for (const p of palavras) SINONIMOS_PALAVRA.set(raiz(p), palavras.map(raiz));
}
registrarGrupoSinonimos(["software", "sistema", "aplicativo", "plataforma", "solucao"]);
registrarGrupoSinonimos(["veiculo", "automovel", "carro"]);
registrarGrupoSinonimos(["medicamento", "farmaco", "remedio"]);
registrarGrupoSinonimos(["computador", "microcomputador", "desktop"]);

// Uma palavra do termo esta presente no objeto: direto, por raiz, ou por um
// sinonimo do mesmo grupo.
function palavraPresente(w, raizesObjeto, objetoNorm) {
  if (raizesObjeto.has(raiz(w)) || contemPalavra(w, objetoNorm)) return true;
  const grupo = SINONIMOS_PALAVRA.get(raiz(w));
  if (!grupo) return false;
  return grupo.some((s) => raizesObjeto.has(s));
}

// TERMO LONGO (4+ palavras) aceita faltar UMA. Caso real medido: o cliente
// cadastrou "SOFTWARE DE GESTAO EM SAUDE PUBLICA" (4 palavras significativas) e
// perdia "Contratacao de sistema de gestao em saude para a Secretaria Municipal"
// -- que e exatamente o cliente dele -- so porque o edital nao repete a palavra
// "publica". Quanto mais especifico o cliente escreve, menos ele recebia, o que
// e o oposto do esperado. Exigir n-1 recupera esses casos e continua seguro: o
// ruido ("sistema de esgoto", "sistema de ar condicionado") bate 1 de 4 e nao
// passa. So vale de 4 palavras pra cima: em termo de 2-3 palavras, deixar cair
// uma ja o transformaria em busca generica.
const MIN_PALAVRAS_FLEX = 4;

function subTermoCasa(sub, raizesObjeto, objetoNorm, exigirProximidade = false) {
  const palavras = sub.split(/[^a-z0-9]+/).filter(tokenSignificativo);
  if (!palavras.length) return contemPalavra(sub, objetoNorm);
  const presentes = palavras.filter((w) => palavraPresente(w, raizesObjeto, objetoNorm));
  const exigidas = palavras.length >= MIN_PALAVRAS_FLEX ? palavras.length - 1 : palavras.length;
  if (presentes.length < exigidas) return false;
  // Proximidade (so termos da IA) se aplica as palavras que realmente casaram.
  if (exigirProximidade && presentes.length > 1) return palavrasProximas(presentes, objetoNorm);
  return true;
}

// Um termo casa tolerando plural e genero. Regras:
// - Termo entre "aspas" = frase EXATA: precisa aparecer literalmente, na ordem.
// - Frase com conectivos ("materiais ambulatoriais E insumos hospitalares") e
//   quebrada em sub-termos e casa se QUALQUER um casar. Assim o cliente que
//   cola o nome inteiro de uma categoria ainda recebe editais de cada parte,
//   em vez de exigir a frase completa (que quase nunca aparece num edital).
export function termoCasa(termo, raizesObjeto, objetoNorm, exigirProximidade = false) {
  const t = (termo ?? "").trim();
  if (/^".*"$/.test(t)) {
    const frase = normalizar(t.slice(1, -1)).replace(/\s+/g, " ").trim();
    return frase ? objetoNorm.includes(frase) : true;
  }
  const subTermos = normalizar(t).split(CONECTIVOS).map((s) => s.trim()).filter(Boolean);
  if (!subTermos.length) return objetoNorm.includes(normalizar(t));
  return subTermos.some((sub) => subTermoCasa(sub, raizesObjeto, objetoNorm, exigirProximidade));
}

// BOILERPLATE do objeto de licitacao: o preambulo burocratico que abre quase
// todo edital ("Formalizacao de registro de precos para futura e eventual
// aquisicao de..."), mais os nomes de portal que vem grudados no comeco. NAO e
// pra filtrar match (essas palavras podem existir legitimamente no meio); e pra
// medir ONDE o assunto de verdade comeca. Ver posicaoNoConteudo abaixo.
export const PALAVRAS_BOILERPLATE = new Set([
  "formalizacao", "registro", "registros", "preco", "precos", "pregao",
  "licitacao", "licitatorio", "edital", "ata", "certame", "aquisicao",
  "contratacao", "fornecimento", "prestacao", "srp", "eletronico", "eletronica",
  "presencial", "lote", "lotes", "item", "itens", "objeto", "proposta",
  "habilitacao", "futura", "futuras", "futuro", "eventual", "eventuais",
  "empresa", "empresas", "especializada", "especializado", "especializados",
  "para", "portal", "compras", "publicas", "licitanet", "visando", "visanto",
  "destinados", "destinadas", "destinada", "destinado", "atender", "atendimento",
  "necessidades", "secretaria", "secretarias", "prefeitura", "municipal",
  "municipio", "fundo", "presente", "referencia", "termo", "processo",
  "modalidade", "menor", "maior", "percentual", "desconto", "selecao",
]);

// Palavras de ACAO/generico que aparecem em termos de ramo ("manutencao
// eletrica", "instalacao eletrica", "servicos eletricos") mas NAO identificam o
// ramo sozinhas: o que identifica e "eletrica". Nao podem ancorar a posicao,
// senao um edital de "AQUISICAO DE VEICULOS ... PARA APOIO AS ATIVIDADES DE
// MANUTENCAO DA REDE ELETRICA" e pontuado como se o assunto comecasse em
// "manutencao" (palavra 4) quando na verdade o ramo so aparece em "eletrica"
// (palavra 6) e o que esta sendo comprado e VEICULO. Caso real medido.
export const PALAVRAS_ACAO = new Set([
  "manutencao", "instalacao", "instalacoes", "reforma", "reparo", "reparos",
  "conserto", "consertos", "servico", "servicos", "produto", "produtos",
  "material", "materiais", "equipamento", "equipamentos", "sistema", "sistemas",
  "insumo", "insumos", "peca", "pecas", "kit", "kits", "suprimento",
  "suprimentos", "execucao", "implantacao", "montagem", "operacao",
]);

// Posicao (em palavras de CONTEUDO, ignorando o boilerplate) onde o assunto do
// cliente aparece no objeto. Quanto MENOR, mais o termo e o nucleo do que esta
// sendo comprado; quanto maior, mais ele e periferia (finalidade, sub-item de
// uma obra, acessorio). Descoberto medindo 4 casos reais do painel de um
// cliente de material eletrico (12/08/2026):
//   "AQUISICAO DE MATERIAIS ELETRICOS, incluindo postes, fios, cabos"  -> pos 1  (e isso que ele vende)
//   "Reforma das INSTALACOES ELETRICAS do CEI"                          -> pos 3  (servico do ramo dele)
//   "REFORMA DA ESCOLA (cobertura, INSTALACOES ELETRICAS, SPDA, pintura)" -> pos 6 (obra, eletrica e sub-item)
//   "AQUISICAO DE VEICULOS ... PARA APOIO A MANUTENCAO DA REDE ELETRICA" -> pos 7 (compra veiculo, nao eletrica)
// A posicao BRUTA nao separava (9, 8, 6, 9) porque o 2o caso abre com 7
// palavras de burocracia. Tirando o boilerplate, a ordem sai exata.
export function posicaoNoConteudo(objetoNorm, prefixosTermo) {
  // Tira boilerplate E palavras de acao: o que sobra e a lista do que esta
  // realmente sendo comprado. Se a 1a coisa dessa lista ja e o ramo do cliente,
  // o edital E sobre o ramo dele ("materiais ELETRICOS, postes, fios, cabos" ->
  // pos 0). Se o ramo so aparece la no fim, e finalidade ou acessorio
  // ("VEICULOS, apoio, atividades, rede, eletrica" -> pos 4).
  const conteudo = objetoNorm.split(/[^a-z0-9]+/)
    .filter(tokenSignificativo)
    .filter((w) => !PALAVRAS_BOILERPLATE.has(w) && !PALAVRAS_ACAO.has(w));
  for (let i = 0; i < conteudo.length; i++) {
    const w = conteudo[i];
    const r = raiz(w);
    if (prefixosTermo.some((p) => r === p || w.startsWith(p))) return i;
  }
  return Infinity;
}

// Palavras genericas de licitacao que NAO identificam um ramo sozinhas. Num
// termo de duas palavras, sao a parte "ruido"; a outra e a que importa.
const GENERICOS = new Set([
  "material", "materiais", "produto", "produtos", "servico", "servicos",
  "equipamento", "equipamentos", "insumo", "insumos", "aquisicao", "fornecimento",
  "contratacao", "prestacao", "locacao", "item", "itens", "peca", "pecas",
  "kit", "kits", "sistema", "sistemas", "artigo", "artigos", "suprimento",
  "suprimentos", "consumo", "genero", "generos",
  "de", "da", "do", "das", "dos", "para", "com", "por", "sob",
]);

// Para um termo de cadastro com mais de uma palavra onde SOBRA exatamente uma
// palavra distintiva (depois de tirar as genericas), devolve essa palavra. Ex:
// "material hospitalar" -> "hospitalar"; "equipamento de informatica" ->
// "informatica". Serve pra AMPLIAR a abertura do painel pro ramo inteiro, sem
// exigir as duas palavras juntas. Termos ja especificos (1 palavra, ou 2+
// distintivas como "uniforme escolar") nao sao ampliados (evita ruido).
export function palavraDistintiva(termo) {
  const t = (termo ?? "").trim();
  if (/^".*"$/.test(t)) return null; // frase exata: respeita
  const palavras = normalizar(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (palavras.length <= 1) return null;
  const distintas = palavras.filter((w) => !GENERICOS.has(w));
  return distintas.length === 1 && distintas[0].length >= 4 ? distintas[0] : null;
}

// Lista de palavras distintivas derivadas dos termos crus (dedup).
export function termosAmplos(termos = []) {
  const out = new Set();
  for (const t of termos) { const d = palavraDistintiva(t); if (d) out.add(d); }
  return [...out];
}

// Aplica todos os criterios de um perfil sobre a lista de editais.
// filtro = { termos, termosExcluir, valorMin, valorMax }
export function aplicarFiltro(editais, filtro = {}) {
  const { termos = [], termosIA = [], termosExcluir = [], valorMin = null, valorMax = null } = filtro;
  // Termos do cliente + termos relacionados gerados pela ContrataX.IA (expansao
  // semantica do ramo). A busca casa se QUALQUER um deles casar. Os de exclusao
  // continuam valendo sobre o conjunto todo.
  //
  // PROXIMIDADE so nos termos da IA (12/08/2026): os termos que o CLIENTE
  // digitou sao intencao explicita dele e seguem soltos (objeto e prosa longa,
  // as palavras de uma compra legitima ficam distantes). Ja os da IA sao
  // adivinhacao do sistema e podem colidir com jargao de licitacao — caso real:
  // "registro eletronico" (sinonimo de prontuario) casando com "REGISTRO DE
  // PRECOS ... eletronicos". Exigir proximidade neles corta o falso positivo e
  // mantem o match legitimo. Ver subTermoCasa.
  const temTermo = (t, raizes, objeto, daIA) => termoCasa(t, raizes, objeto, daIA);

  return editais.filter((e) => {
    const objeto = normalizar(e.objeto);
    const raizes = raizesDe(objeto);

    if (termos.length || termosIA.length) {
      const casouProprio = termos.some((t) => temTermo(t, raizes, objeto, false));
      const casouIA = !casouProprio && termosIA.some((t) => temTermo(t, raizes, objeto, true));
      if (!casouProprio && !casouIA) return false;
    }
    if (termosExcluir.length && termosExcluir.some((t) => termoCasa(t, raizes, objeto))) return false;

    const valor = e.valorEstimado;
    if (valorMin != null && (valor == null || valor < valorMin)) return false;
    if (valorMax != null && valor != null && valor > valorMax) return false;

    return true;
  });
}
