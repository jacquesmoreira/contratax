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
    g.fornecedores.set(f, (g.fornecedores.get(f) || 0) + (c.valor || 0));
    g.valorTotal += c.valor || 0;
    grupos.set(chave, g);
  }

  const lista = [...grupos.values()].map((g) => {
    const ranking = [...g.fornecedores.entries()].sort((a, b) => b[1] - a[1]);
    const [principal, valorPrincipal] = ranking[0] || ["Nao informado", 0];
    return {
      orgao: g.orgao, municipio: g.municipio, uf: g.uf, objeto: g.objeto,
      vigenciaFim: g.vigenciaFim,
      fornecedorPrincipal: principal,
      valorPrincipal,
      outrosFornecedores: Math.max(0, ranking.length - 1),
      valorTotal: g.valorTotal,
    };
  });
  lista.sort((a, b) => (a.vigenciaFim || "").localeCompare(b.vigenciaFim || ""));
  return lista.slice(0, limite);
}
