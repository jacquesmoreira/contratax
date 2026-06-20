// "Criar Radar com IA": o cliente descreve em linguagem natural o que procura
// ("pregoes de merenda escolar em SC ate 50 mil, sem terceirizacao") e a IA
// converte em FILTROS de busca prontos. Barato (Haiku), reusa a chamada de IA.

import { chamar, temChave } from "./ia.mjs";

const MODELO = process.env.LICITA_MODELO_RADAR || "claude-haiku-4-5-20251001";
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const MODS = { pregao: 6, dispensa: 8, inexigibilidade: 9, concorrencia: 4, credenciamento: 12, leilao: 1 };

const INSTRUCAO = `Voce converte o pedido em linguagem natural de um fornecedor em FILTROS de busca de licitacoes publicas. Devolva APENAS um JSON valido, sem texto fora dele:
{
  "termos": ["1 a 4 palavras-chave do produto/servico"],
  "ufs": ["siglas de estado em MAIUSCULO, ou [] para Brasil todo"],
  "cidade": "nome da cidade ou null",
  "valorMin": numero_em_reais ou null,
  "valorMax": numero_em_reais ou null,
  "modalidade": "pregao" | "dispensa" | "concorrencia" | "credenciamento" | null,
  "excluir": ["termos a excluir do resultado, ou []"]
}
Regras:
- Extraia SOMENTE o que o usuario disse. Nao invente filtro que ele nao pediu.
- UFs validas: ${UFS.join(", ")}.
- Converta valores: "50 mil" = 50000, "1 milhao" = 1000000.
- "sem X", "exceto X", "menos X" => coloque X em excluir.
- Responda SO com o JSON.`;

export async function radarIA(texto, { perfilToken } = {}) {
  if (!temChave()) throw new Error("IA nao configurada");
  const t = String(texto || "").trim().slice(0, 300);
  if (t.length < 3) throw new Error("Descreva o que você procura");

  const corpo = { model: MODELO, max_tokens: 300, system: INSTRUCAO, messages: [{ role: "user", content: t }] };
  const resp = await chamar(corpo, { meta: { perfilToken: perfilToken || "_radar", etapa: "radar_ia" } });

  let j;
  try { j = JSON.parse(resp); }
  catch { const m = String(resp).match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : {}; }

  const ufs = (Array.isArray(j.ufs) ? j.ufs : []).map((u) => String(u).toUpperCase().trim()).filter((u) => UFS.includes(u));
  return {
    termos: (Array.isArray(j.termos) ? j.termos : []).slice(0, 4).map((x) => String(x).trim()).filter(Boolean),
    ufs,
    cidade: j.cidade ? String(j.cidade).trim() : "",
    valorMin: Number(j.valorMin) > 0 ? Number(j.valorMin) : null,
    valorMax: Number(j.valorMax) > 0 ? Number(j.valorMax) : null,
    modalidade: MODS[String(j.modalidade || "").toLowerCase()] || null,
    excluir: (Array.isArray(j.excluir) ? j.excluir : []).map((x) => String(x).trim()).filter(Boolean),
  };
}
