// Gera o HTML do oficio formal de cobranca administrativa para orgao publico
// em atraso. HTML pensado pra impressao em PDF direto pelo navegador (Ctrl+P).
//
// Fundamentacao: Lei 14.133/2021, art. 141 (prazo de 30 dias para pagamento
// apos liquidacao); art. 137 e ss. (consequencias do inadimplemento da
// Administracao); jurisprudencia pacifica de cabimento de correcao monetaria
// e juros moratorios em atrasos de pagamento de contrato administrativo.

import { calcularCorrecao, formatarBRL } from "./correcaoMonetaria.mjs";

function dataExtenso(d = new Date()) {
  const meses = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}

export function gerarOficioHtml({ nota, empresa, perfilToken }) {
  const dataEmissao = new Date(nota.data_emissao);
  const vencimento = new Date(dataEmissao.getTime() + 30 * 864e5);
  const calc = calcularCorrecao({
    valorOriginal: nota.valor,
    dataVencimento: vencimento.toISOString().slice(0, 10),
  });
  const orgao = escaparHtml(nota.orgao_nome || "[ORGAO PUBLICO]");
  const cnpjOrgao = escaparHtml(nota.orgao_cnpj || "[CNPJ]");
  const numeroNF = escaparHtml(nota.numero || "[NUMERO]");
  const razao = escaparHtml(empresa?.razao || empresa?.nome || "[RAZAO SOCIAL]");
  const cnpjEmp = escaparHtml(empresa?.cnpj || "[CNPJ DA EMPRESA]");
  const cidade = escaparHtml(empresa?.cidade || "[CIDADE]");
  const uf = escaparHtml(empresa?.uf || "");
  const email = escaparHtml(empresa?.email || "[E-MAIL]");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Oficio de cobranca - NF ${numeroNF}</title>
<style>
@page { size:A4; margin:25mm 22mm; }
body { font-family: Georgia, "Times New Roman", serif; color:#111; font-size:12pt; line-height:1.55; max-width:170mm; margin:0 auto; padding:24px; }
header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:24px; }
header .razao { font-weight:700; font-size:14pt; }
header .meta { font-size:10pt; color:#555; text-align:right; }
h1 { font-size:14pt; text-align:center; margin:28px 0 12px; text-transform:uppercase; letter-spacing:1px; }
.dest { margin-bottom:24px; }
.dest b { display:block; }
p { margin:10px 0; text-align:justify; }
.tabela { width:100%; border-collapse:collapse; margin:16px 0; font-size:11pt; }
.tabela th, .tabela td { border:1px solid #999; padding:8px 10px; text-align:left; }
.tabela th { background:#eee; }
.tabela td.r { text-align:right; }
.tot { font-weight:700; background:#fffbea; }
.ass { margin-top:48px; text-align:center; }
.ass .linha { border-top:1px solid #111; width:60%; margin:0 auto 6px; }
.foot { margin-top:32px; font-size:9pt; color:#666; border-top:1px solid #ccc; padding-top:8px; }
.botoes { text-align:center; margin:20px 0 30px; }
.botoes button, .botoes a { display:inline-block; margin:0 6px; padding:10px 18px; background:#4338ca; color:#fff; border:none; border-radius:8px; font-size:12pt; font-family:inherit; cursor:pointer; text-decoration:none; font-weight:700; }
.botoes a.esc { background:#059669; }
@media print { .botoes { display:none; } }
</style></head><body>

<div class="botoes">
  <button onclick="window.print()">Imprimir / Salvar PDF</button>
  <a class="esc" href="/recebiveis?c=${encodeURIComponent(perfilToken)}#escalar=${nota.id}">Escalonar para advogado parceiro</a>
</div>

<header>
  <div>
    <div class="razao">${razao}</div>
    <div style="font-size:10pt">CNPJ ${cnpjEmp}</div>
  </div>
  <div class="meta">
    ${cidade}${uf ? "/" + uf : ""}, ${dataExtenso(new Date())}<br>
    Ref.: NF nº ${numeroNF}
  </div>
</header>

<div class="dest">
  Ao(A) Senhor(a) Ordenador(a) de Despesas<br>
  <b>${orgao}</b>
  CNPJ ${cnpjOrgao}
</div>

<h1>Notificação extrajudicial de cobrança</h1>

<p>Prezados Senhores,</p>

<p>A empresa <b>${razao}</b>, inscrita no CNPJ sob o nº ${cnpjEmp}, vem, respeitosamente, à presença de Vossa Senhoria, com fundamento na <b>Lei nº 14.133/2021, art. 141</b>, e na jurisprudência consolidada do Superior Tribunal de Justiça e do Tribunal de Contas da União, requerer o pagamento de obrigação contratual em atraso, conforme demonstrado a seguir.</p>

<p><b>1. Da obrigação inadimplida.</b> Em ${dataEmissao.toLocaleDateString("pt-BR")}, esta empresa emitiu a Nota Fiscal de nº <b>${numeroNF}</b>, no valor de <b>${formatarBRL(nota.valor)}</b>, relativa ao fornecimento de bens e/ou serviços contratados por esse órgão. ${nota.descricao ? `O objeto compreendeu: ${escaparHtml(nota.descricao)}.` : ""}</p>

<p><b>2. Do prazo legal.</b> Nos termos do art. 141 da Lei nº 14.133/2021, o pagamento devia ter sido efetuado em até <b>30 (trinta) dias</b> contados da liquidação da despesa, ou seja, até <b>${vencimento.toLocaleDateString("pt-BR")}</b>. Até a presente data, decorridos <b>${calc.diasAtraso} dias</b> do vencimento, o pagamento não foi realizado.</p>

<p><b>3. Da atualização do débito.</b> Aplicada a correção monetária pelo IPCA e os juros moratórios de 0,5% ao mês, conforme jurisprudência aplicável, o débito atualizado é o seguinte:</p>

<table class="tabela">
  <tr><th>Discriminação</th><th class="r">Valor</th></tr>
  <tr><td>Valor original da NF nº ${numeroNF}</td><td class="r">${formatarBRL(calc.valorOriginal)}</td></tr>
  <tr><td>Correção monetária (IPCA estimado, ${calc.mesesAtraso} meses)</td><td class="r">${formatarBRL(calc.correcao)}</td></tr>
  <tr><td>Juros moratórios (0,5% a.m., ${calc.mesesAtraso} meses)</td><td class="r">${formatarBRL(calc.juros)}</td></tr>
  <tr class="tot"><td><b>Total devido nesta data</b></td><td class="r"><b>${formatarBRL(calc.totalDevido)}</b></td></tr>
</table>

<p><b>4. Do prazo para regularização.</b> Fica esse órgão público notificado para, no prazo de <b>15 (quinze) dias úteis</b> contados do recebimento, efetuar o pagamento integral do débito atualizado, sob pena desta empresa adotar as medidas judiciais cabíveis, incluindo execução do título extrajudicial e cobrança de honorários sucumbenciais, conforme art. 784 do CPC.</p>

<p><b>5. Da via de comunicação.</b> Resposta e comprovante de pagamento podem ser encaminhados para o e-mail <b>${email}</b>.</p>

<p>Termos em que pede e espera deferimento.</p>

<div class="ass">
  <div class="linha"></div>
  <b>${razao}</b><br>
  CNPJ ${cnpjEmp}
</div>

<div class="foot">
  Documento gerado pela plataforma ContrataX (contratax.com.br). Os cálculos de correção monetária e juros moratórios são uma estimativa baseada em IPCA recente; o índice efetivo do período pode ser ajustado pelo emissor antes do protocolo. Fundamentação legal: Lei nº 14.133/2021, art. 141; jurisprudência STJ e TCU sobre atrasos de pagamento em contratos administrativos.
</div>

</body></html>`;
}
