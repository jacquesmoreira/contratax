// Camada de sessao: cada LOGIN ganha uma sessao com id proprio (sid), guardada
// no SQLite e entregue ao navegador como cookie HttpOnly. Serve a dois fins:
//
//  1. SESSAO UNICA: ao logar, revogamos as sessoes anteriores do MESMO usuario.
//     Quem estava logado em outro lugar perde o acesso (o guard barra a sessao
//     revogada e o heartbeat do painel desloga na hora). Membros diferentes da
//     equipe tem sessoes distintas e nao se derrubam.
//  2. Parar de depender so do token na URL pra coisas sensiveis.
//
// O sid e aleatorio (24 bytes) e nao carrega dado nenhum: e so a chave da linha.

import { randomBytes } from "node:crypto";
import { abrir } from "./db.mjs";

const DIAS_VALIDADE = Number(process.env.LICITA_SESSAO_DIAS || 30);

let _init = false;
function db() {
  const d = abrir();
  if (!_init) {
    d.exec(`CREATE TABLE IF NOT EXISTS sessoes (
      sid TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ip TEXT, ua TEXT,
      criado_em TEXT NOT NULL,
      visto_em TEXT NOT NULL,
      revogado_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessoes_user ON sessoes(token, user_id);`);
    _init = true;
  }
  return d;
}

// Cria a sessao do login e REVOGA as anteriores do mesmo (token, usuario).
export function criarSessao({ token, userId, ip = "", ua = "" }) {
  const d = db();
  const agora = new Date().toISOString();
  const uid = String(userId || "admin");
  d.prepare("UPDATE sessoes SET revogado_em=? WHERE token=? AND user_id=? AND revogado_em IS NULL")
    .run(agora, token, uid);
  const sid = randomBytes(24).toString("hex");
  d.prepare("INSERT INTO sessoes (sid, token, user_id, ip, ua, criado_em, visto_em) VALUES (?,?,?,?,?,?,?)")
    .run(sid, token, uid, String(ip).slice(0, 60), String(ua).slice(0, 200), agora, agora);
  return sid;
}

// Valida o sid: existe, nao revogada, nao expirada. NAO exige bater com o token
// da URL (assessoria alterna entre varias empresas/tokens com a mesma sessao).
// Atualiza visto_em. Devolve { ok, motivo, token, userId }.
export function validarSessao(sid) {
  if (!sid) return { ok: false, motivo: "sem-sessao" };
  const d = db();
  const s = d.prepare("SELECT * FROM sessoes WHERE sid=?").get(sid);
  if (!s) return { ok: false, motivo: "desconhecida" };
  if (s.revogado_em) return { ok: false, motivo: "revogada" };
  if (Date.now() - new Date(s.criado_em).getTime() > DIAS_VALIDADE * 864e5) {
    return { ok: false, motivo: "expirada" };
  }
  d.prepare("UPDATE sessoes SET visto_em=? WHERE sid=?").run(new Date().toISOString(), sid);
  return { ok: true, token: s.token, userId: s.user_id };
}

// Revoga uma sessao (logout).
export function revogarSessao(sid) {
  if (!sid) return;
  db().prepare("UPDATE sessoes SET revogado_em=? WHERE sid=? AND revogado_em IS NULL")
    .run(new Date().toISOString(), sid);
}

// Monta a string do cookie de sessao. Secure fica de fora em localhost (senao o
// navegador descarta o cookie em http durante testes); em producao (HTTPS) entra.
export function cookieSessao(sid, host = "") {
  const ehLocal = /^(localhost|127\.0\.0\.1)/.test(String(host));
  const partes = [
    `cx_sid=${sid}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${DIAS_VALIDADE * 86400}`,
  ];
  if (!ehLocal) partes.push("Secure");
  return partes.join("; ");
}

// Cookie do TOKEN de acesso (cx_tok), HttpOnly. E o primeiro passo pra tirar o
// token da URL: o servidor grava aqui e o front passa a ler daqui em vez do ?c=.
// Separado do cx_sid (sessao/single-login) de proposito: mexer no cx_sid quebra
// a troca de empresa da assessoria e a sessao unica.
export function cookieToken(token, host = "") {
  const ehLocal = /^(localhost|127\.0\.0\.1)/.test(String(host));
  const partes = [`cx_tok=${token}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${DIAS_VALIDADE * 86400}`];
  if (!ehLocal) partes.push("Secure");
  return partes.join("; ");
}

// Cookie que apaga a sessao no navegador (logout).
export function cookieLimpar(host = "") {
  const ehLocal = /^(localhost|127\.0\.0\.1)/.test(String(host));
  const partes = ["cx_sid=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (!ehLocal) partes.push("Secure");
  return partes.join("; ");
}

// Le um cookie do request (helper sem dependencia).
export function lerCookie(req, nome) {
  const raw = req.headers?.cookie || "";
  for (const par of raw.split(";")) {
    const i = par.indexOf("=");
    if (i < 0) continue;
    if (par.slice(0, i).trim() === nome) return decodeURIComponent(par.slice(i + 1).trim());
  }
  return "";
}
