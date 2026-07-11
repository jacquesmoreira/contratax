// Assinatura (cobranca-lite). Cada perfil tem um estado: teste -> ativo -> vencido.
// Modelo concierge: novo cliente entra em teste gratis; voce ativa manualmente
// apos o Pix. Automacao (Asaas/Mercado Pago) entra depois, no deploy.

import { lerPerfis, salvarPerfis } from "./perfis.mjs";
import { planoDe } from "./planos.mjs";

const TRIAL_DIAS = Number(process.env.LICITA_TRIAL_DIAS || 7);

// Preco de cada acesso (assento) extra, em numero. String "49,00" -> 49.
const _precoNum = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
export const PRECO_ASSENTO_NUM = _precoNum(process.env.LICITA_PRECO_ASSENTO || "49,00");

// Dados de cobranca exibidos no muro de pagamento (configure no .env).
export const cobranca = {
  preco: process.env.LICITA_PRECO || "247,00",
  pix: process.env.LICITA_PIX_CHAVE || "configure-sua-chave-pix",
  contato: process.env.LICITA_CONTATO || "comprovante@seudominio.com.br",
  trialDias: TRIAL_DIAS,
};

// Assinatura inicial de um novo cadastro: teste gratis.
export function novaAssinaturaTeste() {
  return {
    status: "teste",
    plano: "mensal",
    criadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + TRIAL_DIAS * 864e5).toISOString(),
  };
}

// Carencia (dias) que uma mensalidade paga pode atrasar antes de bloquear o acesso.
const GRACA_DIAS = Number(process.env.LICITA_GRACA_DIAS || 3);

// Calcula o estado efetivo da assinatura (considerando vencimento e carencia).
// Para empresas gerenciadas (Plano Assessoria), o status HERDA do perfil-gerente.
// Funcao sincrona; quando precisa herdar, devolve resultado generico ate
// statusAtualAsync ser usada (nas rotas que ja sao async).
export function statusAtual(perfil) {
  const a = perfil?.assinatura;
  if (!a && !perfil?.gerenciadoPor) return { status: "ativo", temAcesso: true, expiraEm: null, diasRestantes: null }; // legado/admin
  if (!a && perfil?.gerenciadoPor) {
    // Empresa gerenciada sem assinatura propria: assume "ativo" (a checagem
    // assincrona via statusAtualAsync pega o gerente). Em modo sincrono, nao
    // travamos o acesso — o gerente ja foi cobrado.
    return { status: "ativo", temAcesso: true, expiraEm: null, diasRestantes: null, herdado: true };
  }

  const agora = new Date();
  const expira = a.expiraEm ? new Date(a.expiraEm) : null;
  const diasRestantes = expira ? Math.ceil((expira - agora) / 864e5) : null;
  const vencido = expira ? agora > expira : false;
  const formaPagamento = a.formaPagamento || null;

  if (a.status === "inativo") return { status: "inativo", temAcesso: false, formaPagamento, expiraEm: a.expiraEm, diasRestantes };

  if (vencido) {
    // Teste expirado vira paywall direto (sem carencia).
    if (a.status === "teste") {
      return { status: "teste_expirado", temAcesso: false, formaPagamento, expiraEm: a.expiraEm, diasRestantes, diasAtraso: 0 };
    }
    // Assinatura paga: carencia de GRACA_DIAS (acessa, mas com aviso urgente);
    // passou a carencia, bloqueia ("aguardando pagamento").
    const diasAtraso = Math.floor((agora - expira) / 864e5);
    if (diasAtraso <= GRACA_DIAS) {
      return { status: "atrasado", temAcesso: true, formaPagamento, expiraEm: a.expiraEm, diasRestantes, diasAtraso, gracaDias: GRACA_DIAS };
    }
    return { status: "vencido", temAcesso: false, formaPagamento, expiraEm: a.expiraEm, diasRestantes, diasAtraso };
  }
  return { status: a.status, temAcesso: true, formaPagamento, expiraEm: a.expiraEm, diasRestantes };
}

// Ativa (ou renova) a assinatura de um cliente num NIVEL (basico/pro) por N dias.
// Chamado pelo webhook de pagamento (automatico) ou pelo admin. nivel=null mantem
// o nivel atual (ou basico). Uso retrocompativel: ativarPorToken(token, dias).
export async function ativarPorToken(token, dias = 30, nivel = null, formaPagamento = null) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error(`Token ${token} nao encontrado`);
  p.assinatura = {
    ...(p.assinatura || {}),
    status: "ativo",
    plano: "mensal",
    nivel: nivel || p.assinatura?.nivel || "basico",
    formaPagamento: formaPagamento || p.assinatura?.formaPagamento || null,
    ativadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + dias * 864e5).toISOString(),
  };
  // Marca que ja foi pagante: a sequencia de win-back nao deve perseguir quem
  // virou cliente (e depois eventualmente cancelou) com e-mails de reativacao.
  p._jaFoiPago = true;
  await salvarPerfis(perfis);
  return p;
}

// Acucar para o webhook: ativa por nivel (mensalidade recorrente = 30 dias).
// formaPagamento (CREDIT_CARD / PIX / BOLETO) define se avisamos antes do vencimento.
export async function ativarPlano(token, nivel, dias = 30, formaPagamento = null) {
  return ativarPorToken(token, dias, nivel, formaPagamento);
}

