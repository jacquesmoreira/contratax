// Parser leve do XML da NFe modelo 55 (padrao nacional SEFAZ).
// Extrai apenas os campos que interessam ao modulo Recebiveis.
// Nao usa dependencia externa - regex sobre o XML cru, que e estruturado e estavel.

function pegar(re, xml) {
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function pegarDest(xml) {
  const bloco = xml.match(/<dest>([\s\S]*?)<\/dest>/);
  if (!bloco) return { cnpj: null, nome: null };
  const b = bloco[1];
  const cnpj = pegar(/<CNPJ>(\d{14})<\/CNPJ>/, b);
  const cpf = pegar(/<CPF>(\d{11})<\/CPF>/, b);
  const nome = pegar(/<xNome>([^<]+)<\/xNome>/, b);
  return { cnpj: cnpj || cpf, nome };
}

function pegarDescricao(xml) {
  const itens = [...xml.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/g)].slice(0, 3);
  const descricoes = itens
    .map((m) => {
      const x = m[1].match(/<xProd>([^<]+)<\/xProd>/);
      return x ? x[1].trim() : null;
    })
    .filter(Boolean);
  return descricoes.join(" | ") || null;
}

// Recebe string com o XML completo da NFe e devolve campos extraidos.
// Retorna null se nao parecer com uma NFe valida.
export function parsearNFe(xml) {
  if (!xml || typeof xml !== "string") return null;
  // Aceita tanto NFe (modelo 55) quanto NFSe variantes mais comuns.
  if (!/<nfe\b|<NFe\b|<NFSe\b|<infNFSe\b/i.test(xml)) return null;

  // ide -> data e numero
  const dataEmissaoRaw = pegar(/<dhEmi>([^<]+)<\/dhEmi>/, xml)
    || pegar(/<dEmi>([^<]+)<\/dEmi>/, xml)
    || pegar(/<DataEmissaoNFSe>([^<]+)<\/DataEmissaoNFSe>/i, xml)
    || pegar(/<DataEmissao>([^<]+)<\/DataEmissao>/i, xml);
  const dataEmissao = dataEmissaoRaw ? dataEmissaoRaw.slice(0, 10) : null;

  const numero = pegar(/<nNF>([^<]+)<\/nNF>/, xml)
    || pegar(/<Numero>([^<]+)<\/Numero>/i, xml);
  const serie = pegar(/<serie>([^<]+)<\/serie>/, xml)
    || pegar(/<Serie>([^<]+)<\/Serie>/i, xml);

  // Valor total
  const valorStr = pegar(/<vNF>([^<]+)<\/vNF>/, xml)
    || pegar(/<ValorServicos>([^<]+)<\/ValorServicos>/i, xml)
    || pegar(/<ValorLiquidoNfse>([^<]+)<\/ValorLiquidoNfse>/i, xml)
    || pegar(/<vTotal>([^<]+)<\/vTotal>/, xml);
  const valor = valorStr ? Number(valorStr.replace(",", ".")) : null;

  // Chave (NFe tem 44 digitos no atributo Id="NFe...")
  const chaveNfe = (xml.match(/Id\s*=\s*"NFe(\d{44})"/) || [])[1] || null;

  // Destinatario (cliente da NF = orgao publico no nosso caso)
  const dest = pegarDest(xml);

  // Descricao dos itens
  const descricao = pegarDescricao(xml)
    || pegar(/<Discriminacao>([^<]+)<\/Discriminacao>/i, xml);

  if (!dataEmissao || !valor) return null;

  return {
    numero,
    serie,
    chaveNfe,
    dataEmissao,
    valor,
    orgaoCnpj: dest.cnpj,
    orgaoNome: dest.nome,
    descricao,
  };
}
