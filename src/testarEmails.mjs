// Envia a sequencia COMPLETA de e-mails (onboarding + reengajamento + boletim)
// pra um endereco, pra avaliacao interna (acentuacao, tom, layout). So via rota
// admin (/api/admin/testar-emails?c=ADMIN&para=email). Usa dados REAIS do acervo
// pro conteudo ficar fiel ao que o cliente recebe.

import { enviar, gerarDigest } from "./email.mjs";
import { email1, emailAtivacao, email2, email3, emailUltimasHoras } from "./onboardingEmails.mjs";
import { gerarReengajamento } from "./winbackEmails.mjs";
import { consultar } from "./db.mjs";
import { aplicarFiltro, termosAmplos } from "./filtro.mjs";

// Editais reais do ramo da amostra (mesmo filtro do painel: termos + termosAmplos).
function dadosRamo(perfil) {
  const termos = perfil.filtro?.termos ?? [];
  const casaram = aplicarFiltro(
    consultar({ ufs: perfil.ufs ?? [], apenasAbertos: true }),
    { termos, termosIA: termosAmplos(termos) },
  );
  const comValor = casaram.filter((e) => e.valorEstimado > 0);
  const soma = comValor.reduce((s, e) => s + (e.valorEstimado || 0), 0);
  const ordenados = [...casaram].sort((a, b) => (a.encerramento || "").localeCompare(b.encerramento || ""));
  return { total: casaram.length, soma, novos: casaram.length, exemplos: ordenados.slice(0, 5), top: ordenados.slice(0, 8) };
}

// Monta a lista [{ tag, assunto, html }] com um perfil de amostra. ramo e uf sao
// configuraveis (?ramo=&uf= na rota) pra avaliar como fica em qualquer nicho.
export function montarSequencia({ para = "amostra@contratax.com.br", ramo = "material hospitalar", uf = "SC" } = {}) {
  const agora = new Date();
  const criadoEm = new Date(agora.getTime() - 6 * 864e5).toISOString(); // teste com 6 dias
  const expiraEm = new Date(agora.getTime() + 1 * 864e5).toISOString();
  const termos = String(ramo).split(",").map((s) => s.trim()).filter(Boolean);
  const perfil = {
    id: "amostra-teste",
    nome: "Jacques",
    razaoSocial: "SUA EMPRESA LTDA (amostra)",
    cnpj: "61740453000149",
    email: para,
    token: "amostra-teste",
    filtro: { termos: termos.length ? termos : ["material hospitalar"] },
    ufs: uf ? [String(uf).toUpperCase()] : [],
    assinatura: { criadoEm, expiraEm },
  };
  const d = dadosRamo(perfil);
  const vig = `Vigência do teste grátis: até ${new Date(expiraEm).toLocaleDateString("pt-BR")}`;

  return [
    { tag: "1/7 Onboarding - dia 0 - boas-vindas", ...email1(perfil) },
    { tag: "2/7 Onboarding - dia 2 - ativacao", ...emailAtivacao(perfil, d) },
    { tag: "3/7 Onboarding - dia 4 - veredito", ...email2(perfil) },
    { tag: "4/7 Onboarding - dia 6 - planos", ...email3(perfil, d.total, d.soma) },
    { tag: "5/7 Onboarding - dia 7 - ultimas horas", ...emailUltimasHoras(perfil) },
    { tag: "6/7 Reengajamento diario (lead que nao fechou)", ...gerarReengajamento(perfil, d) },
    { tag: "7/7 Boletim diario (cliente pagante)", ...gerarDigest(perfil, d.top, { vigenciaTexto: vig }) },
  ];
}

export async function enviarSequenciaTeste({ para, ramo, uf, log = console.log }) {
  const lista = montarSequencia({ para, ramo, uf });
  const base = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
  let n = 0;
  for (const e of lista) {
    // Prefixa o assunto com [TESTE x/7 ...] pra voce identificar cada etapa.
    await enviar({
      para,
      assunto: `[TESTE ${e.tag}] ${e.assunto}`,
      html: e.html,
      listaDescadastroUrl: `${base}/descadastrar?c=amostra-teste`,
    });
    n++;
    log(`[testar-emails] ${e.tag} -> ${para}`);
  }
  return n;
}
