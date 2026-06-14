// Controle de uso pra visitante anonimo (sem login): permite N usos gratis
// por janela de 24h, depois bloqueia e oferece o paywall.
// Cota separada por feature (tldr, impugnacao) e identificada por IP.

const LIMITES = {
  tldr: Number(process.env.LICITA_VISITANTE_TLDR || 3),
  impugnacao: Number(process.env.LICITA_VISITANTE_IMPUGNACAO || 1),
  chat: Number(process.env.LICITA_VISITANTE_CHAT || 15),
};
const JANELA_MS = Number(process.env.LICITA_VISITANTE_JANELA_MS || 24 * 60 * 60 * 1000);

// Map em memoria: ip -> { tldr: {count, resetEm}, impugnacao: {count, resetEm} }
// Reset rolling 24h por feature. Em memoria do processo — se reiniciar, zera.
// Pra MVP eh suficiente; pode trocar por Redis depois.
const usos = new Map();

function limparExpirados() {
  const agora = Date.now();
  for (const [ip, dados] of usos) {
    let temAtivo = false;
    for (const k of Object.keys(dados)) {
      if (dados[k].resetEm && dados[k].resetEm > agora) temAtivo = true;
    }
    if (!temAtivo) usos.delete(ip);
  }
}

// Extrai IP do request (Railway/proxies usam X-Forwarded-For)
export function ipDoRequest(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// Checa e (se permitido) registra o uso. Devolve:
//   { ok: true, restantes }  ou  { ok: false, limite, restantes: 0 }
export function tentarUsoVisitante(ip, feature) {
  if (!LIMITES[feature]) return { ok: true, restantes: Infinity };
  if (Math.random() < 0.01) limparExpirados();

  const agora = Date.now();
  if (!usos.has(ip)) usos.set(ip, {});
  const dados = usos.get(ip);
  if (!dados[feature] || dados[feature].resetEm <= agora) {
    dados[feature] = { count: 0, resetEm: agora + JANELA_MS };
  }
  const reg = dados[feature];
  const limite = LIMITES[feature];
  if (reg.count >= limite) {
    return { ok: false, limite, restantes: 0, resetEm: reg.resetEm };
  }
  reg.count += 1;
  return { ok: true, limite, restantes: limite - reg.count, resetEm: reg.resetEm };
}

// Apenas consulta o estado sem incrementar (pra UI mostrar quantos restam)
export function estadoUsoVisitante(ip, feature) {
  if (!LIMITES[feature]) return { restantes: Infinity, limite: Infinity };
  const dados = usos.get(ip);
  const agora = Date.now();
  if (!dados?.[feature] || dados[feature].resetEm <= agora) {
    return { restantes: LIMITES[feature], limite: LIMITES[feature] };
  }
  return {
    restantes: Math.max(0, LIMITES[feature] - dados[feature].count),
    limite: LIMITES[feature],
    resetEm: dados[feature].resetEm,
  };
}
