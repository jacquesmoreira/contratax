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

// Conjunto das raizes das palavras (>= 3 letras) de um texto normalizado.
function raizesDe(textoNorm) {
  return new Set(textoNorm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(raiz));
}

// Um termo casa se TODAS as suas palavras (>= 3 letras) aparecem no objeto,
// tolerando plural e genero. Termo so com palavra curta cai para substring.
// Termo entre "aspas" = frase EXATA: precisa aparecer literalmente, na ordem.
export function termoCasa(termo, raizesObjeto, objetoNorm) {
  const t = (termo ?? "").trim();
  if (/^".*"$/.test(t)) {
    const frase = normalizar(t.slice(1, -1)).replace(/\s+/g, " ").trim();
    return frase ? objetoNorm.includes(frase) : true;
  }
  const palavras = normalizar(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (!palavras.length) return objetoNorm.includes(normalizar(t));
  return palavras.every((w) => raizesObjeto.has(raiz(w)) || objetoNorm.includes(w));
}

// Aplica todos os criterios de um perfil sobre a lista de editais.
// filtro = { termos, termosExcluir, valorMin, valorMax }
export function aplicarFiltro(editais, filtro = {}) {
  const { termos = [], termosExcluir = [], valorMin = null, valorMax = null } = filtro;

  return editais.filter((e) => {
    const objeto = normalizar(e.objeto);
    const raizes = raizesDe(objeto);

    if (termos.length && !termos.some((t) => termoCasa(t, raizes, objeto))) return false;
    if (termosExcluir.length && termosExcluir.some((t) => termoCasa(t, raizes, objeto))) return false;

    const valor = e.valorEstimado;
    if (valorMin != null && (valor == null || valor < valorMin)) return false;
    if (valorMax != null && valor != null && valor > valorMax) return false;

    return true;
  });
}
