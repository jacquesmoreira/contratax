// Preco de referencia: para um edital aberto, busca contratos JA FECHADOS de
// objeto similar no historico e compara com o valor estimado.
//
// Diferenca para precoVencedores (preco.mjs):
//   - precoVencedores: foco em "quem ganha no ramo do cliente" (ranking)
//   - precoReferencia: foco em "esse valor estimado esta caro ou justo?"
//     (calibrado pelo proprio objeto do edital, nao pelo ramo do cliente)

import { consultarContratos } from "./db.mjs";
import { aplicarFiltro, normalizar } from "./filtro.mjs";

// Stopwords em portugues + termos comuns em editais (sem valor distintivo).
const STOP = new Set([
  // gramatica
  "de","da","do","das","dos","para","com","sem","por","em","na","no","nas","nos",
  "a","o","as","os","e","ou","um","uma","uns","umas","ao","aos","ate",
  "este","esta","essa","esse","esses","essas","aquele","aquela",
  "que","qual","quais","cujo","cuja","cujos","cujas","sob",
  "sera","seja","sao","ser","seu","sua","seus","suas",
  // termos genericos de edital
  "lei","leis","art","artigo","ref","referente","referencia","tipo",
  "objeto","objetos","contratacao","contratacoes","aquisicao","prestacao",
  "servicos","servico","fornecimento","sistema","sistemas","sistemas",
  "registro","precos","preco","demanda","futura","eventual","eventuais",
  "presente","mediante","atender","necessidades","necessidade",
  "secretaria","municipal","estadual","federal","prefeitura","municipio",
  "cidade","estado","uniao","governo","administracao","publica","publico",
  "conforme","exclusivo","exclusiva","item","itens","lote","lotes",
  "edital","pregao","dispensa","concorrencia","leilao","credenciamento",
  "global","preferencial","preferencialmente","portal","compras","comprasnet",
  "diversos","diversas","varios","varias","outros","outras","demais",
  "empresa","empresas","especializada","especializado","especializadas","especializados",
  "destinada","destinado","destinados","destinadas","destinacao",
  "veiculos","veiculo","atender","atendimento","interesse","relativo","relativos",
  "futuras","futuro","futuros","disponivel","disponiveis",
  // anos e meses (lixo)
  "ano","anos","mes","meses","periodo","periodos","exercicio","duracao",
  // palavras vazias longas que aparecem demais
  "tendo","sendo","sera","sera","conforme","conforme","ainda","apenas","tambem",
]);

// Extrai palavras-chave significativas do objeto do edital.
// Exemplo: "Aquisicao de materiais hospitalares para o municipio de Joinville"
//   -> ["materiais", "hospitalares", "joinville"] -> 2-3 termos mais distintivos
export function termosDoObjeto(objeto, max = 5) {
  if (!objeto) return [];
  const tokens = normalizar(objeto)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t));
  // Frequencia + tamanho como heuristica (palavras mais longas tendem a ser mais
  // distintivas). Mantem a ordem de aparicao para palavras com mesmo "peso".
  const ordem = new Map();
  tokens.forEach((t, i) => { if (!ordem.has(t)) ordem.set(t, i); });
  return [...new Set(tokens)]
    .sort((a, b) => b.length - a.length || ordem.get(a) - ordem.get(b))
    .slice(0, max);
}

function estatisticas(valores) {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const p = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];
  return {
    n: v.length,
    min: v[0],
    max: v[v.length - 1],
    p25: p(0.25),
    mediana: p(0.5),
    p75: p(0.75),
    media: Math.round(v.reduce((s, x) => s + x, 0) / v.length),
  };
}

// Cadeia: UF -> nacional. Se UF tem poucos contratos similares, sobe pra nacional.
const MIN_AMOSTRA = 5;

