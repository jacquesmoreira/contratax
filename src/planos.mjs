// Catalogo de planos e pacotes avulsos. Preco e cota configuraveis por env.
// A cota de ANALISES de IA (o que custa $) vem do plano; pacotes avulsos somam
// creditos extras que nao expiram no virar do mes.
//
// Precificacao 2026-06-07 (Cenario A): margem minima 60% pessimista (cliente
// usa 100% da cota). Custo por analise completa: R$ 2,50 (Sonnet 4.6, com
// cache global protegendo edital ja lido). TL;DR fora da cota, custo ~R$ 0,05
// por cache miss (Haiku 4.5). Pacotes avulsos sao upsell quando cliente bate
// no teto da cota mensal.

// ATENCAO — ID INTERNO x NOME DE TELA (nao confie na chave pra saber o nome):
// a chave do objeto (id) fica GRAVADA na assinatura do cliente e na referencia
// do Asaas (sub:token:ID), entao NAO pode mudar sem quebrar renovacao. Ja o
// `nome` e so o rotulo de tela e pode mudar a vontade. Quando o Jacques reordenou
// a escada (jul/2026), renomeamos os rotulos SEM tocar nos ids:
//   id "essencial" -> exibe "Basico"   (R$149/15)  <- degrau novo, id novo
//   id "basico"    -> exibe "Pro"       (R$247/30)  <- so trocou o rotulo
//   id "pro"       -> exibe "Expertise" (R$397/50)  <- so trocou o rotulo
// Assim quem ja paga (nivel="basico"/"pro") mantem preco e cota; so ve outro nome.
export const PLANOS = {
  // Plano de ENTRADA: busca e alerta ilimitados (custo zero) + 6 analises de
  // edital COM VEREDITO de aptidao. Margem segura porque o uso medio fica bem
  // abaixo do teto de 6.
  starter: {
    id: "starter",
    nome: "Starter",
    preco: process.env.LICITA_PRECO_STARTER || "59,00",
    analises: Number(process.env.LICITA_ANALISES_STARTER || 6), // entrada, com veredito
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_STARTER || 0),
    tldrLimiteDia: Number(process.env.LICITA_TLDR_STARTER || 8),
    empresas: 1,
    degustacao: true, // sinaliza pra UI deixar claro que a IA e limitada
  },
  // Degrau intermediario (jul/2026): fecha o abismo Starter(59)->antigo Basico(247).
  // Exibido como "Basico". id "essencial" pra nao colidir com o id "basico" antigo.
  essencial: {
    id: "essencial",
    nome: "Básico",
    preco: process.env.LICITA_PRECO_ESSENCIAL || "149,00",
    analises: Number(process.env.LICITA_ANALISES_ESSENCIAL || 15),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_ESSENCIAL || 2),
    tldrLimiteDia: Number(process.env.LICITA_TLDR_ESSENCIAL || 10),
    empresas: 1,
  },
  basico: {
    id: "basico",
    nome: "Pro", // rotulo novo; id historico e "basico"
    preco: process.env.LICITA_PRECO_BASICO || process.env.LICITA_PRECO || "247,00",
    analises: Number(process.env.LICITA_ANALISES_BASICO || 30),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_BASICO || 5),
    tldrLimiteDia: Number(process.env.LICITA_TLDR_BASICO || 12),
    empresas: 1, // 1 CNPJ
  },
  pro: {
    id: "pro",
    nome: "Expertise", // rotulo novo; id historico e "pro"
    preco: process.env.LICITA_PRECO_PRO || "397,00",
    analises: Number(process.env.LICITA_ANALISES_PRO || 50),
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_PRO || 20),
    tldrLimiteDia: Number(process.env.LICITA_TLDR_PRO || 18),
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
    tldrLimiteDia: Number(process.env.LICITA_TLDR_ASS10 || 30),
    empresas: Number(process.env.LICITA_EMPRESAS_ASS10 || 10),
    assessoria: true,
  },
  assessoria25: {
    id: "assessoria25",
    nome: "Assessoria 25",
    preco: process.env.LICITA_PRECO_ASS25 || "1297,00",
    analises: Number(process.env.LICITA_ANALISES_ASS25 || 6), // por empresa (150 total)
    extracoesPdf: Number(process.env.LICITA_EXTRACOES_ASS25 || 5), // por empresa
    tldrLimiteDia: Number(process.env.LICITA_TLDR_ASS25 || 50),
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
