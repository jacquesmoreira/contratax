// Integracao com o Asaas (gateway de pagamento brasileiro). Cria clientes,
// assinaturas (mensalidade recorrente) e cobrancas avulsas, e devolve a URL de
// pagamento (Pix/cartao/boleto) hospedada pelo Asaas. A liberacao da conta acontece
// automaticamente pelo WEBHOOK quando o pagamento e confirmado (ver server.mjs).
//
// Config por env:
//   ASAAS_API_KEY        chave da conta (sandbox ou producao)
//   ASAAS_BASE_URL       default sandbox; em producao use https://api.asaas.com/v3
//   ASAAS_WEBHOOK_TOKEN  segredo p/ validar o webhook (mesmo valor configurado no Asaas)

const BASE = process.env.ASAAS_BASE_URL || "https://sandbox.asaas.com/api/v3";
const KEY = process.env.ASAAS_API_KEY || "";

export function asaasConfigurado() {
  return Boolean(KEY);
}

// "197,00" / "1.297,00" -> 197.0 / 1297.0
export function precoNumero(preco) {
  return Number(String(preco).replace(/\./g, "").replace(",", "."));
}

async function api(caminho, metodo = "GET", corpo = null) {
  if (!KEY) throw new Error("ASAAS_API_KEY nao configurada");
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { access_token: KEY, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Asaas ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// Reusa o cliente Asaas se ja existir E ainda estiver ativo; senao cria e
// devolve o id. IMPORTANTE: valida o clienteId guardado antes de reusar. Um
// cliente REMOVIDO no Asaas (comum em limpeza de testes) rejeita qualquer
// cobranca nova com "invalid_customer / cliente removido". Aqui, se o id
// guardado nao existir mais (404) ou estiver deleted, recria um cliente novo.
// O chamador deve persistir o id retornado (pode ter mudado).
export async function obterOuCriarCliente({ nome, email, cnpj, clienteId }) {
  if (clienteId) {
    try {
      const existente = await api(`/customers/${clienteId}`, "GET");
      if (existente && existente.id && !existente.deleted) return existente.id;
      // caiu aqui = deleted:true -> recria abaixo
    } catch { /* 404 ou erro de leitura: recria abaixo */ }
  }
  const c = await api("/customers", "POST", {
    name: nome || email,
    email,
    cpfCnpj: (cnpj || "").replace(/\D/g, "") || undefined,
  });
  return c.id;
}

// Assinatura mensal recorrente. Devolve a URL de pagamento da 1a cobranca.
export async function criarAssinatura({ clienteId, valor, descricao, externalReference, successUrl, ciclo = "mensal" }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const sub = await api("/subscriptions", "POST", {
    customer: clienteId,
    billingType: "UNDEFINED", // o cliente escolhe Pix, cartao ou boleto no checkout
    value: valor,
    nextDueDate: hoje,
    cycle: ciclo === "anual" ? "YEARLY" : "MONTHLY", // anual = 1 cobranca/ano
    description: descricao,
    externalReference,
    callback: successUrl ? { successUrl, autoRedirect: true } : undefined,
  });
  let invoiceUrl = null;
  try {
    const pgs = await api(`/subscriptions/${sub.id}/payments`, "GET");
    invoiceUrl = pgs?.data?.[0]?.invoiceUrl || null;
  } catch { /* a cobranca pode levar um instante para aparecer */ }
  return { subscriptionId: sub.id, invoiceUrl };
}

// Cobranca avulsa (pacote de analises). Devolve a URL de pagamento.
export async function criarCobrancaAvulsa({ clienteId, valor, descricao, externalReference, successUrl }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const pg = await api("/payments", "POST", {
    customer: clienteId,
    billingType: "UNDEFINED",
    value: valor,
    dueDate: hoje,
    description: descricao,
    externalReference,
    callback: successUrl ? { successUrl, autoRedirect: true } : undefined,
  });
  return { paymentId: pg.id, invoiceUrl: pg.invoiceUrl };
}

// Busca a externalReference de uma assinatura (fallback do webhook quando a
// cobranca gerada nao traz a referencia diretamente).
export async function externalReferenceDaAssinatura(subscriptionId) {
  try { const s = await api(`/subscriptions/${subscriptionId}`, "GET"); return s.externalReference || null; }
  catch { return null; }
}

// Atualiza o valor da assinatura recorrente no Asaas. Usado em upgrade de plano:
// proximas cobrancas passam a vir no preco novo, sem cancelar/recriar.
export async function atualizarValorAssinatura(subscriptionId, novoValor, descricao = null) {
  if (!subscriptionId) return { ok: false, erro: "sem subscriptionId" };
  try {
    const corpo = { value: Number(novoValor) };
    if (descricao) corpo.description = descricao;
    await api(`/subscriptions/${subscriptionId}`, "PUT", corpo);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// Cancela a assinatura recorrente no Asaas (para a renovacao automatica).
// O acesso do cliente continua valido ate o fim do periodo ja pago — quem decide
// isso e o nosso codigo (assinatura.mjs), o Asaas so para de cobrar.
export async function cancelarAssinaturaAsaas(subscriptionId) {
  if (!subscriptionId) return { ok: false, erro: "sem subscriptionId" };
  try {
    await api(`/subscriptions/${subscriptionId}`, "DELETE");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
