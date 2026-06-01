// Controle de uso das ANALISES de IA (o que custa $ do Claude). As BUSCAS sao
// gratuitas (so consulta no banco) e nao tem limite. Cada empresa tem uma cota
// mensal de analises novas; analise repetida vem do cache e NAO consome cota.

import { statusAtual } from "./assinatura.mjs";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";

// Cota de analises por mes, conforme o estado da assinatura.
// A analise por IA e um RECURSO DO PLANO PAGO (custa $ do Claude). No teste gratis
// a cota e 0 por padrao (recurso aparece, mas pede assinatura). Para dar uma
// "degustacao" no teste, basta setar LICITA_ANALISES_TESTE=1 (ou mais).
const LIMITE = {
  teste: Number(process.env.LICITA_ANALISES_TESTE || 0),
  ativo: Number(process.env.LICITA_ANALISES_PLANO || 50),
};

export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function limiteDe(perfil) {
  const s = statusAtual(perfil).status;
  if (s === "teste") return LIMITE.teste;
  if (s === "ativo" || s === "admin") return LIMITE.ativo;
  return 0; // teste_expirado / vencido / inativo: sem cota (painel ja bloqueia o acesso)
}

export function usoDe(perfil) {
  const mes = mesAtual();
  const a = perfil.analises && perfil.analises.mes === mes ? perfil.analises : { mes, usados: 0 };
  const limite = limiteDe(perfil);
  return { mes, usados: a.usados, limite, restantes: Math.max(0, limite - a.usados) };
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
  if (st === "ativo" || st === "admin") {
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

// Registra UMA analise nova (chame apenas em cache miss). Reseta no virar do mes.
export async function registrarAnalise(token) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) return null;
  const mes = mesAtual();
  if (!p.analises || p.analises.mes !== mes) p.analises = { mes, usados: 0 };
  p.analises.usados += 1;
  await salvarPerfis(perfis);
  return usoDe(p);
}
