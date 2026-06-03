// Plano Assessoria: 1 conta-mae (consultor/assessor) que gerencia varios
// CNPJs (empresas filhas). Cada empresa filha eh um perfil normal com seu
// proprio token, CNPJ, ramo e dados — apenas marcado com `gerenciadoPor`.
//
// A cobranca (Asaas) eh feita na conta-mae; as filhas herdam a assinatura
// ativa do gerente (statusAtual checa esse encadeamento).

import { randomBytes } from "node:crypto";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { limparCNPJ, validarFormatoCNPJ } from "./cnpj.mjs";
import { planoDe } from "./planos.mjs";

const slug = (s) =>
  (s || "empresa").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

// Devolve true se o perfil tem plano de assessoria ativo.
export function ehAssessoria(perfil) {
  return Boolean(planoDe(perfil)?.assessoria);
}

// Limite de empresas gerenciadas pelo perfil (vem do plano).
export function limiteEmpresas(perfil) {
  return planoDe(perfil)?.empresas || 1;
}

// Lista as empresas gerenciadas por um assessor (so as filhas dele).
export async function listarEmpresasGerenciadas(tokenGerente) {
  const perfis = await lerPerfis();
  return perfis.filter((p) => p.gerenciadoPor === tokenGerente);
}

// Adiciona uma nova empresa sob a gerencia de um assessor. Reaproveita a
// estrutura de perfil normal — o cliente final tambem pode logar com o token
// proprio dele caso o assessor compartilhe.
export async function adicionarEmpresa(tokenGerente, dados) {
  const perfis = await lerPerfis();
  const gerente = perfis.find((p) => p.token === tokenGerente);
  if (!gerente) throw new Error("Conta gerente nao encontrada");
  if (!ehAssessoria(gerente)) throw new Error("Seu plano nao permite gerenciar varias empresas");

  const atuais = perfis.filter((p) => p.gerenciadoPor === tokenGerente);
  const limite = limiteEmpresas(gerente);
  if (atuais.length >= limite) {
    throw new Error(`Limite de ${limite} empresas atingido para o seu plano. Atualize para o Assessoria 25.`);
  }

  const { nome, cnpj, razaoSocial, ramo, ufs, modalidades } = dados;
  if (!cnpj || !validarFormatoCNPJ(cnpj)) throw new Error("CNPJ invalido");
  if (!ramo?.trim()) throw new Error("Informe o ramo da empresa");

  const cnpjLimpo = limparCNPJ(cnpj);
  if (perfis.some((p) => limparCNPJ(p.cnpj || "") === cnpjLimpo)) {
    throw new Error("Ja existe uma conta com este CNPJ no ContrataX");
  }

  const termos = ramo.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  if (!termos.length) throw new Error("Informe pelo menos uma palavra-chave do ramo");

  const ufsArr = Array.isArray(ufs) ? ufs.filter(Boolean) : (ufs ? [ufs] : []);
  const token = randomBytes(6).toString("hex");
  const id = `${slug(razaoSocial || nome || "empresa")}-${Date.now().toString(36)}`;
  const agora = new Date().toISOString();
  const nomeFinal = (nome || razaoSocial || "Empresa").trim();

  const novo = {
    id,
    nome: nomeFinal,
    razaoSocial: razaoSocial || null,
    cnpj: cnpjLimpo,
    email: null,        // login eh do assessor; a empresa nao tem email proprio
    senhaHash: null,
    token,
    gerenciadoPor: tokenGerente,  // <-- aponta para o assessor
    usuarios: [],
    assentos: 1,
    analises: { mes: agora.slice(0, 7), usados: 0 },
    ufs: ufsArr,
    modalidades: modalidades?.length ? modalidades : [6, 8, 9, 4],
    filtro: { termos, termosExcluir: [], valorMin: null, valorMax: null },
    // Sem assinatura propria — herda do gerente (statusAtual trata isso)
    assinatura: null,
  };

  perfis.push(novo);
  await salvarPerfis(perfis);
  return novo;
}

// Remove uma empresa gerenciada (mas mantem o registro pra historico/auditoria
// — soft delete: marca como removido em vez de apagar de fato).
export async function removerEmpresa(tokenGerente, tokenEmpresa) {
  const perfis = await lerPerfis();
  const idx = perfis.findIndex((p) => p.token === tokenEmpresa && p.gerenciadoPor === tokenGerente);
  if (idx < 0) throw new Error("Empresa nao encontrada na sua gestao");
  perfis[idx].gerenciadoPor = null;
  perfis[idx].removidaEm = new Date().toISOString();
  await salvarPerfis(perfis);
  return true;
}
