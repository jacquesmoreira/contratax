// Templates baixaveis (CSV/MD) que o cliente pode usar como ponto de partida.
// Geram conteudo programaticamente, nao precisam de arquivos em disco.

const BOM = "\u{FEFF}";

function csv(linhas) {
  return BOM + linhas.map((l) => l.map((c) => {
    const s = String(c ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\r\n");
}

export const TEMPLATES = {
  "pesquisa-precos": {
    nome: "Planilha de pesquisa de preços",
    descricao: "Modelo pronto pra registrar 3+ cotações de mercado e calcular preço de referência. Exigido em quase todo edital.",
    ext: "csv",
    gerar() {
      return csv([
        ["Item", "Descrição detalhada", "Unidade", "Quantidade", "Fornecedor 1", "Preço unit. 1", "Fornecedor 2", "Preço unit. 2", "Fornecedor 3", "Preço unit. 3", "Preço médio", "Preço mínimo", "Preço máximo", "Observações"],
        ["1", "[descreva o item]", "un", "100", "[nome]", "0,00", "[nome]", "0,00", "[nome]", "0,00", "0,00", "0,00", "0,00", ""],
        ["2", "", "un", "", "", "", "", "", "", "", "", "", "", ""],
        ["3", "", "un", "", "", "", "", "", "", "", "", "", "", ""],
      ]);
    },
  },
  "checklist-habilitacao": {
    nome: "Checklist de habilitação (Lei 14.133)",
    descricao: "Lista completa de documentos exigidos em licitação, organizada nas 5 categorias da Lei 14.133/2021.",
    ext: "md",
    gerar() {
      return `# Checklist de Habilitação — Lei 14.133/2021

> Marque o que tem em mãos antes de cada pregão. Empresa com tudo organizado não perde licitação por bobagem.

## 1. Habilitação Jurídica (art. 66)

- [ ] Contrato social ou estatuto consolidado (com últimas alterações)
- [ ] Registro na Junta Comercial
- [ ] Inscrição no CNPJ ativa
- [ ] Procuração (se for representado por terceiros)
- [ ] CCMEI (no caso de MEI)

## 2. Regularidade Fiscal e Trabalhista (art. 68)

- [ ] Certidão Negativa Federal Conjunta (Receita + PGFN) — validade 180 dias
- [ ] Certificado de Regularidade do FGTS (CRF) — **validade 30 dias** ⚠️
- [ ] Certidão Negativa de Débitos Trabalhistas (CNDT) — validade 180 dias
- [ ] Certidão Negativa Estadual — validade 30-60 dias
- [ ] Certidão Negativa Municipal — validade 30-90 dias

## 3. Qualificação Econômico-Financeira (art. 69)

- [ ] Certidão Negativa de Falência e Recuperação Judicial
- [ ] Balanço Patrimonial e DRE do último exercício
- [ ] Comprovação de capital social mínimo (geralmente 10% do valor estimado)
- [ ] Índices de liquidez dentro do exigido (quando aplicável)

## 4. Qualificação Técnica (art. 67)

- [ ] Atestado(s) de Capacidade Técnica de cliente(s) anterior(es)
- [ ] Registro em conselho de classe (CREA, CRM, CRC, etc, se aplicável)
- [ ] Licenças específicas (ANVISA, sanitária, ambiental, etc, conforme objeto)
- [ ] Equipe técnica mínima documentada (quando exigido)

## 5. Declarações Padrão

- [ ] Declaração de Idoneidade
- [ ] Declaração de não-emprego de menor (art. 7º, XXXIII CF)
- [ ] Declaração de ME/EPP/MEI (se aplicável)
- [ ] Declaração de Cumprimento dos Requisitos do Edital
- [ ] Declaração de Inexistência de Fatos Impeditivos

## Antes do pregão

- [ ] Confirmar TODAS as datas de validade no dia do pregão
- [ ] SICAF atualizado (se for licitação federal)
- [ ] Cadastro ativo na plataforma onde o pregão acontece
- [ ] Acesso ao sistema testado 24h antes
- [ ] Proposta calculada com margem mínima definida

---
Gerado pelo ContrataX. Veja seus alertas de certidão em https://www.contratax.com.br/painel
`;
    },
  },
  "modelo-impugnacao": {
    nome: "Modelo de impugnação ao edital",
    descricao: "Estrutura pronta de petição de impugnação. Preencha os campos entre colchetes.",
    ext: "md",
    gerar() {
      return `# IMPUGNAÇÃO AO EDITAL DO PREGÃO ELETRÔNICO Nº [número]

**Ao(à) Pregoeiro(a) do(a) [órgão público]**

[RAZÃO SOCIAL DA SUA EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [00.000.000/0001-00], com sede em [endereço completo], neste ato representada por [nome do representante legal], vem, respeitosamente, à presença de Vossa Senhoria, com fundamento no art. 164 da Lei nº 14.133/2021, IMPUGNAR o edital do pregão eletrônico em epígrafe, pelas razões de fato e direito a seguir expostas.

## I. DA TEMPESTIVIDADE

O edital foi publicado em [data], com sessão de abertura marcada para [data e hora]. Considerando o prazo de até 3 dias úteis antes da sessão (art. 164 da Lei 14.133/2021), a presente impugnação é tempestiva.

## II. DOS FATOS

O item [X] do edital prevê:

> "[transcreva literalmente a cláusula impugnada]"

## III. DO DIREITO

[Fundamente. Cite o artigo da Lei 14.133/2021 + súmula do TCU aplicável + jurisprudência se houver. Exemplos:

- Para atestado com quantitativo excessivo: Súmula 263 do TCU + art. 67 da Lei 14.133
- Para marca específica sem justificativa: art. 41, I da Lei 14.133
- Para visita técnica obrigatória sem fundamento: art. 63, V da Lei 14.133
- Para restrição geográfica indevida: art. 9º, II da Lei 14.133]

A exigência atual viola os princípios da competitividade e da isonomia, restringindo indevidamente a participação de licitantes capazes.

## IV. DO PEDIDO

Diante do exposto, requer:

a) **A reforma do item [X]** do edital, adequando-o à legislação vigente, com a seguinte redação sugerida: "[proponha nova redação]";

b) Subsidiariamente, **a anulação integral do edital**, com nova publicação após a correção da ilegalidade;

c) A **suspensão da sessão de abertura** até a decisão final sobre a presente impugnação.

Termos em que pede deferimento.

[Cidade], [dia] de [mês] de [ano].

_________________________________________
[Nome do representante legal]
[CPF]
[Cargo]

---
Modelo gerado pelo ContrataX. A petição é um ponto de partida; revise com seu jurídico antes de protocolar.
`;
    },
  },
  "calendario-certidoes": {
    nome: "Calendário de validade de certidões",
    descricao: "Planilha pra acompanhar a validade de cada certidão e nunca mais ser desclassificado por documento vencido.",
    ext: "csv",
    gerar() {
      return csv([
        ["Certidão", "Órgão emissor", "Data emissão", "Data validade", "Validade típica", "Onde renovar", "Status"],
        ["Federal Conjunta (Receita + PGFN)", "Receita Federal/PGFN", "", "", "180 dias", "regularize.pgfn.gov.br", "Em dia / Vence em X dias / Vencida"],
        ["FGTS (CRF)", "Caixa Econômica", "", "", "30 dias ⚠️", "consulta-crf.caixa.gov.br", ""],
        ["CNDT (Trabalhista)", "Tribunal Superior do Trabalho", "", "", "180 dias", "cndt-certidao.tst.jus.br", ""],
        ["Estadual", "Sefaz do estado", "", "", "30-60 dias", "site da Sefaz", ""],
        ["Municipal", "Prefeitura", "", "", "30-90 dias", "site da Prefeitura", ""],
        ["Falência e Recuperação", "Tribunal de Justiça", "", "", "30-90 dias", "site do TJ", ""],
      ]);
    },
  },
};

export function listarTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, nome: t.nome, descricao: t.descricao, ext: t.ext }));
}

export function gerarTemplate(id) {
  const t = TEMPLATES[id];
  if (!t) return null;
  return { conteudo: t.gerar(), nome: t.nome, ext: t.ext };
}
