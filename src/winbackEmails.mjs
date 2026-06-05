// Sequencia de WIN-BACK (reativacao) para leads que testaram e NAO assinaram.
//
// Lead que terminou o teste sem converter e o mais quente que existe: ja viu o
// produto, ja entendeu o valor. Abandona-lo e desperdicio. Esta sequencia traz
// ele de volta com 3 e-mails apos a expiracao do teste, cada um com angulo
// diferente e dado REAL do ramo da pessoa (o jaw-drop do que ele esta perdendo).
//
//   Win-back 1 (2 dias apos expirar): FOMO concreto - "essa semana abriram X
//     editais do seu ramo, somando R$ Y. Sem a conta ativa, voce nao ve."
//   Win-back 2 (9 dias apos expirar): a conta da viabilidade por outro angulo -
//     o custo de NAO monitorar (1 contrato perdido > 1 ano de assinatura).
//   Win-back 3 (21 dias apos expirar): ultima chamada, sem pressao - a conta
//     fica preservada, voltar e 1 clique.
//
// Cada perfil recebe cada e-mail UMA VEZ (marca _winbackEmail1Em, etc).
// Roda no atualizarLoop junto com o onboarding.

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { consultar } from "./db.mjs";
import { aplicarFiltro } from "./filtro.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function diasDesde(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso)) / 864e5);
}

function header() {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;font-family:Inter,sans-serif">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px">
        <tr><td style="background:linear-gradient(135deg,#312e81,#2563eb);border-radius:16px 16px 0 0;padding:24px 28px 22px">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:#fff;border-radius:9px;padding:7px 11px">
              <img src="${BASE}/logo-horizontal.png" alt="ContrataX" height="22" style="display:block;height:22px;width:auto;border:0" />
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;padding:28px 30px;color:#0f172a;font-size:15px;line-height:1.65">`;
}

function footer() {
  return `</td></tr>
        <tr><td style="background:#f1f5f9;border-radius:0 0 16px 16px;padding:18px 28px;text-align:center;color:#64748b;font-size:12px">
          ContrataX, gestão inteligente de licitações. Você recebe este e-mail porque criou uma conta em <a href="${BASE}" style="color:#475569">contratax.com.br</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

function botao(link, texto) {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr>
    <td style="background:#4338ca;border-radius:11px;padding:14px 28px">
      <a href="${link}" style="color:#fff;font-weight:800;text-decoration:none;font-size:15px">${texto}</a>
    </td></tr></table>`;
}

function valorTxt(soma) {
  return soma > 1e9 ? `R$ ${(soma/1e9).toFixed(1)} bilhões`
    : soma > 1e6 ? `R$ ${(soma/1e6).toFixed(1)} milhões`
    : `R$ ${Math.round(soma/1e3)} mil`;
}

// Conta editais abertos do ramo do perfil (dado real pro jaw-drop).
function editaisDoRamo(perfil) {
  const termos = perfil.filtro?.termos ?? [];
  const ufs = perfil.ufs ?? [];
  if (!termos.length) return { total: 0, soma: 0, exemplos: [] };
  const cand = consultar({ ufs, apenasAbertos: true });
  const casaram = aplicarFiltro(cand, { termos });
  const comValor = casaram.filter((e) => e.valorEstimado > 0);
  const soma = comValor.reduce((s, e) => s + (e.valorEstimado || 0), 0);
  return { total: casaram.length, soma, exemplos: casaram.slice(0, 3) };
}

