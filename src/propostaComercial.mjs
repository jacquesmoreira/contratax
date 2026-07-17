// Carta de Proposta Comercial: documento pronto pra empresa apresentar a proposta
// num edital. Junta os dados da empresa (do perfil) + a referencia do edital + a
// tabela de itens (do PNCP, com o valor de referencia do orgao) + as clausulas
// que quase todo edital pede na proposta (validade, tributos inclusos, aceite das
// condicoes). O cliente preenche o "valor proposto", assina e sobe no portal.
//
// Saida: HTML pronto pra impressao em PDF (Ctrl+P), mesmo padrao das minutas.
// NAO e a peça oficial do orgao: e a proposta DA PROPRIA empresa, gerada pra ela
// usar. O rodape deixa claro que e um modelo pra revisar antes de enviar.

function dataExtenso(d = new Date()) {
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
function brl(v) {
  return v == null || v === "" ? "" : (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dataBR(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? String(s) : d.toLocaleDateString("pt-BR");
}

function estilo() {
  return `<style>
@page { size:A4; margin:22mm 20mm; }
body { font-family:Georgia,"Times New Roman",serif; color:#111; font-size:11.5pt; line-height:1.5; max-width:172mm; margin:0 auto; padding:24px; }
header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:22px; }
.razao { font-weight:700; font-size:14pt; }
.meta { font-size:10pt; color:#555; text-align:right; }
h1 { font-size:14pt; text-align:center; margin:24px 0 12px; text-transform:uppercase; letter-spacing:1px; }
.dest { margin-bottom:20px; }
.dest b { display:block; }
p { margin:10px 0; text-align:justify; }
table { width:100%; border-collapse:collapse; margin:14px 0; font-size:9.5pt; }
th, td { border:1px solid #999; padding:6px 8px; text-align:left; vertical-align:top; }
th { background:#eee; }
.r { text-align:right; white-space:nowrap; }
.c { text-align:center; }
.num { width:34px; }
ol.cl { margin:10px 0; padding-left:20px; }
ol.cl li { margin:7px 0; text-align:justify; }
.campo { border-bottom:1px solid #111; display:inline-block; min-width:220px; }
.ass { margin-top:44px; text-align:center; }
.ass .linha { border-top:1px solid #111; width:60%; margin:0 auto 6px; }
.foot { margin-top:30px; font-size:9pt; color:#666; border-top:1px solid #ccc; padding-top:8px; }
.botoes { text-align:center; margin:10px 0 20px; }
.botoes button { padding:10px 18px; background:#4338ca; color:#fff; border:none; border-radius:8px; font-size:12pt; font-family:inherit; cursor:pointer; font-weight:700; }
@media print { .botoes { display:none; } }
</style>`;
}

// Monta a tabela de itens. Cap defensivo pra atas gigantes (o cliente ainda tem
// a planilha Excel completa pra esses casos).
function tabelaItens(itens = []) {
  const MAX = 200;
  const usar = itens.slice(0, MAX);
  const linhas = usar.map((i) => `<tr>
    <td class="c num">${esc(i.numero ?? "")}</td>
    <td>${esc(i.descricao ?? "")}</td>
    <td class="c">${esc(i.unidade ?? "")}</td>
    <td class="r">${i.quantidade != null ? esc(i.quantidade) : ""}</td>
    <td class="r">${brl(i.valorUnitario)}</td>
    <td class="r"></td>
    <td class="r"></td>
  </tr>`).join("");
  const corte = itens.length > MAX
    ? `<tr><td colspan="7" class="c" style="font-style:italic;color:#666">... e mais ${itens.length - MAX} itens. Use a Planilha de Proposta (Excel) para a lista completa.</td></tr>`
    : "";
  return `<table>
    <thead><tr>
      <th class="c num">Item</th><th>Descrição</th><th class="c">Un.</th><th class="r">Qtd.</th>
      <th class="r">Valor unit. ref. (R$)</th><th class="r">Valor unit. proposto (R$)</th><th class="r">Valor total (R$)</th>
    </tr></thead>
    <tbody>${linhas}${corte}</tbody>
  </table>`;
}

// empresa: { razao, cnpj, cidade, uf, email, telefone }
// edital:  { id, orgao, orgaoCnpj, objeto, numeroCompra, modalidade, encerramento }
// itens:   [{ numero, descricao, unidade, quantidade, valorUnitario }]
export function cartaProposta({ empresa = {}, edital = {}, itens = [], validadeDias = 60 }) {
  const razao = empresa.razao || empresa.razaoSocial || empresa.nome || "[RAZÃO SOCIAL DA SUA EMPRESA]";
  const cnpj = empresa.cnpj || "[CNPJ]";
  const local = [empresa.cidade, empresa.uf].filter(Boolean).join("/") || "__________";
  const numeroEd = edital.numeroCompra || edital.id || "(número do edital)";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Proposta comercial - ${esc(numeroEd)}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<header>
  <div>
    <div class="razao">${esc(razao)}</div>
    <div style="font-size:10pt">CNPJ ${esc(cnpj)}</div>
    ${empresa.email || empresa.telefone ? `<div style="font-size:9.5pt;color:#555">${esc([empresa.email, empresa.telefone].filter(Boolean).join(" · "))}</div>` : ""}
  </div>
  <div class="meta">${esc(local)}, ${dataExtenso(new Date())}<br>Ref.: Edital nº ${esc(numeroEd)}</div>
</header>
<div class="dest">
  À Comissão de Contratação / Pregoeiro(a)<br>
  <b>${esc(edital.orgao || "[ÓRGÃO PÚBLICO]")}</b>
  ${edital.orgaoCnpj ? `CNPJ ${esc(edital.orgaoCnpj)}` : ""}
</div>
<h1>Proposta Comercial</h1>
<p>Prezados Senhores,</p>
<p>A empresa <b>${esc(razao)}</b>, inscrita no CNPJ sob o nº ${esc(cnpj)}, apresenta sua <b>proposta comercial</b> para o objeto do Edital nº ${esc(numeroEd)}${edital.modalidade ? ` (${esc(edital.modalidade)})` : ""}, cujo objeto é: <b>${esc(edital.objeto || "conforme edital")}</b>.</p>
${itens.length ? `<p><b>1. Dos preços propostos.</b> Segue a relação de itens, com o valor unitário de referência do órgão. Preencha as colunas de valor proposto:</p>
${tabelaItens(itens)}` : `<p><b>1. Dos preços propostos.</b> Os preços seguem na planilha de proposta anexa (Planilha de Proposta em Excel), preenchida com o valor unitário de cada item.</p>`}
<p><b>${itens.length ? "2" : "2"}. Das condições da proposta.</b></p>
<ol class="cl">
  <li>A presente proposta tem <b>validade de ${validadeDias} (${validadeDias === 60 ? "sessenta" : validadeDias} ) dias</b> corridos, contados da data de sua apresentação.</li>
  <li>Nos preços propostos estão <b>inclusos todos os custos e despesas</b> (tributos, encargos sociais e trabalhistas, fretes, seguros e demais custos diretos e indiretos) necessários ao integral cumprimento do objeto.</li>
  <li>Declaramos que <b>conhecemos e aceitamos integralmente as condições do edital</b> e seus anexos, e que cumprimos os requisitos de habilitação exigidos.</li>
  <li>${edital.encerramento ? `Estamos cientes de que a sessão/entrega de propostas encerra em <b>${dataBR(edital.encerramento)}</b>.` : "Comprometemo-nos a cumprir os prazos estabelecidos no edital."}</li>
</ol>
<p><b>Dados bancários para pagamento:</b> Banco <span class="campo"></span> Agência <span class="campo" style="min-width:90px"></span> Conta <span class="campo" style="min-width:120px"></span></p>
<div class="ass">
  <div class="linha"></div>
  <b>${esc(razao)}</b><br>CNPJ ${esc(cnpj)}<br>
  <span style="font-size:10pt;color:#555">Representante legal (nome e assinatura)</span>
</div>
<div class="foot">Documento gerado pela plataforma ContrataX a partir dos dados públicos do PNCP e do cadastro da sua empresa. É um <b>modelo</b> da SUA proposta: confira os valores, os dados da empresa e as exigências específicas do edital antes de enviar. A ContrataX não participa da sessão de lances, que ocorre no portal oficial da licitação.</div>
</body></html>`;
}
