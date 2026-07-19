// Reengajamento DIARIO dos leads que testaram e NAO assinaram (teste_expirado,
// nunca pagaram). Modelo "diario quente, depois afunila", escolhido pra manter a
// marca presente todo dia sem queimar a reputacao do dominio (que e compartilhada
// com os e-mails dos clientes pagantes):
//
//   Dias 1-14 apos expirar:  DIARIO   (intencao mais quente)
//   Dias 15-60:              SEMANAL
//   Dias 60+:                campanha encerrada pra este perfil (~2 meses no total,
//                             decisao do Jacques 19/07/2026; antes era mensal pra sempre)
//
// Cada e-mail sai no formato "Boletim" (mesmo chassi institucional do digest),
// lidera com os editais REAIS do ramo (FOMO concreto) e traz um muro "reative pra
// ver o veredito". Nao e "volta pfv" repetido, e valor diario.
//
// Protecoes obrigatorias pra volume diario:
//   - respeita _descadastrado (opt-out de 1 clique)
//   - nunca envia pra quem ja foi pago (_jaFoiPago)
//   - 1 e-mail por dia no maximo (_ultimoReengajamento) + gap por fase
//   - header List-Unsubscribe (via listaDescadastroUrl no enviar)
//
// Voz institucional: a ContrataX como empresa, nunca 1a pessoa/fundador.
// Roda 1x/dia dentro do digestLoop (horario controlado), junto do digest.

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { enviar, temEmailKey, boletimLayout } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { consultar } from "./db.mjs";
import { aplicarFiltro } from "./filtro.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function diasDesde(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso)) / 864e5);
}

const brl = (v) => (v == null ? "valor não informado" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
const dataBR = (iso) => { if (!iso) return "?"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("pt-BR"); };
const diasAte = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.ceil((d - new Date()) / 864e5); };
function prazoTxt(iso) {
  const d = diasAte(iso);
  if (d == null) return "";
  if (d < 0) return "encerrado";
  if (d === 0) return "encerra hoje";
  return `encerra em ${d} dia${d > 1 ? "s" : ""}`;
}
function valorTxt(soma) {
  return soma > 1e9 ? `R$ ${(soma/1e9).toFixed(1)} bilhões`
    : soma > 1e6 ? `R$ ${(soma/1e6).toFixed(1)} milhões`
    : `R$ ${Math.round(soma/1e3)} mil`;
}

function cardEdital(e) {
  const d = diasAte(e.encerramento);
  const cor = d != null && d <= 2 ? "#dc2626" : d != null && d <= 7 ? "#d97706" : "#059669";
  return `<tr><td style="padding:0 0 10px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:13px 15px;">
      <div style="font-size:12px;color:#64748b;font-weight:600;">${e.municipio ?? "?"}/${e.uf ?? "?"} · ${e.orgao ?? "Órgão público"}</div>
      <div style="font-size:14.5px;color:#0f172a;margin:6px 0;">${(e.objeto || "").slice(0, 120)}</div>
      <div style="font-size:13px;color:#475569;"><b style="color:#0f172a;">${brl(e.valorEstimado)}</b> &nbsp;·&nbsp; <span style="color:${cor};font-weight:700;">${prazoTxt(e.encerramento)}</span></div>
    </td></tr></table>
  </td></tr>`;
}

// Editais abertos do ramo do perfil. desdeIso: conta quantos foram publicados
// desde o ultimo reengajamento (pra o FOMO "X novos hoje"). exemplos: os 5 mais
// urgentes (menor prazo primeiro).
function editaisDoRamo(perfil, desdeIso = null) {
  const termos = perfil.filtro?.termos ?? [];
  const ufs = perfil.ufs ?? [];
  if (!termos.length) return { total: 0, soma: 0, exemplos: [], novos: 0 };
  const cand = consultar({ ufs, apenasAbertos: true });
  const casaram = aplicarFiltro(cand, { termos });
  const comValor = casaram.filter((e) => e.valorEstimado > 0);
  const soma = comValor.reduce((s, e) => s + (e.valorEstimado || 0), 0);
  const novos = desdeIso ? casaram.filter((e) => e.publicacao && e.publicacao >= desdeIso).length : casaram.length;
  const exemplos = [...casaram].sort((a, b) => (a.encerramento || "").localeCompare(b.encerramento || "")).slice(0, 5);
  return { total: casaram.length, soma, exemplos, novos };
}