// Win-back 1 (2 dias apos expirar): FOMO concreto com dado real
function winback1(perfil, dados) {
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const ramo = (perfil.filtro?.termos ?? [])[0] || "seu ramo";
  const link = `${BASE}/assinar?c=${perfil.token}`;
  const exemplos = dados.exemplos.map((e) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#0f172a">${e.objeto ? e.objeto.slice(0, 80) : "Licitação"}${e.orgao ? `<br><span style="color:#64748b;font-size:12.5px">${e.orgao}</span>` : ""}</td></tr>`
  ).join("");
  return {
    assunto: `${nome}, abriram ${dados.total} licitações de ${ramo} desde que seu teste acabou`,
    html: header() + `
      <h2 style="font-size:21px;font-weight:800;margin-bottom:12px">O mundo não parou quando seu teste acabou</h2>
      <p style="margin-bottom:14px">Nos últimos dias, abriram <b>${dados.total.toLocaleString("pt-BR")} licitações</b> no segmento <b>${ramo}</b>${dados.soma > 0 ? `, somando <b>${valorTxt(dados.soma)}</b> em oportunidades` : ""}. Com a conta ativa, elas chegariam no seu painel e no seu e-mail, já com o veredito de aptidão.</p>
      ${exemplos ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">${exemplos}</table>` : ""}
      <p style="margin-bottom:14px">Reativar leva 1 minuto e você volta a ver tudo isso organizado.</p>
      ${botao(link, "Reativar minha conta →")}
      <p style="font-size:13.5px;color:#475569;margin-top:18px">Sua conta e seus dados continuam salvos. É só escolher um plano pra destravar.</p>
    ` + footer(),
  };
}

// Win-back 2 (9 dias apos expirar): o custo de NAO monitorar
function winback2(perfil) {
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const link = `${BASE}/assinar?c=${perfil.token}`;
  return {
    assunto: `${nome}, a conta que vale a pena fazer antes de desistir`,
    html: header() + `
      <h2 style="font-size:21px;font-weight:800;margin-bottom:12px">Quanto custa NÃO acompanhar</h2>
      <p style="margin-bottom:14px">A assinatura é R$ 197/mês. Parece um custo. Mas pense no outro lado: um único contrato público que você não viu a tempo vale, em média, vários meses de assinatura.</p>
      <p style="margin-bottom:14px"><b>A conta real:</b><br>
      Um contrato pequeno de R$ 4.000 paga 20 meses do plano. Conferir editais na mão consome 1 a 2 horas por dia. O ContrataX faz isso em minutos, todo dia, e ainda lê cada edital e confere sua aptidão.</p>
      <p style="margin-bottom:14px">Não é sobre gastar R$ 197. É sobre não perder o próximo contrato por falta de tempo de garimpar.</p>
      ${botao(link, "Ver os planos →")}
      <p style="font-size:13.5px;color:#475569;margin-top:18px">Sem fidelidade. Você cancela quando quiser, no próprio painel.</p>
    ` + footer(),
  };
}

// Win-back 3 (21 dias apos expirar): ultima chamada, sem pressao
function winback3(perfil, dados) {
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const ramo = (perfil.filtro?.termos ?? [])[0] || "seu ramo";
  const link = `${BASE}/assinar?c=${perfil.token}`;
  return {
    assunto: `${nome}, último aviso sobre sua conta no ContrataX`,
    html: header() + `
      <h2 style="font-size:21px;font-weight:800;margin-bottom:12px">Vou parar de te escrever</h2>
      <p style="margin-bottom:14px">Este é o último e-mail da sequência. Não quero encher sua caixa de entrada.</p>
      <p style="margin-bottom:14px">Sua conta segue salva, com o ramo <b>${ramo}</b> e os estados que você configurou. Se um dia quiser voltar a monitorar as licitações do seu segmento sem garimpar na mão, é só reativar, leva 1 minuto.</p>
      ${dados.total > 0 ? `<p style="margin-bottom:14px">Pra referência: tem <b>${dados.total.toLocaleString("pt-BR")} licitações</b> do seu ramo abertas agora mesmo.</p>` : ""}
      ${botao(link, "Reativar quando quiser →")}
      <p style="font-size:13.5px;color:#475569;margin-top:18px">Obrigado por ter testado o ContrataX. Sucesso nas suas próximas disputas.</p>
    ` + footer(),
  };
}

export async function disparosWinback({ log = console.log } = {}) {
  if (!temEmailKey()) {
    log("[winback] RESEND_API_KEY ausente; pulando.");
    return 0;
  }
  const perfis = await lerPerfis();
  let enviados = 0, mexeu = false;

  for (const p of perfis) {
    try {
      if (!p.email) continue;
      const st = statusAtual(p);
      // So reativa quem terminou o teste sem converter.
      if (st.status !== "teste_expirado") continue;
      // Nunca enviar pra quem ja foi cliente pago algum dia (respeita quem cancelou).
      if (p._jaFoiPago) continue;

      const diasAposExpirar = diasDesde(p.assinatura?.expiraEm);
      if (diasAposExpirar < 2) continue;

      let msg = null;
      if (diasAposExpirar >= 2 && !p._winbackEmail1Em) {
        msg = { i: 1, ...winback1(p, editaisDoRamo(p)) };
      } else if (diasAposExpirar >= 9 && !p._winbackEmail2Em) {
        msg = { i: 2, ...winback2(p) };
      } else if (diasAposExpirar >= 21 && !p._winbackEmail3Em) {
        msg = { i: 3, ...winback3(p, editaisDoRamo(p)) };
      }
      if (!msg) continue;

      await enviar({ para: p.email, assunto: msg.assunto, html: msg.html });
      p[`_winbackEmail${msg.i}Em`] = new Date().toISOString();
      mexeu = true;
      enviados++;
      log(`[winback] enviado E-mail ${msg.i} para ${p.email} (${diasAposExpirar}d apos expirar)`);
    } catch (e) {
      log(`[winback] ${p.nome || p.id}: erro ${e.message}`);
    }
  }
  if (mexeu) await salvarPerfis(perfis);
  return enviados;
}
