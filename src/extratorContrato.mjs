// Extracao automatica de dados de um contrato administrativo (PDF ou XML).
//
// Estrategia:
//   1) Se for XML do PNCP (instrumento contratual publicado), faz regex direto.
//      Zero custo de IA.
//   2) Se for PDF do contrato (cliente subiu), usa Claude Haiku (modelo barato)
//      para extrair os 7 campos chave: numero, orgao_nome, orgao_cnpj, objeto,
//      valor_total, data_inicio, data_fim.
//
// Custo estimado: PDF de ~10 paginas com Haiku gira em torno de R$ 0,05 a 0,15
// por extracao. Eh aceitavel ja que e uma acao de cadastro (raro), nao recorrente.

import { chamar, extrairJson, temChave } from "./ia.mjs";

// Modelo padrao (barato) pra contrato normal. Haiku 4.5 = janela de 200K tokens.
const MODELO_EXTRACAO = process.env.LICITA_MODELO_EXTRATOR || "claude-haiku-4-5-20251001";
// Modelo de FALLBACK pra PDF grande (ata de registro de precos). Sonnet 4.6 =
// janela de 1 MILHAO de tokens, cabe a ata gigante que estoura o Haiku. Custa
// mais (~5x), mas so e usado no caso raro de documento extenso.
const MODELO_EXTRACAO_GRANDE = process.env.LICITA_MODELO_EXTRATOR_GRANDE || "claude-sonnet-4-6";

const INSTRUCAO = `Voce esta lendo o PDF de um CONTRATO ADMINISTRATIVO firmado entre uma empresa privada e um orgao publico brasileiro. Extraia os campos abaixo e devolva APENAS JSON valido, sem comentarios:

{
  "numero": "numero do contrato como aparece (ex: '045/2025' ou '12.345.6/789')",
  "pregao": "numero do pregao/licitacao que originou o contrato (ex: 'PE 159/2025', 'Pregao Eletronico 26/2026') ou null se nao constar",
  "processo": "numero do processo administrativo (ex: 'Processo 332/2024', '10.2026') ou null se nao constar",
  "orgaoNome": "nome completo do orgao contratante (a CONTRATANTE), ex: 'PREFEITURA MUNICIPAL DE FLORIANOPOLIS'",
  "orgaoCnpj": "CNPJ do orgao (somente digitos, 14 chars)",
  "objeto": "descricao do objeto do contrato (1-3 frases)",
  "valorTotal": numero (valor global do contrato em reais, sem formatacao, ex: 120000.50),
  "dataInicio": "data de inicio da vigencia (formato AAAA-MM-DD)",
  "dataFim": "data de termino da vigencia (formato AAAA-MM-DD). Se houver vigencia em meses a contar do inicio, calcule.",
  "indiceReajuste": "indice de reajuste pactuado (IPCA, INPC, INCC, etc.) ou null se nao constar"
}

Regras:
- Se um campo nao for encontrado, use null (nao invente).
- Datas: se houver 'sessenta dias' ou 'doze meses', traduza para AAAA-MM-DD baseado na data inicio.
- valorTotal: se houver 'valor mensal' e 'numero de meses', multiplique. Se houver apenas valor mensal, registre o anual.
- A CONTRATANTE e o orgao publico, NAO a empresa privada. Cuidado para nao trocar.`;

// 1) Parser de XML do instrumento contratual do PNCP.
//    Estrutura tipica: <contrato>...</contrato> com tags identificaveis.
//    Cobre os formatos mais comuns; cai pra IA se nao reconhecer.
export function parsearXmlContrato(xml) {
  if (!xml || typeof xml !== "string") return null;
  if (!/<contrato\b|<Contrato\b|<instrumentoContratual\b/i.test(xml)) return null;
  const pegar = (re) => { const m = xml.match(re); return m ? m[1].trim() : null; };
  const numero = pegar(/<numero[^>]*>([^<]+)<\/numero>/i)
    || pegar(/<numeroContrato[^>]*>([^<]+)<\/numeroContrato>/i);
  const pregao = pegar(/<numeroProcessoLicitacao[^>]*>([^<]+)<\/numeroProcessoLicitacao>/i)
    || pegar(/<numeroCompra[^>]*>([^<]+)<\/numeroCompra>/i)
    || pegar(/<identificadorCompra[^>]*>([^<]+)<\/identificadorCompra>/i);
  const processo = pegar(/<processo[^>]*>([^<]+)<\/processo>/i)
    || pegar(/<numeroProcesso[^>]*>([^<]+)<\/numeroProcesso>/i);
  const orgaoNome = pegar(/<orgao[^>]*>([\s\S]*?)<\/orgao>/i)?.match(/<nome[^>]*>([^<]+)<\/nome>/i)?.[1]
    || pegar(/<orgaoNome[^>]*>([^<]+)<\/orgaoNome>/i)
    || pegar(/<razaoSocial[^>]*>([^<]+)<\/razaoSocial>/i);
  const orgaoCnpj = pegar(/<orgaoCnpj[^>]*>([\s\d.\-/]+)<\/orgaoCnpj>/i)
    || pegar(/<cnpj[^>]*>([\s\d.\-/]+)<\/cnpj>/i);
  const objeto = pegar(/<objeto[^>]*>([^<]+)<\/objeto>/i)
    || pegar(/<objetoContrato[^>]*>([^<]+)<\/objetoContrato>/i);
  const valor = pegar(/<valorTotal[^>]*>([\d.,]+)<\/valorTotal>/i)
    || pegar(/<valorGlobal[^>]*>([\d.,]+)<\/valorGlobal>/i);
  const dataInicio = pegar(/<dataInicioVigencia[^>]*>([^<]+)<\/dataInicioVigencia>/i)
    || pegar(/<vigenciaInicio[^>]*>([^<]+)<\/vigenciaInicio>/i);
  const dataFim = pegar(/<dataFimVigencia[^>]*>([^<]+)<\/dataFimVigencia>/i)
    || pegar(/<vigenciaFim[^>]*>([^<]+)<\/vigenciaFim>/i);
  if (!numero && !orgaoNome && !valor) return null;
  return {
    numero,
    pregao: pregao || null,
    processo: processo || null,
    orgaoNome,
    orgaoCnpj: orgaoCnpj ? orgaoCnpj.replace(/\D+/g, "") : null,
    objeto,
    valorTotal: valor ? Number(String(valor).replace(/\./g, "").replace(",", ".")) : null,
    dataInicio: dataInicio ? dataInicio.slice(0, 10) : null,
    dataFim: dataFim ? dataFim.slice(0, 10) : null,
    indiceReajuste: null,
    fonte: "xml",
  };
}

