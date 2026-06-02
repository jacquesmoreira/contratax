// Cliente da API publica de consultas do PNCP (Portal Nacional de Contratacoes Publicas).
// Dados abertos e gratuitos, obrigatorios por forca da Lei 14.133/2021.
// Doc: https://pncp.gov.br/api/consulta/swagger-ui/index.html

// Endpoint de contratacoes com PROPOSTA EM ABERTO: traz so os editais que o
// fornecedor ainda pode disputar, cada um com a data limite de envio de proposta.
const BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

// Modalidades mais relevantes para pequenas e medias empresas (codigos do PNCP).
export const MODALIDADES = {
  1: "Leilao - Eletronico",
  4: "Concorrencia - Eletronica",
  6: "Pregao - Eletronico",
  8: "Dispensa de Licitacao",
  9: "Inexigibilidade",
  12: "Credenciamento",
};

// Formata Date para o padrao AAAAMMDD exigido pela API.
function fmtData(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Converte o objeto bruto do PNCP num formato interno limpo e estavel,
// para o resto do sistema nao depender dos nomes de campo da API.
export function normalizarEdital(raw) {
  return {
    id: raw.numeroControlePNCP,
    orgao: raw.orgaoEntidade?.razaoSocial ?? null,
    orgaoCnpj: raw.orgaoEntidade?.cnpj ?? null, // necessario para baixar os documentos
    unidade: raw.unidadeOrgao?.nomeUnidade ?? null,
    uf: raw.unidadeOrgao?.ufSigla ?? null,
    municipio: raw.unidadeOrgao?.municipioNome ?? null,
    objeto: raw.objetoCompra ?? "",
    modalidade: raw.modalidadeNome ?? null,
    modalidadeId: raw.modalidadeId ?? null,
    valorEstimado: raw.valorTotalEstimado ?? null,
    abertura: raw.dataAberturaProposta ?? null,
    encerramento: raw.dataEncerramentoProposta ?? null,
    situacao: raw.situacaoCompraNome ?? null,
    publicacao: raw.dataPublicacaoPncp ?? null,
    link: raw.linkSistemaOrigem ?? null,
    srp: Boolean(raw.srp),
    ano: raw.anoCompra ?? null, // identificadores para a API de documentos
    sequencial: raw.sequencialCompra ?? null,
  };
}

// ---- Contratos (base dos diferenciais: radar de renovacao + preco dos vencedores) ----

const BASE_CONTRATOS = "https://pncp.gov.br/api/consulta/v1/contratos";

export function normalizarContrato(raw) {
  return {
    id: raw.numeroControlePNCP,
    orgao: raw.orgaoEntidade?.razaoSocial ?? null,
    orgaoCnpj: raw.orgaoEntidade?.cnpj ?? null,
    uf: raw.unidadeOrgao?.ufSigla ?? null,
    municipio: raw.unidadeOrgao?.municipioNome ?? null,
    objeto: raw.objetoContrato ?? "",
    fornecedor: raw.nomeRazaoSocialFornecedor ?? null,
    fornecedorNi: raw.niFornecedor ?? null,
    valorGlobal: raw.valorGlobal ?? null,
    vigenciaInicio: raw.dataVigenciaInicio ?? null,
    vigenciaFim: raw.dataVigenciaFim ?? null,
    categoriaId: raw.categoriaProcesso?.id ?? null,
    categoriaNome: raw.categoriaProcesso?.nome ?? null,
    ano: raw.anoContrato ?? null,
    publicacao: raw.dataPublicacaoPncp ?? null,
  };
}

// Busca JSON resiliente ao WAF (pagina HTML de bloqueio = espera e tenta de novo).
async function fetchJsonResiliente(url, tentativas = 3) {
  let ultimoErro;
  for (let t = 1; t <= tentativas; t++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      const tipo = resp.headers.get("content-type") ?? "";
      if (resp.ok && tipo.includes("application/json")) return await resp.json();
      ultimoErro = new Error(`PNCP ${resp.status} (${tipo || "sem content-type"})`);
      if (t < tentativas) await dormir(30000);
    } catch (e) {
      ultimoErro = e;
      if (t < tentativas) await dormir(5000);
    }
  }
  throw new Error(`Falha apos ${tentativas} tentativas: ${ultimoErro?.message}`);
}