// Calcula a diferenca pro-rata para upgrade de plano dentro do ciclo atual.
// Devolve { permitido, valor, diasRestantes, precoNovo, precoAtual, descricao }.
// Regra: cliente paga (preco_novo - preco_atual) * dias_restantes / 30.
// Minimo R$ 5,00 (evita cobrancas irrisorias e custo de Pix). Se diferenca <= 0
// (downgrade), nao permite upgrade — orientacao e usar downgrade agendado.
export function calcularProRata(perfil, planoAtual, planoNovo) {
  const status = statusAtual(perfil);
  const precoNum = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
  const precoAtual = precoNum(planoAtual.preco);
  const precoNovo = precoNum(planoNovo.preco);
  if (precoNovo <= precoAtual) {
    return { permitido: false, motivo: "downgrade", precoAtual, precoNovo, valor: 0, diasRestantes: 0 };
  }
  let dias = status.diasRestantes;
  if (dias == null || dias < 0) dias = 0;
  if (dias > 30) dias = 30;
  const valor = Math.max(5, Math.round((precoNovo - precoAtual) * (dias / 30) * 100) / 100);
  return {
    permitido: true,
    precoAtual,
    precoNovo,
    diasRestantes: dias,
    valor,
    descricao: `Upgrade pro-rata: ${planoAtual.nome} -> ${planoNovo.nome} (${dias} dias)`,
  };
}

// Valor mensal recorrente atual = base do plano + assentos extras pagos.
// assentosPagos = assentos comprados ALEM do que ja vem incluso no plano.
// Usado pra atualizar o valor da assinatura no Asaas (compra de assentos e
// tambem upgrade, pra nao perder os assentos extras ao trocar de plano).
export function valorMensalRecorrente(perfil) {
  const base = _precoNum(planoDe(perfil).preco);
  const extras = Math.max(0, Number(perfil?.assentosPagos || 0));
  return Math.round((base + extras * PRECO_ASSENTO_NUM) * 100) / 100;
}

// Pro-rata para comprar `qtd` assentos extras dentro do ciclo atual.
// Cobra qtd * preco_assento * dias_restantes / 30 agora (minimo R$ 5,00); o
// valor cheio entra na recorrencia a partir da proxima cobranca.
export function calcularProRataAssentos(perfil, qtd) {
  const status = statusAtual(perfil);
  let dias = status.diasRestantes;
  if (dias == null || dias < 0) dias = 0;
  if (dias > 30) dias = 30;
  const n = Math.max(1, Math.min(50, Number(qtd) || 1)); // teto de 50 por compra
  const valor = Math.max(5, Math.round(n * PRECO_ASSENTO_NUM * (dias / 30) * 100) / 100);
  const mensalAtual = valorMensalRecorrente(perfil);
  const mensalNovo = Math.round((mensalAtual + n * PRECO_ASSENTO_NUM) * 100) / 100;
  return {
    permitido: true, qtd: n, diasRestantes: dias, valor,
    precoAssento: PRECO_ASSENTO_NUM, mensalAtual, mensalNovo,
    descricao: `${n} acesso(s) extra(s), pro-rata ${dias} dia(s)`,
  };
}

// Aplica os assentos comprados no perfil (chamado pelo webhook ao confirmar o
// pagamento). Sobe o total permitido (p.assentos) e o contador de pagos.
export async function aplicarAssentos(token, qtd) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error(`Token ${token} nao encontrado`);
  const n = Math.max(1, Math.min(50, Number(qtd) || 1));
  p.assentos = Math.max(1, (p.assentos || 1) + n);
  p.assentosPagos = Math.max(0, (p.assentosPagos || 0) + n);
  await salvarPerfis(perfis);
  return p;
}

// Aplica o upgrade no perfil (sobe o nivel e mantem expiraEm). Chamado pelo
// webhook quando o pagamento da diferenca for confirmado.
export async function aplicarUpgrade(token, novoNivel) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error(`Token ${token} nao encontrado`);
  if (!p.assinatura) p.assinatura = {};
  p.assinatura.nivel = novoNivel;
  p.assinatura.upgradeEm = new Date().toISOString();
  await salvarPerfis(perfis);
  return p;
}

// Cancelamento self-service: marca o perfil como cancelado, mas mantem o acesso
// ate o fim do ciclo pago. Quem realmente para a cobranca recorrente e a chamada
// ao Asaas (cancelarAssinaturaAsaas) feita na rota.
export async function cancelarPorToken(token, motivo = "") {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) throw new Error(`Token ${token} nao encontrado`);
  if (!p.assinatura) p.assinatura = {};
  p.assinatura.canceladoEm = new Date().toISOString();
  p.assinatura.canceladoMotivo = String(motivo || "").slice(0, 240);
  // NAO mexe em status nem em expiraEm: o cliente paga pelo periodo ja contratado.
  // Quando expirar, o calculo natural de statusAtual joga pra "vencido" e nao
  // renova porque a assinatura Asaas ja foi deletada.
  await salvarPerfis(perfis);
  return p;
}

// Lista todos os clientes com o estado da assinatura (para o admin).
export async function listarClientes() {
  const perfis = await lerPerfis();
  return perfis.map((p) => ({ nome: p.nome, email: p.email ?? null, token: p.token, ...statusAtual(p) }));
}
