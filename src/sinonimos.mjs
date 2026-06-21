// Expansao de termo de PRODUTO para o RAMO correspondente.
//
// Problema: o cliente (ou visitante da LP) digita um produto especifico
// ("atadura", "compressa", "cateter"), mas o EDITAL descreve o objeto em alto
// nivel ("aquisicao de material hospitalar"). O produto especifico mora nos
// ITENS do edital, nao no objeto que indexamos. Resultado: busca literal por
// "atadura" da quase zero, mesmo havendo dezenas de editais de material
// hospitalar abertos. Na LP isso mata cadastro.
//
// Solucao: um dicionario curado mapeia palavras-gatilho (produtos) para os
// termos AMPLOS do ramo. Quando o cliente busca "atadura", a busca tambem
// considera "hospitalar", "enfermagem", "ambulatorial"... e ele ve os editais
// do ramo dele. Instantaneo, sem custo de IA, e usa a MESMA tolerancia de
// plural/genero (raiz) do resto do site -> consistencia total.

import { normalizar, raiz } from "./filtro.mjs";

// Cada grupo: gatilhos (produtos especificos) -> amplos (termos do ramo que
// realmente aparecem no objeto dos editais). Mantido curado e extensivel.
//
// PRECISAO: os `amplos` miram a CATEGORIA DO PRODUTO ("material hospitalar"),
// nunca o DOMINIO/orgao ("saude", "medico"). Palavras de dominio aparecem no
// nome do orgao ("Secretaria de Saude") e em editais de servico/obra sem
// relacao com o produto -> trariam lixo (ex: buscar "compressa" trazia seguro
// e engenharia da Secretaria de Saude). Por isso os amplos sao frases de
// produto ("material de X", "equipamento de X") ou palavras inerentemente de
// produto ("hospitalar", "combustivel", "pneu").
const GRUPOS = [
  {
    amplos: ["hospitalar", "enfermagem", "ambulatorial", "material hospitalar", "materiais hospitalares", "insumo hospitalar", "insumos hospitalares", "produto hospitalar", "produtos para saude", "material de enfermagem", "material ambulatorial", "material laboratorial", "medico-hospitalar", "material medico"],
    gatilhos: [
      "atadura", "gaze", "compressa", "esparadrapo", "cateter", "seringa", "agulha",
      "escalpe", "sonda", "curativo", "algodao", "soro", "soro fisiologico", "fralda",
      "fralda geriatrica", "mascara cirurgica", "avental", "touca", "abaixador",
      "lanceta", "micropore", "equipo", "dreno", "bisturi", "sutura", "fio cirurgico",
      "swab", "termometro", "oximetro", "estetoscopio", "tensiometro", "esfigmomanometro",
      "nebulizador", "glicosimetro", "fita glicemica", "cadeira de rodas", "muleta",
      "andador", "colar cervical", "tala", "ortese", "protese", "insulina", "medicamento",
      "remedio", "antibiotico", "dipirona", "paracetamol", "reagente", "tubo de coleta",
      "especulo", "preservativo", "luva de procedimento", "saco coletor", "scalp",
    ],
  },
  {
    amplos: ["material de construcao", "materiais de construcao", "material hidraulico", "material eletrico", "material predial", "material de acabamento"],
    gatilhos: [
      "cimento", "areia", "brita", "tijolo", "bloco de concreto", "vergalhao", "telha",
      "viga", "concreto", "argamassa", "cal", "gesso", "drywall", "massa corrida",
      "cano", "tubo pvc", "conexao hidraulica", "registro hidraulico", "fio eletrico",
      "cabo eletrico", "disjuntor", "tomada", "interruptor", "luminaria", "porta",
      "janela", "esquadria", "piso", "ceramica", "porcelanato", "azulejo",
      "manta asfaltica", "prego", "parafuso", "dobradica", "fechadura", "eletroduto",
    ],
  },
  {
    amplos: ["alimenticio", "genero alimenticio", "generos alimenticios", "alimentacao escolar", "merenda escolar", "cesta basica", "hortifruti"],
    gatilhos: [
      "arroz", "feijao", "oleo de soja", "acucar", "farinha", "macarrao", "leite",
      "carne", "frango", "peixe", "ovo", "fruta", "verdura", "legume", "pao",
      "biscoito", "cafe", "achocolatado", "polpa de fruta", "margarina", "manteiga",
      "queijo", "presunto", "iogurte", "cereal", "fuba", "tempero", "cesta basica",
      "agua mineral",
    ],
  },
  {
    amplos: ["material de limpeza", "materiais de limpeza", "produto de limpeza", "produtos de limpeza", "material de higiene", "material de higienizacao"],
    gatilhos: [
      "detergente", "sabao", "agua sanitaria", "alvejante", "desinfetante", "vassoura",
      "rodo", "pano de chao", "balde", "esponja", "papel higienico", "papel toalha",
      "sabonete", "alcool gel", "alcool 70", "saco de lixo", "cera liquida",
      "limpa vidro", "multiuso", "flanela", "lustra moveis", "desengordurante",
    ],
  },
  {
    amplos: ["papelaria", "material de escritorio", "material de expediente", "material de papelaria"],
    gatilhos: [
      "papel a4", "papel sulfite", "caneta", "lapis", "borracha", "grampeador",
      "grampo", "clips", "pasta", "envelope", "caderno", "agenda", "cartolina",
      "toner", "cartucho", "tinta de impressora", "fita adesiva", "cola", "tesoura",
      "regua", "marcador", "pincel atomico", "post it", "perfurador", "quadro branco",
    ],
  },
  {
    amplos: ["equipamento de informatica", "equipamentos de informatica", "material de informatica", "suprimento de informatica"],
    gatilhos: [
      "notebook", "computador", "desktop", "monitor", "teclado", "mouse", "impressora",
      "scanner", "roteador", "switch", "nobreak", "estabilizador", "ssd", "pendrive",
      "memoria ram", "cabo de rede", "webcam", "headset", "projetor", "servidor",
      "licenca de software", "antivirus", "microcomputador", "hd externo",
    ],
  },
  {
    amplos: ["mobiliario", "mobiliario escolar", "mobiliario de escritorio"],
    gatilhos: [
      "cadeira", "mesa", "armario", "estante", "gaveteiro", "longarina", "poltrona",
      "sofa", "arquivo de aco", "prateleira", "balcao", "escrivaninha", "cama",
      "colchao", "beliche", "carteira escolar",
    ],
  },
  {
    amplos: ["peca automotiva", "pecas automotivas", "material automotivo", "autopecas", "pneu", "pneus"],
    gatilhos: [
      "pneu", "oleo lubrificante", "filtro de oleo", "filtro de ar", "pastilha de freio",
      "bateria automotiva", "amortecedor", "correia", "vela de ignicao",
      "lampada automotiva", "para-choque", "peca automotiva", "lona de freio",
    ],
  },
  {
    amplos: ["combustivel", "oleo diesel", "gasolina", "etanol", "arla"],
    gatilhos: ["gasolina", "diesel", "etanol", "alcool combustivel", "arla", "oleo diesel", "gas glp"],
  },
  {
    amplos: ["epi", "equipamento de protecao individual", "material de seguranca", "uniforme", "fardamento", "vestuario"],
    gatilhos: [
      "capacete", "bota", "luva de seguranca", "oculos de protecao", "protetor auricular",
      "cinto de seguranca", "jaleco", "colete", "fardamento", "camiseta", "calca uniforme",
    ],
  },
];

