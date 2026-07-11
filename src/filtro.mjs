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
function subTermoCasa(sub, raizesObjeto, objetoNorm) {
  const palavras = sub.split(/[^a-z0-9]+/).filter(tokenSignificativo);
  if (!palavras.length) return contemPalavra(sub, objetoNorm);
  return palavras.every((w) => raizesObjeto.has(raiz(w)) || contemPalavra(w, objetoNorm));
}

// Um termo casa tolerando plural e genero. Regras:
// - Termo entre "aspas" = frase EXATA: precisa aparecer literalmente, na ordem.
// - Frase com conectivos ("materiais ambulatoriais E insumos hospitalares") e
//   quebrada em sub-termos e casa se QUALQUER um casar. Assim o cliente que
//   cola o nome inteiro de uma categoria ainda recebe editais de cada parte,
//   em vez de exigir a frase completa (que quase nunca aparece num edital).
export function termoCasa(termo, raizesObjeto, objetoNorm) {
  const t = (termo ?? "").trim();
  if (/^".*"$/.test(t)) {
    const frase = normalizar(t.slice(1, -1)).replace(/\s+/g, " ").trim();
    return frase ? objetoNorm.includes(frase) : true;
  }
  const subTermos = normalizar(t).split(CONECTIVOS).map((s) => s.trim()).filter(Boolean);
  if (!subTermos.length) return objetoNorm.includes(normalizar(t));
  return subTermos.some((sub) => subTermoCasa(sub, raizesObjeto, objetoNorm));
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
  const termosBusca = [...termos, ...termosIA];

  return editais.filter((e) => {
    const objeto = normalizar(e.objeto);
    const raizes = raizesDe(objeto);

    if (termosBusca.length && !termosBusca.some((t) => termoCasa(t, raizes, objeto))) return false;
    if (termosExcluir.length && termosExcluir.some((t) => termoCasa(t, raizes, objeto))) return false;

    const valor = e.valorEstimado;
    if (valorMin != null && (valor == null || valor < valorMin)) return false;
    if (valorMax != null && valor != null && valor > valorMax) return false;

    return true;
  });
}
