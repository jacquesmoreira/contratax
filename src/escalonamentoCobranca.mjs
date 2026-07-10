// Escada de escalonamento de cobranca de orgao publico em atraso.
//
// Por que existe: cobrar JUROS de prefeitura raramente funciona (vira
// precatorio, anos pra receber). O que faz a Administracao se mexer e a
// PRESSAO ADMINISTRATIVA - obrigacao legal de resposta (LAI) e risco de
// responsabilizacao pessoal do ordenador de despesas (TCE/TCM).
//
// Este modulo gera 3 pecas formais, em ordem crescente de pressao:
//   1. Pedido via LAI (Lei 12.527/2011) - orgao OBRIGADO a responder em 20 dias
//      quando vai pagar. Nao responder gera sancao ao servidor.
//   2. Representacao ao Tribunal de Contas (TCE/TCM) - pede apuracao de
//      eventual quebra da ordem cronologica de pagamentos (Lei 14.133, art. 141
//      par. 1) e responsabilizacao do ordenador.
//   3. Manifestacao a Ouvidoria do orgao - registro formal interno, gera
//      numero de protocolo e prazo de resposta.
//
// Cada peca e HTML pronto pra impressao em PDF (Ctrl+P). O oficio de cobranca
// com juros (src/oficioCobranca.mjs) continua existindo como uma das opcoes.

function dataExtenso(d = new Date()) {
  const meses = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}
