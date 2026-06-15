// Cadastro self-service: o proprio cliente cria o perfil de monitoramento dele.
// Gera um token de acesso, grava em perfis.json e ja roda o matching para o
// painel nascer cheio. Sem senha (acesso pelo link exclusivo com o token).

import { randomBytes } from "node:crypto";
import { monitorar } from "./monitor.mjs";
import { novaAssinaturaTeste } from "./assinatura.mjs";
import { hashSenha } from "./senha.mjs";
import { validarFormatoCNPJ, limparCNPJ, consultarCNPJ } from "./cnpj.mjs";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { expandirRamo } from "./expandirRamo.mjs";

const slug = (s) =>
  (s || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

// Separa a string de ramos em termos. Aceita virgula, ponto-e-virgula, bullet
// (• e ·), barra vertical e quebra de linha. Antes so quebrava em virgula, e
// quem colava uma lista com bullets (•) virava 1 termo gigante: a trava nao
// pegava, o painel nao colapsava e o filtro nao casava. Separador unico aqui.
export const SEP_RAMOS = /[,;•·|\n\r]+/;
export function parseRamos(str) {
  return String(str || "").split(SEP_RAMOS).map((t) => t.trim()).filter(Boolean);
}

// Teto rigido de ramos por perfil. Acima disso, a curadoria perde sentido
// (recebe quase todo edital da UF). Exportado pra UI usar o mesmo numero.
export const MAX_TERMOS = Number(process.env.LICITA_MAX_TERMOS || 50);
// A partir daqui a UI mostra aviso educativo (sem bloquear) que muitos ramos
// reduzem a precisao do filtro.
export const AVISO_TERMOS = Number(process.env.LICITA_AVISO_TERMOS || 15);

// Cria um perfil a partir dos dados do formulario e devolve o link do painel.
// Cria um perfil "stub" via Google OAuth, sem exigir CNPJ/ramo/senha. O cliente
// e direcionado a /conta apos o primeiro login para completar o cadastro.
export async function criarPerfilGoogle({ nome, email, googleSub }) {
  if (!email || !/.+@.+\..+/.test(email)) throw new Error("E-mail invalido");
  const perfis = await lerPerfis();
  if (perfis.some((p) => (p.email || "").toLowerCase() === email.trim().toLowerCase())) {
    throw new Error("Ja existe uma conta com esse e-mail.");
  }
  const token = randomBytes(16).toString("hex");
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

export async function criarPerfil({ nome, email, uf, ramo, modalidades, senha, cnpj, razaoSocial, aceiteTermos, ip }) {
  if (!email || !/.+@.+\..+/.test(email)) throw new Error("E-mail invalido");
  if (!cnpj || !validarFormatoCNPJ(cnpj)) throw new Error("CNPJ invalido");
  if (!ramo || !ramo.trim()) throw new Error("Informe o ramo da empresa");
  if (!senha || senha.length < 6) throw new Error("A senha precisa de ao menos 6 caracteres");
  // Clickwrap: o aceite explicito dos termos e obrigatorio. Sem ele, nao cria
  // perfil. Protege juridicamente contra alegacao de "nao concordei".
  if (!aceiteTermos || !aceiteTermos.em || !aceiteTermos.versao) {
    throw new Error("Voce precisa aceitar os Termos de Uso e a Politica de Privacidade.");
  }

  const cnpjLimpo = limparCNPJ(cnpj);
  const perfis = await lerPerfis();
  if (perfis.some((p) => (p.email || "").toLowerCase() === email.trim().toLowerCase())) {
    throw new Error("Ja existe uma conta com esse e-mail. Use a pagina de Entrar.");
  }
  if (perfis.some((p) => limparCNPJ(p.cnpj || "") === cnpjLimpo)) {
    throw new Error("Ja existe uma conta com este CNPJ. Peca acesso ao administrador da conta.");
  }

  // So aceita empresa ATIVA na Receita. Empresa baixada/inapta/suspensa nao pode
  // participar de licitacao, entao monitorar nao faz sentido. Bloqueia apenas
  // quando a Receita CONFIRMA que nao esta ativa (se a consulta falhar, deixa
  // passar pra nao punir cadastro legitimo por instabilidade da API).
  try {
    const consulta = await consultarCNPJ(cnpjLimpo);
    if (consulta.ativa === false) {
      throw new Error(`Este CNPJ consta como "${consulta.situacao}" na Receita. Para participar de licitacoes, a empresa precisa estar com situacao cadastral ativa.`);
    }
    if (!razaoSocial && consulta.razaoSocial) razaoSocial = consulta.razaoSocial;
  } catch (e) {
    // Se o erro veio da nossa validacao (ativa === false), propaga. Se foi
    // falha de rede/parse, ignora e segue (best-effort).
    if (/situacao cadastral ativa/.test(e.message)) throw e;
  }

  const termos = parseRamos(ramo);
  if (!termos.length) throw new Error("Informe ao menos uma palavra do seu ramo");
  // Teto rigido de ramos: selecionar tudo destroi a curadoria (o cliente recebe
  // praticamente todo edital da UF e acha que o filtro nao funciona = churn).
  // 50 e folgado pra qualquer empresa real; acima disso e "marquei tudo".
  if (termos.length > MAX_TERMOS) {
    throw new Error(`Selecione no maximo ${MAX_TERMOS} ramos. Foque no que sua empresa realmente vende para receber so o que importa.`);
  }
  const token = randomBytes(16).toString("hex");
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
    filtro: { termos, termosIA: await expandirRamo(termos), termosExcluir: [], valorMin: null, valorMax: null },
    assinatura: novaAssinaturaTeste(),
    // Registro do clickwrap (prova juridica do consentimento). IP capturado
    // pelo servidor (mais confiavel que client-side).
    aceiteTermos: {
      em: aceiteTermos.em,
      versao: aceiteTermos.versao,
      ip: ip || null,
      userAgent: (aceiteTermos.userAgent || "").slice(0, 200),
    },
  };

  perfis.push(perfil);
  await salvarPerfis(perfis);

  // Matching imediato (le do banco, instantaneo) para o painel ja ter conteudo.
  const { filtrados } = await monitorar(perfil);

  return { token, link: `/painel?c=${token}`, total: filtrados.length, nome: perfil.nome };
}
