// Exportacao em CSV (UTF-8 com BOM) - Excel/Google Sheets abrem nativo.
// Zero dependencias. Apenas formata os dados das views que ja existem.

const brl = (v) => v == null || v === 0 ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString("pt-BR");
};
const dataHora = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

// Escapa um campo para CSV (RFC 4180): aspas duplicadas + envolve em "" se
// tem virgula, aspas ou quebra de linha.
function csvCampo(v) {
  const s = String(v ?? "");
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLinha(arr) {
  return arr.map(csvCampo).join(";"); // ; para Excel BR abrir certo
}

// Cabecalho UTF-8 BOM faz o Excel reconhecer acentos sem precisar "importar".
const BOM = "﻿";

export function nomeArquivo(tipo, extensao = "csv") {
  const data = new Date().toISOString().slice(0, 10);
  return `contratax-${tipo}-${data}.${extensao}`;
}

// EDITAIS (busca / oportunidades abertas)
export function csvEditais(editais) {
  const cab = ["Municipio", "UF", "Orgao", "Modalidade", "Objeto", "Valor estimado (R$)", "Encerra em", "Link PNCP"];
  const linhas = editais.map((e) => csvLinha([
    e.municipio ?? "",
    e.uf ?? "",
    e.orgao ?? "",
    e.modalidade ?? "",
    e.objeto ?? "",
    brl(e.valorEstimado),
    dataHora(e.encerramento),
    e.link ?? "",
  ]));
  return BOM + [csvLinha(cab), ...linhas].join("\r\n");
}

// HISTORICO (licitacoes ja fechadas, agrupadas por objeto)
export function csvHistorico(licitacoes) {
  const cab = ["Municipio", "UF", "Orgao", "Objeto", "Data", "Vencedor 1", "Valor 1 (R$)", "Vencedor 2", "Valor 2 (R$)", "Vencedor 3", "Valor 3 (R$)", "Total contratos", "Valor total (R$)"];
  const linhas = licitacoes.map((l) => {
    const v = l.vencedores || [];
    return csvLinha([
      l.municipio ?? "",
      l.uf ?? "",
      l.orgao ?? "",
      l.objeto ?? "",
      dataBR(l.data),
      v[0]?.fornecedor ?? "", brl(v[0]?.valor),
      v[1]?.fornecedor ?? "", brl(v[1]?.valor),
      v[2]?.fornecedor ?? "", brl(v[2]?.valor),
      l.qtdContratos ?? 1,
      brl(l.valorTotal),
    ]);
  });
  return BOM + [csvLinha(cab), ...linhas].join("\r\n");
}

// RADAR (contratos vencendo + top 3 fornecedores por vitorias)
export function csvRadar(itens) {
  const cab = ["Municipio", "UF", "Orgao", "Objeto", "Vigencia ate", "1o vencedor", "Vitorias", "2o vencedor", "Vitorias", "3o vencedor", "Vitorias", "Valor total contratado (R$)"];
  const linhas = itens.map((i) => {
    const t = i.top3 || [];
    return csvLinha([
      i.municipio ?? "",
      i.uf ?? "",
      i.orgao ?? "",
      i.objeto ?? "",
      dataBR(i.vigenciaFim),
      t[0]?.fornecedor ?? "", t[0]?.qtd ?? "",
      t[1]?.fornecedor ?? "", t[1]?.qtd ?? "",
      t[2]?.fornecedor ?? "", t[2]?.qtd ?? "",
      brl(i.valorTotal),
    ]);
  });
  return BOM + [csvLinha(cab), ...linhas].join("\r\n");
}
