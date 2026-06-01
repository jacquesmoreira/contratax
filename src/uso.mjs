// Controle de uso das ANALISES de IA (o que custa $ do Claude). As BUSCAS sao
// gratuitas (so consulta no banco) e nao tem limite. Cada empresa tem uma cota
// mensal de analises novas; analise repetida vem do cache e NAO consome cota.

import { statusAtual } from "./assinatura.mjs";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { planoDe } from "./planos.mjs";

// Cota mensal de analises no teste gratis (0 por padrao: recurso aparece mas pede
// assinatura; LICITA_ANALISES_TESTE=1+ libera uma "degustacao").
const ANALISES_TESTE = Number(process.env.LICITA_ANALISES_TESTE || 0);

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
