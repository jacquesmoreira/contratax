// Geracao de minutas formais para acoes pos-venda no contrato administrativo:
//   - Pedido de PRORROGACAO de vigencia
//   - Pedido de ADITIVO de valor / quantitativo (Lei 14.133, art. 124, I)
//   - Pedido de REEQUILIBRIO economico-financeiro (Lei 14.133, art. 124, II;
//     art. 135)
//
// Saida: HTML pronto pra impressao em PDF (Ctrl+P).

import { gatilhoReequilibrio } from "./indicesEconomicos.mjs";

function dataExtenso(d = new Date()) {
  const meses = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}
function brl(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function cabecalho(empresa, contrato, refTitulo) {
  return `<header><div>
    <div class="razao">${esc(empresa.razao)}</div>
    <div style="font-size:10pt">CNPJ ${esc(empresa.cnpj)}</div>
  </div><div class="meta">
    ${esc(empresa.cidade || "")}${empresa.uf ? "/" + esc(empresa.uf) : ""}, ${dataExtenso(new Date())}<br>
    Ref.: Contrato nº ${esc(contrato.numero || "-")}, ${esc(refTitulo)}
  </div></header>
  <div class="dest">
    Ao(A) Senhor(a) Gestor(a) do Contrato<br>
    <b>${esc(contrato.orgao_nome || "[ORGAO PUBLICO]")}</b>
    CNPJ ${esc(contrato.orgao_cnpj || "[CNPJ]")}
  </div>`;
}

function estilo() {
  return `<style>
@page { size:A4; margin:25mm 22mm; }
body { font-family:Georgia,"Times New Roman",serif; color:#111; font-size:12pt; line-height:1.55; max-width:170mm; margin:0 auto; padding:24px; }
header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:24px; }
.razao { font-weight:700; font-size:14pt; }
.meta { font-size:10pt; color:#555; text-align:right; }
h1 { font-size:14pt; text-align:center; margin:28px 0 12px; text-transform:uppercase; letter-spacing:1px; }
.dest { margin-bottom:24px; }
.dest b { display:block; }
p { margin:10px 0; text-align:justify; }
table { width:100%; border-collapse:collapse; margin:14px 0; font-size:11pt; }
th, td { border:1px solid #999; padding:8px 10px; text-align:left; }
th { background:#eee; }
.r { text-align:right; }
.tot { font-weight:700; background:#fffbea; }
.ass { margin-top:48px; text-align:center; }
.ass .linha { border-top:1px solid #111; width:60%; margin:0 auto 6px; }
.foot { margin-top:32px; font-size:9pt; color:#666; border-top:1px solid #ccc; padding-top:8px; }
.botoes { text-align:center; margin:14px 0 22px; }
.botoes button { padding:10px 18px; background:#4338ca; color:#fff; border:none; border-radius:8px; font-size:12pt; font-family:inherit; cursor:pointer; font-weight:700; }
@media print { .botoes { display:none; } }
</style>`;
}

// 1) PRORROGACAO de vigencia (Lei 14.133, art. 105 ss.)
export function minutaProrrogacao({ contrato, empresa, mesesProrrogacao = 12 }) {
  const dataAtual = new Date(contrato.data_fim || new Date());
  const novaDataFim = new Date(dataAtual.getTime() + mesesProrrogacao * 30 * 864e5);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Pedido de prorrogacao - Contrato ${esc(contrato.numero || "")}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${cabecalho(empresa, contrato, "Pedido de prorrogacao de vigencia")}
<h1>Pedido de Prorrogacao de Vigencia Contratual</h1>
<p>Prezados Senhores,</p>
<p>A empresa <b>${esc(empresa.razao)}</b>, inscrita no CNPJ sob o nº ${esc(empresa.cnpj)}, contratada por esse orgao por meio do <b>Contrato nº ${esc(contrato.numero || "(numero)")}</b>, vem respeitosamente requerer a <b>prorrogacao do prazo de vigencia</b> pelo periodo de <b>${mesesProrrogacao} meses</b>, com base nos fundamentos a seguir.</p>
<p><b>1. Da regularidade da execucao.</b> Ao longo do periodo de vigencia, esta contratada manteve a regular execucao do objeto, com cumprimento dos prazos, da qualidade especificada e das obrigacoes acessorias.</p>
<p><b>2. Do fundamento legal.</b> Nos termos do art. 107 da Lei 14.133/2021, os contratos de servicos e fornecimentos continuos podem ser prorrogados sucessivamente, respeitando o limite legal, quando demonstrada a vantagem economica e administrativa.</p>
<p><b>3. Do objeto da prorrogacao.</b> ${esc(contrato.objeto || "Continuidade do objeto contratado.")} Valor estimado para o periodo: <b>${brl(contrato.valor_total)}</b>.</p>
<p><b>4. Do prazo proposto.</b> ${mesesProrrogacao} meses, com nova data de termino prevista para <b>${novaDataFim.toLocaleDateString("pt-BR")}</b>.</p>
<p>Coloca-se a disposicao para os tramites administrativos necessarios.</p>
<div class="ass">
  <div class="linha"></div>
  <b>${esc(empresa.razao)}</b><br>CNPJ ${esc(empresa.cnpj)}
</div>
<div class="foot">Minuta gerada pela plataforma ContrataX. Revise as clausulas-chave (objeto, valor, prazo) antes do protocolo. Fundamento: Lei 14.133/2021, arts. 105 a 107.</div>
</body></html>`;
}

// 2) ADITIVO de valor / quantitativo (Lei 14.133, art. 124, I)
export function minutaAditivo({ contrato, empresa, tipo = "quantitativo", justificativa = "", percentualPretendido = 25 }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Pedido de aditivo - Contrato ${esc(contrato.numero || "")}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${cabecalho(empresa, contrato, "Pedido de aditivo contratual")}
<h1>Pedido de Termo Aditivo ao Contrato</h1>
<p>Prezados Senhores,</p>
<p>A empresa <b>${esc(empresa.razao)}</b>, CNPJ ${esc(empresa.cnpj)}, contratada por meio do <b>Contrato nº ${esc(contrato.numero || "(numero)")}</b>, vem requerer a celebracao de <b>termo aditivo</b> ao referido instrumento, conforme exposto a seguir.</p>
<p><b>1. Da natureza do aditivo.</b> Aditivo de natureza <b>${esc(tipo)}</b>, fundamentado no art. 124, inciso I, da Lei nº 14.133/2021, observado o limite de 25% sobre o valor inicial atualizado, ou 50% no caso de reforma de edificio ou equipamento.</p>
<p><b>2. Da justificativa.</b> ${esc(justificativa || "[A justificar conforme situacao concreta da execucao.]")}</p>
<p><b>3. Do percentual pretendido.</b> ${percentualPretendido}% sobre o valor original do contrato, equivalente a <b>${brl((contrato.valor_total || 0) * percentualPretendido / 100)}</b>, atingindo valor final estimado de <b>${brl((contrato.valor_total || 0) * (1 + percentualPretendido/100))}</b>.</p>
<p><b>4. Do prazo.</b> Solicita-se a manifestacao desse orgao no prazo regulamentar para que, se aceito, o aditivo seja formalizado tempestivamente.</p>
<p>Coloca-se a disposicao para os esclarecimentos necessarios.</p>
<div class="ass">
  <div class="linha"></div>
  <b>${esc(empresa.razao)}</b><br>CNPJ ${esc(empresa.cnpj)}
</div>
<div class="foot">Minuta gerada pela plataforma ContrataX. O percentual e o objeto do aditivo dependem da analise dos limites do art. 124 da Lei 14.133/2021. Revise antes do protocolo.</div>
</body></html>`;
}

// 3) REEQUILIBRIO ECONOMICO-FINANCEIRO (Lei 14.133, art. 124, II; art. 135)
export function minutaReequilibrio({ contrato, empresa, indice, dataBase, justificativa = "" }) {
  const gat = gatilhoReequilibrio({ indice, dataBase });
  const variacao = gat ? gat.variacaoPercent : 0;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Pedido de reequilibrio - Contrato ${esc(contrato.numero || "")}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${cabecalho(empresa, contrato, "Pedido de reequilibrio economico-financeiro")}
<h1>Pedido de Reequilibrio Economico-Financeiro</h1>
<p>Prezados Senhores,</p>
<p>A empresa <b>${esc(empresa.razao)}</b>, CNPJ ${esc(empresa.cnpj)}, contratada por meio do <b>Contrato nº ${esc(contrato.numero || "(numero)")}</b>, vem requerer o <b>reequilibrio economico-financeiro</b> do referido contrato, conforme fundamentos a seguir.</p>
<p><b>1. Do fundamento legal.</b> O art. 124, inciso II, c/c art. 135 da Lei nº 14.133/2021 assegura a manutencao do equilibrio economico-financeiro do contrato administrativo quando da ocorrencia de fatos imprevisiveis ou previsiveis de consequencias incalculaveis (alea economica extraordinaria).</p>
<p><b>2. Do evento desequilibrante.</b> Verificou-se variacao acumulada do indice <b>${esc(indice)}</b> de <b>${variacao}%</b> desde ${esc(dataBase)}, periodo em que se firmou a referencia economica do contrato. Tal variacao impacta diretamente o custo do objeto pactuado e rompe a equacao economica original.</p>
<p><b>3. Da justificativa concreta.</b> ${esc(justificativa || "[A complementar com a descricao dos insumos afetados, planilhas de composicao de custos antes e depois da variacao, notas fiscais comprobatorias.]")}</p>
<p><b>4. Do pedido.</b> Requer-se a revisao do valor contratual em percentual equivalente a recomposicao do equilibrio, com efeitos a contar da data deste protocolo, mediante celebracao de termo aditivo.</p>
<p>Coloca-se a disposicao para a apresentacao da memoria de calculo detalhada.</p>
<div class="ass">
  <div class="linha"></div>
  <b>${esc(empresa.razao)}</b><br>CNPJ ${esc(empresa.cnpj)}
</div>
<div class="foot">Minuta gerada pela plataforma ContrataX. A taxa de variacao informada e uma estimativa baseada nos ultimos 12 meses; recomenda-se anexar a memoria de calculo com indices oficiais (IBGE, FGV) do periodo exato. Revise antes do protocolo.</div>
</body></html>`;
}
