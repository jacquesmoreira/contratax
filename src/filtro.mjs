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
function raiz(p) {
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
function tokenSignificativo(w) {
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

// Casa um sub-termo: TODAS as suas palavras (>= 3 letras) aparecem no objeto,
// tolerando plural e genero. So palavra curta cai para substring.
function subTermoCasa(sub, raizesObjeto, objetoNorm) {
  const palavras = sub.split(/[^a-z0-9]+/).filter(tokenSignificativo);
  if (!palavras.length) return objetoNorm.includes(sub);
  return palavras.every((w) => raizesObjeto.has(raiz(w)) || objetoNorm.includes(w));
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
