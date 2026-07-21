// Tratamento de BOUNCE de e-mail (mensagem que voltou).
//
// POR QUE EXISTE: ate 20/07/2026 o sistema nao sabia quando um e-mail voltava.
// Um cliente PAGANTE podia ficar semanas sem receber alerta nenhum e ninguem
// descobria, nem ele nem nos. Foi exatamente o que aconteceu: o Marcelo abriu
// chamado dizendo que nao recebia alertas, e o e-mail dele estava voltando ha
// dias (caixa cheia, bounce "Transient/General" do Gmail).
//
// COMO FUNCIONA: o bounce nao acontece no momento do envio (a API do Resend
// responde 200 e o provedor de destino devolve depois, de forma assincrona).
// Por isso o unico jeito de saber e o WEBHOOK do Resend, que chama
// POST /api/webhook/resend com o evento email.bounced.
//
// O QUE FAZEMOS COM O EVENTO:
//   1. Registra no perfil do cliente (_emailBounce) pra o painel dele avisar.
//   2. Alerta o admin por e-mail, com prioridade quando e cliente PAGANTE.
//
// TIPOS DE BOUNCE (classificacao do Resend/SES):
//   Permanent  = endereco invalido/inexistente. Nao adianta insistir.
//   Transient  = falha temporaria (caixa cheia, servidor fora). Pode voltar a
//                funcionar sozinho, entao NAO desativamos o envio.
//   Undetermined = provedor nao explicou.

import { lerPerfis, atualizarPerfil } from "./perfis.mjs";
import { statusAtual } from "./assinatura.mjs";

const ADMIN_EMAIL = process.env.LICITA_BACKUP_EMAIL || "licitacontratax@gmail.com";
const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

// Throttle do alerta ao admin: no maximo 1 por endereco a cada 12h. Sem isso,
// um cliente com caixa cheia gera um alerta por e-mail que tentamos enviar
// (digest + onboarding + recibo...), virando spam pro proprio admin.
const _ultimoAviso = new Map();
const JANELA_AVISO_MS = 12 * 3600 * 1000;

function podeAvisar(email) {
  const agora = Date.now();
  const ultimo = _ultimoAviso.get(email) || 0;
  if (agora - ultimo < JANELA_AVISO_MS) return false;
  _ultimoAviso.set(email, agora);
  return true;
}

