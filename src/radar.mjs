// Radar de renovacao: contratos do ramo do cliente que vao vencer em breve.
// Quando um contrato vence, costuma sair uma nova licitacao. O cliente se prepara
// com antecedencia e ainda ve quem e o fornecedor atual (o concorrente a bater).

import { contratosVencendo } from "./db.mjs";
import { aplicarFiltro, normalizar } from "./filtro.mjs";

export function radarRenovacao({ termos = [], uf = null, categorias = [], dentroMeses = 12, limite = 12 } = {}) {
  const candidatos = contratosVencendo({ uf, categorias, dentroMeses });
  const casaram = aplicarFiltro(candidatos, { termos });

  // Uma licitacao (Registro de Precos, sobretudo) costuma ter VARIOS contratos, um
  // por item/fornecedor. Agrupamos por licitacao (mesmo orgao + objeto) e mostramos
  // o FORNECEDOR PRINCIPAL (o que mais faturou) + quantos outros disputaram.
  const grupos = new Map();
  for (const c of casaram) {
    const chave = `${c.orgao || ""}|${normalizar(c.objeto || "").replace(/\s+/g, " ").trim().slice(0, 50)}`;
    const g = grupos.get(chave) || {
      orgao: c.orgao, municipio: c.municipio, uf: c.uf, objeto: c.objeto,
      vigenciaFim: c.vigenciaFim, fornecedores: new Map(), valorTotal: 0,
    };
    // Mantem o objeto mais longo (mais descritivo) e a vigencia que vence primeiro.
    if ((c.objeto || "").length > (g.objeto || "").length) g.objeto = c.objeto;
    if (c.vigenciaFim && (!g.vigenciaFim || c.vigenciaFim < g.vigenciaFim)) g.vigenciaFim = c.vigenciaFim;
    const f = c.fornecedor || "Nao informado";
    // Rastreia: qtd de contratos ganhos (para ranquear por vitórias) e valor (para total).
    const reg = g.fornecedores.get(f) || { qtd: 0, valor: 0 };
    reg.qtd += 1;
    reg.valor += c.valor || 0;
    g.fornecedores.set(f, reg);
    g.valorTotal += c.valor || 0;
    grupos.set(chave, g);
  }

  const lista = [...grupos.values()].map((g) => {
    // Ordena por numero de contratos ganhos (quem ganhou mais itens/municipios)
    const ranking = [...g.fornecedores.entries()]
      .sort((a, b) => b[1].qtd - a[1].qtd || b[1].valor - a[1].valor);
    return {
      orgao: g.orgao, municipio: g.municipio, uf: g.uf, objeto: g.objeto,
      vigenciaFim: g.vigenciaFim,
      valorTotal: g.valorTotal,
      // Top 3 fornecedores por numero de contratos ganhos (sem valor individual)
      top3: ranking.slice(0, 3).map(([fornecedor, r]) => ({ fornecedor, qtd: r.qtd })),
    };
  });
  lista.sort((a, b) => (a.vigenciaFim || "").localeCompare(b.vigenciaFim || ""));
  return lista.slice(0, limite);
}
