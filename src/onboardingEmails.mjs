// Sequencia de onboarding tecnico: 3 e-mails nos primeiros 7 dias do cadastro
// para AUMENTAR ATIVACAO (metrica core de SaaS).
//
// Diferente do digest diario, isso eh uma sequencia fixa que dispara uma vez:
//   E-mail 1 (dia 1): "Bem-vindo. Proximo passo: cadastrar suas certidoes"
//   E-mail 2 (dia 3): "Veja sua 1a licitacao do ramo e o veredito"
//   E-mail 3 (dia 6): "Ja viu R$ X em editais abertos. Falta pouco pro fim do teste"
//
// Cada perfil recebe cada e-mail UMA VEZ (marca em _onboardEmail1Em, etc).
//
// Ativacao: roda dentro do atualizarLoop (a cada 6h) — checa todos perfis em
// teste e dispara o que estiver no prazo.

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { enviar, temEmailKey } from "./email.mjs";
import { statusAtual } from "./assinatura.mjs";
import { consultar } from "./db.mjs";
import { aplicarFiltro } from "./filtro.mjs";

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function diasDesde(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  return Math.floor((Date.now() - d) / 864e5);
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
        <tr><td style="background:#f1f5f9;border-radius:0 0 16px 16px;padding:18px 28px;text-align:center;color:#94a3b8;font-size:12px">
          ContrataX, gestão inteligente de licitações. Você recebe este e-mail porque criou uma conta em <a href="${BASE}" style="color:#475569">contratax.com.br</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// E-mail 1 (dia 1): boas-vindas + chama pra cadastrar certidoes
export function email1(perfil) {
  const link = `${BASE}/documentos?c=${perfil.token}`;
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  return {
    assunto: "Bem-vindo ao ContrataX. Próximo passo: 5 minutos pra liberar a conferência de aptidão",
    html: header() + `
      <h2 style="font-size:21px;font-weight:800;margin-bottom:12px;color:#0f172a">Olá, ${nome}</h2>
      <p style="margin-bottom:14px">Sua conta no ContrataX está ativa. Agora cabe um passo simples que destrava o principal recurso da plataforma.</p>
      <p style="margin-bottom:14px"><b>Cadastre as datas de validade das suas certidões.</b> A partir disso, o sistema consegue ler cada edital e te dizer, na hora, se você está apto a participar ou o que falta resolver. E você recebe alerta automático 30, 15, 7 e 3 dias antes de cada certidão vencer.</p>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr>
        <td style="background:#4338ca;border-radius:11px;padding:14px 28px">
          <a href="${link}" style="color:#fff;font-weight:800;text-decoration:none;font-size:15px">Cadastrar minhas certidões →</a>
        </td>
      </tr></table>
      <p style="font-size:13.5px;color:#475569;margin-top:18px">Leva 5 minutos. As principais são: Federal Conjunta, FGTS, CNDT, Estadual e Municipal. Se não tiver alguma em mãos, deixa em branco e cadastra depois.</p>
    ` + footer(),
  };
}

// E-mail 2 (dia 3): abre 1a licitacao do ramo e mostra como funciona o veredito
export function email2(perfil, exemploEdital) {
  const link = `${BASE}/painel?c=${perfil.token}`;
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const ramo = (perfil.filtro?.termos ?? [])[0] || "seu ramo";
  return {
    assunto: `${nome}, veja como ler um edital em 10 segundos`,
    html: header() + `
      <h2 style="font-size:21px;font-weight:800;margin-bottom:12px;color:#0f172a">A conferência de aptidão na prática</h2>
      <p style="margin-bottom:14px">Você cadastrou seu ramo no <b>${ramo}</b>. Já temos editais abertos esperando.</p>
      <p style="margin-bottom:14px">Quando você abre qualquer edital no painel, o sistema entrega em segundos:</p>
      <ul style="margin:0 0 18px 22px;color:#1e293b">
        <li style="margin-bottom:6px"><b>Objeto e valor</b> da licitação em 1 frase</li>
        <li style="margin-bottom:6px"><b>Prazo</b> exato pra envio da proposta</li>
        <li style="margin-bottom:6px"><b>3 exigências críticas</b> de habilitação</li>
        <li style="margin-bottom:6px"><b>Veredito</b>: apto, apto com pendências ou não apto</li>
      </ul>
      <p style="margin-bottom:14px">Sem isso, você lê 50-150 páginas de edital pra descobrir que faltava um atestado. Com isso, você decide em 10 segundos se vale entrar na disputa.</p>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr>
        <td style="background:#4338ca;border-radius:11px;padding:14px 28px">
          <a href="${link}" style="color:#fff;font-weight:800;text-decoration:none;font-size:15px">Abrir o painel agora →</a>
        </td>
      </tr></table>
    ` + footer(),
  };
}

// E-mail 3 (dia 6): ultimo dia do teste, fechamento
export function email3(perfil, totalEditais, somaValor) {
  const link = `${BASE}/assinar?c=${perfil.token}`;
  const nome = (perfil.nome || "").split(" ")[0] || "olá";
  const ramo = (perfil.filtro?.termos ?? [])[0] || "seu ramo";
  const valorTxt = somaValor > 1e9 ? `R$ ${(somaValor/1e9).toFixed(1)} bilhões` : somaValor > 1e6 ? `R$ ${(somaValor/1e6).toFixed(1)} milhões` : `R$ ${Math.round(somaValor/1e3)} mil`;
  return {
    assunto: `${nome}, seu teste termina em 24h. Vale R$ 197?`,
    html: header() + `
      <h2 style="font-size:21px;font-weight:800;margin-bottom:12px;color:#0f172a">A conta direta</h2>
      <p style="margin-bottom:14px">Nos últimos 6 dias, o ContrataX monitorou <b>${totalEditais.toLocaleString("pt-BR")} licitações abertas</b> no segmento <b>${ramo}</b>, somando <b>${valorTxt}</b> em oportunidades.</p>
      <p style="margin-bottom:14px">Seu teste grátis termina amanhã. A pergunta direta: vale R$ 197/mês continuar monitorando isso de forma organizada, com leitura completa de cada edital e alerta de certidão vencendo?</p>
      <p style="margin-bottom:14px"><b>A conta da viabilidade:</b><br>
      Um único contrato fechado em R$ 4.000 paga 20 meses da assinatura. 1 hora de consultor especializado custa R$ 250-800. R$ 197 cobre o mês inteiro de monitoramento + análise + alertas.</p>
      <p style="margin-bottom:14px">Sem fidelidade. Cancela quando quiser, no próprio painel.</p>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr>
        <td style="background:#4338ca;border-radius:11px;padding:14px 28px">
          <a href="${link}" style="color:#fff;font-weight:800;text-decoration:none;font-size:15px">Escolher meu plano →</a>
        </td>
      </tr></table>
      <p style="font-size:13.5px;color:#475569;margin-top:18px">Se decidir não assinar, sem problema. Sua conta fica preservada por 30 dias caso queira voltar.</p>
    ` + footer(),
  };
}

// Roda o ciclo: percorre todos os perfis e dispara o e-mail apropriado
export async function disparosOnboarding({ log = console.log } = {}) {
  if (!temEmailKey()) {
    log("[onboarding] RESEND_API_KEY ausente; pulando.");
    return 0;
  }
  const perfis = await lerPerfis();
  let enviados = 0;
  let mexeu = false;
  for (const p of perfis) {
    try {
      if (!p.email) continue;
      const dias = diasDesde(p.assinatura?.criadoEm);
      if (dias < 1) continue;
      // Pula assinantes ativos pagos (so manda pra quem ainda esta em teste OU teste expirado nao confirmado)
      const st = statusAtual(p);
      const elegivel = ["teste", "teste_expirado"].includes(st.status);
      if (!elegivel) continue;

      let msg = null;
      if (dias >= 1 && !p._onboardEmail1Em) msg = { i: 1, ...email1(p) };
      else if (dias >= 3 && !p._onboardEmail2Em) msg = { i: 2, ...email2(p) };
      else if (dias >= 6 && !p._onboardEmail3Em) {
        // Calcula contadores do ramo do cliente pra personalizar
        const termos = p.filtro?.termos ?? [];
        const ufs = p.ufs ?? [];
        const cand = consultar({ ufs, apenasAbertos: true });
        const casaram = aplicarFiltro(cand, { termos }).filter((e) => e.valorEstimado > 0);
        const soma = casaram.reduce((s, e) => s + (e.valorEstimado || 0), 0);
        msg = { i: 3, ...email3(p, casaram.length, soma) };
      }
      if (!msg) continue;

      await enviar({ para: p.email, assunto: msg.assunto, html: msg.html });
      // Marca enviado
      p[`_onboardEmail${msg.i}Em`] = new Date().toISOString();
      mexeu = true;
      enviados++;
      log(`[onboarding] enviado E-mail ${msg.i} para ${p.email} (${dias}d desde cadastro)`);
    } catch (e) {
      log(`[onboarding] ${p.nome || p.id}: erro ${e.message}`);
    }
  }
  if (mexeu) await salvarPerfis(perfis);
  return enviados;
}
