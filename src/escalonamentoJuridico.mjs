// Escalonamento para advogado parceiro especialista em contratos administrativos.
//
// MVP simples: cliente preenche formulario "preciso de um advogado pra cobrar
// esse orgao" -> envia e-mail pro contato@contratax.com.br com os detalhes da
// NF e da empresa. Internamente, Jacques organiza a indicacao.
//
// Modelo de negocio (acordado): comissao por sucesso ao advogado parceiro,
// sem cobrar do cliente. Cliente ganha = empresa ganha (NPS+) = parceiro paga
// fee na vitoria.

import { enviar, temEmailKey } from "./email.mjs";
import { formatarBRL } from "./correcaoMonetaria.mjs";
import { calcularCorrecao } from "./correcaoMonetaria.mjs";

const DESTINO = process.env.CONTRATAX_JURIDICO_EMAIL || "contato@contratax.com.br";

export async function escalarParaAdvogado({ nota, empresa, perfilToken, observacoes }) {
  const vencimento = new Date(new Date(nota.data_emissao).getTime() + 30 * 864e5);
  const calc = calcularCorrecao({
    valorOriginal: nota.valor,
    dataVencimento: vencimento.toISOString().slice(0, 10),
  });

  const assunto = `[ContrataX] Pedido de advogado - ${empresa?.razao || empresa?.nome || perfilToken}`;
  const corpo = `
Novo pedido de advogado parceiro especialista em contratos administrativos.

=== EMPRESA ===
Razao: ${empresa?.razao || empresa?.nome || "-"}
CNPJ:  ${empresa?.cnpj || "-"}
Email: ${empresa?.email || "-"}
Tel:   ${empresa?.telefone || "-"}
Local: ${empresa?.cidade || "-"} / ${empresa?.uf || "-"}
Token: ${perfilToken}

=== NOTA FISCAL EM ATRASO ===
NF nº:     ${nota.numero || "-"}
Emissao:   ${nota.data_emissao}
Valor:     ${formatarBRL(nota.valor)}
Orgao:     ${nota.orgao_nome || "-"}
CNPJ org.: ${nota.orgao_cnpj || "-"}
Descricao: ${nota.descricao || "-"}

=== ATRASO E DEBITO ATUALIZADO ===
Vencimento legal: ${vencimento.toISOString().slice(0, 10)}
Dias em atraso:   ${calc.diasAtraso}
Valor corrigido:  ${formatarBRL(calc.valorCorrigido)}
Juros:            ${formatarBRL(calc.juros)}
Total devido:     ${formatarBRL(calc.totalDevido)}

=== OBSERVACOES DO CLIENTE ===
${observacoes || "(sem observacoes)"}

---
Acao: contatar empresa em ate 1 dia util, indicar advogado parceiro, registrar comissao no controle interno.
`.trim();

  if (!temEmailKey()) {
    return { ok: false, motivo: "email_nao_configurado", corpo };
  }

  try {
    const html = `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap">${corpo.replace(/[&<>]/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</pre>`;
    await enviar({ para: DESTINO, assunto, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}