function brl(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function diasAtraso(nota) {
  const venc = new Date(new Date(nota.data_emissao).getTime() + 30 * 864e5);
  return Math.max(0, Math.floor((Date.now() - venc.getTime()) / 864e5));
}

function estilo() {
  return `<style>
@page { size:A4; margin:25mm 22mm; }
body { font-family:Georgia,"Times New Roman",serif; color:#111; font-size:12pt; line-height:1.55; max-width:170mm; margin:0 auto; padding:24px; }
header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:24px; }
header .razao { font-weight:700; font-size:14pt; }
header .meta { font-size:10pt; color:#555; text-align:right; }
h1 { font-size:14pt; text-align:center; margin:24px 0 12px; text-transform:uppercase; letter-spacing:1px; }
.dest { margin-bottom:20px; }
.dest b { display:block; }
p { margin:10px 0; text-align:justify; }
ol, ul { margin:10px 0 10px 22px; }
li { margin:6px 0; text-align:justify; }
.box { background:#f6f6f4; border:1px solid #ccc; border-radius:6px; padding:12px 14px; margin:14px 0; font-size:11pt; }
.ass { margin-top:46px; text-align:center; }
.ass .linha { border-top:1px solid #111; width:60%; margin:0 auto 6px; }
.foot { margin-top:30px; font-size:9pt; color:#666; border-top:1px solid #ccc; padding-top:8px; }
.botoes { text-align:center; margin:14px 0 24px; }
.botoes button { padding:10px 18px; background:#4338ca; color:#fff; border:none; border-radius:8px; font-size:12pt; font-family:inherit; cursor:pointer; font-weight:700; }
@media print { .botoes { display:none; } }
</style>`;
}

function cabecalho(empresa, nota, refTitulo) {
  return `<header>
    <div>
      <div class="razao">${esc(empresa?.razao || empresa?.nome || "[RAZAO SOCIAL]")}</div>
      <div style="font-size:10pt">CNPJ ${esc(empresa?.cnpj || "[CNPJ]")}</div>
    </div>
    <div class="meta">
      ${esc(empresa?.cidade || "")}${empresa?.uf ? "/" + esc(empresa.uf) : ""}, ${dataExtenso(new Date())}<br>
      Ref.: NF nº ${esc(nota.numero || "-")}, ${esc(refTitulo)}
    </div>
  </header>`;
}

// ===== 1. PEDIDO VIA LAI =====
export function gerarLaiHtml({ nota, empresa }) {
  const orgao = esc(nota.orgao_nome || "[ORGAO PUBLICO]");
  const cnpjOrgao = esc(nota.orgao_cnpj || "[CNPJ]");
  const numeroNF = esc(nota.numero || "[NUMERO]");
  const dataEmissao = new Date(nota.data_emissao).toLocaleDateString("pt-BR");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Pedido LAI - NF ${numeroNF}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${cabecalho(empresa, nota, "Pedido de informacao - LAI")}
<div class="dest">À Autoridade de Monitoramento da Lei de Acesso à Informação<br>
ou ao Serviço de Informação ao Cidadão (SIC) do órgão<br>
<b>${orgao}</b>
CNPJ ${cnpjOrgao}</div>

<h1>Pedido de Acesso à Informação</h1>

<p>Com fundamento no art. 5º, inciso XXXIII, da Constituição Federal e na <b>Lei nº 12.527/2011 (Lei de Acesso à Informação)</b>, a empresa <b>${esc(empresa?.razao || empresa?.nome)}</b>, inscrita no CNPJ sob o nº ${esc(empresa?.cnpj)}, vem requerer acesso às seguintes informações de interesse próprio e coletivo:</p>

<ol>
  <li>Qual a <b>data prevista para pagamento</b> da Nota Fiscal nº ${numeroNF}, emitida em ${dataEmissao}, no valor de <b>${brl(nota.valor)}</b>?</li>
  <li>A referida despesa já foi <b>liquidada</b>? Em caso afirmativo, em que data?</li>
  <li>Qual a <b>posição da Nota Fiscal nº ${numeroNF} na ordem cronológica de pagamentos</b> do órgão, conforme exige o art. 141, § 1º, da Lei 14.133/2021?</li>
  <li>Existem pagamentos a outros fornecedores, da mesma fonte de recursos, realizados ou programados <b>à frente</b> desta Nota Fiscal? Em caso afirmativo, qual a justificativa formal para a alteração da ordem cronológica?</li>
  <li>Cópia do <b>extrato da ordem cronológica de pagamentos</b> da fonte de recursos correspondente.</li>
</ol>

<div class="box"><b>Prazo legal de resposta:</b> nos termos do art. 11 da Lei 12.527/2011, o órgão deve responder <b>imediatamente</b> se a informação estiver disponível, ou no prazo de até <b>20 (vinte) dias</b>, prorrogável por mais 10. A ausência de resposta ou a recusa injustificada sujeita a autoridade responsável a sanções administrativas (art. 32 da mesma Lei).</div>

<p>Solicita-se que a resposta seja encaminhada para o e-mail <b>${esc(empresa?.email || "[E-MAIL]")}</b>.</p>

<div class="ass"><div class="linha"></div><b>${esc(empresa?.razao || empresa?.nome)}</b><br>CNPJ ${esc(empresa?.cnpj)}</div>
<div class="foot">Documento gerado pela plataforma ContrataX. A LAI obriga o órgão a responder sobre a previsão de pagamento e a ordem cronológica, criando rastro formal sem desgastar a relação comercial. Protocole no SIC do órgão (site oficial) ou presencialmente.</div>
</body></html>`;
}

// ===== 2. REPRESENTACAO AO TRIBUNAL DE CONTAS =====
export function gerarTceHtml({ nota, empresa }) {
  const orgao = esc(nota.orgao_nome || "[ORGAO PUBLICO]");
  const numeroNF = esc(nota.numero || "[NUMERO]");
  const dataEmissao = new Date(nota.data_emissao).toLocaleDateString("pt-BR");
  const atraso = diasAtraso(nota);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Representacao TCE - NF ${numeroNF}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${cabecalho(empresa, nota, "Representacao ao Tribunal de Contas")}
<div class="dest">Ao Tribunal de Contas do Estado / do Município competente<br>
<span style="font-size:10pt;color:#555">(protocolar pela Ouvidoria do TCE/TCM da sua região)</span></div>

<h1>Representação por Atraso de Pagamento</h1>

<p>A empresa <b>${esc(empresa?.razao || empresa?.nome)}</b>, CNPJ ${esc(empresa?.cnpj)}, vem apresentar <b>REPRESENTAÇÃO</b> em face do órgão <b>${orgao}</b>, pelos fatos a seguir.</p>

<p><b>1. Dos fatos.</b> A representante é credora do órgão pela Nota Fiscal nº ${numeroNF}, emitida em ${dataEmissao}, no valor de <b>${brl(nota.valor)}</b>, decorrente de contrato administrativo regularmente executado. O pagamento, que deveria ter ocorrido em até 30 dias da liquidação (art. 141 da Lei 14.133/2021), encontra-se em atraso há <b>${atraso} dias</b>.</p>

<p><b>2. Do descumprimento da ordem cronológica.</b> O art. 141, § 1º, da Lei 14.133/2021 impõe à Administração a obrigatoriedade de obedecer à ordem cronológica das exigibilidades para cada fonte de recursos, somente alterável mediante prévia justificativa formal e publicada. A representante tem fundado receio de que tal ordem não esteja sendo observada.</p>

<p><b>3. Do pedido.</b> Requer-se que esse Egrégio Tribunal:</p>
<ol>
  <li>Determine ao órgão a apresentação do <b>extrato da ordem cronológica de pagamentos</b> da fonte de recursos correspondente;</li>
  <li>Apure eventual <b>quebra injustificada da ordem cronológica</b> e a regularidade da gestão financeira do órgão;</li>
  <li>Adote as medidas cabíveis para <b>responsabilização do ordenador de despesas</b>, caso constatada irregularidade, nos termos da Lei Orgânica deste Tribunal.</li>
</ol>

<div class="box"><b>Por que esta peça funciona:</b> o Tribunal de Contas pode aplicar multa e inscrever o ordenador de despesas em contas irregulares. Gestores públicos costumam priorizar a regularização do pagamento assim que tomam ciência de uma representação, justamente para evitar a apuração formal.</div>

<div class="ass"><div class="linha"></div><b>${esc(empresa?.razao || empresa?.nome)}</b><br>CNPJ ${esc(empresa?.cnpj)}</div>
<div class="foot">Documento gerado pela plataforma ContrataX. Protocole pela Ouvidoria do Tribunal de Contas do seu Estado (TCE) ou do Município (TCM, onde houver). A maioria aceita protocolo eletrônico no site oficial. Anexe a NF e o comprovante de atraso.</div>
</body></html>`;
}

// ===== 3. MANIFESTACAO A OUVIDORIA DO ORGAO =====
export function gerarOuvidoriaHtml({ nota, empresa }) {
  const orgao = esc(nota.orgao_nome || "[ORGAO PUBLICO]");
  const numeroNF = esc(nota.numero || "[NUMERO]");
  const dataEmissao = new Date(nota.data_emissao).toLocaleDateString("pt-BR");
  const atraso = diasAtraso(nota);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Ouvidoria - NF ${numeroNF}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${cabecalho(empresa, nota, "Manifestacao a Ouvidoria")}
<div class="dest">À Ouvidoria do órgão<br><b>${orgao}</b></div>

<h1>Manifestação de Ouvidoria: Atraso de Pagamento</h1>

<p><b>Tipo de manifestação:</b> Reclamação.</p>

<p>A empresa <b>${esc(empresa?.razao || empresa?.nome)}</b>, CNPJ ${esc(empresa?.cnpj)}, registra reclamação formal pelo atraso no pagamento da Nota Fiscal nº ${numeroNF}, emitida em ${dataEmissao}, no valor de <b>${brl(nota.valor)}</b>, em atraso há <b>${atraso} dias</b> além do prazo legal de 30 dias (art. 141 da Lei 14.133/2021).</p>

<p><b>Providência solicitada:</b> informação sobre a data prevista de pagamento e regularização do débito com a brevidade possível.</p>

<div class="box">Nos termos da <b>Lei nº 13.460/2017</b> (Lei de Defesa do Usuário do Serviço Público), a ouvidoria deve responder a manifestação no prazo de <b>30 dias</b>, prorrogável por igual período mediante justificativa. O registro gera número de protocolo rastreável.</div>

<p>Resposta para o e-mail <b>${esc(empresa?.email || "[E-MAIL]")}</b>.</p>

<div class="ass"><div class="linha"></div><b>${esc(empresa?.razao || empresa?.nome)}</b><br>CNPJ ${esc(empresa?.cnpj)}</div>
<div class="foot">Documento gerado pela plataforma ContrataX. A maioria dos órgãos tem ouvidoria com protocolo eletrônico (procure por "Ouvidoria" no site oficial ou use a plataforma Fala.BR do governo federal para órgãos federais).</div>
</body></html>`;
}
