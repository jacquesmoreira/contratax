// Kit de Habilitacao: um unico documento (HTML pra PDF) que junta TODAS as
// declaracoes de habilitacao (cada uma numa pagina, pronta pra assinar) + um
// checklist das certidoes da empresa com validade e status. E o "imprima tudo
// de uma vez" pra montar o envelope/anexo de habilitacao. Sem custo de IA.
//
// NAO substitui as certidoes oficiais (que o cliente emite nos sites dos orgaos):
// o checklist so organiza o que ele ja cadastrou e avisa o que esta vencido ou
// faltando. As declaracoes sim sao geradas prontas.

import { gerarDeclaracoes } from "./declaracoes.mjs";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
// Parseia data. "YYYY-MM-DD" vira data LOCAL (senao new Date interpreta como UTC
// e o fuso -3 joga a validade pro dia anterior).
function parseData(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function dataBR(s) {
  const d = parseData(s);
  return d ? d.toLocaleDateString("pt-BR") : "";
}

// Certidoes padrao da habilitacao (mesma lista do cadastro em documentos.html).
const CERTIDOES = [
  { id: "federalConjunta", nome: "Certidão Negativa de Débitos Federais e Dívida Ativa da União", org: "Receita Federal / PGFN" },
  { id: "fgts", nome: "Certificado de Regularidade do FGTS (CRF)", org: "Caixa Econômica Federal" },
  { id: "trabalhistaCNDT", nome: "Certidão Negativa de Débitos Trabalhistas (CNDT)", org: "Justiça do Trabalho / TST" },
  { id: "estadual", nome: "Certidão Negativa de Débitos Estaduais", org: "Fazenda do seu estado" },
  { id: "municipal", nome: "Certidão Negativa de Débitos Municipais", org: "Prefeitura da sua sede" },
];

function statusCertidao(validade) {
  const v = parseData(validade);
  if (!v) return { txt: "Não cadastrada", cor: "#b45309", bg: "#fef3c7" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (v < hoje) return { txt: `Vencida em ${dataBR(validade)}`, cor: "#b91c1c", bg: "#fee2e2" };
  return { txt: `Válida até ${dataBR(validade)}`, cor: "#166534", bg: "#dcfce7" };
}

function estilo() {
  return `<style>
@page { size:A4; margin:22mm 20mm; }
body { font-family:Georgia,"Times New Roman",serif; color:#111; font-size:11.5pt; line-height:1.55; max-width:172mm; margin:0 auto; padding:24px; }
.capa { border-bottom:2px solid #111; padding-bottom:12px; margin-bottom:20px; }
.razao { font-weight:700; font-size:15pt; }
h1 { font-size:15pt; text-align:center; margin:20px 0 6px; text-transform:uppercase; letter-spacing:1px; }
h2 { font-size:12.5pt; margin:22px 0 8px; }
p { margin:9px 0; text-align:justify; }
table { width:100%; border-collapse:collapse; margin:10px 0; font-size:10pt; }
th, td { border:1px solid #999; padding:7px 9px; text-align:left; vertical-align:top; }
th { background:#eee; }
.pill { display:inline-block; font-weight:700; font-size:9pt; padding:2px 8px; border-radius:99px; }
.decl { page-break-before:always; }
.decl h2 { text-align:center; text-transform:uppercase; font-size:12pt; letter-spacing:.5px; }
.decl .corpo { white-space:normal; }
.ass { margin-top:40px; text-align:center; }
.ass .linha { border-top:1px solid #111; width:62%; margin:0 auto 6px; }
.foot { margin-top:26px; font-size:9pt; color:#666; border-top:1px solid #ccc; padding-top:8px; }
.botoes { text-align:center; margin:10px 0 20px; }
.botoes button { padding:10px 18px; background:#4338ca; color:#fff; border:none; border-radius:8px; font-size:12pt; font-family:inherit; cursor:pointer; font-weight:700; }
@media print { .botoes { display:none; } .decl { page-break-before:always; } }
</style>`;
}

// Converte o texto da declaracao (com \n) em HTML: 1a linha vira titulo, o resto
// paragrafos; a linha de assinatura (com "____") vira bloco de assinatura.
function declaracaoHTML(d) {
  const linhas = d.texto.split("\n");
  const titulo = linhas[0];
  const resto = linhas.slice(1).join("\n").trim();
  const partes = resto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const corpo = partes.map((p) => {
    if (p.includes("____")) {
      return `<div class="ass"><div class="linha"></div>${esc(p.replace(/_+/g, "").trim()).replace(/\n/g, "<br>")}</div>`;
    }
    return `<p>${esc(p).replace(/\n/g, "<br>")}</p>`;
  }).join("");
  return `<div class="decl"><h2>${esc(titulo)}</h2><div class="corpo">${corpo}</div></div>`;
}

// empresa: { razao/razaoSocial/nome, cnpj, endereco, certidoes:{id:{validade}}, representante:{} }
export function kitHabilitacao(empresa = {}) {
  const razao = empresa.razao || empresa.razaoSocial || empresa.nome || "[RAZÃO SOCIAL]";
  const cnpj = empresa.cnpj || "[CNPJ]";
  const certs = empresa.certidoes || {};
  const declaracoes = gerarDeclaracoes(empresa);

  const linhasCert = CERTIDOES.map((c) => {
    const validade = certs[c.id]?.validade || null;
    const st = statusCertidao(validade);
    return `<tr>
      <td><b>${esc(c.nome)}</b><br><span style="font-size:9pt;color:#555">${esc(c.org)}</span></td>
      <td><span class="pill" style="color:${st.cor};background:${st.bg}">${esc(st.txt)}</span></td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Kit de Habilitação - ${esc(razao)}</title>${estilo()}</head><body>
<div class="botoes"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<div class="capa">
  <div class="razao">${esc(razao)}</div>
  <div style="font-size:10pt">CNPJ ${esc(cnpj)}</div>
</div>
<h1>Kit de Habilitação</h1>
<p style="text-align:center;color:#555;font-size:10pt;margin-top:0">Declarações padrão da Lei 14.133/2021 + checklist das suas certidões</p>

<h2>Checklist de certidões de regularidade</h2>
<table>
  <thead><tr><th>Documento</th><th style="width:40%">Situação (do seu cadastro)</th></tr></thead>
  <tbody>${linhasCert}</tbody>
</table>
<p style="font-size:9.5pt;color:#555">Emita as certidões atualizadas nos sites oficiais dos órgãos e anexe junto com as declarações abaixo. O status acima reflete o que você cadastrou no ContrataX.</p>

${declaracoes.map(declaracaoHTML).join("")}

<div class="foot">Documento gerado pela plataforma ContrataX a partir do cadastro da sua empresa. As declarações são modelos padrão da Lei 14.133/2021, prontas para conferência e assinatura. Revise os dados e as exigências específicas do edital antes de protocolar. As certidões oficiais devem ser emitidas nos sites dos respectivos órgãos.</div>
</body></html>`;
}