// Estimativa BARATA (zero-dependency) de quantas paginas um PDF tem: conta os
// objetos "/Type /Page" (ignorando "/Type /Pages", que e o no-arvore). Nao e
// exato, mas serve pra detectar uma ata de registro de precos gigante antes de
// gastar a chamada de IA (que estouraria o limite de contexto).
function estimarPaginasPdf(buffer) {
  try {
    const txt = buffer.toString("latin1");
    const m = txt.match(/\/Type\s*\/Page(?![s])/g);
    return m ? m.length : 0;
  } catch { return 0; }
}

// Acima deste tamanho o PDF provavelmente estoura a janela do Haiku (200K) -> usa
// o Sonnet (1M). ~40 paginas densas de ata ja passam de 200K tokens.
const LIMIAR_SONNET = Number(process.env.LICITA_LIMIAR_SONNET_PAGINAS || 40);
// Acima disso nem o Sonnet (1M) garante caber: ai sim avisa pra cadastrar manual.
const MAX_PAGINAS_CONTRATO = Number(process.env.LICITA_MAX_PAGINAS_CONTRATO || 250);

// 2) Extracao de PDF via IA. Pequeno -> Haiku (barato); grande (ata de registro
// de precos) -> Sonnet 4.6 (janela de 1M), que cabe onde o Haiku estoura.
export async function extrairContratoPdf(pdfBuffer) {
  if (!temChave()) throw new Error("ANTHROPIC_API_KEY nao definida");
  if (!Buffer.isBuffer(pdfBuffer)) throw new Error("Esperado Buffer");
  if (pdfBuffer.length > 30 * 1024 * 1024) throw new Error("PDF maior que 30 MB");

  const paginas = estimarPaginasPdf(pdfBuffer);
  // Documento absurdamente grande: nem 1M de contexto cabe. Avisa pra cadastrar
  // manual (caso extremo; uma ata normal nao chega perto disso).
  if (paginas > MAX_PAGINAS_CONTRATO) {
    const e = new Error(`Este arquivo e muito extenso (cerca de ${paginas} paginas) para a leitura automatica. Suba apenas o CONTRATO assinado, ou cadastre os dados principais manualmente.`);
    e.codigo = "pdf_muitas_paginas";
    throw e;
  }
  // Escolhe o modelo pelo tamanho: ata grande -> Sonnet (1M); resto -> Haiku.
  const modelo = paginas > LIMIAR_SONNET ? MODELO_EXTRACAO_GRANDE : MODELO_EXTRACAO;
  const corpo = {
    model: modelo,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        { type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
          cache_control: { type: "ephemeral" } },
        { type: "text", text: INSTRUCAO },
      ],
    }],
  };
  const texto = await chamar(corpo, { meta: { perfilToken: "_extracao_contrato", editalId: "_extracao", etapa: "extracao_contrato" } });
  const dados = extrairJson(texto);
  return { ...dados, fonte: "pdf" };
}

// Detector simples de tipo do arquivo bruto.
export function detectarTipo(bufferOuString) {
  if (Buffer.isBuffer(bufferOuString)) {
    const cab = bufferOuString.slice(0, 8).toString("utf8");
    if (cab.startsWith("%PDF")) return "pdf";
    const inicio = bufferOuString.slice(0, 200).toString("utf8");
    if (/^\s*<\?xml|<contrato\b|<Contrato\b/i.test(inicio)) return "xml";
    return "desconhecido";
  }
  if (typeof bufferOuString === "string") {
    if (/^\s*<\?xml|<contrato\b/i.test(bufferOuString.slice(0, 200))) return "xml";
    return "desconhecido";
  }
  return "desconhecido";
}