// Percorre os contratos publicados numa janela de datas (AAAAMMDD), pagina a pagina.
export async function* paginarContratos({ dataInicial, dataFinal } = {}) {
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const params = new URLSearchParams({ dataInicial, dataFinal, pagina: String(pagina), tamanhoPagina: "50" });
    const json = await fetchJsonResiliente(`${BASE_CONTRATOS}?${params}`);
    totalPaginas = json.totalPaginas ?? 1;
    yield { contratos: (json.data ?? []).map(normalizarContrato), pagina, totalPaginas };
    pagina += 1;
    if (pagina <= totalPaginas) await dormir(2000);
  } while (pagina <= totalPaginas);
}

// Pausa para nao sobrecarregar a API publica.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Busca uma unica pagina de uma modalidade, com tentativas e backoff.
// A API publica as vezes responde com uma pagina HTML de bloqueio quando ha
// muitas requisicoes seguidas; nesse caso tentamos de novo esperando mais.
async function buscarPagina({ dataFinal, modalidade, uf, pagina, tentativas = 3 }) {
  const params = new URLSearchParams({
    dataFinal, // data limite de recebimento de propostas (janela para frente)
    codigoModalidadeContratacao: String(modalidade),
    pagina: String(pagina),
    tamanhoPagina: "50", // maximo aceito pela API; reduz drasticamente o n. de requisicoes
  });
  if (uf) params.set("uf", uf);
  const url = `${BASE}?${params}`;

  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      const tipo = resp.headers.get("content-type") ?? "";

      // Resposta valida em JSON: sucesso.
      if (resp.ok && tipo.includes("application/json")) {
        const json = await resp.json();
        return {
          editais: (json.data ?? []).map(normalizarEdital),
          totalPaginas: json.totalPaginas ?? 1,
        };
      }

      // Pagina HTML = bloqueio de rajada do WAF. Nao adianta insistir rapido:
      // esperamos bastante (30s) antes de tentar de novo, para a janela limpar.
      ultimoErro = new Error(`PNCP respondeu ${resp.status} (${tipo || "sem content-type"})`);
      if (tentativa < tentativas) await dormir(30000);
    } catch (e) {
      ultimoErro = e;
      if (tentativa < tentativas) await dormir(5000);
    }
  }

  throw new Error(
    `Falha na modalidade ${modalidade} pagina ${pagina} apos ${tentativas} tentativas: ${ultimoErro?.message}`
  );
}

// Gerador que percorre TODAS as paginas de uma modalidade, entregando uma pagina
// por vez. Permite gravar incrementalmente (resiliente a quedas no meio do crawl).
// uf = null significa busca nacional (todos os estados de uma vez).
export async function* paginarEditais({ diasAFrente = 365, modalidade, uf = null } = {}) {
  const dataFinal = fmtData(new Date(Date.now() + diasAFrente * 864e5));
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const { editais, totalPaginas: tp } = await buscarPagina({ dataFinal, modalidade, uf, pagina });
    totalPaginas = tp;
    yield { editais, pagina, totalPaginas };
    pagina += 1;
    if (pagina <= totalPaginas) await dormir(2000); // ritmo educado entre paginas
  } while (pagina <= totalPaginas);
}

// Cache em memoria para a execucao atual: evita rebaixar os mesmos dados
// quando varios perfis pedem a mesma UF/modalidades/janela.
const cacheExecucao = new Map();

// Busca TODOS os editais com proposta em aberto encerrando ate `diasAFrente` dias.
// Faz a paginacao completa e junta tudo num array unico de editais normalizados.
export async function buscarTudo({ diasAFrente = 365, modalidades = [6, 8], uf = null, maxPaginas = 100 } = {}) {
  const dataFinal = fmtData(new Date(Date.now() + diasAFrente * 864e5));

  const chave = JSON.stringify({ dataFinal, modalidades: [...modalidades].sort(), uf, maxPaginas });
  if (cacheExecucao.has(chave)) return cacheExecucao.get(chave);

  const resultado = [];
  for (const modalidade of modalidades) {
    let pagina = 1;
    let totalPaginas = 1;
    do {
      const { editais, totalPaginas: tp } = await buscarPagina({ dataFinal, modalidade, uf, pagina });
      totalPaginas = tp;
      resultado.push(...editais);
      pagina += 1;
      await dormir(2000); // ritmo educado: ~1 req a cada 2s, bem abaixo do limite do WAF
    } while (pagina <= totalPaginas && pagina <= maxPaginas);
  }

  cacheExecucao.set(chave, resultado);
  return resultado;
}
