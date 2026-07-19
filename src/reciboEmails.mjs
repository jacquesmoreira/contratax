// Recibos por e-mail de cada pagamento confirmado (assinatura, upgrade, pacote
// avulso, acessos extras). Antes disso, o cliente pagava e nao recebia NADA por
// e-mail: o dinheiro saia da conta dele e o unico sinal de que funcionou era o
// painel destravar sozinho. Gera ansiedade e duvida ("caiu mesmo? foi cobrado
// certo?"). Cada funcao aqui devolve { assunto, html } pronto pra `enviar()`.
//
// Voz institucional (a ContrataX como empresa), tom direto e tranquilizador,
// sem travessao. Reaproveita o mesmo chassi visual do aviso de renovacao.

const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

const NOME_PAGAMENTO = {
  CREDIT_CARD: "Cartão de crédito",
  PIX: "Pix",
  BOLETO: "Boleto",
  UNDEFINED: "não informado",
};
function nomeFormaPagamento(fp) {
  return NOME_PAGAMENTO[fp] || fp || "não informado";
}

function fmtBR(iso) {
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return ""; }
}
function brl(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function template({ selo, seloCor, titulo, mensagem, perfil, linhas, link, ctaTxt }) {
  const linhasHtml = linhas.map(([rotulo, valor], i) => {
    const borda = i < linhas.length - 1 ? "border-bottom:1px solid #e2e8f0;" : "";
    return `<tr><td style="padding:10px 14px;background:#f8fafc;width:50%;color:#64748b;${borda}">${rotulo}</td><td style="padding:10px 14px;font-weight:700;${borda}">${valor}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:${seloCor.bg};padding:20px 26px;border-bottom:1px solid ${seloCor.borda}">
<div style="font-size:13px;color:${seloCor.fg};font-weight:700;letter-spacing:.5px">${selo}</div>
<div style="font-size:18px;color:${seloCor.tit};font-weight:800;margin-top:4px">${titulo}</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#0f172a;font-size:15px;line-height:1.6">
<p>Olá, ${perfil.nome || "cliente"}.</p>
${mensagem}
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
${linhasHtml}
</table>
${link ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:18px 0"><tr><td align="center">
<a href="${link}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:11px">${ctaTxt}</a>
</td></tr></table>` : ""}
<p style="font-size:13.5px;color:#64748b">Dúvidas sobre esta cobrança? Responda este e-mail ou escreva para <a href="mailto:contato@contratax.com.br" style="color:#4338ca">contato@contratax.com.br</a>.</p>
</td></tr>
<tr><td style="background:#f8fafc;padding:16px 26px;text-align:center;border-top:1px solid #e2e8f0">
<div style="color:#64748b;font-size:12.5px">ContrataX, monitor de licitações públicas</div>
</td></tr></table></td></tr></table></body></html>`;
}

// Ativação da assinatura: primeira vez (trial -> pago) tem tom de boas-vindas;
// renovação recorrente é só a confirmação, mais enxuta (o cliente já conhece
// o produto, não precisa reapresentar).
export function reciboAtivacao({ perfil, plano, valor, formaPagamento, expiraEm, primeiraVez }) {
  const link = `${BASE}/painel?c=${perfil.token}`;
  if (primeiraVez) {
    return {
      assunto: `Seu plano ${plano.nome} está ativo`,
      html: template({
        selo: "PAGAMENTO CONFIRMADO",
        seloCor: { bg: "#dcfce7", borda: "#bbf7d0", fg: "#166534", tit: "#14532d" },
        titulo: `Bem-vindo ao plano ${plano.nome}`,
        mensagem: `<p>Recebemos o seu pagamento e a assinatura já está ativa. Os limites do período de teste saíram do caminho: agora você tem <b>${plano.analises} análises de edital por mês</b> com a ContrataX.IA, além de busca e alertas diários ilimitados do seu ramo.</p>`,
        perfil, link, ctaTxt: "Abrir o painel",
        linhas: [
          ["Plano", plano.nome],
          ["Valor", `R$ ${brl(valor)}/mês`],
          ["Forma de pagamento", nomeFormaPagamento(formaPagamento)],
          ["Próxima cobrança", fmtBR(expiraEm)],
        ],
      }),
    };
  }
  return {
    assunto: "Recibo: sua mensalidade do ContrataX foi cobrada",
    html: template({
      selo: "PAGAMENTO CONFIRMADO",
      seloCor: { bg: "#dcfce7", borda: "#bbf7d0", fg: "#166534", tit: "#14532d" },
      titulo: "Mensalidade renovada com sucesso",
      mensagem: `<p>Sua assinatura do plano <b>${plano.nome}</b> foi renovada. O acesso continua ativo, sem nenhuma ação necessária da sua parte.</p>`,
      perfil, link, ctaTxt: "Abrir o painel",
      linhas: [
        ["Plano", plano.nome],
        ["Valor", `R$ ${brl(valor)}/mês`],
        ["Forma de pagamento", nomeFormaPagamento(formaPagamento)],
        ["Próxima cobrança", fmtBR(expiraEm)],
      ],
    }),
  };
}

export function reciboUpgrade({ perfil, plano, valorCobrado, valorMensalNovo, formaPagamento, proximaCobranca }) {
  const link = `${BASE}/conta?c=${perfil.token}`;
  return {
    assunto: `Recibo: upgrade para o plano ${plano.nome}`,
    html: template({
      selo: "UPGRADE CONFIRMADO",
      seloCor: { bg: "#eef2ff", borda: "#c7d2fe", fg: "#3730a3", tit: "#1e1b4b" },
      titulo: `Seu plano agora é ${plano.nome}`,
      mensagem: `<p>Confirmamos o pagamento da diferença proporcional e seu plano já foi atualizado. A partir de agora você tem <b>${plano.analises} análises de edital por mês</b> com a ContrataX.IA.</p>`,
      perfil, link, ctaTxt: "Ver minha conta",
      linhas: [
        ["Novo plano", plano.nome],
        ["Cobrado hoje (proporcional)", `R$ ${brl(valorCobrado)}`],
        ["Nova mensalidade", `R$ ${brl(valorMensalNovo)}/mês`],
        ["Forma de pagamento", nomeFormaPagamento(formaPagamento)],
        ...(proximaCobranca ? [["Próxima cobrança cheia", fmtBR(proximaCobranca)]] : []),
      ],
    }),
  };
}

export function reciboAvulso({ perfil, nomePacote, analises, valor, formaPagamento }) {
  const link = `${BASE}/painel?c=${perfil.token}`;
  return {
    assunto: `Recibo: ${nomePacote} adicionado à sua conta`,
    html: template({
      selo: "PAGAMENTO CONFIRMADO",
      seloCor: { bg: "#dcfce7", borda: "#bbf7d0", fg: "#166534", tit: "#14532d" },
      titulo: `${analises} análises adicionadas`,
      mensagem: `<p>Confirmamos o pagamento do <b>${nomePacote}</b>. As ${analises} análises já estão disponíveis na sua conta agora mesmo e não expiram no fim do mês.</p>`,
      perfil, link, ctaTxt: "Usar agora",
      linhas: [
        ["Pacote", nomePacote],
        ["Análises adicionadas", String(analises)],
        ["Valor", `R$ ${brl(valor)}`],
        ["Forma de pagamento", nomeFormaPagamento(formaPagamento)],
      ],
    }),
  };
}

export function reciboAssentos({ perfil, quantidade, totalAssentos, valorMensalNovo, formaPagamento }) {
  const link = `${BASE}/equipe?c=${perfil.token}`;
  return {
    assunto: `Recibo: ${quantidade} acesso(s) extra(s) liberado(s)`,
    html: template({
      selo: "PAGAMENTO CONFIRMADO",
      seloCor: { bg: "#dcfce7", borda: "#bbf7d0", fg: "#166534", tit: "#14532d" },
      titulo: `${quantidade} novo(s) acesso(s) para a sua equipe`,
      mensagem: `<p>Confirmamos o pagamento e já liberamos ${quantidade} acesso(s) extra(s). Agora sua conta tem <b>${totalAssentos} acesso(s)</b> no total, prontos pra convidar quem faltava.</p>`,
      perfil, link, ctaTxt: "Gerenciar equipe",
      linhas: [
        ["Acessos adicionados", String(quantidade)],
        ["Total de acessos", String(totalAssentos)],
        ["Nova mensalidade", `R$ ${brl(valorMensalNovo)}/mês`],
        ["Forma de pagamento", nomeFormaPagamento(formaPagamento)],
      ],
    }),
  };
}
