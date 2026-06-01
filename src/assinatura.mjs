// Assinatura (cobranca-lite). Cada perfil tem um estado: teste -> ativo -> vencido.
// Modelo concierge: novo cliente entra em teste gratis; voce ativa manualmente
// apos o Pix. Automacao (Asaas/Mercado Pago) entra depois, no deploy.

import { readFile, writeFile } from "node:fs/promises";
import { PERFIS } from "./caminhos.mjs";

const TRIAL_DIAS = Number(process.env.LICITA_TRIAL_DIAS || 7);

// Dados de cobranca exibidos no muro de pagamento (configure no .env).
export const cobranca = {
  preco: process.env.LICITA_PRECO || "197,00",
  pix: process.env.LICITA_PIX_CHAVE || "configure-sua-chave-pix",
  contato: process.env.LICITA_CONTATO || "comprovante@seudominio.com.br",
  trialDias: TRIAL_DIAS,
};

// Assinatura inicial de um novo cadastro: teste gratis.
export function novaAssinaturaTeste() {
  return {
    status: "teste",
    plano: "mensal",
    criadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + TRIAL_DIAS * 864e5).toISOString(),
  };
}

// Calcula o estado efetivo da assinatura (considerando o vencimento).
export function statusAtual(perfil) {
  const a = perfil.assinatura;
  if (!a) return { status: "ativo", temAcesso: true, expiraEm: null, diasRestantes: null }; // legado/admin

  const expira = a.expiraEm ? new Date(a.expiraEm) : null;
  const diasRestantes = expira ? Math.ceil((expira - new Date()) / 864e5) : null;
  const vencido = expira ? new Date() > expira : false;

  if (a.status === "inativo") return { status: "inativo", temAcesso: false, expiraEm: a.expiraEm, diasRestantes };
  if (vencido) {
    return {
      status: a.status === "teste" ? "teste_expirado" : "vencido",
      temAcesso: false,
      expiraEm: a.expiraEm,
      diasRestantes,
    };
  }
  return { status: a.status, temAcesso: true, expiraEm: a.expiraEm, diasRestantes };
}

// Ativa (ou renova) a assinatura de um cliente por N dias. Uso do admin apos o Pix.
export async function ativarPorToken(token, dias = 30) {
  const perfis = JSON.parse(await readFile(PERFIS, "utf8"));
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error(`Token ${token} nao encontrado`);
  p.assinatura = {
    ...(p.assinatura || {}),
    status: "ativo",
    plano: "mensal",
    ativadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + dias * 864e5).toISOString(),
  };
  await writeFile(PERFIS, JSON.stringify(perfis, null, 2), "utf8");
  return p;
}

// Lista todos os clientes com o estado da assinatura (para o admin).
export async function listarClientes() {
  const perfis = JSON.parse(await readFile(PERFIS, "utf8"));
  return perfis.map((p) => ({ nome: p.nome, email: p.email ?? null, token: p.token, ...statusAtual(p) }));
}
