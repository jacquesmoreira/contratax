// Camada 4: conferencia de aptidao. Cruza as exigencias do edital (Camada 3) com
// o perfil documental da empresa e diz se ela esta apta, e o que falta.
//
// Duas partes:
//  - saudeDocumental(): deterministica, roda SEM chave (saude das certidoes da empresa).
//  - conferirComIA(): cruzamento fino edital x empresa, usa o Claude (precisa de chave).

import { chamar, extrairJson, MODELO, temChave } from "./ia.mjs";
import { analisarEdital } from "./analise.mjs";
import { salvarConferencia, carregarConferencia } from "./store.mjs";

const ROTULOS_CERTIDAO = {
  federalConjunta: "Certidao Negativa Federal (Receita/PGFN)",
  fgts: "Certificado de Regularidade do FGTS",
  trabalhistaCNDT: "Certidao Negativa de Debitos Trabalhistas (CNDT)",
  estadual: "Certidao Negativa Estadual",
  municipal: "Certidao Negativa Municipal",
};

// Parte deterministica: confere a regularidade documental da propria empresa.
// Independe de edital e de chave de IA. Roda agora.
export function saudeDocumental(empresa, { hoje = new Date() } = {}) {
  const itens = [];
  for (const [chave, rotulo] of Object.entries(ROTULOS_CERTIDAO)) {
    const c = empresa.certidoes?.[chave];
    if (!c) {
      itens.push({ documento: rotulo, situacao: "ausente", validade: null });
      continue;
    }
    const vencida = c.status === "vencida" || (c.validade && new Date(c.validade) < hoje);
    itens.push({ documento: rotulo, situacao: vencida ? "vencida" : "valida", validade: c.validade ?? null });
  }
  const pendencias = itens.filter((i) => i.situacao !== "valida");
  return { itens, pendencias, regular: pendencias.length === 0 };
}

const INSTRUCAO_APTIDAO = `Voce e especialista em habilitacao em licitacoes publicas brasileiras (Lei 14.133/2021).
Recebe as EXIGENCIAS DE HABILITACAO de um edital e o PERFIL DOCUMENTAL de uma empresa.
Avalie, item a item, se a empresa ATENDE, NAO ATENDE ou PRECISA CONFIRMAR cada exigencia.
Responda SOMENTE com JSON valido, sem texto fora dele, nesta estrutura:

{
  "veredito": "apto | apto_com_pendencias | nao_apto",
  "resumo": "1 a 2 frases diretas sobre a situacao da empresa neste edital",
  "itens": [
    { "exigencia": "texto da exigencia", "situacao": "atende|nao_atende|confirmar", "observacao": "por que" }
  ],
  "pendencias": ["o que falta resolver antes de participar"],
  "proximosPassos": ["acoes concretas e praticas"]
}

Seja rigoroso: na duvida use "confirmar". Nao invente exigencias nem capacidades.`;

// Monta o corpo da chamada de IA (so texto, reaproveita a analise da Camada 3).
export function montarCorpoAptidao(analiseEdital, empresa, { modelo = MODELO } = {}) {
  const exigencias = analiseEdital.exigenciasHabilitacao ?? analiseEdital;
  const texto = `${INSTRUCAO_APTIDAO}

EXIGENCIAS DO EDITAL (JSON):
${JSON.stringify(exigencias, null, 2)}

PERFIL DOCUMENTAL DA EMPRESA (JSON):
${JSON.stringify(empresa, null, 2)}`;
  return { model: modelo, max_tokens: 4000, messages: [{ role: "user", content: [{ type: "text", text: texto }] }] };
}

// Cruzamento fino via IA (precisa de chave).
export async function conferirComIA(analiseEdital, empresa, opcoes = {}) {
  return extrairJson(await chamar(montarCorpoAptidao(analiseEdital, empresa, opcoes), { meta: opcoes.meta }));
}

// Orquestra a conferencia completa de um edital para uma empresa.
// Sempre devolve a saude documental (deterministica). A parte de IA roda se houver chave.
export async function conferir(edital, empresa, { forcar = false } = {}) {
  const saude = saudeDocumental(empresa);

  if (!forcar) {
    const cache = await carregarConferencia(edital.id, empresa.id);
    if (cache) return { ...cache.dados, saude, cache: true };
  }

  const { analise } = await analisarEdital(edital); // Camada 3
  const aptidao = await conferirComIA(analise, empresa, { meta: { etapa: "conferencia", editalId: edital.id, empresaId: empresa.id } }); // Camada 4
  const dados = { aptidao, analiseResumo: analise.resumo };
  await salvarConferencia(edital.id, empresa.id, dados);
  return { ...dados, saude, cache: false };
}

// Simulacao: devolve a parte que roda sem chave e sinaliza prontidao da parte de IA.
export function simular(empresa) {
  return { saude: saudeDocumental(empresa), temChave: temChave() };
}
