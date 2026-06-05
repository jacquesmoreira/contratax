// Antecipacao de recebivel publico (marketplace de FIDC/factoring parceiro).
//
// Ideia: em vez de esperar a prefeitura pagar (60-120 dias), o cliente vende a
// NF a um fundo especializado em recebivel publico e recebe ~85-92% HOJE. Quem
// passa a cobrar o orgao e o fundo (problema deles).
//
// MVP: captacao de interesse. Cliente clica "quero antecipar", preenchemos um
// e-mail estruturado pro Jacques, que conecta com o FIDC parceiro. Modelo de
// receita: comissao de 0,5-1% sobre o valor antecipado, paga pelo fundo.
//
// Quando houver volume, troca por integracao direta com API do fundo.

import { enviar, temEmailKey } from "./email.mjs";
import { formatarBRL } from "./correcaoMonetaria.mjs";

const DESTINO = process.env.CONTRATAX_ANTECIPACAO_EMAIL || process.env.CONTRATAX_JURIDICO_EMAIL || "contato@contratax.com.br";

// Estimativa de quanto o cliente receberia (faixa), so pra dar ancora na UI.
// Desagio tipico de recebivel publico: 8% a 15% conforme prazo e risco (CAPAG).
export function estimativaAntecipacao(valor, capagNota = null) {
  const v = Number(valor) || 0;
  // Desagio menor para municipios bem avaliados (A+/A), maior para C/D.
  let desagioMin = 0.08, desagioMax = 0.15;
  if (capagNota === "A+" || capagNota === "A") { desagioMin = 0.06; desagioMax = 0.10; }
  else if (capagNota === "C") { desagioMin = 0.12; desagioMax = 0.18; }
  else if (capagNota === "D" || capagNota === "D-") { desagioMin = 0.15; desagioMax = 0.25; }
  return {
    valorOriginal: v,
    recebeMin: Math.round(v * (1 - desagioMax)),
    recebeMax: Math.round(v * (1 - desagioMin)),
    desagioMinPct: Math.round(desagioMin * 100),
    desagioMaxPct: Math.round(desagioMax * 100),
  };
}

export async function solicitarAntecipacao({ nota, empresa, perfilToken, observacoes }) {
  const est = estimativaAntecipacao(nota.valor);
  const assunto = `[ContrataX] Antecipacao de recebivel - ${empresa?.razao || empresa?.nome || perfilToken}`;
  const corpo = `
Novo interesse em ANTECIPACAO DE RECEBIVEL PUBLICO.

=== EMPRESA ===
Razao: ${empresa?.razao || empresa?.nome || "-"}
CNPJ:  ${empresa?.cnpj || "-"}
Email: ${empresa?.email || "-"}
Tel:   ${empresa?.telefone || "-"}
Local: ${empresa?.cidade || "-"} / ${empresa?.uf || "-"}
Token: ${perfilToken}

=== NOTA FISCAL A ANTECIPAR ===
NF nº:     ${nota.numero || "-"}
Emissao:   ${nota.data_emissao}
Valor:     ${formatarBRL(nota.valor)}
Orgao:     ${nota.orgao_nome || "-"}
CNPJ org.: ${nota.orgao_cnpj || "-"}

=== ESTIMATIVA (faixa, desagio 8-15%) ===
Receberia entre ${formatarBRL(est.recebeMin)} e ${formatarBRL(est.recebeMax)}

=== OBSERVACOES DO CLIENTE ===
${observacoes || "(sem observacoes)"}

---
Acao: conectar com FIDC parceiro especializado em recebivel publico. Registrar
comissao no controle interno (0,5-1% sobre valor antecipado).
`.trim();

  if (!temEmailKey()) return { ok: false, motivo: "email_nao_configurado" };
  try {
    const html = `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap">${corpo.replace(/[&<>]/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</pre>`;
    await enviar({ para: DESTINO, assunto, html });
    return { ok: true, estimativa: est };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}
