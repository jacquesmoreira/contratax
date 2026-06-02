// Equipe: varios usuarios sob o mesmo CNPJ (empresa). O criador da conta e o admin;
// ele convida membros ate o limite de assentos do plano. Cada assento extra e cobrado.

import { randomBytes } from "node:crypto";
import { hashSenha, verificarSenha } from "./senha.mjs";
import { lerPerfis, salvarPerfis, garantirUsuarios, normEmail } from "./perfis.mjs";

// Preco por acesso adicional (assento extra). Exibido quando o limite e atingido.
export const PRECO_ASSENTO = process.env.LICITA_PRECO_ASSENTO || "49,00";

// Login: aceita e-mail OU CNPJ + senha.
// Procura em todas as contas e devolve { perfil, usuario }.
export async function autenticarUsuario(identificador, senha) {
  const id = (identificador || "").trim();
  if (!id) return { ok: false, motivo: "Informe o seu e-mail ou CNPJ" };
  const perfis = await lerPerfis();
  // Detecta se e CNPJ (so digitos, 14 chars) ou e-mail
  const cnpjLimpo = id.replace(/\D/g, "");
  const ehCnpj = cnpjLimpo.length === 14 && /^\d{14}$/.test(cnpjLimpo);

  for (const p of perfis) {
    garantirUsuarios(p);
    // Busca por CNPJ: acha a empresa e usa o usuario admin
    if (ehCnpj && (p.cnpj || "").replace(/\D/g, "") === cnpjLimpo) {
      const u = p.usuarios.find((x) => x.papel === "admin") || p.usuarios[0];
      if (!u) continue;
      if (u.senhaHash && !verificarSenha(senha, u.senhaHash)) {
        return { ok: false, motivo: "CNPJ ou senha incorretos." };
      }
      return { ok: true, perfil: p, usuario: u };
    }
    // Busca por e-mail: procura em todos os usuarios da empresa
    if (!ehCnpj) {
      const alvo = normEmail(id);
      const u = p.usuarios.find((x) => normEmail(x.email) === alvo);
      if (!u) continue;
      if (u.senhaHash && !verificarSenha(senha, u.senhaHash)) {
        return { ok: false, motivo: "E-mail ou senha incorretos." };
      }
      return { ok: true, perfil: p, usuario: u };
    }
  }
  return {
    ok: false,
    motivo: ehCnpj
      ? "Nao encontramos uma conta com esse CNPJ. Faca o seu cadastro."
      : "Nao encontramos uma conta com esse e-mail. Faca o seu cadastro.",
  };
}

// True se o e-mail ja tem acesso em qualquer conta (qualquer empresa).
function emailEmUso(perfis, email) {
  const alvo = normEmail(email);
  return perfis.some((q) => normEmail(q.email) === alvo
    || (q.usuarios || []).some((u) => normEmail(u.email) === alvo));
}

// Admin convida um membro para a empresa (pelo token da conta).
export async function convidarMembro(token, { nome, email, senha } = {}) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error("Conta nao encontrada");
  garantirUsuarios(p);

  email = normEmail(email);
  if (!email || !/.+@.+\..+/.test(email)) throw new Error("E-mail invalido");
  if (!senha || senha.length < 6) throw new Error("A senha precisa de ao menos 6 caracteres");
  if (emailEmUso(perfis, email)) throw new Error("Este e-mail ja tem acesso em alguma conta.");

  if (p.usuarios.length >= (p.assentos || 1)) {
    throw new Error(
      `Seu plano inclui ${p.assentos || 1} acesso(s). Cada acesso a mais custa R$ ${PRECO_ASSENTO}/mes. `
      + "Fale com o suporte para liberar novos acessos.",
    );
  }

  const membro = {
    id: "u-" + randomBytes(4).toString("hex"),
    nome: (nome || email.split("@")[0]).trim(),
    email,
    senhaHash: hashSenha(senha),
    papel: "membro",
    criadoEm: new Date().toISOString(),
  };
  p.usuarios.push(membro);
  await salvarPerfis(perfis);
  return { id: membro.id, nome: membro.nome, email: membro.email, papel: membro.papel };
}

// Remove um membro (nao remove o admin).
export async function removerMembro(token, idMembro) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error("Conta nao encontrada");
  garantirUsuarios(p);
  const alvo = p.usuarios.find((u) => u.id === idMembro);
  if (!alvo) throw new Error("Acesso nao encontrado");
  if (alvo.papel === "admin") throw new Error("O administrador da conta nao pode ser removido");
  p.usuarios = p.usuarios.filter((u) => u.id !== idMembro);
  await salvarPerfis(perfis);
  return { ok: true };
}

// Estado da equipe para o painel: membros, assentos usados/total e preco do extra.
export async function listarMembros(token) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) return null;
  garantirUsuarios(p);
  return {
    assentos: p.assentos || 1,
    usados: p.usuarios.length,
    precoAssento: PRECO_ASSENTO,
    membros: p.usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel })),
  };
}

// Concierge (admin): define quantos assentos a conta tem (apos pagamento do extra).
export async function definirAssentos(token, n) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error("Conta nao encontrada");
  p.assentos = Math.max(1, Number(n) || 1);
  await salvarPerfis(perfis);
  return { assentos: p.assentos };
}
