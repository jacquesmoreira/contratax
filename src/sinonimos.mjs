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
    // So FRASES de material de consumo (viram busca exata). Sem "hospitalar"/
    // "ambulatorial" soltos: pegavam servico ("atendimento ambulatorial") e
    // equipamento ("equipamentos hospitalares", "camas hospitalares").
    amplos: ["material hospitalar", "materiais hospitalares", "material medico-hospitalar", "materiais medico-hospitalares", "material medico hospitalar", "insumo hospitalar", "insumos hospitalares", "produto hospitalar", "produtos hospitalares", "produtos para saude", "produto para saude", "material de enfermagem", "materiais de enfermagem", "material penso", "material ambulatorial", "material odontologico", "material laboratorial", "material farmacologico"],
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
    // Quem busca um PRODUTO de construcao quer COMPRAR o produto, nao a obra.
    // Excluimos editais de obra/servico (que so citam o material de passagem,
    // junto com mao de obra). Frases contiguas que NAO aparecem em compra pura.
    excluir: [
      "mao de obra", "execucao de obra", "execucao de obras", "empreitada",
      "obra de engenharia", "obras de engenharia", "servico de engenharia",
      "servicos de engenharia", "pavimentacao", "reforma e ampliacao",
      "ampliacao e reforma", "construcao civil",
    ],
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
  return { amplos: g.amplos, excluir: g.excluir || [], raizesUni, frases };
});

// Frase de 2+ palavras vira busca EXATA (entre aspas = contigua); palavra unica
// continua flexivel. Evita match espalhado ("material hospitalar" casando em
// "equipamentos medico-hospitalares E MATERIAIS permanentes").
const aspasSeFrase = (a) => (a.includes(" ") ? `"${a}"` : a);

// Grupos cujo gatilho casa com o termo. Gatilho de 1 palavra casa por raiz
// (tolera plural/genero); gatilho de varias palavras casa por frase contida.
function gruposDoTermo(termo) {
  const n = normalizar(termo ?? "").trim();
  if (!n || /^".*"$/.test((termo ?? "").trim())) return { n, grupos: [] }; // frase exata: respeita
  const raizes = new Set(n.split(/[^a-z0-9]+/).filter(Boolean).map(raiz));
  const grupos = GRUPOS_PREP.filter((g) =>
    g.frases.some((f) => n.includes(f)) || [...g.raizesUni].some((r) => raizes.has(r)));
  return { n, grupos };
}

// Termos AMPLOS do(s) ramo(s) do produto buscado (pra ABRIR a busca pro ramo).
export function expandirRamo(termo) {
  const { n, grupos } = gruposDoTermo(termo);
  const out = new Set();
  for (const g of grupos) for (const a of g.amplos) out.add(a);
  for (const a of [...out]) if (n.includes(normalizar(a))) out.delete(a); // ja contido no termo
  return [...out].map(aspasSeFrase);
}

// Raizes de uma frase, em ordem, pra comparar "material hospitalar" com
// "materiais hospitalares" (tolera plural/genero). Ex: "material hospitalar".
const raizesFrase = (s) => normalizar(s).split(/[^a-z0-9]+/).filter(Boolean).map(raiz).join(" ");

// Grupos cujo AMPLO casa com o termo do cliente: ele cadastrou a FRASE DE
// CATEGORIA do ramo ("material hospitalar", "material de limpeza") em vez de um
// produto especifico. Casa por raiz (plural/genero) pra "materiais hospitalares"
// achar o grupo de "material hospitalar". So casa frase >= 2 palavras (palavra
// generica solta, tipo "material", casaria varios grupos = ruido).
// Casamento: exato (rn===ra), OU o amplo contem o termo do cliente (ra.includes),
// OU o termo do cliente contem um amplo de 2+ PALAVRAS (rn.includes com ra >= 2
// palavras). A restricao de 2+ palavras no ultimo caso evita falso positivo:
// "uniforme escolar" contem "uniforme" (amplo solto do grupo EPI) e cairia no
// ramo errado. Exigir que o amplo contido seja frase (>= 2 palavras) corta isso.
function gruposPorAmplo(termo) {
  const n = normalizar(termo ?? "").trim();
  if (!n || n.split(/\s+/).length < 2 || /^".*"$/.test((termo ?? "").trim())) return { n, grupos: [] };
  const rn = raizesFrase(n);
  const grupos = GRUPOS_PREP.filter((g) =>
    g.amplos.some((a) => {
      const ra = raizesFrase(a);
      return rn === ra || ra.includes(rn) || (ra.split(" ").length >= 2 && rn.includes(ra));
    }));
  return { n, grupos };
}

// Expansao CURADA pro FEED do painel (recall sem lixo). Quando o cliente cadastrou
// uma FRASE DE CATEGORIA do ramo ("material hospitalar", "material de limpeza"),
// expande pras frases-IRMAS do mesmo grupo ("insumo hospitalar", "material de
// enfermagem"...), todas entre aspas (frase exata/contigua). Da recall do ramo SEM
// o "hospitalar" solto que o antigo termosAmplos gerava (e que trazia servico/
// roupa/equipamento hospitalar). ESCOPO: so o caminho do AMPLO (frase de
// categoria). NAO expande PRODUTO->ramo aqui de proposito: fazer isso no feed
// levaria "atadura" de ~5 pra ~125 editais no painel de todo cliente de produto
// (mudanca grande de comportamento, fora do que foi reportado). Produto no feed
// segue casando literal (objeto + itens), como antes.
export function expandirRamoCurado(termos = []) {
  const out = new Set();
  for (const t of termos) {
    const { grupos } = gruposPorAmplo(t);
    const rn = raizesFrase(t);
    for (const g of grupos) for (const a of g.amplos) {
      if (raizesFrase(a) !== rn) out.add(a); // nao re-adiciona o proprio termo do cliente
    }
  }
  return [...out].map(aspasSeFrase);
}

// Termos a EXCLUIR quando o produto buscado tem ramo com sinais de obra/servico.
// Ex: quem busca "cimento" quer COMPRAR cimento, nao ver licitacoes de OBRA que
// so citam cimento junto com mao de obra. So construcao define `excluir` hoje.
export function excluirRamo(termo) {
  const { grupos } = gruposDoTermo(termo);
  const out = new Set();
  for (const g of grupos) for (const e of g.excluir) out.add(e);
  return [...out].map(aspasSeFrase);
}

// Expande uma lista de termos: junta os amplos de ramo de cada um.
export function expandirTermos(termos = []) {
  const out = new Set();
  for (const t of termos) for (const a of expandirRamo(t)) out.add(a);
  return [...out];
}

// Junta as exclusoes de ramo de cada termo.
export function excluirTermos(termos = []) {
  const out = new Set();
  for (const t of termos) for (const e of excluirRamo(t)) out.add(e);
  return [...out];
}
