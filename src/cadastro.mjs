// Cadastro self-service: o proprio cliente cria o perfil de monitoramento dele.
// Gera um token de acesso, grava em perfis.json e ja roda o matching para o
// painel nascer cheio. Sem senha (acesso pelo link exclusivo com o token).

import { randomBytes } from "node:crypto";
import { monitorar } from "./monitor.mjs";
import { novaAssinaturaTeste } from "./assinatura.mjs";
import { hashSenha } from "./senha.mjs";
import { validarFormatoCNPJ, limparCNPJ } from "./cnpj.mjs";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";

const slug = (s) =>
  (s || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

// Cria um perfil a partir dos dados do formulario e devolve o link do painel.
// Cria um perfil "stub" via Google OAuth, sem exigir CNPJ/ramo/senha. O cliente
// e direcionado a /conta apos o primeiro login para completar o cadastro.
export async function criarPerfilGoogle({ nome, email, googleSub }) {
  if (!email || !/.+@.+\..+/.test(email)) throw new Error("E-mail invalido");
  const perfis = await lerPerfis();
  if (perfis.some((p) => (p.email || "").toLowerCase() === email.trim().toLowerCase())) {
    throw new Error("Ja existe uma conta com esse e-mail.");
  }
  const token = randomBytes(6).toString("hex");
  const id = `${slug(email.split("@")[0])}-${Date.now().toString(36)}`;
  const agora = new Date().toISOString();
  const nomeConta = (nome || email.split("@")[0]).trim();
  const perfil = {
    id,
    nome: nomeConta,
    razaoSocial: null,
    cnpj: "",
    email: email.trim(),
    senhaHash: null,
    googleSub: googleSub || null,
    precisaCompletarCadastro: true,
    token,
    usuarios: [{
      id: "u-" + id, nome: nomeConta, email: email.trim(),
      senhaHash: null, googleSub: googleSub || null, papel: "admin", criadoEm: agora,
    }],
    assentos: 1,
    analises: { mes: agora.slice(0, 7), usados: 0 },
    ufs: [],
    modalidades: [6, 8, 9, 4],
    filtro: { termos: [], termosExcluir: [], valorMin: null, valorMax: null },
    assinatura: novaAssinaturaTeste(),
  };
  perfis.push(perfil);
  await salvarPerfis(perfis);
  return { token, link: `/conta?c=${token}&completar=1`, nome: perfil.nome };
}

export async function criarPerfil({ nome, email, uf, ramo, modalidades, senha, cnpj, razaoSocial }) {
  if (!email || !/.+@.+\..+/.test(email)) throw new Error("E-mail invalido");
  if (!cnpj || !validarFormatoCNPJ(cnpj)) throw new Error("CNPJ invalido");
  if (!ramo || !ramo.trim()) throw new Error("Informe o ramo da empresa");
  if (!senha || senha.length < 6) throw new Error("A senha precisa de ao menos 6 caracteres");

  const cnpjLimpo = limparCNPJ(cnpj);
  const perfis = await lerPerfis();
  if (perfis.some((p) => (p.email || "").toLowerCase() === email.trim().toLowerCase())) {
    throw new Error("Ja existe uma conta com esse e-mail. Use a pagina de Entrar.");
  }
  if (perfis.some((p) => limparCNPJ(p.cnpj || "") === cnpjLimpo)) {
    throw new Error("Ja existe uma conta com este CNPJ. Peca acesso ao administrador da conta.");
  }

  const termos = ramo.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  if (!termos.length) throw new Error("Informe ao menos uma palavra do seu ramo");
  const token = randomBytes(6).toString("hex");
  const id = `${slug(email.split("@")[0])}-${Date.now().toString(36)}`;
  const agora = new Date().toISOString();
  const nomeConta = (nome || razaoSocial || email.split("@")[0]).trim();
  const senhaHash = hashSenha(senha);

  // Aceita uf como string simples ou array de UFs (multi-estado).
  const ufsArr = Array.isArray(uf) ? uf.filter(Boolean) : (uf ? [uf] : []);

  const perfil = {
    id,
    nome: nomeConta,
    razaoSocial: razaoSocial || null,
    cnpj: cnpjLimpo,
    email: email.trim(),
    senhaHash,
    token,
    // Equipe: o criador e o admin. Plano base = 1 acesso (assento).
    usuarios: [{
      id: "u-" + id,
      nome: nomeConta,
      email: email.trim(),
      senhaHash,
      papel: "admin",
      criadoEm: agora,
    }],
    assentos: 1,
    // Cota de analises de IA do mes (buscas nao contam).
    analises: { mes: agora.slice(0, 7), usados: 0 },
    ufs: ufsArr,
    modalidades: modalidades?.length ? modalidades : [6, 8, 9, 4],
    filtro: { termos, termosExcluir: [], valorMin: null, valorMax: null },
    assinatura: novaAssinaturaTeste(),
  };

  perfis.push(perfil);
  await salvarPerfis(perfis);

  // Matching imediato (le do banco, instantaneo) para o painel ja ter conteudo.
  const { filtrados } = await monitorar(perfil);

  return { token, link: `/painel?c=${token}`, total: filtrados.length, nome: perfil.nome };
}
