// Checklist de onboarding pos-cadastro. Calcula o estado de cada passo
// olhando o que o cliente JA fez (sem precisar marcar manualmente).
// O banner some sozinho quando todos os passos viraram "feito".

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
      id: "docs",
      titulo: "Cadastrar documentos da empresa",
      descricao: "Datas de validade das certidões — a IA usa pra conferir aptidão e te avisar dos vencimentos.",
      feito: temDocsCompletos,
      link: "/documentos",
      icone: "📄",
      progresso: `${docsCadastrados}/5 certidões`,
    },
    {
      id: "edital",
      titulo: "Abrir seu primeiro edital",
      descricao: "Veja o TL;DR, faixa de preços e quem ganha no seu ramo direto no detalhe.",
      feito: temAnalise,
      link: "#painel",
      icone: "🔍",
    },
    {
      id: "alertas",
      titulo: "Avisos por e-mail ativados",
      descricao: temEmailKey()
        ? "Você recebe digest diário dos editais novos + alertas quando uma certidão estiver perto de vencer."
        : "Em breve: digest diário automático dos editais novos no seu ramo.",
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
