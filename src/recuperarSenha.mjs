// Recuperação de senha por e-mail (link mágico com expiração de 1 hora).
//
// Fluxo:
//   1) Cliente preenche e-mail em /esqueci-senha
//   2) POST /api/recuperar-senha -> gera token, salva no perfil com expira_em,
//      manda e-mail com link contendo o token
//   3) Cliente clica no link -> /redefinir-senha?t=<token>
//   4) Cliente define senha nova
//   5) POST /api/redefinir-senha -> valida token, troca senhaHash, limpa token
//
// Token: 32 bytes hex (alta entropia), válido por 60min, uso único.

import { randomBytes, createHash } from "node:crypto";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { hashSenha } from "./senha.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const VALIDADE_MS = 60 * 60 * 1000; // 60 minutos

function hashToken(t) {
  // Armazena hash do token (nunca o token cru) - se o perfis.json vazar,
  // ninguém consegue redefinir senhas com os tokens armazenados.
  return createHash("sha256").update(t).digest("hex");
}

// Solicita reset. Sempre devolve sucesso (mesmo se o e-mail não existir) pra
// não revelar quais e-mails estão cadastrados.
export async function solicitarReset({ email, baseUrl }) {
  if (!email || !temEmailKey()) return { ok: true }; // silencioso
  const emailNorm = String(email).trim().toLowerCase();
  const perfis = await lerPerfis();
  const p = perfis.find((x) => (x.email || "").trim().toLowerCase() === emailNorm);
  if (!p) return { ok: true }; // resposta uniforme
  const tokenCru = randomBytes(32).toString("hex");
  p._resetSenhaHash = hashToken(tokenCru);
  p._resetSenhaExpira = Date.now() + VALIDADE_MS;
  await salvarPerfis(perfis);

  const link = `${baseUrl}/redefinir-senha?t=${tokenCru}`;
  try {
    await enviar({
      para: p.email,
      assunto: "Redefinir sua senha no ContrataX",
      html: htmlEmail(p.nome || p.email, link),
    });
    return { ok: true };
  } catch (e) {
    return { ok: true, log: "envio_falhou:" + e.message };
  }
}

// CORREÇÃO 09/08/2026: o arquivo estava sem acentuação (bug antigo, não
// estilo) — "Ola", "botao", "voce" etc. Corrigido; saudação passou a usar
// só o primeiro nome, igual ao resto do sistema.
function htmlEmail(nomeCompleto, link) {
  const nome = String(nomeCompleto || "").split(" ")[0] || "cliente";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:30px 24px;color:#0f172a">
    <img src="https://www.contratax.com.br/logo-horizontal.png" alt="ContrataX" style="height:32px;margin-bottom:18px">
    <h1 style="font-size:20px;font-weight:800;margin:0 0 14px">Redefinir sua senha</h1>
    <p>Olá, <b>${nome}</b>. Recebemos um pedido para redefinir a senha da sua conta no ContrataX.</p>
    <p>Clique no botão abaixo para escolher uma nova senha. O link expira em <b>60 minutos</b>.</p>
    <p style="margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9px;font-weight:700">Redefinir senha</a>
    </p>
    <p style="font-size:13px;color:#475569">Se você não pediu essa troca, ignore esse e-mail. Sua senha atual continua válida.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">ContrataX, gestão inteligente de licitações</p>
  </div>`;
}

// Aplica nova senha usando o token. Token deve estar válido e dentro do prazo.
export async function aplicarReset({ token, senhaNova }) {
  if (!token || !senhaNova) return { ok: false, erro: "Dados incompletos" };
  if (String(senhaNova).length < 6) return { ok: false, erro: "A senha precisa ter ao menos 6 caracteres" };
  const tkHash = hashToken(String(token));
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x._resetSenhaHash === tkHash);
  if (!p) return { ok: false, erro: "Link inválido ou já usado" };
  if (!p._resetSenhaExpira || Date.now() > p._resetSenhaExpira) {
    return { ok: false, erro: "Link expirado. Solicite um novo." };
  }
  p.senhaHash = hashSenha(senhaNova);
  // Atualiza também o admin da equipe (usuário master)
  if (Array.isArray(p.usuarios)) {
    const adm = p.usuarios.find((u) => u.papel === "admin");
    if (adm) adm.senhaHash = p.senhaHash;
  }
  delete p._resetSenhaHash;
  delete p._resetSenhaExpira;
  await salvarPerfis(perfis);
  return { ok: true, token: p.token };
}

// Verifica se o token é válido sem aplicar (pro front decidir se mostra form).
export async function verificarToken(token) {
  if (!token) return { ok: false };
  const perfis = await lerPerfis();
  const tkHash = hashToken(String(token));
  const p = perfis.find((x) => x._resetSenhaHash === tkHash);
  if (!p) return { ok: false, motivo: "invalido" };
  if (Date.now() > (p._resetSenhaExpira || 0)) return { ok: false, motivo: "expirado" };
  return { ok: true, email: p.email };
}
