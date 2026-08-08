// Feedback de SAIDA (churn): quando um teste expira sem virar pagante, manda UMA
// vez um e-mail de 1 clique perguntando "o que faltou?". Motivo (08/08/2026):
// ~1 trial/dia entra pelo organico e quase ninguem fecha, e a gente vinha
// INFERINDO o porque (layout, relevancia, preco) sem NUNCA perguntar. Cada
// expirado que responde vira um dado sobre a objecao real, pra consertar o que e
// de verdade em vez de chutar. Async, 1 clique, sem ligacao/demo (respeita o
// modelo do Jacques). So roda com LICITA_DIGEST=1 (junto do reengajamento).

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";
import { lerPerfis, salvarPerfis, atualizarPerfil } from "./perfis.mjs";
import { statusAtual } from "./assinatura.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
const ARQ = resolve(DATA_DIR, "feedback-saida.json");

// As objecoes possiveis. A chave vai na URL (?r=), o label aparece pro Jacques.
// Cada uma aponta pra uma acao diferente: sem_editais -> relevancia/SEO;
// sem_valor -> produto/demonstracao; preco -> pricing; avaliando -> nurture.
export const RAZOES = {
  sem_editais: "Não encontrei licitações do meu ramo",
  sem_valor: "Encontrei, mas não vi valor suficiente pra assinar",
  preco: "O preço não cabe pra mim agora",
  avaliando: "Ainda estava avaliando / faltou tempo",
  outro: "Outro motivo",
};

async function lerJson() {
  try { return JSON.parse(await readFile(ARQ, "utf8")); } catch { return {}; }
}
// Escrita atomica (tmp + rename), mesmo cuidado do store.mjs pra nao truncar.
async function gravarJson(obj) {
  await mkdir(dirname(ARQ), { recursive: true });
  const tmp = `${ARQ}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await rename(tmp, ARQ);
}

// Registra a resposta de um cliente (chamado pelo clique no e-mail). Idempotente:
// a 1a resposta vale; cliques repetidos so atualizam a data. Guarda ramo/nome pra
// dar contexto no admin sem cruzar tabela depois.
export async function registrarFeedbackSaida(token, razao, texto = "") {
  if (!token || !RAZOES[razao]) return { ok: false };
  let nome = null, email = null, ramo = null;
  try {
    const perfis = await lerPerfis();
    const p = perfis.find((x) => x.token === token);
    if (p) { nome = p.razaoSocial || p.nome || null; email = p.email || null; ramo = (p.filtro?.termos ?? []).join(", ") || null; }
  } catch {}
  const tudo = await lerJson();
  const jaTinha = tudo[token];
  tudo[token] = {
    razao,
    label: RAZOES[razao],
    texto: String(texto || "").slice(0, 500) || (jaTinha?.texto ?? ""),
    nome, email, ramo,
    em: jaTinha?.em || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
  await gravarJson(tudo);
  return { ok: true, label: RAZOES[razao] };
}

// Agregado pro admin: quantos responderam cada objecao + a lista.
export async function listarFeedbackSaida() {
  const tudo = await lerJson();
  const itens = Object.values(tudo).sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));
  const porRazao = {};
  for (const k of Object.keys(RAZOES)) porRazao[k] = 0;
  for (const it of itens) if (porRazao[it.razao] != null) porRazao[it.razao]++;
  return { total: itens.length, porRazao, itens };
}

const botao = (token, cod, label) =>
  `<tr><td style="padding:5px 0"><a href="${BASE}/feedback-saida?c=${encodeURIComponent(token)}&r=${cod}" style="display:block;background:#fff;border:1.5px solid #c7d2fe;color:#312e81;text-decoration:none;font-weight:700;font-size:14.5px;padding:13px 16px;border-radius:11px">${label}</a></td></tr>`;

// O e-mail de 1 clique. Curto de proposito: quanto menos atrito, mais resposta.
export function gerarEmailSaida(perfil) {
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const botoes = Object.entries(RAZOES).map(([cod, label]) => botao(perfil.token, cod, label)).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#0f172a;font-size:15px;line-height:1.6">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 12px">${nome}, posso te fazer 1 pergunta rápida?</h2>
    <p style="margin:0 0 8px">Seu teste no ContrataX terminou, e a gente não vai te encher de e-mail. Só queria entender uma coisa, e é <b>1 clique</b>, sem formulário:</p>
    <p style="margin:0 0 14px;font-weight:800;font-size:16px">O que faltou pra você continuar?</p>
    <table width="100%" cellpadding="0" cellspacing="0">${botoes}</table>
    <p style="font-size:13px;color:#475569;margin:16px 0 0">Sua resposta ajuda demais a melhorar a plataforma pra empresas como a sua. Obrigado de verdade.</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:22px">ContrataX · dados oficiais do PNCP · <a href="mailto:contato@contratax.com.br" style="color:#94a3b8">contato@contratax.com.br</a></p>
  </div>`;
  return { assunto: `${nome}, posso te fazer 1 pergunta rápida?`, html };
}

// Passada diaria: manda o feedback pra quem expirou e ainda nao recebeu. UMA vez
// por perfil (marca _feedbackSaidaEnviadoEm). Marca tambem _ultimoReengajamento =
// hoje, pra o winback do MESMO dia pular esse perfil (nao mandar 2 e-mails juntos).
// Cap por rodada pra nao estourar a cota diaria do Resend na primeira execucao
// (que pega o backlog inteiro de expirados de uma vez).
export async function disparosFeedbackSaida({ log = console.log, max = 20 } = {}) {
  if (!temEmailKey()) { log("[feedback-saida] RESEND_API_KEY ausente; pulando."); return 0; }
  const perfis = await lerPerfis();
  const hoje = new Date().toDateString();
  let enviados = 0, mexeu = false;
  for (const p of perfis) {
    if (enviados >= max) break;
    try {
      if (!p.email) continue;
      if (p._descadastrado) continue;
      if (p._jaFoiPago) continue;
      if (p._feedbackSaidaEnviadoEm) continue;      // ja perguntamos uma vez
      if (statusAtual(p).status !== "teste_expirado") continue;

      const { assunto, html } = gerarEmailSaida(p);
      await enviar({ para: p.email, assunto, html, listaDescadastroUrl: `${BASE}/descadastrar?c=${p.token}` });
      p._feedbackSaidaEnviadoEm = new Date().toISOString();
      p._ultimoReengajamento = hoje; // winback pula hoje, evita 2 e-mails no mesmo dia
      mexeu = true;
      enviados++;
      log(`[feedback-saida] ${p.email}: pergunta de saida enviada.`);
    } catch (e) {
      log(`[feedback-saida] ${p.nome || p.id}: erro ${e.message}`);
    }
  }
  if (mexeu) await salvarPerfis(perfis);
  if (enviados) log(`[feedback-saida] ${enviados} pergunta(s) de saida enviada(s).`);
  return enviados;
}
