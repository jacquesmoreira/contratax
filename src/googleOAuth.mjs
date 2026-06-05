// Login via Google OAuth 2.0 (Authorization Code Flow).
//
// Pre-requisitos no Google Cloud Console:
//   1. Criar projeto
//   2. APIs & Services > Credentials > Create OAuth client ID
//   3. Tipo: Web application
//   4. Authorized redirect URI: https://www.contratax.com.br/api/google/callback
//   5. Pegar CLIENT_ID e CLIENT_SECRET, configurar no Railway:
//        GOOGLE_CLIENT_ID
//        GOOGLE_CLIENT_SECRET
//
// Fluxo:
//   /api/google/iniciar?intencao=cadastro|entrar -> redireciona pro Google
//   Google redireciona de volta pra /api/google/callback?code=...&state=...
//   Backend troca code por token, busca dados do usuario, cria/loga conta.

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { criarPerfilGoogle } from "./cadastro.mjs";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
const REDIRECT_URI = `${BASE}/api/google/callback`;

export function googleConfigurado() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// URL pra qual o front redireciona quando o usuario clica em "Entrar com Google".
export function urlAutorizacao({ intencao = "entrar" } = {}) {
  if (!googleConfigurado()) throw new Error("Google OAuth nao configurado");
  const state = `${intencao}.${Math.random().toString(36).slice(2, 12)}`;
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}`, state };
}

// Troca o "code" recebido pelo access_token + dados do usuario.
async function trocarCodePorPerfil(code) {
  // 1) code -> token
  const formData = new URLSearchParams({
    code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
  });
  const r1 = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  if (!r1.ok) throw new Error(`google token ${r1.status}: ${(await r1.text()).slice(0,200)}`);
  const tok = await r1.json();
  // 2) token -> userinfo
  const r2 = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!r2.ok) throw new Error(`google userinfo ${r2.status}`);
  return await r2.json(); // { sub, email, name, picture, email_verified, ... }
}

// Localiza perfil existente pelo email. Se nao existir, cria um perfil "stub"
// com email + nome do Google e marca a conta como precisa-completar-cadastro.
async function localizarOuCriar(userInfo, intencao) {
  const email = String(userInfo.email || "").trim().toLowerCase();
  if (!email) throw new Error("Conta Google sem e-mail valido");

  const perfis = await lerPerfis();
  const existente = perfis.find((p) => String(p.email || "").trim().toLowerCase() === email);
  if (existente) {
    // Marca o google_sub para vincular logins futuros sem ambiguidade
    if (!existente.googleSub) {
      existente.googleSub = userInfo.sub;
      await salvarPerfis(perfis);
    }
    return { perfil: existente, isNovo: false };
  }

  if (intencao === "entrar") {
    // Cliente quis entrar mas nao tem conta - vamos criar mesmo assim
    // (mesmo comportamento da concorrencia: cadastro implicito via OAuth).
  }

  // Cria perfil minimo. Cliente vai completar CNPJ/ramo/UF apos o primeiro login.
  const stub = await criarPerfilGoogle({
    nome: userInfo.name || email.split("@")[0],
    email,
    googleSub: userInfo.sub,
  });
  // Recarrega o perfil completo (criarPerfilGoogle devolve so o resumo)
  const todos = await lerPerfis();
  const perfilNovo = todos.find((p) => p.token === stub.token);
  return { perfil: perfilNovo, isNovo: true };
}

// Chama no callback /api/google/callback?code=...&state=...
export async function processarCallback(code, state) {
  if (!code) throw new Error("code ausente no callback");
  const intencao = String(state || "").split(".")[0] || "entrar";
  const userInfo = await trocarCodePorPerfil(code);
  const { perfil, isNovo } = await localizarOuCriar(userInfo, intencao);
  return { perfil, isNovo, userInfo };
}
