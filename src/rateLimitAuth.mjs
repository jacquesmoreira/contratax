// Rate limiting para rotas sensiveis de autenticacao (anti brute-force).
// Conta tentativas por IP por acao numa janela deslizante. Quando excede,
// bloqueia por um tempo crescente.
//
// Diferente do rateLimitVisitante (que e cota de uso gratis), aqui o objetivo
// e travar ataques de forca bruta de senha e abuso de envio de e-mail.
//
// Em memoria do processo. Para multi-instancia, trocar por Redis. Para o porte
// atual (1 instancia Railway), e suficiente.

// Config por acao: { max tentativas, janela em ms, bloqueio em ms apos exceder }
const REGRAS = {
  login:      { max: 8,  janelaMs: 10 * 60 * 1000, bloqueioMs: 15 * 60 * 1000 },
  recuperar:  { max: 5,  janelaMs: 15 * 60 * 1000, bloqueioMs: 15 * 60 * 1000 },
  cadastro:   { max: 10, janelaMs: 60 * 60 * 1000, bloqueioMs: 30 * 60 * 1000 },
  completar:  { max: 15, janelaMs: 60 * 60 * 1000, bloqueioMs: 15 * 60 * 1000 },
};

// Map: "acao|ip" -> { tentativas: number[], bloqueadoAte: number }
const registro = new Map();

function limparExpirados() {
  const agora = Date.now();
  for (const [chave, dados] of registro) {
    if ((!dados.bloqueadoAte || dados.bloqueadoAte < agora) &&
        (!dados.tentativas.length || dados.tentativas[dados.tentativas.length - 1] < agora - 60 * 60 * 1000)) {
      registro.delete(chave);
    }
  }
}

export function ipDoRequest(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// Verifica se a acao deste IP esta permitida. NAO registra a tentativa ainda.
// Retorna { ok: true } ou { ok: false, esperaSeg }.
export function checarAuth(acao, ip) {
  const regra = REGRAS[acao];
  if (!regra) return { ok: true };
  if (Math.random() < 0.02) limparExpirados();

  const chave = `${acao}|${ip}`;
  const agora = Date.now();
  const dados = registro.get(chave) || { tentativas: [], bloqueadoAte: 0 };

  if (dados.bloqueadoAte && dados.bloqueadoAte > agora) {
    return { ok: false, esperaSeg: Math.ceil((dados.bloqueadoAte - agora) / 1000) };
  }
  // Limpa tentativas fora da janela
  dados.tentativas = dados.tentativas.filter((t) => t > agora - regra.janelaMs);
  if (dados.tentativas.length >= regra.max) {
    dados.bloqueadoAte = agora + regra.bloqueioMs;
    registro.set(chave, dados);
    return { ok: false, esperaSeg: Math.ceil(regra.bloqueioMs / 1000) };
  }
  registro.set(chave, dados);
  return { ok: true };
}

// Registra UMA tentativa (chamar apos checarAuth ok, antes de processar).
export function registrarTentativa(acao, ip) {
  const regra = REGRAS[acao];
  if (!regra) return;
  const chave = `${acao}|${ip}`;
  const dados = registro.get(chave) || { tentativas: [], bloqueadoAte: 0 };
  dados.tentativas.push(Date.now());
  registro.set(chave, dados);
}

// Limpa o registro de um IP apos sucesso (login correto zera o contador).
export function limparAuth(acao, ip) {
  registro.delete(`${acao}|${ip}`);
}
