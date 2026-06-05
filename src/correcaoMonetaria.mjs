// Correcao monetaria + juros moratorios para cobranca de orgao publico em atraso.
//
// Base juridica:
//   - Lei 14.133/2021 (Nova Lei de Licitacoes): prazo de pagamento de 30 dias
//     contados da liquidacao (art. 141).
//   - Em caso de atraso, e cabivel correcao monetaria pelo IPCA/INPC e juros
//     moratorios de 0,5% ao mes (1% nos contratos pre-2021 sob Lei 8.666),
//     conforme jurisprudencia consolidada do STJ e do TCU.
//
// Premissa de produto: usar IPCA acumulado por estimativa (4% a.a. ~ 0,327%
// a.m. equivalente) como aproximacao. Cliente pode editar o indice efetivo
// antes de protocolar o oficio. Nao buscamos API do Bacen aqui pra manter
// zero-dependencia. Em uma versao futura, podemos integrar SGS/Bacen.
//
// Outputs: valor original, indice de correcao, valor corrigido, juros,
// total devido. Tudo em Reais (numero).

// Taxa mensal de juros moratorios (Lei 14.133/2021 entende como 0,5% ao mes).
const JUROS_MORA_MES = 0.005;
// Aproximacao de IPCA mensal recente (~4%/ano). Conservador: cliente pode
// trocar para o valor real do periodo se desejar.
const IPCA_MES = 0.00327; // (1.04)^(1/12) - 1 aprox.

export function calcularCorrecao({ valorOriginal, dataVencimento, dataReferencia = null }) {
  const venc = new Date(dataVencimento);
  const ref = dataReferencia ? new Date(dataReferencia) : new Date();
  const diasAtraso = Math.max(0, Math.floor((ref - venc) / 864e5));
  const mesesAtraso = diasAtraso / 30;

  if (diasAtraso <= 0) {
    return {
      diasAtraso: 0,
      mesesAtraso: 0,
      valorOriginal,
      correcao: 0,
      valorCorrigido: valorOriginal,
      juros: 0,
      totalDevido: valorOriginal,
      taxaJurosMes: JUROS_MORA_MES,
      taxaCorrecaoMes: IPCA_MES,
    };
  }

  // Correcao composta (IPCA aproximado).
  const fatorCorrecao = Math.pow(1 + IPCA_MES, mesesAtraso);
  const valorCorrigido = valorOriginal * fatorCorrecao;
  const correcao = valorCorrigido - valorOriginal;
  // Juros simples sobre valor corrigido (interpretacao mais comum em
  // cobranca administrativa, alinhada com TCU).
  const juros = valorCorrigido * JUROS_MORA_MES * mesesAtraso;
  const totalDevido = valorCorrigido + juros;

  return {
    diasAtraso,
    mesesAtraso: Number(mesesAtraso.toFixed(2)),
    valorOriginal,
    correcao: Number(correcao.toFixed(2)),
    valorCorrigido: Number(valorCorrigido.toFixed(2)),
    juros: Number(juros.toFixed(2)),
    totalDevido: Number(totalDevido.toFixed(2)),
    taxaJurosMes: JUROS_MORA_MES,
    taxaCorrecaoMes: IPCA_MES,
  };
}

export function formatarBRL(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
