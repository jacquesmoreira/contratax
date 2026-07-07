// Checklist de onboarding pos-cadastro. Calcula o estado de cada passo
// olhando o que o cliente JA fez (sem precisar marcar manualmente).
// O banner some sozinho quando todos os passos viraram "feito".
//
// Ordem = ATIVACAO primeiro: a causa nº1 de churn no teste (medida) foi o cliente
// nunca rodar a 1a analise nem subir certidoes, entao nunca sentir o veredito (o
// diferencial). Os dois primeiros passos vendem esse momento, nao pedem tarefa.

import { temEmailKey } from "./email.mjs";

const TODOS_DOCS = ["federalConjunta", "fgts", "trabalhistaCNDT", "estadual", "municipal"];

// Calcula o checklist do cliente. Cada passo tem feito/false + link + descricao.
export function checklist(perfil) {
  const empresa = perfil?.empresa || {};
  const certidoes = empresa.certidoes || {};
  const docsCadastrados = TODOS_DOCS.filter((k) => certidoes[k]?.validade).length;
  const temDocsCompletos = docsCadastrados >= 3; // 3 das 5 ja considera "ok"
  const temAnalise = (perfil.analises?.usados || 0) > 0; // ja rodou ao menos 1 IA

  const equipeCheia = (perfil.usuarios?.length || 1) >= 2;
  const temPlanoComEquipe = (perfil.assentos || 1) >= 2;

  const passos = [
    {
      id: "edital",
      titulo: "Rode sua 1ª análise (o momento que decide)",
      descricao: "Abra qualquer edital do seu painel e a IA lê ele por você em segundos: objeto, prazo, armadilhas e o veredito. É o que a maioria testa primeiro, e é grátis no teste.",
      feito: temAnalise,
      link: "#painel",
      icone: "🔍",
    },
    {
      id: "docs",
      titulo: "Destrave o veredito personalizado",
      descricao: "Suba as datas das suas certidões e a IA passa a dizer se VOCÊ está apto ou o que falta (ex: certidão X vencida), não só um resumo genérico. É o nosso diferencial, e ainda te avisa antes de cada vencimento.",
      feito: temDocsCompletos,
      link: "/documentos",
      icone: "📄",
      progresso: `${docsCadastrados}/5 certidões`,
    },
    {
      id: "alertas",
      titulo: "Avisos por e-mail ativados",
      descricao: temEmailKey()
        ? "Você recebe o boletim diário dos editais novos do seu ramo + alerta quando uma certidão estiver perto de vencer."
        : "Em breve: boletim diário automático dos editais novos no seu ramo.",
      feito: Boolean(perfil.email) && temEmailKey(),
      link: "/conta",
      icone: "📧",
    },
  ];

  // So mostra o passo de equipe se o plano permite (Pro+) e ainda nao convidou
  if (temPlanoComEquipe) {
    passos.push({
      id: "equipe",
      titulo: "Convidar membros da equipe",
      descricao: `Seu plano libera ${perfil.assentos} acessos. Convide quem analisa licitações com você.`,
      feito: equipeCheia,
      link: "/equipe",
      icone: "👥",
    });
  }

  const feitos = passos.filter((p) => p.feito).length;
  const total = passos.length;
  const completo = feitos === total;

  return {
    completo,
    feitos,
    total,
    passos,
    // dispensado manualmente pelo cliente (botao 'Pular' no banner)
    dispensado: Boolean(perfil._onboardingDispensado),
  };
}