function htmlAviso({ email, tipo, subtipo, perfil, pagante, assunto }) {
  const quem = perfil
    ? `${perfil.razaoSocial || perfil.nome || "cliente"} (${pagante ? "PAGANTE" : "em teste"})`
    : "endereco sem conta vinculada (provavelmente campanha fria)";
  const permanente = String(tipo).toLowerCase() === "permanent";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:26px 22px;color:#0f172a">
    <div style="background:${permanente ? "#b91c1c" : "#b45309"};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;font-weight:800;letter-spacing:.5px">E-MAIL VOLTOU (BOUNCE)</div>
      <div style="font-size:19px;font-weight:800;margin-top:3px">${email}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:18px 20px;font-size:14px;line-height:1.65">
      <p style="margin:0 0 12px"><b>Quem:</b> ${quem}</p>
      <p style="margin:0 0 12px"><b>Tipo:</b> ${tipo || "?"} / ${subtipo || "?"}</p>
      ${assunto ? `<p style="margin:0 0 12px"><b>Assunto que voltou:</b> ${assunto}</p>` : ""}
      <p style="margin:0 0 12px">${permanente
        ? "Bounce <b>permanente</b>: o endereco provavelmente nao existe ou foi desativado. Confirme o e-mail correto com o cliente, nao adianta reenviar."
        : "Bounce <b>temporario</b>: costuma ser caixa cheia ou instabilidade do provedor. Pode voltar sozinho, mas se repetir vale falar com o cliente."}</p>
      ${perfil ? `<p style="margin:14px 0 0"><a href="${BASE}/admin?c=${encodeURIComponent(process.env.LICITA_ADMIN_TOKEN || "")}" style="background:#4338ca;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:9px;display:inline-block">Abrir o painel admin</a></p>` : ""}
    </div>
  </div>`;
}

// Evento email.delivered: se o e-mail do cliente VOLTOU a ser entregue, o aviso
// no painel dele nao faz mais sentido e some sozinho.
//
// CUIDADO COM A ORDEM: o bounce real observado em 20/07/2026 foi
// "Sent -> Delivered -> Bounced" (o Gmail aceitou e devolveu depois). Ou seja,
// UM EVENTO DE ENTREGA PODE SER MAIS VELHO QUE O BOUNCE. Se limpassemos em
// qualquer entrega, esse delivered (ou um evento reentregue fora de ordem pelo
// Resend) apagaria um aviso que ainda vale. Por isso so limpa quando a entrega
// e comprovadamente MAIS NOVA que o bounce registrado.
export async function registrarEntrega({ email, em, log = console.log } = {}) {
  const alvo = (email || "").trim().toLowerCase();
  if (!alvo) return { ok: false, motivo: "sem-email" };

  let perfil = null;
  try {
    const perfis = await lerPerfis();
    perfil = perfis.find((p) => (p.email || "").trim().toLowerCase() === alvo) || null;
  } catch (e) {
    log(`[bounce] entrega: falha ao ler perfis: ${e.message}`);
    return { ok: false };
  }
  if (!perfil?._emailBounce) return { ok: true, semAviso: true };

  const entregueEm = em ? new Date(em).getTime() : Date.now();
  const bounceEm = new Date(perfil._emailBounce.em).getTime();
  if (!(entregueEm > bounceEm)) {
    log(`[bounce] entrega de ${alvo} e anterior ao bounce; mantendo o aviso.`);
    return { ok: true, ignorado: true };
  }

  try {
    await atualizarPerfil(perfil.token, (p) => { delete p._emailBounce; });
    _ultimoAviso.delete(alvo); // libera o throttle: se voltar a falhar, avisa de novo
    log(`[bounce] ${alvo} voltou a receber; aviso do painel removido.`);
  } catch (e) {
    log(`[bounce] falha ao limpar aviso: ${e.message}`);
  }
  return { ok: true, limpo: true };
}

// Processa UM evento de bounce. Best-effort: nunca lanca (quem chama e um
// webhook; falhar ali so faria o Resend reenviar o evento sem necessidade).
export async function registrarBounce({ email, tipo, subtipo, assunto, em, log = console.log } = {}) {
  const alvo = (email || "").trim().toLowerCase();
  if (!alvo) return { ok: false, motivo: "sem-email" };

  let perfil = null;
  let pagante = false;
  try {
    const perfis = await lerPerfis();
    perfil = perfis.find((p) => (p.email || "").trim().toLowerCase() === alvo) || null;
    if (perfil) pagante = statusAtual(perfil).status === "ativo";
  } catch (e) {
    log(`[bounce] falha ao ler perfis: ${e.message}`);
  }

  // Marca no perfil pra o painel do cliente avisar que o e-mail dele nao chega.
  if (perfil) {
    try {
      await atualizarPerfil(perfil.token, (p) => {
        p._emailBounce = {
          // Data do EVENTO (nao do processamento): e o que a comparacao em
          // registrarEntrega usa pra decidir se a entrega e mais nova.
          em: em ? new Date(em).toISOString() : new Date().toISOString(),
          tipo: tipo || null,
          subtipo: subtipo || null,
          total: ((p._emailBounce?.total) || 0) + 1,
        };
      });
    } catch (e) {
      log(`[bounce] falha ao marcar perfil: ${e.message}`);
    }
  }

  log(`[bounce] ${alvo} (${tipo || "?"}/${subtipo || "?"})${perfil ? ` — conta: ${perfil.nome}${pagante ? " PAGANTE" : ""}` : " — sem conta vinculada"}`);

  // Alerta o admin. Endereco de campanha fria (sem conta) nao gera alerta: numa
  // lista de milhares, bounce e rotina e viraria spam no e-mail do admin.
  if (!perfil) return { ok: true, perfil: false };
  if (!podeAvisar(alvo)) return { ok: true, avisoThrottled: true };

  try {
    const { enviar, temEmailKey } = await import("./email.mjs");
    if (!temEmailKey()) return { ok: true, semChave: true };
    await enviar({
      para: ADMIN_EMAIL,
      assunto: `[ContrataX] ${pagante ? "🔴 PAGANTE" : "⚠"} e-mail voltou: ${alvo}`,
      html: htmlAviso({ email: alvo, tipo, subtipo, perfil, pagante, assunto }),
    });
  } catch (e) {
    log(`[bounce] falha ao avisar admin: ${e.message}`);
  }
  return { ok: true, perfil: true, pagante };
}
