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
    const reg = porForn.get(f) || { fornecedor: f, fornecedorNi: c.fornecedorNi || null, qtd: 0, valorTotal: 0 };
    reg.qtd += 1;
    reg.valorTotal += c.valor;
    if (!reg.fornecedorNi && c.fornecedorNi) reg.fornecedorNi = c.fornecedorNi;
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
    contratosCasaram: casaram, // mantem a lista pra detalhamento
  };
}

// Monta a URL publica do PNCP para o detalhe do contrato, a partir do
// numeroControlePNCP (formato: CNPJ-tipo-sequencial/ano).
// Ex: "00394502000144-2-000045/2026" -> https://pncp.gov.br/app/contratos/00394502000144/2026/45
export function linkPncpContrato(id) {
  if (!id) return null;
  const m = String(id).match(/^(\d+)-\d+-(\d+)\/(\d+)$/);
  if (!m) return null;
  const [, cnpj, sequencial, ano] = m;
  // Remove zeros a esquerda do sequencial
  const seq = String(Number(sequencial));
  return `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${seq}`;
}

// Lista os contratos de UM fornecedor especifico, dentro do escopo (mesmo orgao,
// mesmo ramo do cliente). Devolve com link pro PNCP de cada contrato.
export function contratosDoFornecedor({ termos = [], uf = null, orgaoCnpj = null, fornecedorNi = null, fornecedor = null, meses = 18 } = {}) {
  if (!fornecedorNi && !fornecedor) return [];
  const candidatos = consultarContratos({ uf, mesesAtras: meses });
  let casaram = aplicarFiltro(candidatos, { termos }).filter((c) => c.valor > 0);
  if (orgaoCnpj) casaram = casaram.filter((c) => (c.orgaoCnpj || "") === orgaoCnpj);
  // Casa por CNPJ do fornecedor (mais preciso) ou por nome (fallback)
  if (fornecedorNi) {
    casaram = casaram.filter((c) => (c.fornecedorNi || "").replace(/\D/g, "") === String(fornecedorNi).replace(/\D/g, ""));
  } else {
    casaram = casaram.filter((c) => (c.fornecedor || "") === fornecedor);
  }
  const lista = casaram
    .sort((a, b) => (b.vigenciaInicio || "").localeCompare(a.vigenciaInicio || ""))
    .map((c) => ({
      id: c.id,
      objeto: c.objeto,
      orgao: c.orgao,
      orgaoCnpj: c.orgaoCnpj,
      municipio: c.municipio,
      uf: c.uf,
      valor: c.valor,
      vigenciaInicio: c.vigenciaInicio,
      vigenciaFim: c.vigenciaFim,
      linkPncp: linkPncpContrato(c.id),
    }));
  return agruparContratos(lista);
}

// Agrupa contratos que sao, na pratica, o MESMO contrato registrado como varios
// itens/empenhos no PNCP. Heuristica: mesmo orgao + mesma vigencia (inicio+fim).
// O PNCP frequentemente fragmenta um contrato em N linhas (uma por item), com a
// mesma vigencia e objeto quase identico. Agrupar evita a lista poluida que o
// cliente via (ex: 22 linhas que sao 3 contratos).
//
// Cada grupo resultante traz:
//   - valor: soma dos itens
//   - itens: quantidade agrupada
//   - objeto: o mais descritivo (mais longo)
//   - links: lista de links do PNCP (todos os itens)
export function agruparContratos(lista) {
  const grupos = new Map();
  // Normaliza data: pega so YYYY-MM-DD (corta hora/minuto). Sem isso, dois
  // itens do MESMO contrato com timestamp diferindo em segundos nao agrupam.
  const diaSo = (s) => String(s || "").slice(0, 10);
  for (const c of lista) {
    // Chave: orgao + vigencia. Sem vigencia, cai no proprio id (nao agrupa).
    const di = diaSo(c.vigenciaInicio), df = diaSo(c.vigenciaFim);
    const chave = (di || df)
      ? `${c.orgaoCnpj || c.orgao || ""}|${di}|${df}`
      : `solo-${c.id}`;
    const g = grupos.get(chave);
    if (!g) {
      grupos.set(chave, {
        id: c.id,
        objeto: c.objeto,
        orgao: c.orgao,
        municipio: c.municipio,
        uf: c.uf,
        valor: c.valor || 0,
        vigenciaInicio: c.vigenciaInicio,
        vigenciaFim: c.vigenciaFim,
        linkPncp: c.linkPncp,
        itens: 1,
        links: c.linkPncp ? [c.linkPncp] : [],
      });
    } else {
      g.valor += c.valor || 0;
      g.itens += 1;
      // mantem o objeto mais descritivo (mais longo)
      if ((c.objeto || "").length > (g.objeto || "").length) g.objeto = c.objeto;
      if (c.linkPncp && !g.links.includes(c.linkPncp)) g.links.push(c.linkPncp);
    }
  }
  return [...grupos.values()].sort((a, b) => (b.vigenciaInicio || "").localeCompare(a.vigenciaInicio || ""));
}
