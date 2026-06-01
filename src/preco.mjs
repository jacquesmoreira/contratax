// Inteligencia de preco: a partir dos contratos ja fechados, mostra por quanto
// contratos parecidos foram vencidos (Raio-X dos vencedores) e a faixa de preco
// praticada (Termometro). Reutiliza o matching forgiving dos editais.

import { consultarContratos } from "./db.mjs";
import { aplicarFiltro, normalizar } from "./filtro.mjs";

function estatisticas(valores) {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return {
    n: v.length,
    min: v[0],
    max: v[v.length - 1],
    mediana: v[Math.floor(v.length / 2)],
    media: Math.round(v.reduce((s, x) => s + x, 0) / v.length),
  };
}

// Inteligencia de concorrencia: quem mais ganha contratos do ramo do cliente, e a
// faixa de precos praticada. Foco em QUEM ganha (confiavel) em vez de um "lance"
// preciso (os valores do PNCP misturam preco por item com contrato inteiro).
// Minimo de contratos para cada escopo fazer sentido. Abaixo disso, sobe o escopo
// (orgao -> municipio -> estado) para o ranking nao ficar raso ou enganoso.
const MIN_ORGAO = 4;
const MIN_MUNICIPIO = 12;

function rankear(casaram, limite) {
  const porForn = new Map();
  for (const c of casaram) {
    const f = c.fornecedor || "Nao informado";
    const reg = porForn.get(f) || { fornecedor: f, qtd: 0, valorTotal: 0 };
    reg.qtd += 1;
    reg.valorTotal += c.valor;
    porForn.set(f, reg);
  }
  return [...porForn.values()].sort((a, b) => b.qtd - a.qtd).slice(0, limite);
}

export function precoVencedores({ termos = [], uf = null, municipio = null, orgao = null, orgaoCnpj = null, categorias = [], meses = 18, limite = 6 } = {}) {
  // Para o escopo de orgao funcionar, precisamos varrer o pais (o orgao pode ter
  // contratos antigos de outra natureza, mas o CNPJ e unico). Carrega por UF quando
  // ha UF (mais barato) e cai para nacional so se precisar do orgao sem UF.
  const candidatos = consultarContratos({ uf, categorias, mesesAtras: meses });
  const noRamo = aplicarFiltro(candidatos, { termos }).filter((c) => c.valor > 0);

  // Cadeia de escopo, do mais especifico para o mais amplo:
  // orgao (a prefeitura/fundo desta licitacao) -> municipio -> estado -> nacional.
  let escopo = uf ? "uf" : "nacional";
  let casaram = noRamo;
  let local = null;
  let nomeOrgao = null;

  const noOrgao = orgaoCnpj
    ? noRamo.filter((c) => (c.orgaoCnpj || "") === orgaoCnpj)
    : [];
  if (noOrgao.length >= MIN_ORGAO) {
    casaram = noOrgao; escopo = "orgao"; nomeOrgao = orgao || noOrgao[0].orgao;
  } else if (municipio) {
    const mn = normalizar(municipio);
    const naCidade = noRamo.filter((c) => normalizar(c.municipio || "") === mn);
    if (naCidade.length >= MIN_MUNICIPIO) { casaram = naCidade; escopo = "municipio"; local = municipio; }
  }

  return {
    total: casaram.length,
    meses,
    termos, // o ramo (vem do cadastro do cliente) usado para casar os contratos
    uf,
    municipio: local,
    orgao: nomeOrgao,
    escopo, // "orgao" | "municipio" | "uf" | "nacional"
    stats: estatisticas(casaram.map((c) => c.valor)),
    topFornecedores: rankear(casaram, limite),
  };
}
