// Controle de uso das ANALISES de IA (o que custa $ do Claude). As BUSCAS sao
// gratuitas (so consulta no banco) e nao tem limite. Cada empresa tem uma cota
// mensal de analises novas; analise repetida vem do cache e NAO consome cota.

import { statusAtual } from "./assinatura.mjs";
import { lerPerfis, salvarPerfis } from "./perfis.mjs";

// Cota de analises por mes, conforme o estado da assinatura.
const LIMITE = {
  teste: Number(process.env.LICITA_ANALISES_TESTE || 5),
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