// Decide os termos para buscar contratos similares:
//   - Se temos termos do perfil do cliente (ramo ja calibrado), usa eles.
//   - Senao, extrai do objeto do edital (heuristica).
// Devolve array de termos para passar a aplicarFiltro (cada um vira um OR).
function termosParaCasar(edital, termosPerfil) {
  if (termosPerfil?.length) {
    // Cliente tem perfil: usa as palavras-chave do ramo dele. Sao termos
    // ja escolhidos manualmente, mais precisos do que extracao automatica.
    return termosPerfil;
  }
  return termosDoObjeto(edital?.objeto, 3);
}

// Para um edital, devolve a "leitura" de preco:
//   {
//     temReferencia: bool,
//     escopo: "uf"|"nacional",
//     uf, termos: [...],            // termos usados pra casar
//     stats: {n, min, mediana, max, p25, p75},
//     valorEstimado, comparacao: {  // so se tiver valor estimado
//       diferencaPercentual,        // +X% acima da mediana, -X% abaixo
//       veredito,                   // "abaixo" | "alinhado" | "acima"
//       texto                       // string pronta pra UI
//     }
//   }
export function precoReferencia(edital, { meses = 18, termosPerfil = [] } = {}) {
  const termos = termosParaCasar(edital, termosPerfil);
  if (termos.length === 0) return { temReferencia: false, motivo: "sem-termos" };

  const uf = edital?.uf || null;
  // Tenta UF primeiro; se nao tiver amostra suficiente, vai pra nacional.
  let casaram = [];
  let escopo = "nacional";
  if (uf) {
    const candUF = consultarContratos({ uf, mesesAtras: meses });
    const naUF = aplicarFiltro(candUF, { termos }).filter((c) => c.valor > 0);
    if (naUF.length >= MIN_AMOSTRA) { casaram = naUF; escopo = "uf"; }
  }
  if (casaram.length === 0) {
    const cand = consultarContratos({ mesesAtras: meses });
    casaram = aplicarFiltro(cand, { termos }).filter((c) => c.valor > 0);
    escopo = "nacional";
  }

  if (casaram.length < MIN_AMOSTRA) {
    return { temReferencia: false, motivo: "amostra-insuficiente", n: casaram.length, termos };
  }

  // Remove outliers extremos (5% maiores e menores) pra estatisticas robustas.
  // Os valores no PNCP misturam preco por item com contrato inteiro, entao a
  // faixa eh ampla mesmo apos limpeza.
  const sorted = casaram.map((c) => c.valor).sort((a, b) => a - b);
  const corte = Math.floor(sorted.length * 0.05);
  const limpos = sorted.slice(corte, sorted.length - corte);
  const stats = estatisticas(limpos);

  const valorEstimado = Number(edital?.valorEstimado) || 0;
  // Classifica o tamanho do edital pra dar contexto util ao cliente.
  // Os contratos no PNCP misturam preco por item (R$X/unidade) com contrato
  // inteiro (R$Y total), entao a faixa varia muito — nao da pra julgar "caro
  // ou barato" matematicamente. O cliente julga; nos damos o contexto.
  let perfil = null;
  if (valorEstimado > 0 && stats) {
    if (valorEstimado >= stats.p75 * 5) {
      perfil = {
        tipo: "grande",
        texto: "Edital de grande porte, provavelmente Registro de Preços ou contratação ampla. A faixa abaixo reflete contratos individuais semelhantes.",
      };
    } else if (valorEstimado >= stats.p25 && valorEstimado <= stats.p75 * 3) {
      perfil = {
        tipo: "tipico",
        texto: "Valor estimado dentro da faixa típica de contratos individuais do segmento.",
      };
    } else if (valorEstimado < stats.p25) {
      perfil = {
        tipo: "pequeno",
        texto: "Edital de pequeno porte, abaixo da faixa típica de contratos do segmento.",
      };
    }
  }

  return {
    temReferencia: true,
    escopo,                       // "uf" | "nacional"
    uf: escopo === "uf" ? uf : null,
    meses,
    termos,                       // termos usados na busca (pra mostrar ao cliente)
    stats,                        // {n, min, p25, mediana, p75, max, media}
    valorEstimado,
    perfil,                       // {tipo, texto} | null  (sinalizacao honesta, sem julgamento)
  };
}