// E-mail de reengajamento no formato Boletim (muro "reative pra ver o veredito").
export function gerarReengajamento(perfil, dados) {
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const ramo = (perfil.filtro?.termos ?? [])[0] || "seu ramo";
  const link = `${BASE}/assinar?c=${perfil.token}`;
  const temNovos = dados.novos > 0;
  const assunto = temNovos
    ? `${nome}, ${dados.novos.toLocaleString("pt-BR")} ${dados.novos === 1 ? "novo edital" : "novos editais"} de ${ramo} hoje`
    : `${nome}, ${dados.total.toLocaleString("pt-BR")} editais de ${ramo} abertos agora`;
  const vigenciaTexto = `Vigência da assinatura: <b>expirada em ${dataBR(perfil.assinatura?.expiraEm)}</b> (conta pausada)`;
  const intro = `<div style="font-size:14.5px;color:#334155;margin-bottom:14px;">Seu teste terminou, mas a ContrataX não parou de monitorar o <b>${ramo}</b>. ${temNovos ? `Hoje entraram <b>${dados.novos.toLocaleString("pt-BR")} ${dados.novos === 1 ? "novo edital" : "novos editais"}</b>` : `Agora há <b>${dados.total.toLocaleString("pt-BR")} editais abertos</b>`}${dados.soma > 0 ? `, somando <b>${valorTxt(dados.soma)}</b>` : ""}:</div>`;
  const cards = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 12px">${dados.exemplos.map(cardEdital).join("")}</table>`;
  const muro = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:13.5px;color:#92400e;line-height:1.5">🔒 O veredito de aptidão e os alertas diários estão pausados. Reative pra destravar e voltar a receber tudo isso no seu painel.</td></tr></table>`;
  const html = boletimLayout({ perfil, vigenciaTexto, intro, corpoHtml: cards + muro, ctaLink: link, ctaTexto: "Reativar e ver o veredito" });
  return { assunto, html };
}

// Fase da regua a partir dos dias apos expirar. Define o gap minimo entre envios.
// Campanha de 2 meses (decisao do Jacques, 19/07/2026): diario nas 2 primeiras
// semanas (intencao mais quente), semanal ate completar ~2 meses, depois PARA
// (retorna null). Antes disso continuava mensal pra sempre; a regua agora tem
// fim definido, sem heartbeat indefinido pra quem nao demonstrou interesse.
function faseGap(diasAposExpirar) {
  if (diasAposExpirar <= 14) return { nome: "quente", gap: 1 };   // diario
  if (diasAposExpirar <= 60) return { nome: "semanal", gap: 7 };  // semanal
  return null;                                                     // campanha encerrada
}

export async function disparosReengajamento({ log = console.log } = {}) {
  if (!temEmailKey()) {
    log("[reengajamento] RESEND_API_KEY ausente; pulando.");
    return 0;
  }
  const perfis = await lerPerfis();
  const hoje = new Date().toDateString();
  let enviados = 0, mexeu = false;

  for (const p of perfis) {
    try {
      if (!p.email) continue;
      if (p._descadastrado) continue;              // opt-out honrado
      if (p._jaFoiPago) continue;                  // respeita quem ja foi cliente
      if (statusAtual(p).status !== "teste_expirado") continue;
      if (p._ultimoReengajamento === hoje) continue; // no maximo 1/dia

      const diasAposExpirar = diasDesde(p.assinatura?.expiraEm);
      if (diasAposExpirar < 1) continue;

      // Afunilamento: respeita o gap minimo da fase (diario/semanal). Depois
      // de ~2 meses (faseGap devolve null), a campanha para pra este perfil.
      const faseInfo = faseGap(diasAposExpirar);
      if (!faseInfo) continue;
      const { nome: fase, gap } = faseInfo;
      const desdeUltimo = p._ultimoReengajamentoEm ? diasDesde(p._ultimoReengajamentoEm) : 9999;
      if (desdeUltimo < gap) continue;

      const dados = editaisDoRamo(p, p._ultimoReengajamentoEm || null);
      if (dados.total === 0) continue; // sem editais do ramo agora: nao manda vazio

      const { assunto, html } = gerarReengajamento(p, dados);
      await enviar({ para: p.email, assunto, html, listaDescadastroUrl: `${BASE}/descadastrar?c=${p.token}` });

      p._ultimoReengajamento = hoje;
      p._ultimoReengajamentoEm = new Date().toISOString();
      mexeu = true;
      enviados++;
      log(`[reengajamento] ${p.email}: enviado (fase ${fase}, ${diasAposExpirar}d apos expirar, ${dados.total} editais).`);
    } catch (e) {
      log(`[reengajamento] ${p.nome || p.id}: erro ${e.message}`);
    }
  }
  if (mexeu) await salvarPerfis(perfis);
  return enviados;
}

// Alias retrocompatibilidade: o nome antigo ainda e valido caso algo importe.
export { disparosReengajamento as disparosWinback };