// Pre-computa, para cada grupo, as raizes dos gatilhos de UMA palavra e a lista
// de gatilhos de varias palavras (casados por frase).
const GRUPOS_PREP = GRUPOS.map((g) => {
  const raizesUni = new Set();
  const frases = [];
  for (const gat of g.gatilhos) {
    const n = normalizar(gat);
    if (n.includes(" ")) frases.push(n);
    else raizesUni.add(raiz(n));
  }
  return { amplos: g.amplos, raizesUni, frases };
});

// Dada uma busca, devolve os termos AMPLOS do(s) ramo(s) cujo gatilho casou.
// Casa gatilho de 1 palavra por raiz (tolera plural/genero); gatilho de varias
// palavras por frase contida no termo.
export function expandirRamo(termo) {
  const n = normalizar(termo ?? "").trim();
  if (!n || /^".*"$/.test((termo ?? "").trim())) return []; // frase exata: respeita
  const raizes = new Set(n.split(/[^a-z0-9]+/).filter(Boolean).map(raiz));
  const out = new Set();
  for (const g of GRUPOS_PREP) {
    const casou =
      g.frases.some((f) => n.includes(f)) ||
      [...g.raizesUni].some((r) => raizes.has(r));
    if (casou) for (const a of g.amplos) out.add(a);
  }
  // Nao devolve um amplo que o proprio termo ja contem (evita redundancia).
  for (const a of [...out]) if (n.includes(normalizar(a))) out.delete(a);
  return [...out];
}

// Expande uma lista de termos de busca: junta os amplos de ramo de cada um.
export function expandirTermos(termos = []) {
  const out = new Set();
  for (const t of termos) for (const a of expandirRamo(t)) out.add(a);
  return [...out];
}
