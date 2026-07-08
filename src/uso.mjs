// Controle de uso das ANALISES de IA (o que custa $ do Claude). As BUSCAS sao
// gratuitas (so consulta no banco) e nao tem limite. Cada empresa tem uma cota
// mensal de analises novas; analise repetida vem do cache e NAO consome cota.

import { statusAtual } from "./assinatura.mjs";
import { lerPerfis, salvarPerfis, atualizarPerfil } from "./perfis.mjs";
import { planoDe } from "./planos.mjs";

// Cota de analises no teste gratis. Default 3: o cliente PRECISA sentir o veredito
// durante o teste, senao o diferencial nunca dispara e ele nao converte (era 0 =
// clicava em "analisar" e batia num paywall). Anti-abuso vem do cadastro (1 CNPJ
// unico, ativo na Receita). Ajustavel via LICITA_ANALISES_TESTE no Railway.
const ANALISES_TESTE = Number(process.env.LICITA_ANALISES_TESTE || 3);

export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Cota MENSAL conforme o estado/plano. Ativo => cota do plano (basico/pro).
export function limiteDe(perfil) {
  const s = statusAtual(perfil).status;
  if (s === "teste") return ANALISES_TESTE;
  if (s === "ativo" || s === "admin" || s === "atrasado") return planoDe(perfil).analises; // carencia mantem acesso
  return 0; // teste_expirado / vencido / inativo: sem cota (painel ja bloqueia o acesso)
}

// Creditos avulsos (pacotes comprados a mais) nao expiram no virar do mes.
function avulsasDe(perfil) {
  return Math.max(0, perfil.analises?.avulsas || 0);
}

export function usoDe(perfil) {
  const mes = mesAtual();
  const usados = perfil.analises && perfil.analises.mes === mes ? perfil.analises.usados : 0;
  const limite = limiteDe(perfil);
  const avulsas = avulsasDe(perfil);
  const restantesMes = Math.max(0, limite - usados);
  return { mes, usados, limite, avulsas, restantes: restantesMes + avulsas };
}

export function podeAnalisar(perfil) {
  return usoDe(perfil).restantes > 0;
}

// Decide se o cliente pode disparar uma analise agora, e por que nao (para a UI
// mostrar "assine" vs "limite do mes atingido"). A analise so roda para assinatura
// ativa (ou degustacao do teste, se configurada).
export function checarAnalise(perfil) {
  const st = statusAtual(perfil).status;
  const uso = usoDe(perfil);
  if (st === "ativo" || st === "admin" || st === "atrasado") {
    return uso.restantes > 0
      ? { ok: true, uso }
      : { ok: false, motivo: "limite", uso };
  }
  if (st === "teste") {
    return uso.restantes > 0
      ? { ok: true, uso } // degustacao configurada (LICITA_ANALISES_TESTE>0)
      : { ok: false, motivo: "assinatura", uso };
  }
  // teste_expirado / vencido / inativo
  return { ok: false, motivo: "assinatura", uso };
}

// Registra UMA analise nova (chame apenas em cache miss). Consome primeiro a cota
// mensal; esgotada, consome creditos avulsos. Os avulsos persistem entre meses.
export async function registrarAnalise(token) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) return null;
  const mes = mesAtual();
  const avulsas = Math.max(0, p.analises?.avulsas || 0);
  if (!p.analises || p.analises.mes !== mes) p.analises = { mes, usados: 0, avulsas };
  if (p.analises.usados < limiteDe(p)) {
    p.analises.usados += 1; // dentro da cota mensal
  } else if (p.analises.avulsas > 0) {
    p.analises.avulsas -= 1; // estourou o mes: usa credito avulso
  }
  await salvarPerfis(perfis);
  return usoDe(p);
}

// === Cota de EXTRACOES de PDF de contrato (Haiku, custo baixo) ===
// Separada da cota de analises de edital. XML do PNCP nao consome essa cota
// (parsing local, custo zero). Apenas PDF consome.
export function limiteExtracoesPdf(perfil) {
  const s = statusAtual(perfil).status;
  if (s === "ativo" || s === "admin" || s === "atrasado") {
    return planoDe(perfil).extracoesPdf ?? 5;
  }
  if (s === "teste") return 2; // degustacao curta no teste
  return 0;
}

export function usoExtracoesDe(perfil) {
  const mes = mesAtual();
  const usados = perfil.extracoesPdf && perfil.extracoesPdf.mes === mes ? perfil.extracoesPdf.usados : 0;
  const limite = limiteExtracoesPdf(perfil);
  return { mes, usados, limite, restantes: Math.max(0, limite - usados) };
}

export function podeExtrairPdf(perfil) {
  return usoExtracoesDe(perfil).restantes > 0;
}

export async function registrarExtracaoPdf(token) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) return null;
  const mes = mesAtual();
  if (!p.extracoesPdf || p.extracoesPdf.mes !== mes) p.extracoesPdf = { mes, usados: 0 };
  p.extracoesPdf.usados += 1;
  await salvarPerfis(perfis);
  return usoExtracoesDe(p);
}

// === Engajamento: resumos rapidos (TL;DR) servidos ao cliente ===
// Mede uso de IA percebido pelo cliente, incluindo CACHE HIT (R$0). Sem isso
// o engajamento fica invisivel no admin: o caso comum e cache hit, que nao
// gera custo nem consome cota e por isso nao aparece em nenhum contador. Nao
// e cota nem cobra nada; e so um medidor. Write race-safe e barato (perfis.json
// e pequeno). NAO conta no custo em R$ (cache hit nao chama IA).
export async function registrarResumo(token) {
  await atualizarPerfil(token, (p) => {
    if (!p._resumos) p._resumos = { n: 0, ultimo: null };
    p._resumos.n += 1;
    p._resumos.ultimo = new Date().toISOString();
  });
}

export function resumosDe(perfil) {
  return { n: perfil._resumos?.n || 0, ultimo: perfil._resumos?.ultimo || null };
}

// Adiciona creditos avulsos (chamado pelo webhook de pagamento de pacote avulso).
export async function adicionarAvulsas(token, qtd) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) return null;
  const mes = mesAtual();
  if (!p.analises || p.analises.mes !== mes) p.analises = { mes, usados: p.analises?.usados || 0, avulsas: 0 };
  p.analises.avulsas = Math.max(0, (p.analises.avulsas || 0) + Number(qtd || 0));
  await salvarPerfis(perfis);
  return usoDe(p);
}
