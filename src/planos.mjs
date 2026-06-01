// Catalogo de planos e pacotes avulsos. Preco e cota configuraveis por env.
// A cota de ANALISES de IA (o que custa $) vem do plano; pacotes avulsos somam
// creditos extras que nao expiram no virar do mes.

export const PLANOS = {
  basico: {
    id: "basico",
    nome: "Basico",
    preco: process.env.LICITA_PRECO_BASICO || process.env.LICITA_PRECO || "197,00",
    analises: Number(process.env.LICITA_ANALISES_BASICO || 100),
  },
  pro: {
    id: "pro",
    nome: "Pro",
    preco: process.env.LICITA_PRECO_PRO || "297,00",
    analises: Number(process.env.LICITA_ANALISES_PRO || 250),
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
