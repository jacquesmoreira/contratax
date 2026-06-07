// Anonimizacao de IPs em logs antigos (LGPD-friendly).
//
// O ContrataX guarda IP em alguns lugares por motivo legitimo:
//   - perfil.aceiteTermos.ip (prova juridica do clickwrap)
//   - data/custos-ia.jsonl (auditoria de custo, indireto via perfil)
//
// Apos N dias (default 30), mascara o IP guardado: 189.45.67.123 vira
// 189.45.x.x (mantem os 2 primeiros octetos pra rastrear regiao geografica,
// remove os 2 ultimos que identificam o dispositivo). Reduz superficie de
// vazamento sem perder a prova juridica do consentimento (a data e a versao
// dos termos continuam intactas).
//
// Politica: dados pessoais identificadores devem ser mantidos pelo tempo
// MINIMO necessario para a finalidade. 30 dias e suficiente pra rastrear
// fraude/abuso recente; alem disso, vira dado anonimizado.

import { lerPerfis, salvarPerfis } from "./perfis.mjs";

const DIAS_RETENCAO = Number(process.env.LICITA_IP_RETENCAO_DIAS || 30);

// Mascara IPv4: 189.45.67.123 -> 189.45.x.x
// IPv6: ::1 -> ::x (simplificado)
function mascararIP(ip) {
  if (!ip) return ip;
  const s = String(ip);
  // IPv4
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  // IPv6 simples
  if (s.includes(":")) {
    const partes = s.split(":");
    if (partes.length > 2) return partes.slice(0, 2).join(":") + ":x:x:x:x:x:x";
    return "::x";
  }
  return "x.x.x.x";
}

// Aplica anonimizacao nos perfis. Retorna { perfisAnonimizados, ipsAfetados }.
export async function anonimizarLogsAntigos({ log = console.log } = {}) {
  const corte = Date.now() - DIAS_RETENCAO * 864e5;
  const perfis = await lerPerfis();
  let perfisAfetados = 0, ipsAfetados = 0;

  for (const p of perfis) {
    if (!p.aceiteTermos?.ip) continue;
    // Ja anonimizado (contem "x")
    if (String(p.aceiteTermos.ip).includes("x")) continue;
    // Aceite recente: nao mexe
    const emData = p.aceiteTermos.em ? new Date(p.aceiteTermos.em).getTime() : 0;
    if (emData > corte) continue;
    // Anonimiza
    p.aceiteTermos.ipOriginal = undefined; // garante nao ter raw guardado
    p.aceiteTermos.ip = mascararIP(p.aceiteTermos.ip);
    p.aceiteTermos.anonimizadoEm = new Date().toISOString();
    perfisAfetados++;
    ipsAfetados++;
  }

  if (perfisAfetados > 0) {
    await salvarPerfis(perfis);
    log(`[lgpd] anonimizou ${perfisAfetados} perfil(is) com IP > ${DIAS_RETENCAO} dias`);
  } else {
    log(`[lgpd] nenhum IP antigo para anonimizar`);
  }
  return { perfisAfetados, ipsAfetados };
}

// Para uso em outros lugares que queiram mascarar IP em tempo real
export { mascararIP };
