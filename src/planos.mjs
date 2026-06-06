// Catalogo de planos e pacotes avulsos. Preco e cota configuraveis por env.
// A cota de ANALISES de IA (o que custa $) vem do plano; pacotes avulsos somam
// creditos extras que nao expiram no virar do mes.

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
    preco: process.env.LICITA_PRECO_BASICO || process.env.LICITA_PRECO || "197,00",
    analises: Number(process.env.LICITA_ANALISES_BASICO || 50),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_BASICO || 5),
    empresas: 1, // 1 CNPJ
  },
  pro: {
    id: "pro",
    nome: "Pro",
    preco: process.env.LICITA_PRECO_PRO || "297,00",
    analises: Number(process.env.LICITA_ANALISES_PRO || 100),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_PRO || 20),
    empresas: 1,
  },
  // Planos para CONSULTORES / ASSESSORIAS de licitacao: 1 login que gerencia
  // varios CNPJs. Cada empresa filha tem seu painel completo (editais, alertas,
  // analises). Cota de analises eh POR EMPRESA (100/mes cada).
  assessoria10: {
    id: "assessoria10",
    nome: "Assessoria 10",
    preco: process.env.LICITA_PRECO_ASS10 || "497,00",
    analises: Number(process.env.LICITA_ANALISES_ASS10 || 20), // por empresa
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_ASS10 || 5), // por empresa
    empresas: Number(process.env.LICITA_EMPRESAS_ASS10 || 10),
    assessoria: true,
  },
  assessoria25: {
    id: "assessoria25",
    nome: "Assessoria 25",
    preco: process.env.LICITA_PRECO_ASS25 || "897,00",
    analises: Number(process.env.LICITA_ANALISES_ASS25 || 20), // por empresa
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_ASS25 || 5), // por empresa
    empresas: Number(process.env.LICITA_EMPRESAS_ASS25 || 25),
    assessoria: true,
  },
};

export const PLANO_PADRAO = "basico";

// Pacotes avulsos (creditos extras de analise, sem recorrencia). Preco por unidade
// fica de proposito acima do plano, para incentivar o upgrade em vez do avulso.
export const AVULSOS = {
  p50: { id: "p50", nome: "Pacote 50 analises", preco: process.env.LICITA_PRECO_AV50 || "130,00", analises: 50 },
  p150: { id: "p150", nome: "Pacote 150 analises", preco: process.env.LICITA_PRECO_AV150 || "330,00", analises: 150 },
};

// Plano (nivel) efetivo de um perfil. Default = basico para assinaturas antigas.
export function planoDe(perfil) {
  const nivel = perfil?.assinatura?.nivel;
  return PLANOS[nivel] || PLANOS[PLANO_PADRAO];
}

export function listarPlanos() {
  return Object.values(PLANOS);
}
