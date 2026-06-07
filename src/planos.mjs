// Catalogo de planos e pacotes avulsos. Preco e cota configuraveis por env.
// A cota de ANALISES de IA (o que custa $) vem do plano; pacotes avulsos somam
// creditos extras que nao expiram no virar do mes.
//
// Precificacao 2026-06-07 (Cenario A): margem minima 60% pessimista (cliente
// usa 100% da cota). Custo por analise completa: R$ 2,50 (Sonnet 4.6, com
// cache global protegendo edital ja lido). TL;DR fora da cota, custo ~R$ 0,05
// por cache miss (Haiku 4.5). Pacotes avulsos sao upsell quando cliente bate
// no teto da cota mensal.

export const PLANOS = {
  // Plano de ENTRADA: busca e alerta ilimitados (custo zero), mas a leitura do
  // edital pelo ContrataX.IA fica em DEGUSTACAO (3/mes). A IA e o gancho de
  // upgrade pro Basico. Margem alta porque quase nao consome IA.
  starter: {
    id: "starter",
    nome: "Starter",
    preco: process.env.LICITA_PRECO_STARTER || "59,00",
    analises: Number(process.env.LICITA_ANALISES_STARTER || 3), // degustacao
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_STARTER || 0),
    empresas: 1,
    degustacao: true, // sinaliza pra UI deixar claro que a IA e limitada
  },
  basico: {
    id: "basico",
    nome: "Basico",
    preco: process.env.LICITA_PRECO_BASICO || process.env.LICITA_PRECO || "247,00",
    analises: Number(process.env.LICITA_ANALISES_BASICO || 30),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_BASICO || 5),
    empresas: 1, // 1 CNPJ
  },
  pro: {
    id: "pro",
    nome: "Pro",
    preco: process.env.LICITA_PRECO_PRO || "397,00",
    analises: Number(process.env.LICITA_ANALISES_PRO || 50),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_PRO || 20),
    empresas: 1,
  },
  // Planos para CONSULTORES / ASSESSORIAS de licitacao: 1 login que gerencia
  // varios CNPJs. Cada empresa filha tem seu painel completo (editais, alertas,
  // analises). Cota de analises eh POR EMPRESA.
  assessoria10: {
    id: "assessoria10",
    nome: "Assessoria 10",
    preco: process.env.LICITA_PRECO_ASS10 || "697,00",
    analises: Number(process.env.LICITA_ANALISES_ASS10 || 8), // por empresa (80 total)
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_ASS10 || 5), // por empresa
    empresas: Number(process.env.LICITA_EMPRESAS_ASS10 || 10),
    assessoria: true,
  },
  assessoria25: {
    id: "assessoria25",
    nome: "Assessoria 25",
    preco: process.env.LICITA_PRECO_ASS25 || "1297,00",
    analises: Number(process.env.LICITA_ANALISES_ASS25 || 6), // por empresa (150 total)
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_ASS25 || 5), // por empresa
    empresas: Number(process.env.LICITA_EMPRESAS_ASS25 || 25),
    assessoria: true,
  },
};

export const PLANO_PADRAO = "basico";

// Pacotes avulsos (creditos extras de analise, sem recorrencia). Preco por
// unidade fica de proposito acima do plano (~R$ 7,40/analise vs ~R$ 7,94 no
// Pro), para incentivar o upgrade em vez do avulso recorrente. Margem alvo:
// 60%+ pessimista (toda cota consumida).
export const AVULSOS = {
  p10: { id: "p10", nome: "Pacote 10 analises", preco: process.env.LICITA_PRECO_AV10 || "79,00", analises: 10 },
  p25: { id: "p25", nome: "Pacote 25 analises", preco: process.env.LICITA_PRECO_AV25 || "189,00", analises: 25 },
  p50: { id: "p50", nome: "Pacote 50 analises", preco: process.env.LICITA_PRECO_AV50 || "369,00", analises: 50 },
};

// Plano (nivel) efetivo de um perfil. Default = basico para assinaturas antigas.
export function planoDe(perfil) {
  const nivel = perfil?.assinatura?.nivel;
  return PLANOS[nivel] || PLANOS[PLANO_PADRAO];
}

export function listarPlanos() {
  return Object.values(PLANOS);
}
