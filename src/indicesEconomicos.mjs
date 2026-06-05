// Indices economicos usados para reequilibrio economico-financeiro
// (Lei 14.133/2021, art. 124, II).
//
// IMPORTANTE: zero-dependencia, sem API externa. Valores aproximados das
// medias dos ultimos 12 meses (revisar periodicamente). Cliente pode pedir o
// indice efetivo do periodo na hora do protocolo - este modulo serve como
// SINAL DE OPORTUNIDADE: "voce ja tem direito a renegociar".

// Variacao anual aproximada (% acumulado em 12 meses) - referencia 2026.
const VARIACOES_12M = {
  IPCA:     4.2,
  INPC:     4.0,
  INCC:     6.5,   // Custo de construcao - tipico de obras/manutencao
  ICV:      4.5,
  COMBUSTIVEL: 8.5,
  ENERGIA: 6.0,
  TRABALHISTA: 6.0, // referencia ao reajuste do salario minimo
};

// Variacao mensal media (aproximada)
function mensal(anual) { return Math.pow(1 + anual/100, 1/12) - 1; }

// Verifica se ja ha gatilho de reequilibrio (variacao > limite).
// Premissa: jurisprudencia/doutrina consagram variacao >5% no insumo
// principal como suficiente para pedir reequilibrio.
export function gatilhoReequilibrio({ indice, dataBase, dataReferencia = null }) {
  const taxaAno = VARIACOES_12M[indice];
  if (!taxaAno || !dataBase) return null;
  const base = new Date(dataBase);
  const ref = dataReferencia ? new Date(dataReferencia) : new Date();
  if (isNaN(base) || isNaN(ref)) return null;
  const meses = Math.max(0, Math.floor((ref - base) / (30 * 864e5)));
  const variacao = (Math.pow(1 + mensal(taxaAno), meses) - 1) * 100;
  const direito = variacao >= 5;
  return {
    indice,
    meses,
    variacaoPercent: Number(variacao.toFixed(2)),
    temDireito: direito,
    taxaAnualReferencia: taxaAno,
  };
}

export function indicesDisponiveis() {
  return Object.entries(VARIACOES_12M).map(([k,v]) => ({ codigo:k, variacao12m:v }));
}
