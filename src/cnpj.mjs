// Validacao de CNPJ: digito verificador (offline, instantaneo) + consulta na base
// da Receita via BrasilAPI (gratis) para confirmar existencia e puxar a razao social.

function digitoVerificador(base) {
  const pesos = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

export function limparCNPJ(cnpj) {
  return (cnpj || "").replace(/\D/g, "");
}

// Valida o numero pelo digito verificador (nao garante que existe na Receita).
export function validarFormatoCNPJ(cnpj) {
  const c = limparCNPJ(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  return Number(c[12]) === digitoVerificador(c.slice(0, 12)) && Number(c[13]) === digitoVerificador(c.slice(0, 13));
}

// Consulta a Receita (BrasilAPI). Best-effort: se a API cair, aceita pelo digito.
export async function consultarCNPJ(cnpj) {
  const c = limparCNPJ(cnpj);
  if (!validarFormatoCNPJ(c)) return { valido: false, erro: "CNPJ inválido (confira os números)" };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { headers: { "User-Agent": "Licita/1.0" } });
    if (r.status === 404) return { valido: false, erro: "CNPJ não encontrado na base da Receita" };
    if (!r.ok) return { valido: true, razaoSocial: null, aviso: "não deu para confirmar na Receita agora" };
    const j = await r.json();
    const situacao = j.descricao_situacao_cadastral ?? null;
    // ativa: true se a Receita confirma ATIVA, false se confirma outra situacao
    // (BAIXADA/INAPTA/SUSPENSA/NULA), null se nao deu pra confirmar.
    const ativa = situacao ? /^ATIVA$/i.test(String(situacao).trim()) : null;
    return { valido: true, razaoSocial: j.razao_social ?? null, situacao, ativa, uf: j.uf ?? null };
  } catch {
    return { valido: true, razaoSocial: null, ativa: null, aviso: "não deu para confirmar na Receita agora" };
  }
}
