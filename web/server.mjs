// Painel web do Licita. Servidor HTTP minimo, sem dependencias.
// Serve a pagina, a lista de editais e a analise de IA (Camadas 3 e 4) sob demanda.
//
// Uso: node web/server.mjs   (porta padrao 3000, ou variavel de ambiente PORT)

import "../src/env.mjs"; // carrega .env (chave da IA)
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzip as gzipCb } from "node:zlib";
import { promisify } from "node:util";
const gzip = promisify(gzipCb);
import { carregarResultados, carregarAnalise, carregarConferencia, salvarLead, carregarImpugnacao, carregarLeads, carregarTldr, salvarTldr, salvarFeedback, carregarFeedbacks, alternarFeedbackLido, salvarNota, carregarNota, salvarEstagio, removerEstagio, carregarEstagios } from "../src/store.mjs";
import { gerarTldr } from "../src/tldr.mjs";
import { gerarImpugnacao } from "../src/impugnacao.mjs";
import { gerarDeclaracoes } from "../src/declaracoes.mjs";
import { paginaHub, paginaCategoria, urlsSEO } from "../src/seoPaginas.mjs";
import { categoriaPorSlug, ufPorSigla, CATEGORIAS } from "../src/categorias.mjs";
import { paginaOrgao, paginaHubOrgaos, urlsOrgaos } from "../src/seoOrgaos.mjs";
import { paginaCnae, paginaHubCnae, urlsCnae, cnaePorCodigo } from "../src/seoCnae.mjs";
import { paginaRanking, paginaHubRanking, urlsRanking } from "../src/rankingCompras.mjs";
import { renderizarArtigo, renderizarListagem, urlsBlog } from "../src/blog.mjs";
import { renderizarAjuda, renderizarContato, processarContato } from "../src/ajuda.mjs";
import { tentarUsoVisitante, ipDoRequest } from "../src/rateLimitVisitante.mjs";
import { paginaCasos, paginaStatus, paginaSeguranca } from "../src/paginasInstitucionais.mjs";
import { injetarAnalytics, enviarConversao } from "../src/analytics.mjs";
import { buscarPorId, buscaPublica, buscarEditais, estatisticas, estatisticasContratos, analiseConcorrente, pesquisarPrecos, totalPrecos, pesquisarPca, totalPca } from "../src/db.mjs";
import { conferir, saudeDocumental } from "../src/aptidao.mjs";
import { temChave } from "../src/ia.mjs";
import { criarPerfil, MAX_TERMOS, parseRamos } from "../src/cadastro.mjs";
import { gerarDigest, enviar, temEmailKey } from "../src/email.mjs";
import { statusAtual, cobranca } from "../src/assinatura.mjs";
import { precoVencedores, contratosDoFornecedor } from "../src/preco.mjs";
import { precoReferencia } from "../src/precoReferencia.mjs";
import { csvEditais, csvHistorico, csvRadar, csvContratos, csvPropostaItens, nomeArquivo } from "../src/exportar.mjs";
import { lerRecadoPara, estadoRecados, salvarRecado, limparRecado } from "../src/recado.mjs";
import { cartaProposta } from "../src/propostaComercial.mjs";
import { kitHabilitacao } from "../src/kitHabilitacao.mjs";
import { icsEdital, nomeIcs } from "../src/calendario.mjs";
import { ehAssessoria, limiteEmpresas, listarEmpresasGerenciadas, adicionarEmpresa, removerEmpresa } from "../src/assessoria.mjs";
import { checklist as onboardingChecklist } from "../src/onboarding.mjs";
import { radarRenovacao } from "../src/radar.mjs";
import { listarDocumentos, baixarArquivo, listarItens } from "../src/documentos.mjs";
import { verificarSenha } from "../src/senha.mjs";
import { consultarCNPJ } from "../src/cnpj.mjs";
import { autenticarUsuario, convidarMembro, removerMembro, listarMembros, definirAssentos } from "../src/equipe.mjs";
import { criarSessao, validarSessao, revogarSessao, cookieSessao, cookieLimpar, lerCookie } from "../src/sessoes.mjs";
import { lerPerfis, salvarPerfis, atualizarPerfil, PERFIS, garantirUsuarios } from "../src/perfis.mjs";
import { monitorar } from "../src/monitor.mjs";
import { usoDe, registrarAnalise, checarAnalise, adicionarAvulsas, usoExtracoesDe, podeExtrairPdf, registrarExtracaoPdf, registrarResumo, resumosDe } from "../src/uso.mjs";
import { resumoCustos } from "../src/custo.mjs";
import { listarNotas, obterNota, cadastrarNota, marcarPaga, removerNota, estatisticasRecebiveis } from "../src/recebiveis.mjs";
import { parsearNFe } from "../src/parserNFe.mjs";
import { gerarOficioHtml } from "../src/oficioCobranca.mjs";
import { escalarParaAdvogado } from "../src/escalonamentoJuridico.mjs";
import { gerarLaiHtml, gerarTceHtml, gerarOuvidoriaHtml } from "../src/escalonamentoCobranca.mjs";
import { solicitarAntecipacao, estimativaAntecipacao } from "../src/antecipacaoRecebivel.mjs";
import { reputacaoDoOrgao, reputacaoLeve } from "../src/reputacaoOrgaos.mjs";
import { listarContratos, obterContrato, cadastrarContrato, removerContrato } from "../src/contratosMeus.mjs";
import { minutaProrrogacao, minutaAditivo, minutaReequilibrio } from "../src/minutasContrato.mjs";
import { indicesDisponiveis, gatilhoReequilibrio } from "../src/indicesEconomicos.mjs";
import { parsearXmlContrato, extrairContratoPdf, detectarTipo as detectarTipoArquivo } from "../src/extratorContrato.mjs";
import { googleConfigurado, urlAutorizacao, processarCallback } from "../src/googleOAuth.mjs";
import { solicitarReset, aplicarReset, verificarToken } from "../src/recuperarSenha.mjs";
import { checarAuth, registrarTentativa, limparAuth, ipDoRequest as ipAuth } from "../src/rateLimitAuth.mjs";
import { PLANOS, AVULSOS, planoDe, precoAnualNum, MESES_ANUAL } from "../src/planos.mjs";
import { ativarPlano, cancelarPorToken, calcularProRata, aplicarUpgrade, aplicarDowngrade, calcularProRataAssentos, aplicarAssentos, valorMensalRecorrente } from "../src/assinatura.mjs";
import { asaasConfigurado, precoNumero, obterOuCriarCliente, criarAssinatura, criarCobrancaAvulsa, externalReferenceDaAssinatura, cancelarAssinaturaAsaas, atualizarValorAssinatura } from "../src/asaas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");

// Pre-aquecimento do resumo (TL;DR): gera em segundo plano os top-N editais mais
// urgentes do painel, pra abrir instantaneo. So os do painel (nao os 426k) e so
// os SEM cache -> custo controlado; cache global aproveita pra todos os clientes.
// Teto configuravel; 0 desliga. Guard contra geracao concorrente do mesmo edital.
const PREWARM_N = Number(process.env.LICITA_PREWARM_TLDR ?? 8);
const _prewarmAtivos = new Set();
async function preaquecerTldrs(editais) {
  if (!PREWARM_N || !temChave() || !editais?.length) return;
  // Mais urgentes primeiro (mais provaveis de o cliente abrir).
  const top = [...editais]
    .sort((a, b) => (a.encerramento || "9999").localeCompare(b.encerramento || "9999"))
    .slice(0, PREWARM_N);
  for (const ed of top) {
    if (_prewarmAtivos.has(ed.id)) continue;
    try {
      if (await carregarTldr(ed.id)) continue; // ja em cache
      _prewarmAtivos.add(ed.id);
      const tldr = await gerarTldr(ed);
      await salvarTldr(ed.id, tldr);
    } catch { /* best-effort: 1a abertura sob demanda ainda funciona */ }
    finally { _prewarmAtivos.delete(ed.id); }
  }
}
const INDEX = resolve(AQUI, "public", "index.html");
const LP = resolve(AQUI, "public", "lp.html");
const CADASTRO = resolve(AQUI, "public", "cadastro.html");
const ENTRAR = resolve(AQUI, "public", "entrar.html");
const DOCUMENTOS = resolve(AQUI, "public", "documentos.html");
const EQUIPE = resolve(AQUI, "public", "equipe.html");
const PLANEJAMENTO = resolve(AQUI, "public", "planejamento.html");
const CONTA = resolve(AQUI, "public", "conta.html");
const ASSINAR = resolve(AQUI, "public", "assinar.html");
const HISTORICO = resolve(AQUI, "public", "historico.html");
const DECLARACOES = resolve(AQUI, "public", "declaracoes.html");
const ADMIN_PAGE = resolve(AQUI, "public", "admin.html");
const EMPRESAS = resolve(AQUI, "public", "empresas.html");
const PORTA = process.env.PORT || 3000;

function lerCorpo(req) {
  return new Promise((resolve) => {
    let dados = "";
    req.on("data", (c) => (dados += c));
    req.on("end", () => {
      try { resolve(JSON.parse(dados || "{}")); } catch { resolve({}); }
    });
  });
}

const json = (res, codigo, dados) => {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(dados));
};

async function empresaAtual() {
  return JSON.parse(await readFile(resolve(RAIZ, "empresa.json"), "utf8"));
}

// Perfil documental do cliente (do proprio perfil). Sempre devolve algo: se o
// cliente ainda nao cadastrou, vem vazio (certidoes em branco = tudo pendente).
function empresaDoPerfil(perfil) {
  const base = perfil?.empresa || { certidoes: {} };
  return { ...base, id: perfil?.id || "cliente", razaoSocial: perfil?.nome || "Sua empresa" };
}

// Salva o perfil documental no perfil do cliente (pelo token).
async function salvarEmpresaPerfil(token, empresa) {
  const perfis = await lerPerfis();
  const p = perfis.find((x) => x.token === token);
  if (!p) return false;
  p.empresa = empresa;
  await salvarPerfis(perfis);
  return true;
}

// Token do admin. SEM fallback inseguro: se LICITA_ADMIN_TOKEN nao estiver
// definido, geramos um token aleatorio forte no boot (logado uma vez no
// console) - assim o painel admin nunca fica acessivel com a senha obvia "admin".
const ADMIN = process.env.LICITA_ADMIN_TOKEN || (() => {
  const aleatorio = randomBytes(24).toString("hex");
  console.warn(`[seguranca] LICITA_ADMIN_TOKEN nao definido. Token admin temporario desta sessao: ${aleatorio}`);
  console.warn("[seguranca] Defina LICITA_ADMIN_TOKEN no ambiente para um token fixo e seguro.");
  return aleatorio;
})();
const BASE_PUBLICA = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

// Cabecalhos de seguranca aplicados a TODAS as respostas. Protegem contra
// clickjacking, MIME sniffing, downgrade de HTTPS e vazamento de token no
// Referer (o token de acesso vai na URL, entao Referrer-Policy e essencial).
function aplicarHeadersSeguranca(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()");
  // Bloqueia que recursos do site sejam carregados como cross-origin: protege
  // contra ataques de carregamento indevido (Spectre-like).
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  // Bloqueia o navegador de prefetchar DNS de links externos automaticamente.
  res.setHeader("X-DNS-Prefetch-Control", "off");
  // Bloqueia clients de navegacao XSS (legado IE/Edge), mas e zero custo manter.
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // CSP permissiva o suficiente pro que o site usa (Google Fonts, GTM/Analytics,
  // inline scripts/styles do proprio app), mas bloqueia object/base e fontes nao
  // listadas. Bloqueia carregamento de scripts de dominios desconhecidos.
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms",
    "script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.googletagmanager.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://*.doubleclick.net https://www.googleadservices.com https://www.google.com https://www.clarity.ms https://*.clarity.ms https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; "));
}

// Perfil completo pelo token, lido de perfis.json.
async function perfilPorToken(token) {
  const perfis = await lerPerfis();
  return perfis.find((p) => p.token === token) ?? null;
}

// Sela cada edital com reputacao de pagamento (CAPAG/heuristica, versao leve) e o
// selo de OPORTUNIDADE (forte/regular/avaliar + os porques). Usado no FEED e na
// BUSCA, pra o mesmo selo aparecer nos dois (antes so o feed selava, e o cliente
// estranhava o selo sumir na busca). Cache por orgao, best-effort (nao quebra a
// resposta se a reputacao falhar).
async function selarOportunidade(editais) {
  const cacheRep = new Map();
  for (const ed of editais) {
    try {
      const chave = `${ed.uf || ""}|${ed.municipio || ""}|${ed.orgao || ""}`;
      if (!cacheRep.has(chave)) {
        cacheRep.set(chave, await reputacaoLeve({ nome: ed.orgao, uf: ed.uf, municipio: ed.municipio }));
      }
      ed.reputacao = cacheRep.get(chave);
    } catch (e) { console.error("[selarOportunidade] reputacao:", e.message); }
    const fatores = [];
    let pts = 0;
    const rep = ed.reputacao?.classificacao;
    if (rep === "rapido") { pts += 2; fatores.push("Órgão paga rápido"); }
    else if (rep === "regular") { pts += 1; fatores.push("Órgão paga em dia"); }
    else if (rep === "lento") { fatores.push("Órgão costuma pagar devagar"); }
    if (ed.srp) { pts += 1; fatores.push("Registro de Preços (compra recorrente, dá pra se planejar)"); }
    ed.oportunidade = { nivel: pts >= 3 ? "forte" : pts >= 1 ? "regular" : "avaliar", fatores };
  }
  return editais;
}

// Obtem/cria o cliente Asaas do perfil e PERSISTE o id se mudou. O id pode mudar
// quando o cliente antigo foi REMOVIDO no Asaas (ex: limpeza de testes): nesse
// caso obterOuCriarCliente recria um novo, e a gente grava pra nao recriar toda vez.
async function clienteAsaasDoPerfil(perfil) {
  const clienteId = await obterOuCriarCliente({
    nome: perfil.razaoSocial || perfil.nome, email: perfil.email, cnpj: perfil.cnpj, clienteId: perfil.asaasClienteId,
  });
  if (clienteId && clienteId !== perfil.asaasClienteId) {
    const perfis = await lerPerfis();
    const p = perfis.find((x) => x.token === perfil.token);
    if (p) { p.asaasClienteId = clienteId; await salvarPerfis(perfis); }
  }
  return clienteId;
}

// Traduz erro de gateway pra mensagem amigavel: NUNCA vazar o JSON cru do Asaas
// pro cliente (ex: "Asaas 400: {...invalid_customer...}"). Loga o cru no servidor.
function mensagemPagamento(e) {
  const m = String((e && e.message) || "");
  console.error("[pagamento]", m);
  if (/invalid_customer|cliente removido/i.test(m)) return "Não consegui gerar a cobrança agora (seu cadastro de pagamento precisou ser recriado). Tente de novo em instantes; se persistir, fale com o suporte.";
  if (/ASAAS_API_KEY|nao configurada/i.test(m)) return "Pagamento automático indisponível no momento. Fale com o suporte.";
  return "Não consegui gerar a cobrança agora. Tente de novo em instantes ou fale com o suporte.";
}

// ===== Guard de acesso: bloqueia ferramentas pagas para conta vencida =====
// Apos o fim do teste ou da carencia da assinatura, o cliente perde o acesso a
// TODAS as ferramentas (recebiveis, contratos, documentos, historico,
// declaracoes, analise). Sobra o minimo: ver status da conta e pagar.
//
// Prefixos de rota que exigem assinatura ativa. O token vem sempre em ?c= nessas
// rotas. APIs respondem 403 paywall; paginas redirecionam pra /assinar.
const ROTAS_PROTEGIDAS = [
  "/api/recebiveis", "/api/contratos-meus", "/api/documentos", "/api/historico",
  "/api/declaracoes", "/api/radar", "/api/contratos-fornecedor", "/api/saude-empresa",
  "/api/equipe", "/api/exportar", "/api/concorrente", "/api/precos", "/api/pca", "/api/juridico",
  "/api/planejamento",
  "/recebiveis", "/contratos", "/documentos", "/historico", "/declaracoes",
  "/equipe", "/empresas", "/concorrentes", "/precos", "/pca", "/juridico", "/planejamento",
];
function rotaProtegida(rota) {
  return ROTAS_PROTEGIDAS.some((p) => rota === p || rota.startsWith(p + "/") || rota.startsWith(p + "."));
}

// Tipos de conteudo que valem a pena comprimir (texto). Binarios ja sao
// comprimidos por natureza (PNG, PDF, XLSX) - gzip neles desperdica CPU.
function compressivel(headers) {
  const ct = (headers?.["Content-Type"] || "").toLowerCase();
  return /text\/|application\/(json|javascript|xml|manifest\+json|rss\+xml|atom\+xml|ld\+json)|image\/svg/.test(ct);
}

// Wrapper que ADIA writeHead ate o res.end pra decidir se vale comprimir.
// Antes ele setava Content-Encoding: gzip no writeHead e so depois decidia
// comprimir ou nao - quando o body era pequeno (<200B) ou o gzip falhava,
// o header ficava 'gzip' mas o body ia cru, gerando ERR_CONTENT_DECODING_FAILED
// no navegador. Agora o header so e setado quando temos certeza de que vamos
// comprimir.
function ativarGzip(req, res) {
  const aceita = String(req.headers["accept-encoding"] || "").toLowerCase();
  if (!/\bgzip\b/.test(aceita)) return;
  const writeHeadOriginal = res.writeHead.bind(res);
  const endOriginal = res.end.bind(res);
  let codigoBuf = 200, headersBuf = {}, jaEnvieiHeader = false;

  res.writeHead = (codigo, headers) => {
    codigoBuf = codigo;
    headersBuf = headers || {};
    // NAO envia ainda - decidiremos comprimir ou nao no res.end
    return res;
  };

  res.end = async (data) => {
    if (jaEnvieiHeader) return endOriginal(data);
    jaEnvieiHeader = true;
    const ehCompressivel = compressivel(headersBuf);
    if (!ehCompressivel || !data) {
      writeHeadOriginal(codigoBuf, headersBuf);
      return endOriginal(data);
    }
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      if (buf.length < 200) {
        // muito pequeno - nao vale comprimir
        writeHeadOriginal(codigoBuf, headersBuf);
        return endOriginal(buf);
      }
      const comp = await gzip(buf);
      headersBuf["Content-Encoding"] = "gzip";
      headersBuf["Vary"] = headersBuf["Vary"] ? headersBuf["Vary"] + ", Accept-Encoding" : "Accept-Encoding";
      delete headersBuf["Content-Length"]; // tamanho mudou
      writeHeadOriginal(codigoBuf, headersBuf);
      return endOriginal(comp);
    } catch {
      // falhou - manda cru com headers originais (sem gzip)
      writeHeadOriginal(codigoBuf, headersBuf);
      return endOriginal(data);
    }
  };
}

const servidor = createServer(async (req, res) => {
  try {
    aplicarHeadersSeguranca(res);

    // Canonicalizacao de dominio: redireciona 301 do apex (contratax.com.br)
    // para o www (www.contratax.com.br). Evita conteudo duplicado no Google.
    // So atua em producao (host real), nunca em localhost/health checks.
    const host = String(req.headers.host || "").toLowerCase();
    if (host === "contratax.com.br") {
      res.writeHead(301, { Location: `https://www.contratax.com.br${req.url}` });
      return res.end();
    }

    ativarGzip(req, res);
    const url = new URL(req.url, "http://localhost");
    const rota = url.pathname;

    // Guard de acesso: ferramentas pagas exigem assinatura ativa. Conta vencida
    // (teste expirado ou apos a carencia) e barrada aqui, antes de chegar na
    // rota. Admin e contas com acesso passam direto.
    if (rotaProtegida(rota)) {
      const tkGuard = url.searchParams.get("c") || "";
      if (tkGuard && tkGuard !== ADMIN) {
        const pGuard = await perfilPorToken(tkGuard);
        if (pGuard && !statusAtual(pGuard).temAcesso) {
          if (rota.startsWith("/api/")) {
            return json(res, 403, { erro: "Assinatura não ativa. Reative seu plano para usar esta ferramenta.", paywall: true });
          }
          // Pagina: manda pro paywall (assinar), preservando o token.
          res.writeHead(302, { Location: `/assinar?c=${encodeURIComponent(tkGuard)}` });
          return res.end();
        }
        // Sessao unica: ferramentas sensiveis exigem uma sessao de login viva.
        // Se a sessao foi revogada (login em outro local) ou nao existe, barra:
        // API responde 401 sessaoEncerrada; pagina manda pro /entrar.
        const vs = validarSessao(lerCookie(req, "cx_sid"));
        if (!vs.ok) {
          const revogada = vs.motivo === "revogada";
          if (rota.startsWith("/api/")) {
            return json(res, 401, {
              erro: revogada
                ? "Sua sessão foi encerrada porque sua conta foi acessada em outro dispositivo."
                : "Entre na sua conta para usar esta ferramenta.",
              sessaoEncerrada: true, motivo: vs.motivo,
            });
          }
          res.writeHead(302, { Location: `/entrar?sessao=${vs.motivo}&next=${encodeURIComponent(req.url)}` });
          return res.end();
        }
      }
    }

    // Heartbeat de sessao: o painel chama de tempos em tempos pra saber se ainda
    // esta logado. "encerrada" = foi revogada (login em outro local) -> desloga.
    if (rota === "/api/sessao/ping") {
      const sid = lerCookie(req, "cx_sid");
      if (!sid) return json(res, 200, { estado: "sem-sessao" });
      const vs = validarSessao(sid);
      return json(res, 200, { estado: vs.ok ? "ativa" : "encerrada", motivo: vs.motivo });
    }

    // Logout: revoga a sessao e limpa o cookie.
    if (rota === "/api/sair") {
      const sid = lerCookie(req, "cx_sid");
      revogarSessao(sid);
      res.setHeader("Set-Cookie", cookieLimpar(host));
      if (req.method === "POST") return json(res, 200, { ok: true });
      res.writeHead(302, { Location: "/entrar" });
      return res.end();
    }

    // Descadastro (opt-out) dos e-mails de regua. Aceita clique no rodape (GET) e
    // o one-click do Gmail/Outlook (POST, RFC 8058). Marca _descadastrado no
    // perfil; o cliente segue recebendo e-mails essenciais da conta (senha,
    // pagamento), so para a regua de marketing/reengajamento.
    if (rota === "/descadastrar") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (perfil && !perfil._descadastrado) {
        await atualizarPerfil(perfil.token, (p) => { p._descadastrado = new Date().toISOString(); });
      }
      if (req.method === "POST") { res.writeHead(200); return res.end("OK"); }
      const voltar = perfil ? `/painel?c=${encodeURIComponent(perfil.token)}` : "/";
      const pagina = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Descadastrado | ContrataX</title>
<style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.card{max-width:460px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:34px 32px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#475569;line-height:1.6;font-size:15px;margin:0 0 10px}a{color:#4338ca;font-weight:700;text-decoration:none}</style>
</head><body><div class="card">
<h1>Pronto, você foi descadastrado</h1>
<p>Você não vai mais receber os e-mails de novidades e oportunidades do ContrataX.</p>
<p>E-mails essenciais da sua conta (redefinição de senha, cobrança) continuam chegando normalmente.</p>
<p style="margin-top:18px">Mudou de ideia? <a href="${voltar}">Voltar ao ContrataX</a></p>
</div></body></html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(pagina);
    }

    // Admin: dispara a sequencia COMPLETA de e-mails de teste pra um endereco
    // (avaliacao interna de acentuacao/tom/layout). ?c=ADMIN&para=email.
    if (rota === "/api/admin/testar-emails") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Somente admin" });
      const para = url.searchParams.get("para") || process.env.LICITA_CONTATO || "";
      if (!para) return json(res, 400, { erro: "Informe ?para=seu@email.com" });
      const ramo = url.searchParams.get("ramo") || undefined; // ex: "energia solar"
      const uf = url.searchParams.get("uf") || undefined;       // ex: "AC"
      try {
        const { enviarSequenciaTeste } = await import("../src/testarEmails.mjs");
        const n = await enviarSequenciaTeste({ para, ramo, uf });
        return json(res, 200, { ok: true, enviados: n, para, ramo: ramo || "material hospitalar", uf: uf || "SC" });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // Busca publica da landing page (por UF e termo, sem login).
    if (rota === "/api/busca-publica") {
      const uf = url.searchParams.get("uf") || null;
      const termo = url.searchParams.get("termo") || "";
      return json(res, 200, buscaPublica({ uf, termo, limite: 15 }));
    }

    // Recuperacao de senha - solicitar (sempre devolve sucesso pra nao revelar
    // se o e-mail esta cadastrado).
    if (rota === "/api/recuperar-senha" && req.method === "POST") {
      const ip = ipAuth(req);
      const lim = checarAuth("recuperar", ip);
      if (!lim.ok) return json(res, 429, { erro: `Muitas solicitações. Tente novamente em ${Math.ceil(lim.esperaSeg / 60)} minutos.` });
      registrarTentativa("recuperar", ip);
      const corpo = await lerCorpo(req);
      await solicitarReset({ email: corpo.email, baseUrl: BASE_PUBLICA });
      return json(res, 200, { ok: true });
    }

    if (rota === "/api/verificar-reset") {
      const r = await verificarToken(url.searchParams.get("t"));
      return json(res, 200, r);
    }

    if (rota === "/api/redefinir-senha" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const r = await aplicarReset({ token: corpo.token, senhaNova: corpo.senhaNova });
      return json(res, r.ok ? 200 : 400, r);
    }

    // Google OAuth: status (front consulta pra mostrar/esconder botao)
    if (rota === "/api/google/status") {
      return json(res, 200, { configurado: googleConfigurado() });
    }

    // Google OAuth: inicia o fluxo. /api/google/iniciar?intencao=cadastro|entrar
    if (rota === "/api/google/iniciar") {
      if (!googleConfigurado()) {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Login com Google nao configurado neste ambiente");
      }
      const intencao = url.searchParams.get("intencao") || "entrar";
      const { url: urlG } = urlAutorizacao({ intencao });
      res.writeHead(302, { Location: urlG });
      return res.end();
    }

    // Google OAuth: callback do Google
    if (rota === "/api/google/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "";
      const erro = url.searchParams.get("error");
      if (erro) {
        res.writeHead(302, { Location: `/entrar?google_erro=${encodeURIComponent(erro)}` });
        return res.end();
      }
      try {
        const { perfil, isNovo } = await processarCallback(code, state);
        // Sessao do login social (sessao unica + cookie HttpOnly).
        try {
          const uAdmin = (perfil.usuarios?.find((u) => u.papel === "admin") || perfil.usuarios?.[0]);
          const sid = criarSessao({
            token: perfil.token,
            userId: uAdmin?.id || perfil.id || "admin",
            ip: ipAuth(req),
            ua: req.headers["user-agent"] || "",
          });
          res.setHeader("Set-Cookie", cookieSessao(sid, host));
        } catch (e) { console.error("[sessao google]", e.message); }
        const destino = isNovo || perfil.precisaCompletarCadastro
          ? `/conta?c=${perfil.token}&completar=1`
          : (ehAssessoria(perfil) ? `/empresas?c=${perfil.token}` : `/painel?c=${perfil.token}`);
        res.writeHead(302, { Location: destino });
        return res.end();
      } catch (e) {
        res.writeHead(302, { Location: `/entrar?google_erro=${encodeURIComponent(e.message.slice(0, 200))}` });
        return res.end();
      }
    }

    // Login por e-mail e senha.
    if (rota === "/api/entrar" && req.method === "POST") {
      const ip = ipAuth(req);
      const lim = checarAuth("login", ip);
      if (!lim.ok) return json(res, 429, { erro: `Muitas tentativas de login. Tente novamente em ${Math.ceil(lim.esperaSeg / 60)} minutos.` });
      const corpo = await lerCorpo(req);
      const email = (corpo.email || corpo.cnpj || "").trim();
      const senha = corpo.senha || "";
      if (!email) return json(res, 400, { erro: "Informe o seu e-mail ou CNPJ" });
      registrarTentativa("login", ip);
      // Procura por e-mail ou CNPJ em todas as contas (admin ou membro de equipe).
      const r = await autenticarUsuario(email, senha);
      if (!r.ok) {
        const codigo = /incorret/i.test(r.motivo) ? 401 : 404;
        return json(res, codigo, { erro: r.motivo });
      }
      limparAuth("login", ip); // sucesso zera o contador
      // Aviso de login bem-sucedido por email (anti-invasao). Best-effort:
      // se Resend nao estiver configurado ou cliente sem email, pula silencioso.
      try {
        const { temEmailKey, enviar } = await import("../src/email.mjs");
        if (r.perfil?.email && temEmailKey()) {
          const ua = (req.headers["user-agent"] || "navegador desconhecido").slice(0, 100);
          const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
          const ipMasc = ip.replace(/\.(\d{1,3})\.(\d{1,3})$/, ".x.x"); // mascara nao mostra IP completo no email
          const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
          await enviar({
            para: r.perfil.email,
            assunto: `Acesso ao ContrataX em ${agora}`,
            html: `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="padding:22px 26px;color:#0f172a;font-size:14px;line-height:1.6">
<div style="font-size:13px;color:#64748b;font-weight:700;letter-spacing:.5px">ACESSO REGISTRADO</div>
<div style="font-size:17px;font-weight:800;margin:6px 0 14px">Sua conta acabou de ser acessada</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px;margin:8px 0">
<tr><td style="padding:6px 0;color:#64748b">Data e hora</td><td style="padding:6px 0;font-weight:700">${agora}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Regiao do IP</td><td style="padding:6px 0;font-family:monospace">${ipMasc}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;vertical-align:top">Dispositivo</td><td style="padding:6px 0;font-size:12.5px;color:#475569">${ua.replace(/[<>&]/g, "")}</td></tr>
</table>
<p style="font-size:13.5px;color:#475569;margin:18px 0 0"><b>Foi voce?</b> Se sim, pode ignorar este email. Ele e enviado por padrao a cada login pra sua seguranca.</p>
<p style="font-size:13.5px;color:#475569;margin:8px 0 0"><b>Nao foi voce?</b> Troque a sua senha imediatamente.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0"><tr><td>
<a href="${BASE}/esqueci-senha" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px">Trocar minha senha</a>
</td></tr></table>
</td></tr></table></td></tr></table></body></html>`,
          });
        }
      } catch (e) { console.error("[email pos-login]", e.message); }
      // Cria a sessao deste login (revoga as anteriores do mesmo usuario =
      // sessao unica) e entrega o cookie HttpOnly.
      try {
        const sid = criarSessao({
          token: r.perfil.token,
          userId: r.usuario?.id || "admin",
          ip,
          ua: req.headers["user-agent"] || "",
        });
        res.setHeader("Set-Cookie", cookieSessao(sid, host));
      } catch (e) { console.error("[sessao]", e.message); }
      // Assessoria: direto pra /empresas (gestao multi-CNPJ)
      const destino = ehAssessoria(r.perfil) ? `/empresas?c=${r.perfil.token}` : `/painel?c=${r.perfil.token}`;
      return json(res, 200, { link: destino });
    }

    // Plano Assessoria: lista as empresas gerenciadas pelo assessor logado.
    // Trocador de empresa no cabecalho: empresas que o cliente pode alternar.
    // So tem sentido pra conta gerenciada (filha de assessoria) ou pra propria
    // assessoria. Cliente normal de 1 CNPJ recebe lista vazia (sem trocador).
    if (rota === "/api/minhas-empresas") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 200, { empresas: [], atual: null });
      const gerenteToken = ehAssessoria(perfil) ? perfil.token : (perfil.gerenciadoPor || null);
      if (!gerenteToken) return json(res, 200, { empresas: [], atual: perfil.token });
      const perfis = await lerPerfis();
      const filhas = perfis.filter((p) => p.gerenciadoPor === gerenteToken);
      const lista = filhas.map((f) => ({
        token: f.token,
        nome: f.razaoSocial || f.nome || f.cnpj || "Empresa",
        cnpj: f.cnpj || null,
        atual: f.token === perfil.token,
      }));
      return json(res, 200, { empresas: lista, atual: perfil.token, gerenteToken });
    }

    if (rota === "/api/assessoria/empresas") {
      const tokenAss = url.searchParams.get("c") || "";
      const gerente = await perfilPorToken(tokenAss);
      if (!gerente) return json(res, 404, { erro: "Conta nao encontrada" });
      if (!ehAssessoria(gerente)) return json(res, 403, { erro: "Plano atual nao permite gerenciar varias empresas" });
      const empresas = await listarEmpresasGerenciadas(tokenAss);
      return json(res, 200, {
        gerente: { nome: gerente.nome, plano: gerente.assinatura?.nivel || null, status: statusAtual(gerente) },
        limite: limiteEmpresas(gerente),
        usados: empresas.length,
        empresas: empresas.map((e) => ({
          token: e.token,
          nome: e.nome,
          razaoSocial: e.razaoSocial,
          cnpj: e.cnpj,
          ramo: (e.filtro?.termos ?? []).join(", "),
          ufs: e.ufs ?? [],
          analises: e.analises ?? { usados: 0 },
        })),
      });
    }

    if (rota === "/api/assessoria/adicionar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      try {
        const nova = await adicionarEmpresa(corpo.c || "", corpo);
        return json(res, 200, { ok: true, token: nova.token, link: `/painel?c=${nova.token}` });
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }

    if (rota === "/api/assessoria/remover" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      try {
        await removerEmpresa(corpo.c || "", corpo.tokenEmpresa || "");
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }

    // Consulta CNPJ (valida na Receita e devolve a razao social) + checa duplicidade.
    if (rota === "/api/cnpj") {
      const r = await consultarCNPJ(url.searchParams.get("cnpj") || "");
      if (r.valido) {
        const limpo = (url.searchParams.get("cnpj") || "").replace(/\D/g, "");
        const perfis = await lerPerfis();
        if (perfis.some((p) => (p.cnpj || "").replace(/\D/g, "") === limpo)) {
          return json(res, 200, { valido: false, erro: "Já existe uma conta com este CNPJ. Use a página de Entrar ou peça acesso ao administrador da conta." });
        }
        // Empresa nao-ativa na Receita: avisa logo na consulta.
        if (r.ativa === false) {
          return json(res, 200, { valido: false, erro: `Este CNPJ consta como "${r.situacao}" na Receita. Para participar de licitações, a empresa precisa estar com situação cadastral ativa.` });
        }
      }
      return json(res, 200, r);
    }

    // Cadastro self-service: cria o perfil e devolve o link do painel.
    if (rota === "/api/cadastrar" && req.method === "POST") {
      const ipCad = ipAuth(req);
      const limCad = checarAuth("cadastro", ipCad);
      if (!limCad.ok) return json(res, 429, { erro: `Muitos cadastros deste IP. Tente novamente em ${Math.ceil(limCad.esperaSeg / 60)} minutos.` });
      registrarTentativa("cadastro", ipCad);
      const corpo = await lerCorpo(req);
      try {
        // Repassa o IP (servidor-side) pro registro do clickwrap. Mais
        // confiavel que client-side enviar IP fake.
        const r = await criarPerfil({ ...corpo, ip: ipCad });
        // Cria a sessao do novo cadastro pra ele ja entrar logado (sem ser
        // mandado pro /entrar ao abrir uma ferramenta protegida).
        try {
          if (r?.token) {
            const p = await perfilPorToken(r.token);
            const uAdmin = p?.usuarios?.find((u) => u.papel === "admin") || p?.usuarios?.[0];
            const sid = criarSessao({ token: r.token, userId: uAdmin?.id || p?.id || "admin", ip: ipCad, ua: req.headers["user-agent"] || "" });
            res.setHeader("Set-Cookie", cookieSessao(sid, host));
          }
        } catch (e) { console.error("[sessao cadastro]", e.message); }
        return json(res, 200, r);
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }

    // Captura de interessado (e-mail) na landing page.
    if (rota === "/api/lead" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if (!corpo.email || !/.+@.+\..+/.test(corpo.email)) {
        return json(res, 400, { erro: "E-mail invalido" });
      }
      await salvarLead({ email: corpo.email, uf: corpo.uf ?? null, termo: corpo.termo ?? null });
      return json(res, 200, { ok: true });
    }

    // Voz do cliente: sugestao de melhoria ou duvida/suporte, enviada de dentro
    // do painel. Exige cliente logado (token valido). Cai no admin pra analise.
    if (rota === "/api/feedback" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      const msg = String(corpo.mensagem || "").trim();
      if (msg.length < 3) return json(res, 400, { erro: "Escreva sua mensagem" });
      const item = await salvarFeedback({
        token: perfil.token,
        empresa: perfil.razaoSocial || perfil.nome || null,
        email: perfil.email || null,
        tipo: corpo.tipo === "suporte" ? "suporte" : "sugestao",
        mensagem: msg,
      });
      return json(res, 200, { ok: true, id: item.id });
    }

    // Buscas salvas do cliente (guardadas no perfil). Lista.
    if (rota === "/api/buscas" && req.method === "GET") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      return json(res, 200, { buscas: perfil?._buscas || [] });
    }
    // Salvar ou remover uma busca salva.
    if (rota === "/api/buscas" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      let out = [];
      await atualizarPerfil(perfil.token, (p) => {
        p._buscas = Array.isArray(p._buscas) ? p._buscas : [];
        if (corpo.acao === "remover") {
          p._buscas = p._buscas.filter((b) => b.id !== corpo.id);
        } else {
          const nome = String(corpo.nome || "").slice(0, 60).trim() || "Busca salva";
          const params = (corpo.params && typeof corpo.params === "object") ? corpo.params : {};
          p._buscas.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nome, params, em: new Date().toISOString() });
          p._buscas = p._buscas.slice(0, 20); // teto
        }
        out = p._buscas;
      });
      return json(res, 200, { ok: true, buscas: out });
    }

    // Pesquisa de precos homologados (Caminho B). Cliente logado.
    if (rota === "/api/precos") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      const termo = url.searchParams.get("termo") || "";
      const uf = url.searchParams.get("uf") || null;
      const r = pesquisarPrecos({ termo, uf });
      return json(res, 200, { ...r, baseTotal: totalPrecos() });
    }

    // PCA: oportunidades antecipadas (compras planejadas). Cliente logado.
    if (rota === "/api/pca") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      const r = pesquisarPca({ termo: url.searchParams.get("termo") || "" });
      return json(res, 200, { ...r, baseTotal: totalPca() });
    }

    // Analise de concorrente por CNPJ (contratos que ele ganhou). Cliente logado.
    if (rota === "/api/concorrente") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      const cnpj = url.searchParams.get("cnpj") || "";
      const r = analiseConcorrente({ cnpj });
      if (!r) return json(res, 400, { erro: "CNPJ invalido (informe ao menos a raiz de 8 digitos)" });
      return json(res, 200, r);
    }

    // Favoritar/desfavoritar um edital (estrela). Guardado no perfil.
    if (rota === "/api/favorito" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      const id = String(corpo.id || "");
      if (!id) return json(res, 400, { erro: "Edital nao informado" });
      let favorito = false;
      await atualizarPerfil(perfil.token, (p) => {
        p._favoritos = Array.isArray(p._favoritos) ? p._favoritos : [];
        if (p._favoritos.includes(id)) p._favoritos = p._favoritos.filter((x) => x !== id);
        else { p._favoritos.unshift(id); favorito = true; }
        p._favoritos = p._favoritos.slice(0, 500);
      });
      return json(res, 200, { ok: true, favorito });
    }

    // Anotacao privada do cliente num edital (bloco de notas da empresa).
    if (rota === "/api/nota" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      if (!corpo.id) return json(res, 400, { erro: "Edital nao informado" });
      const nota = await salvarNota(perfil.token, String(corpo.id), corpo.texto || "");
      return json(res, 200, { ok: true, em: nota?.em ?? null });
    }

    // Busca livre no acervo (painel): qualquer produto + filtros de UF e modalidade.
    // Exportacao em CSV (Excel/Google Sheets) das views: editais (busca),
    // historico (licitacoes fechadas) e radar (contratos vencendo).
    // Reaproveita os mesmos filtros das rotas /api/*. Limite alto pra exportacao.
    if (rota === "/api/exportar") {
      const tipo = url.searchParams.get("tipo") || "editais";
      const tokenEx = url.searchParams.get("c") || "";
      const perfilEx = tokenEx ? await perfilPorToken(tokenEx) : null;
      const nome = nomeArquivo(tipo);
      let csv = "";

      if (tipo === "editais") {
        const ufsParam = url.searchParams.getAll("uf").filter(Boolean);
        const termoQuery = url.searchParams.get("termo") || "";
        // Se NAO veio termo nem UF na query e o cliente esta logado, usa filtros do perfil.
        const usarPerfil = !termoQuery && !ufsParam.length && perfilEx;
        const ufs = usarPerfil ? perfilEx.ufs : (ufsParam.length > 1 ? ufsParam : null);
        const uf = usarPerfil ? ((perfilEx.ufs ?? [])[0] || null) : (ufsParam[0] || null);
        const termos = usarPerfil ? (perfilEx.filtro?.termos ?? []) : (termoQuery ? [termoQuery] : []);
        const modParam = url.searchParams.get("modalidade") || "";
        const portaisEx = url.searchParams.getAll("portal").map((s) => s.trim()).filter(Boolean);
        const r = buscarEditais({
          uf, ufs,
          termos,
          termo: termoQuery,
          cidade: url.searchParams.get("cidade") || "",
          prazoDias: url.searchParams.get("prazo") || null,
          dataDe: url.searchParams.get("dataDe") || null,
          modalidades: modParam ? [Number(modParam)] : (usarPerfil ? (perfilEx.modalidades || []) : []),
          portais: portaisEx,
          limite: 1000,
        });
        csv = csvEditais(r.editais || []);
      } else if (tipo === "historico") {
        // Re-executa a mesma logica de /api/historico (sem paginacao) pra exportar.
        const ufsHist = url.searchParams.getAll("uf").filter(Boolean);
        const uf = ufsHist[0] || null;
        const meses = Number(url.searchParams.get("meses") || 12);
        const cidade = url.searchParams.get("cidade") || "";
        const customTermo = url.searchParams.get("termo");
        const termos = customTermo
          ? customTermo.split(",").map(t => t.trim()).filter(Boolean)
          : (perfilEx?.filtro?.termos ?? []);
        const { aplicarFiltro, normalizar, termosAmplos } = await import("../src/filtro.mjs");
        const { expandirTermos, excluirTermos } = await import("../src/sinonimos.mjs");
        const termosIA = customTermo
          ? [...termosAmplos(termos), ...expandirTermos(termos)]
          : (perfilEx?.filtro?.termosIA ?? []);
        const termosExcluir = customTermo ? excluirTermos(termos) : (perfilEx?.filtro?.termosExcluir ?? []);
        if (!termos.length && !termosIA.length) return json(res, 400, { erro: "Informe um termo para exportar" });
        const candidatos = (await import("../src/db.mjs")).consultarContratos({ uf, mesesAtras: meses });
        let todos = aplicarFiltro(candidatos, { termos, termosIA, termosExcluir }).filter(c => c.valor > 0);
        if (cidade.trim()) {
          const cn = normalizar(cidade.trim());
          todos = todos.filter(c => normalizar(c.municipio || "").includes(cn));
        }
        // Agrupa por objeto aproximado (mesma logica do /api/historico)
        const hojeIsoExp = new Date().toISOString();
        const dataValidaExp = (c) => {
          const cand = c.publicacao || c.vigenciaInicio;
          return cand && cand <= hojeIsoExp ? cand : null;
        };
        const grupos = new Map();
        for (const c of todos) {
          const ch = `${c.orgaoCnpj || c.orgao || ""}|${normalizar(c.objeto || "").replace(/\s+/g, " ").trim().slice(0, 80)}`;
          const g = grupos.get(ch) || { orgao: c.orgao, municipio: c.municipio, uf: c.uf, objeto: c.objeto, data: dataValidaExp(c), fornecedores: new Map(), valorTotal: 0, qtdContratos: 0 };
          if ((c.objeto || "").length > (g.objeto || "").length) g.objeto = c.objeto;
          const f = c.fornecedor || "Nao informado";
          g.fornecedores.set(f, (g.fornecedores.get(f) || 0) + (c.valor || 0));
          g.valorTotal += c.valor || 0;
          g.qtdContratos++;
          grupos.set(ch, g);
        }
        const licitacoes = [...grupos.values()].map((g) => {
          const vencedores = [...g.fornecedores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([fornecedor, valor]) => ({ fornecedor, valor }));
          return { ...g, vencedores };
        }).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
        csv = csvHistorico(licitacoes);
      } else if (tipo === "concorrentes") {
        // Lista crua dos contratos analisados no bloco "Quem mais ganha neste orgao":
        // filtra por orgao + termos do ramo do cliente, mesma janela do precoVencedores.
        if (!perfilEx) return json(res, 401, { erro: "Login obrigatorio" });
        const editalId = url.searchParams.get("editalId");
        const edital = editalId ? buscarPorId(editalId) : null;
        const { consultarContratos } = await import("../src/db.mjs");
        const { aplicarFiltro } = await import("../src/filtro.mjs");
        const termos = perfilEx.filtro?.termos ?? [];
        const meses = 18;
        const uf = edital?.uf || (perfilEx.ufs ?? [])[0] || null;
        const candidatos = consultarContratos({ uf, mesesAtras: meses });
        let casaram = aplicarFiltro(candidatos, { termos });
        // Filtra pelo orgao do edital se houver
        const orgaoCnpj = edital?.orgaoCnpj || null;
        if (orgaoCnpj) casaram = casaram.filter((c) => (c.orgaoCnpj || "") === orgaoCnpj);
        casaram.sort((a, b) => (b.valor || 0) - (a.valor || 0));
        csv = csvContratos(casaram.slice(0, 500));
      } else if (tipo === "radar") {
        if (!perfilEx) return json(res, 401, { erro: "Login obrigatorio" });
        const itens = radarRenovacao({
          termos: perfilEx.filtro?.termos ?? [],
          uf: (perfilEx.ufs ?? [])[0] ?? null,
          limite: 200,
        });
        csv = csvRadar(itens);
      } else {
        return json(res, 400, { erro: "Tipo invalido (editais, historico ou radar)" });
      }

      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "no-store",
      });
      return res.end(csv);
    }

    if (rota === "/api/buscar") {
      const uf = url.searchParams.get("uf") || null;
      const ufsParam = url.searchParams.getAll("uf"); // multi-uf: ?uf=SC&uf=SP
      const ufs = ufsParam.filter(Boolean).length > 1 ? ufsParam.filter(Boolean) : null;
      const termo = url.searchParams.get("termo") || "";
      const cidade = url.searchParams.get("cidade") || "";
      const prazoDias = url.searchParams.get("prazo") || null;
      const dataDe = url.searchParams.get("dataDe") || null;
      const dataAte = url.searchParams.get("dataAte") || null;
      const pubDe = url.searchParams.get("pubDe") || null;
      const pubAte = url.searchParams.get("pubAte") || null;
      const modParam = url.searchParams.get("modalidade") || "";
      const modalidades = modParam ? [Number(modParam)] : [];
      // Portal de origem: aceita 1 ou varios (?portal=comprasgov&portal=bll).
      const portais = url.searchParams.getAll("portal").map((s) => s.trim()).filter(Boolean);
      const numeroEdital = url.searchParams.get("numeroEdital") || null;
      const valorMin = url.searchParams.get("valorMin") ? Number(url.searchParams.get("valorMin")) : null;
      const valorMax = url.searchParams.get("valorMax") ? Number(url.searchParams.get("valorMax")) : null;
      const srp = url.searchParams.get("srp") || null; // "sim" | "nao"
      const excluir = (url.searchParams.get("excluir") || "").split(",").map((s) => s.trim()).filter(Boolean);
      const pagina = Number(url.searchParams.get("pagina") || 1);
      const porPag = Math.min(50, Math.max(5, Number(url.searchParams.get("porPag") || 15)));
      const resultado = buscarEditais({ uf, ufs, termo, modalidades, portais, cidade, prazoDias, dataDe, dataAte, pubDe, pubAte, numeroEdital, valorMin, valorMax, srp, excluir, pagina, porPag });
      // Sela o mesmo selo de reputacao/oportunidade do feed, pra a busca mostrar
      // bom/medio/mau pagador igual ao painel (nao so "+ Planejamento").
      await selarOportunidade(resultado.editais || []);
      return json(res, 200, resultado);
    }

    // Lista de editais do cliente (filtrada pelo token ?c=). Token admin ve tudo.
    if (rota === "/api/editais") {
      const token = url.searchParams.get("c") || "";
      if (token === ADMIN) return json(res, 200, await carregarResultados());
      const perfil = await perfilPorToken(token);
      if (!perfil) return json(res, 200, {}); // token invalido = nada
      // Calcula AO VIVO (matching e so consulta no banco, instantaneo). Antes
      // lia do resultados.json pre-computado, que so era regenerado a cada 6h:
      // qualquer mudanca no matching (ou cadastro recente) demorava a aparecer e
      // o painel abria vazio. Ao vivo reflete o acervo atual + o ramo ampliado
      // (termosAmplos/termosIA) na hora. marcar:false preserva a flag "novo" do
      // digest diario.
      let editais = [];
      let alargado = false;
      let totalBruto = 0;
      try {
        const r = await monitorar(perfil, { marcar: false, salvar: false });
        editais = r.filtrados; alargado = r.alargado; totalBruto = r.total;
      } catch (e) { console.error("[api/editais] monitorar:", e.message); }
      // Selo de reputacao de pagamento + oportunidade (forte/regular/avaliar), o
      // MESMO helper que a busca usa, pra o selo ser identico nos dois lugares.
      await selarOportunidade(editais);
      // Marca os favoritados do cliente (estrela no card).
      const favSet = new Set(perfil._favoritos || []);
      for (const ed of editais) ed.favorito = favSet.has(ed.id);
      // Pre-aquece o resumo (TL;DR) dos editais mais urgentes em segundo plano,
      // pra abrir instantaneo (como o concorrente faz pre-gerando tudo). Diferenca:
      // so os top-N do painel, nao os 426k -> custo controlado. NAO bloqueia a
      // resposta. Cache global: o 1o cliente aquece pra todos.
      preaquecerTldrs(editais).catch(() => {});
      return json(res, 200, {
        [perfil.id]: {
          nome: perfil.nome,
          uf: (perfil.ufs ?? [])[0] ?? perfil.uf ?? null,
          atualizadoEm: new Date().toISOString(),
          editais,
          alargado,
          totalBruto,
          // Ativacao: se ainda nao rodou nenhuma analise, o painel mostra o card
          // "comece por aqui" que leva a 1a analise (momento "uau").
          analisou: (perfil.analises?.usados || 0) > 0,
          // Se ja analisou mas nao tem nenhuma certidao, o painel mostra o card
          // de captura rapida pra destravar o veredito personalizado.
          temCertidao: Object.values(perfil.empresa?.certidoes || {}).some((c) => c?.validade),
          // Estados do cliente: o painel prefere editais destes UFs nos cards de
          // aha/melhor oportunidade (so cai no nacional se nao houver no estado).
          ufs: perfil.ufs ?? (perfil.uf ? [perfil.uf] : []),
        },
      });
    }

    // Radar de renovacao: contratos do ramo do cliente que vao vencer.
    if (rota === "/api/radar") {
      const token = url.searchParams.get("c") || "";
      const perfil = token ? await perfilPorToken(token) : null;
      const radar = perfil
        ? radarRenovacao({ termos: perfil.filtro?.termos ?? [], uf: (perfil.ufs ?? [])[0] ?? null })
        : [];
      return json(res, 200, { radar });
    }

    // Perfil documental do cliente: salvar.
    if (rota === "/api/documentos" && req.method === "POST") {
      const token = url.searchParams.get("c") || "";
      const empresa = await lerCorpo(req);
      const ok = await salvarEmpresaPerfil(token, empresa);
      if (!ok) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, { ok: true });
    }
    // Perfil documental do cliente: carregar.
    if (rota === "/api/documentos") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      return json(res, 200, { empresa: perfil?.empresa || null });
    }
    // Captura rapida de certidoes (card do painel): MERGE, sem apagar os outros
    // dados da empresa. Destrava o veredito personalizado sem sair pra /documentos.
    if (rota === "/api/certidoes" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      const cert = (corpo.certidoes && typeof corpo.certidoes === "object") ? corpo.certidoes : {};
      await atualizarPerfil(perfil.token, (p) => {
        p.empresa = p.empresa || {};
        p.empresa.certidoes = { ...(p.empresa.certidoes || {}), ...cert };
      });
      return json(res, 200, { ok: true });
    }

    // Kanban de Planejamento: adiciona/move um edital de estagio, ou remove do
    // funil. "edital" (retrato do card no momento de adicionar) e opcional: so
    // e necessario na primeira vez, pra o card sobreviver mesmo se o edital sair
    // do resultado ao vivo da busca depois.
    if (rota === "/api/planejamento" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      if (!corpo.editalId) return json(res, 400, { erro: "editalId obrigatorio" });
      if (corpo.remover) {
        await removerEstagio(perfil.token, corpo.editalId);
        return json(res, 200, { ok: true });
      }
      const item = await salvarEstagio(perfil.token, corpo.editalId, corpo.estagio, corpo.edital);
      if (!item) return json(res, 400, { erro: "Estagio invalido" });
      return json(res, 200, { ok: true, item });
    }
    // Kanban de Planejamento: lista os editais do cliente, agrupados por estagio.
    if (rota === "/api/planejamento") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 403, { erro: "Sessao invalida" });
      return json(res, 200, { grupos: await carregarEstagios(perfil.token) });
    }

    // Estado da assinatura do cliente (o painel usa para liberar ou cobrar).
    // Onboarding: checklist de primeiros passos pos-cadastro.
    if (rota === "/api/onboarding") {
      const tokenOb = url.searchParams.get("c") || "";
      const perfilOb = await perfilPorToken(tokenOb);
      if (!perfilOb) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, onboardingChecklist(perfilOb));
    }

    // Onboarding: cliente dispensa o banner (volta com botao 'mostrar de novo')
    if (rota === "/api/onboarding/dispensar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfis = await lerPerfis();
      const p = perfis.find((x) => x.token === (corpo.c || ""));
      if (!p) return json(res, 404, { erro: "Conta nao encontrada" });
      p._onboardingDispensado = !p._onboardingDispensado;
      await salvarPerfis(perfis);
      return json(res, 200, { ok: true, dispensado: p._onboardingDispensado });
    }

    // Notificacoes in-app (sino): agrega o que ja calculamos e hoje so vai por
    // e-mail. Sem store: reflete o estado atual a cada abertura.
    if (rota === "/api/notificacoes") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 200, { notificacoes: [], total: 0 });
      const c = encodeURIComponent(perfil.token);
      const notis = [];
      try {
        const empresa = empresaDoPerfil(perfil);
        const em30 = new Date(Date.now() + 30 * 864e5);
        const s = saudeDocumental(empresa);
        const vencidas = s.itens.filter((i) => i.situacao === "vencida").length;
        const vencendo = s.itens.filter((i) => i.situacao === "valida" && i.validade && new Date(i.validade) <= em30).length;
        if (vencidas) notis.push({ icone: "📄", titulo: `${vencidas} certid${vencidas > 1 ? "ões" : "ão"} vencida${vencidas > 1 ? "s" : ""}`, link: `/documentos?c=${c}`, urgente: true });
        else if (vencendo) notis.push({ icone: "📄", titulo: `${vencendo} certid${vencendo > 1 ? "ões" : "ão"} vencendo em até 30 dias`, link: `/documentos?c=${c}`, urgente: false });
      } catch {}
      try {
        const r = estatisticasRecebiveis(perfil.token);
        if (r.atrasadas) notis.push({ icone: "💰", titulo: `${r.atrasadas} nota${r.atrasadas > 1 ? "s" : ""} fiscal${r.atrasadas > 1 ? "is" : ""} atrasada${r.atrasadas > 1 ? "s" : ""}`, link: `/recebiveis?c=${c}`, urgente: true });
      } catch {}
      try {
        const cs = listarContratos(perfil.token).filter((x) => x.situacao === "fim_em_30d");
        if (cs.length) notis.push({ icone: "📑", titulo: `${cs.length} contrato${cs.length > 1 ? "s" : ""} vencendo em 30 dias`, link: `/contratos?c=${c}`, urgente: false });
      } catch {}
      try {
        const u = usoDe(perfil);
        if (u.limite > 0 && u.usados / u.limite >= 0.8) notis.push({ icone: "⚡", titulo: `Você usou ${u.usados}/${u.limite} análises do mês`, link: `/assinar?c=${c}`, urgente: u.usados >= u.limite });
      } catch {}
      return json(res, 200, { notificacoes: notis, total: notis.length });
    }

    if (rota === "/api/acesso") {
      const token = url.searchParams.get("c") || "";
      if (token === ADMIN) return json(res, 200, { encontrado: true, nome: "Administrador", status: "admin", temAcesso: true });
      const perfil = await perfilPorToken(token);
      if (!perfil) return json(res, 200, { encontrado: false });
      return json(res, 200, {
        encontrado: true,
        nome: perfil.nome,
        ...statusAtual(perfil),
        nivel: perfil.assinatura?.nivel ?? null,
        uso: usoDe(perfil),
        usoExtracoes: usoExtracoesDe(perfil),
        // Conta criada via Google sem CNPJ ainda: front redireciona pra completar.
        precisaCompletarCadastro: !!perfil.precisaCompletarCadastro || !perfil.cnpj,
        cobranca: { preco: cobranca.preco, pix: cobranca.pix, contato: cobranca.contato },
        // Recado do admin pra este cliente (individual tem prioridade sobre o
        // geral). O painel decide mostrar comparando o id com o ultimo visto.
        recado: await lerRecadoPara(token),
      });
    }

    // Completar cadastro (fluxo Google): cliente preenche CNPJ + ramo + UFs.
    // TRAVA DE CNPJ: bloqueia se o CNPJ ja pertence a outra conta.
    if (rota === "/api/completar-cadastro" && req.method === "POST") {
      const ipC = ipAuth(req);
      const limC = checarAuth("completar", ipC);
      if (!limC.ok) return json(res, 429, { erro: `Muitas tentativas. Tente novamente em ${Math.ceil(limC.esperaSeg / 60)} minutos.` });
      registrarTentativa("completar", ipC);
      const token = url.searchParams.get("c") || "";
      const corpo = await lerCorpo(req);
      const perfis = await lerPerfis();
      const p = perfis.find((x) => x.token === token);
      if (!p) return json(res, 404, { erro: "Conta nao encontrada" });

      const cnpjLimpo = String(corpo.cnpj || "").replace(/\D/g, "");
      if (cnpjLimpo.length !== 14) return json(res, 400, { erro: "Informe um CNPJ valido (14 digitos)" });

      // TRAVA: CNPJ ja existe em OUTRA conta?
      const donoExistente = perfis.find(
        (x) => x.token !== token && (x.cnpj || "").replace(/\D/g, "") === cnpjLimpo
      );
      if (donoExistente) {
        const emailMasc = (donoExistente.email || "").replace(/^(.{2}).*(@.*)$/, "$1***$2");
        return json(res, 409, {
          erro: `Este CNPJ já tem uma conta no ContrataX (e-mail ${emailMasc}). Se for a sua empresa, entre com esse e-mail ou recupere a senha. Se você é da equipe, peça ao administrador da conta para te convidar.`,
          cnpjJaExiste: true,
        });
      }

      const termos = parseRamos(corpo.ramo);
      if (!termos.length) return json(res, 400, { erro: "Informe ao menos uma palavra do seu ramo" });
      if (termos.length > MAX_TERMOS) return json(res, 400, { erro: `Selecione no maximo ${MAX_TERMOS} ramos. Foque no que sua empresa realmente vende para receber so o que importa.` });

      // Consulta a Receita: puxa razao social E bloqueia empresa inativa (so
      // quando a Receita confirma nao-ativa; falha de API nao bloqueia).
      let razao = p.razaoSocial || null;
      try {
        const consulta = await consultarCNPJ(cnpjLimpo);
        if (consulta?.ativa === false) {
          return json(res, 400, { erro: `Este CNPJ consta como "${consulta.situacao}" na Receita. Para participar de licitações, a empresa precisa estar com situação cadastral ativa.` });
        }
        if (consulta?.valido && consulta.razaoSocial) razao = consulta.razaoSocial;
      } catch { /* segue sem razao */ }

      p.cnpj = cnpjLimpo;
      if (razao) p.razaoSocial = razao;
      p.filtro = { ...(p.filtro || {}), termos, termosExcluir: p.filtro?.termosExcluir || [] };
      p.ufs = Array.isArray(corpo.ufs) ? corpo.ufs.filter(Boolean) : (corpo.uf ? [corpo.uf] : []);
      if (corpo.nome && corpo.nome.trim()) p.nome = corpo.nome.trim();
      p.precisaCompletarCadastro = false;
      await salvarPerfis(perfis);

      let total = 0;
      try { const { filtrados } = await monitorar(p); total = filtrados.length; } catch {}
      return json(res, 200, { ok: true, total, link: `/painel?c=${token}` });
    }

    // Perfil do cliente: ler dados editaveis (para a pagina Minha conta).
    // Contratos detalhados de um fornecedor especifico, no MESMO escopo que o
    // ranking usou (orgao, municipio, uf ou nacional). Devolve com link pro PNCP.
    if (rota === "/api/contratos-fornecedor") {
      const tokenF = url.searchParams.get("c") || "";
      const perfilF = await perfilPorToken(tokenF);
      if (!perfilF) return json(res, 404, { erro: "Conta nao encontrada" });
      const editalId = url.searchParams.get("editalId");
      const editalF = editalId ? buscarPorId(editalId) : null;
      const fornecedorNi = url.searchParams.get("ni") || null;
      const fornecedor = url.searchParams.get("fornecedor") || null;
      const escopo = url.searchParams.get("escopo") || "orgao";
      // Filtra por orgao SO se o ranking foi escopo "orgao". Senao usa UF (escopo
      // do ranking) ou nacional — mesmo escopo que o cliente esta vendo no topo.
      const filtrarOrgao = escopo === "orgao";
      const lista = contratosDoFornecedor({
        termos: perfilF.filtro?.termos ?? [],
        uf: escopo === "nacional" ? null : (editalF?.uf || (perfilF.ufs ?? [])[0] || null),
        orgaoCnpj: filtrarOrgao ? (editalF?.orgaoCnpj || null) : null,
        fornecedorNi, fornecedor,
      });
      return json(res, 200, { contratos: lista, escopo });
    }

    // (removidas em 2026-06: rotas /api/templates e /api/templates/<id>.
    // Bloco de download no painel foi desativado; modulo src/templates.mjs
    // ainda existe pra uso futuro, mas nao tem rota publica.)

    // Saude documental do perfil (lista de certidoes + dias para vencer).
    // Usado pelo painel pra mostrar popup de alerta quando algo vai vencer logo.
    if (rota === "/api/saude-empresa" && req.method === "GET") {
      const tokenS = url.searchParams.get("c") || "";
      const perfilS = await perfilPorToken(tokenS);
      if (!perfilS) return json(res, 404, { erro: "Conta nao encontrada" });
      const empresa = empresaDoPerfil(perfilS);
      const s = saudeDocumental(empresa);
      // Calcula dias para vencer de cada item com validade
      const itens = (s.itens || []).map((i) => {
        let dias = null;
        if (i.validade) {
          const d = new Date(i.validade);
          if (!isNaN(d)) dias = Math.ceil((d - new Date()) / 864e5);
        }
        return { ...i, dias };
      });
      return json(res, 200, { ...s, itens });
    }

    if (rota === "/api/perfil" && req.method === "GET") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, {
        nome: perfil.nome,
        razaoSocial: perfil.razaoSocial ?? null,
        cnpj: perfil.cnpj ?? null,
        email: perfil.email ?? null,
        ramo: (perfil.filtro?.termos ?? []).join(", "),
        termosIA: perfil.filtro?.termosIA ?? [],
        excluir: (perfil.filtro?.termosExcluir ?? []).join(", "),
        uf: (perfil.ufs ?? [])[0] ?? "",
        ufs: perfil.ufs ?? [],
        modalidades: perfil.modalidades ?? [],
        endereco: perfil.endereco ?? "",
        representante: perfil.representante ?? { nome: "", cpf: "", cargo: "" },
      });
    }
    // Perfil do cliente: salvar alteracoes (ramo, uf, modalidades, nome).
    if (rota === "/api/perfil" && req.method === "POST") {
      const token = url.searchParams.get("c") || "";
      const corpo = await lerCorpo(req);
      const perfis = await lerPerfis();
      const p = perfis.find((x) => x.token === token);
      if (!p) return json(res, 404, { erro: "Conta nao encontrada" });
      const termos = parseRamos(corpo.ramo);
      if (!termos.length) return json(res, 400, { erro: "Informe ao menos uma palavra do seu ramo" });
      if (termos.length > MAX_TERMOS) return json(res, 400, { erro: `Selecione no maximo ${MAX_TERMOS} ramos. Foque no que sua empresa realmente vende para receber so o que importa.` });
      if (corpo.nome && corpo.nome.trim()) p.nome = corpo.nome.trim();
      const { expandirRamo } = await import("../src/expandirRamo.mjs");
      p.filtro = {
        ...(p.filtro || {}),
        termos,
        termosIA: await expandirRamo(termos),
        termosExcluir: parseRamos(corpo.excluir),
      };
      // Aceita ufs (array) ou uf (string simples, retrocompativel).
      if (Array.isArray(corpo.ufs) && corpo.ufs.length > 0) {
        p.ufs = corpo.ufs.filter(Boolean);
      } else {
        p.ufs = corpo.uf ? [corpo.uf] : [];
      }
      if (Array.isArray(corpo.modalidades) && corpo.modalidades.length) p.modalidades = corpo.modalidades.map(Number);
      if (corpo.endereco !== undefined) p.endereco = String(corpo.endereco || "").trim();
      if (corpo.representante) p.representante = {
        nome: String(corpo.representante.nome || "").trim(),
        cpf: String(corpo.representante.cpf || "").trim(),
        cargo: String(corpo.representante.cargo || "").trim(),
      };
      await salvarPerfis(perfis);
      // Re-roda o matching para o painel ja refletir o novo ramo.
      let total = 0;
      try { const { filtrados } = await monitorar(p); total = filtrados.length; } catch {}
      return json(res, 200, { ok: true, total });
    }

    // Historico de contratos do ramo do cliente (ultimos 12 meses por padrao).
    // Funciona sem login se houver termo na URL; com login pre-carrega o ramo do perfil.
    if (rota === "/api/historico") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      const uf    = url.searchParams.get("uf") || null;
      const cidade = url.searchParams.get("cidade") || "";
      const meses = Number(url.searchParams.get("meses") || 12);
      const pag   = Math.max(1, Number(url.searchParams.get("pagina") || 1));
      const porPag = 30;
      const { consultarContratos } = await import("../src/db.mjs");
      const { aplicarFiltro, normalizar, termosAmplos } = await import("../src/filtro.mjs");
      const { expandirTermos, excluirTermos } = await import("../src/sinonimos.mjs");
      // Usa o termo digitado ou os termos do perfil (se logado). Quando usa o
      // ramo do perfil, aproveita tambem os termos relacionados da ContrataX.IA
      // (mesma expansao semantica do painel de editais), pra o historico nao
      // ficar mais estreito que o painel. Termo digitado tambem expande para o
      // ramo (atadura -> hospitalar), igual a LP e o painel — o objeto do
      // contrato e de alto nivel, entao o produto especifico sozinho da zero.
      const customTermo = url.searchParams.get("termo");
      const termos = customTermo
        ? customTermo.split(",").map(t => t.trim()).filter(Boolean)
        : (perfil?.filtro?.termos ?? []);
      // Produto especifico? Se o termo digitado casa um gatilho do dicionario
      // (fralda, seringa...), a busca e EXPANDIDA pra CATEGORIA do ramo, porque o
      // contrato publico e registrado por categoria ("material hospitalar"), nao
      // por item. Sinaliza pro front explicar (o produto vive DENTRO da categoria,
      // o valor mostrado e do contrato inteiro da categoria, nao so do produto).
      const ramoExpandido = customTermo ? expandirTermos(termos) : [];
      const produtoEspecifico = ramoExpandido.length > 0;
      const termosIA = customTermo
        ? [...termosAmplos(termos), ...ramoExpandido]
        : (perfil?.filtro?.termosIA ?? []);
      // Exclui obra/servico quando o termo digitado e produto de ramo (ex: cimento).
      const termosExcluir = customTermo ? excluirTermos(termos) : (perfil?.filtro?.termosExcluir ?? []);
      // Sem termo e sem perfil: pede que o usuario busque algo
      if (!termos.length && !termosIA.length) {
        return json(res, 200, { total: 0, paginas: 0, pagina: 1, termos: [], licitacoes: [], aviso: "Digite um produto ou serviço para ver o histórico." });
      }
      // Prefiltro coarse pro SQL: palavras DISTINTIVAS de termos+termosIA (sem
      // genericas nem aspas), pra o LIMIT do consultarContratos recair sobre
      // contratos do RAMO buscado, nao sobre os 10k mais recentes de tudo (uma UF
      // grande como SC tem 750k contratos). O matching fino roda depois em JS.
      const GENERICOS_LIKE = new Set(["material","materiais","produto","produtos","servico","servicos","equipamento","equipamentos","insumo","insumos","aquisicao","fornecimento","contratacao","prestacao","locacao","kit","kits","item","itens","peca","pecas","generos","genero","suprimento","suprimentos","consumo"]);
      const termosLike = [...new Set(
        [...termos, ...termosIA]
          .flatMap((t) => normalizar(String(t).replace(/"/g, "")).split(/[^a-z0-9]+/))
          .filter((w) => w.length >= 3 && !GENERICOS_LIKE.has(w))
      )];
      // cidade + termo empurrados pro SQL: o LIMIT agora recai sobre o municipio
      // e o ramo certos (antes era so-UF, e o municipio do cliente se perdia).
      const candidatos = consultarContratos({ uf, cidade, termosLike, mesesAtras: meses });
      const todos = aplicarFiltro(candidatos, { termos, termosIA, termosExcluir }).filter(c => c.valor > 0);
      // Agrupa por licitacao (mesmo objeto aproximado): colapsa contratos do mesmo
      // Registro de Precos comprado por varias prefeituras. Mostra top 3 vencedores.
      // Usa data de PUBLICACAO no PNCP (fato registrado, nunca futuro). Se nao tiver,
      // cai pra vigenciaInicio. Descarta datas no futuro (anomalias do PNCP).
      const hojeIso = new Date().toISOString();
      const dataValida = (c) => {
        const cand = c.publicacao || c.vigenciaInicio;
        if (!cand) return null;
        return cand > hojeIso ? null : cand; // ignora datas futuras
      };
      const grupos = new Map();
      for (const c of todos) {
        // Agrupa por ORGAO + objeto. Antes era so objeto (60 chars): como muitos
        // municipios usam o MESMO titulo padrao ("MATERIAIS AMBULATORIAIS E
        // INSUMOS HOSPITALARES - LEI 14.133/2021"), 122 compras de 122 orgaos
        // colapsavam numa linha so e o cliente perdia "quem ganhou onde". Com o
        // orgao na chave, cada compra de cada orgao vira sua linha (com seu
        // vencedor); fragmentos de item do MESMO orgao seguem colapsados.
        const chave = (c.orgaoCnpj || c.orgao || "") + "|" + normalizar(c.objeto || "").replace(/\s+/g, " ").trim().slice(0, 80);
        const g = grupos.get(chave) || {
          objeto: c.objeto, orgao: c.orgao, municipio: c.municipio, uf: c.uf,
          data: dataValida(c), vigenciaFim: c.vigenciaFim,
          valorTotal: 0, qtdContratos: 0, fornecedores: new Map(),
        };
        if ((c.objeto || "").length > (g.objeto || "").length) g.objeto = c.objeto;
        const d = dataValida(c);
        if (d && (d > (g.data || ""))) g.data = d;
        g.valorTotal += c.valor || 0;
        g.qtdContratos++;
        g.fornecedores.set(c.fornecedor || "Não informado",
          (g.fornecedores.get(c.fornecedor || "Não informado") || 0) + (c.valor || 0));
        grupos.set(chave, g);
      }
      // Marca EXATO vs CATEGORIA: exato = o objeto casa os termos LITERAIS (sem a
      // expansao termosIA). Categoria = so casou via expansao de ramo (ex: buscou
      // "fralda", o contrato e "MATERIAIS AMBULATORIAIS E INSUMOS HOSPITALARES",
      // fralda pode estar la dentro mas o titulo nao confirma). Vale pra QUALQUER
      // termo buscado, nao so produto especifico: se o cliente digitou 2+ palavras
      // que ja SAO a frase de categoria (ex: "material hospitalar"), o proprio
      // objeto casa direto nos termos literais e cai como exato tambem.
      const ehExato = (objeto) => aplicarFiltro([{ objeto }], { termos }).length > 0;
      // Ordena: EXATOS primeiro, depois por data (mais recente primeiro) dentro de cada grupo.
      const lista = [...grupos.values()]
        .map((g) => ({ ...g, exato: ehExato(g.objeto) }))
        .sort((a, b) => (b.exato - a.exato) || (b.data || "").localeCompare(a.data || ""))
        .map(g => ({
        objeto: g.objeto, orgao: g.orgao, municipio: g.municipio, uf: g.uf,
        data: g.data, vigenciaFim: g.vigenciaFim, exato: g.exato,
        valorTotal: g.valorTotal, qtdContratos: g.qtdContratos,
        vencedores: [...g.fornecedores.entries()]
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([fornecedor, valor]) => ({ fornecedor, valor })),
      }));
      const total = lista.length;
      const totalExato = lista.filter((g) => g.exato).length;
      // Soma de contratos de TODOS os grupos (cada "compra"/objeto agrupa N
      // contratos): mostra que "5 compras" pode significar centenas de contratos.
      const totalContratos = lista.reduce((s, g) => s + (g.qtdContratos || 0), 0);
      const paginas = Math.ceil(total / porPag);
      const licitacoes = lista.slice((pag - 1) * porPag, pag * porPag);
      // ramoCategorias = as frases de categoria pra onde o produto foi expandido
      // (sem aspas), pro front citar "material hospitalar" na nota de honestidade.
      const ramoCategorias = [...new Set(ramoExpandido.map((t) => t.replace(/"/g, "")))].slice(0, 4);
      return json(res, 200, { total, totalExato, totalContratos, paginas, pagina: pag, termos, licitacoes, produtoEspecifico, ramoCategorias });
    }

    // Declaracoes de habilitacao preenchidas com os dados da empresa.
    if (rota === "/api/declaracoes") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      const declaracoes = gerarDeclaracoes({
        razaoSocial: perfil.razaoSocial, nome: perfil.nome, cnpj: perfil.cnpj,
        endereco: perfil.endereco, representante: perfil.representante,
      });
      const completo = Boolean(perfil.endereco && perfil.representante?.nome && perfil.representante?.cpf);
      return json(res, 200, { declaracoes, completo });
    }

    // Custo de IA (so admin): resumo de tokens/R$ por analise.
    if (rota === "/api/custos") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      return json(res, 200, (await resumoCustos()) || { chamadas: 0 });
    }

    // Download do backup diario. Protegido por token admin.
    if (rota.startsWith("/admin/backup/")) {
      if ((url.searchParams.get("t") || "") !== ADMIN) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Apenas admin");
      }
      const data = rota.split("/").pop().replace(/[^0-9-]/g, "");
      const { caminhoBackup } = await import("../src/backup.mjs");
      const caminho = caminhoBackup(data);
      try {
        const buf = await readFile(caminho);
        res.writeHead(200, {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="contratax-${data}.db.gz"`,
          "Content-Length": buf.length,
        });
        return res.end(buf);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Backup nao encontrado para " + data);
      }
    }

    // Forca um backup imediato (admin). Util para testar ou antes de manutencao.
    if (rota === "/api/admin/backup/agora") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const { rodarBackup } = await import("../src/backup.mjs");
        const meta = await rodarBackup();
        return json(res, 200, { ok: true, meta });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // Diagnostico de disco: lista os arquivos do volume e tamanhos (pra
    // investigar volume cheio). GET /api/admin/disco?c=ADMIN
    if (rota === "/api/admin/disco") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const { diagnosticoDisco, usoDisco } = await import("../src/backup.mjs");
        const { totalItensEdital } = await import("../src/db.mjs");
        const [arquivos, volume] = await Promise.all([
          diagnosticoDisco(),
          usoDisco().catch(() => null),
        ]);
        return json(res, 200, { volume, itensIndexados: totalItensEdital(), ...arquivos });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // Diagnostico de COBERTURA de dados (admin): fotografa o quanto cada base
    // realmente tem em PRODUCAO. Serve pra decidir se o "historico raso" e falta
    // de backfill (poucos contratos) ou de granularidade (contrato e por
    // categoria, produto vive nos itens que nao indexamos). GET ?c=ADMIN&uf=SC&cidade=...
    if (rota === "/api/admin/cobertura") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const { abrir } = await import("../src/db.mjs");
        const d = abrir();
        const uf = url.searchParams.get("uf") || null;
        const cidade = url.searchParams.get("cidade") || null;
        const um = (sql, ...a) => { try { return d.prepare(sql).get(...a); } catch (e) { return { erro: e.message }; } };
        const lista = (sql, ...a) => { try { return d.prepare(sql).all(...a); } catch (e) { return [{ erro: e.message }]; } };
        const contratos = {
          total: um("SELECT COUNT(*) n FROM contratos").n,
          datas: um("SELECT MIN(publicacao) minPub, MAX(publicacao) maxPub, MIN(vigencia_inicio) minVig, MAX(vigencia_inicio) maxVig FROM contratos"),
          topUf: lista("SELECT uf, COUNT(*) n FROM contratos GROUP BY uf ORDER BY n DESC LIMIT 10"),
          comFralda: um("SELECT COUNT(*) n FROM contratos WHERE objeto LIKE '%ralda%'").n,
          comHospitalar: um("SELECT COUNT(*) n FROM contratos WHERE objeto LIKE '%ospitalar%' OR objeto LIKE '%nfermagem%'").n,
        };
        const precosItens = {
          total: um("SELECT COUNT(*) n FROM precos_itens").n,
          datas: um("SELECT MIN(data_resultado) min, MAX(data_resultado) max FROM precos_itens"),
          topUf: lista("SELECT uf, COUNT(*) n FROM precos_itens GROUP BY uf ORDER BY n DESC LIMIT 10"),
          comFralda: um("SELECT COUNT(*) n FROM precos_itens WHERE descricao_norm LIKE '%fralda%'").n,
        };
        const editais = {
          total: um("SELECT COUNT(*) n FROM editais").n,
          abertos: um("SELECT COUNT(*) n FROM editais WHERE encerramento >= ?", new Date().toISOString()).n,
          itensIndexados: um("SELECT COUNT(*) n FROM itens_edital").n,
        };
        // Recorte opcional por UF/cidade, pra checar um municipio especifico (BC).
        let recorte = null;
        if (uf) {
          const cond = cidade ? "uf=? AND municipio LIKE ?" : "uf=?";
          const args = cidade ? [uf, `%${cidade}%`] : [uf];
          recorte = {
            uf, cidade,
            contratos: um(`SELECT COUNT(*) n FROM contratos WHERE ${cond}`, ...args).n,
            precosItens: um(`SELECT COUNT(*) n FROM precos_itens WHERE ${cond}`, ...args).n,
            amostraObjetos: lista(`SELECT DISTINCT substr(objeto,1,70) obj FROM contratos WHERE ${cond} ORDER BY publicacao DESC LIMIT 15`, ...args).map((r) => r.obj),
          };
        }
        return json(res, 200, { contratos, precosItens, editais, recorte, agora: new Date().toISOString() });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // Limpeza de emergencia: remove orfaos + WAL checkpoint TRUNCATE.
    // POST /api/admin/disco/limpar  body: { c: ADMIN, vacuum: true? }
    if (rota === "/api/admin/disco/limpar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const { limparDisco } = await import("../src/backup.mjs");
        return json(res, 200, await limparDisco({ vacuum: corpo.vacuum === true }));
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // ===== Painel admin (tudo gated por LICITA_ADMIN_TOKEN) =====
    if (rota === "/api/admin/clientes") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      const perfis = await lerPerfis();
      // Custo de IA agregado por cliente (perfilToken).
      let custoPorCliente = {};
      try { custoPorCliente = (await resumoCustos())?.porCliente || {}; } catch {}
      const clientes = perfis.map((p) => {
        garantirUsuarios(p); // so em memoria, para contar a equipe
        const st = statusAtual(p);
        const custo = custoPorCliente[p.token] || { brl: 0, brlMes: 0, chamadas: 0 };
        return {
          token: p.token, nome: p.nome, razaoSocial: p.razaoSocial ?? null, email: p.email ?? null,
          cnpj: p.cnpj ?? null, criadoEm: p.assinatura?.criadoEm ?? null,
          ramo: (p.filtro?.termos ?? []).join(", "), uf: (p.ufs ?? [])[0] ?? null,
          status: st.status, diasRestantes: st.diasRestantes, formaPagamento: st.formaPagamento ?? null,
          nivel: p.assinatura?.nivel ?? null, planoNome: planoDe(p).nome,
          uso: usoDe(p), equipe: { usados: p.usuarios.length, assentos: p.assentos || 1 },
          custoIA: { total: custo.brl, mes: custo.brlMes, chamadas: custo.chamadas },
          resumos: resumosDe(p),
          // Regua de e-mails: quantos do onboarding (3) e do win-back (3) ja sairam.
          regua: {
            onboard: [p._onboardEmail1Em, p._onboardEmail2Em, p._onboardEmail3Em].filter(Boolean).length,
            winback: [p._winbackEmail1Em, p._winbackEmail2Em, p._winbackEmail3Em].filter(Boolean).length,
            boasVindas: Boolean(p._boasVindasEm),
          },
        };
      });
      const resumo = {
        total: clientes.length,
        ativos: clientes.filter((c) => c.status === "ativo").length,
        teste: clientes.filter((c) => c.status === "teste").length,
        atrasados: clientes.filter((c) => c.status === "atrasado").length,
        vencidos: clientes.filter((c) => ["vencido", "teste_expirado"].includes(c.status)).length,
      };
      return json(res, 200, { clientes, resumo });
    }
    if (rota === "/api/admin/stats") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      let leads = []; try { leads = await carregarLeads(); } catch {}
      let feedbacks = []; try { feedbacks = await carregarFeedbacks(); } catch {}
      // Mais recentes primeiro; nao-lidos sempre no topo.
      feedbacks.sort((a, b) => (a.lido === b.lido ? (b.em || "").localeCompare(a.em || "") : a.lido ? 1 : -1));
      return json(res, 200, { editais: estatisticas(), contratos: estatisticasContratos(), leads, feedbacks });
    }
    // Admin: marca um feedback como lido/nao-lido.
    if (rota === "/api/admin/feedback-lido" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      const it = await alternarFeedbackLido(corpo.id || "");
      return it ? json(res, 200, { ok: true, lido: it.lido }) : json(res, 404, { erro: "Nao encontrado" });
    }
    // Admin: estado dos recados (geral + individuais ativos) pra montar o painel.
    if (rota === "/api/admin/recado" && req.method === "GET") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      return json(res, 200, await estadoRecados());
    }
    // Admin: publica ("salvar") ou tira do ar ("limpar") um recado. destino =
    // "todos" (geral) ou o token de um cliente especifico.
    if (rota === "/api/admin/recado" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        if (corpo.acao === "limpar") return json(res, 200, { ok: true, ...(await limparRecado({ destino: corpo.destino })) });
        const r = await salvarRecado({ titulo: corpo.titulo, texto: corpo.texto, destino: corpo.destino });
        return json(res, 200, { ok: true, recado: r });
      } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    // Admin: dispara o digest do dia manualmente (para testar sem esperar 8h).
    if (rota === "/api/admin/digest" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const { enviarDigestDoDia } = await import("../src/digestDiario.mjs");
        const r = await enviarDigestDoDia({});
        return json(res, 200, { ok: true, ...r });
      } catch (e) { return json(res, 500, { erro: e.message }); }
    }
    if (rota === "/api/admin/ativar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const p = await ativarPlano(corpo.token, corpo.nivel || "basico", Number(corpo.dias) || 30);
        return json(res, 200, { ok: true, status: statusAtual(p) });
      } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    if (rota === "/api/admin/avulso" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      const uso = await adicionarAvulsas(corpo.token, Number(corpo.qtd) || 0);
      return json(res, uso ? 200 : 404, uso ? { ok: true, uso } : { erro: "Conta nao encontrada" });
    }
    if (rota === "/api/admin/assentos" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      try {
        const r = await definirAssentos(corpo.token, Number(corpo.n) || 1);
        return json(res, 200, { ok: true, ...r });
      } catch (e) { return json(res, 400, { erro: e.message }); }
    }

    // Admin: congela (suspende) ou reativa o acesso de um cliente. Reversivel.
    if (rota === "/api/admin/suspender" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      const perfis = await lerPerfis();
      const p = perfis.find((x) => x.token === corpo.token);
      if (!p) return json(res, 404, { erro: "Conta nao encontrada" });
      const congelar = corpo.congelar !== false; // default: congela
      if (congelar) {
        p._suspensoEm = new Date().toISOString();
        p.assinatura = { ...(p.assinatura || {}), status: "inativo" };
      } else {
        delete p._suspensoEm;
        // Reativa como teste pra o admin reativar o plano em seguida se quiser.
        p.assinatura = { ...(p.assinatura || {}), status: "teste" };
      }
      await salvarPerfis(perfis);
      return json(res, 200, { ok: true, suspenso: congelar });
    }

    // Admin: exclui (arquiva) um cliente. Soft-delete: marca como excluido e
    // tira do acesso, mas preserva os dados num arquivo separado por seguranca,
    // em vez de apagar de vez (recuperavel se for engano).
    if (rota === "/api/admin/excluir" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if ((corpo.c || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      if (!corpo.token) return json(res, 400, { erro: "Token obrigatorio" });
      const perfis = await lerPerfis();
      const idx = perfis.findIndex((x) => x.token === corpo.token);
      if (idx < 0) return json(res, 404, { erro: "Conta nao encontrada" });
      const [removido] = perfis.splice(idx, 1);
      removido._excluidoEm = new Date().toISOString();
      await salvarPerfis(perfis);
      // Arquiva o perfil removido (recuperavel) no diretorio de dados.
      try {
        const arq = resolve(process.env.LICITA_DATA_DIR || resolve(AQUI, "..", "data"), "perfis-excluidos.jsonl");
        await import("node:fs/promises").then(({ appendFile }) => appendFile(arq, JSON.stringify(removido) + "\n", "utf8"));
      } catch { /* arquivamento best-effort */ }
      return json(res, 200, { ok: true, excluido: removido.nome || removido.token });
    }

    // Catalogo de planos e pacotes avulsos (para a pagina de assinar).
    if (rota === "/api/planos") {
      return json(res, 200, {
        // precoAnual = total do ciclo anual (numero); a UI mostra o /mes equivalente.
        planos: Object.values(PLANOS).map((p) => ({ ...p, precoAnual: precoAnualNum(p) })),
        avulsos: Object.values(AVULSOS),
        mesesAnual: MESES_ANUAL, // p.ex. 10 = "2 meses gratis"
        automatico: asaasConfigurado(),
        cobranca: { pix: cobranca.pix, contato: cobranca.contato },
      });
    }

    // Checkout: cria a cobranca no gateway e devolve a URL de pagamento.
    if (rota === "/api/checkout" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      if (!asaasConfigurado()) {
        // Sem gateway: cai no Pix concierge (a pagina mostra a chave/contato).
        return json(res, 200, { automatico: false, cobranca: { pix: cobranca.pix, contato: cobranca.contato } });
      }
      try {
        const clienteId = await obterOuCriarCliente({
          nome: perfil.razaoSocial || perfil.nome, email: perfil.email, cnpj: perfil.cnpj, clienteId: perfil.asaasClienteId,
        });
        if (clienteId && clienteId !== perfil.asaasClienteId) {
          const perfis = await lerPerfis();
          const p = perfis.find((x) => x.token === perfil.token);
          if (p) { p.asaasClienteId = clienteId; await salvarPerfis(perfis); }
        }
        // URL de retorno: o Asaas redireciona o cliente pra ca apos confirmar o
        // pagamento (passa por uma pagina /obrigado que mostra status + link painel).
        const BASE_URL = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
        const successUrl = `${BASE_URL}/obrigado?c=${perfil.token}`;
        let r;
        if (corpo.tipo === "avulso") {
          const a = AVULSOS[corpo.id];
          if (!a) return json(res, 400, { erro: "Pacote invalido" });
          r = await criarCobrancaAvulsa({ clienteId, valor: precoNumero(a.preco), descricao: `ContrataX: ${a.nome}`, externalReference: `avulso:${perfil.token}:${a.id}`, successUrl });
        } else {
          const pl = PLANOS[corpo.id];
          if (!pl) return json(res, 400, { erro: "Plano invalido" });
          // Ciclo: "anual" (paga MESES_ANUAL adiantado, 1 cobranca/ano) ou mensal.
          const anual = corpo.ciclo === "anual";
          const valor = anual ? precoAnualNum(pl) : precoNumero(pl.preco);
          const refSub = anual ? `sub:${perfil.token}:${pl.id}:anual` : `sub:${perfil.token}:${pl.id}`;
          r = await criarAssinatura({ clienteId, valor, descricao: `ContrataX: Plano ${pl.nome}${anual ? " (anual)" : ""}`, externalReference: refSub, successUrl, ciclo: anual ? "anual" : "mensal" });
          // Salva o subscriptionId no perfil pra permitir cancelamento self-service.
          if (r.subscriptionId) {
            const perfis2 = await lerPerfis();
            const p2 = perfis2.find((x) => x.token === perfil.token);
            if (p2) { p2.asaasSubscriptionId = r.subscriptionId; await salvarPerfis(perfis2); }
          }
        }
        if (!r.invoiceUrl) return json(res, 502, { erro: "Gateway nao devolveu a URL de pagamento" });
        return json(res, 200, { automatico: true, url: r.invoiceUrl });
      } catch (e) {
        return json(res, 502, { erro: mensagemPagamento(e) });
      }
    }

    // Webhook do Asaas: ativa a conta automaticamente quando o pagamento confirma.
    if (rota === "/api/webhook/asaas" && req.method === "POST") {
      const segredo = process.env.ASAAS_WEBHOOK_TOKEN;
      // FALHA FECHADA: sem segredo configurado, REJEITA (antes aceitava qualquer
      // requisicao, permitindo forjar PAYMENT_CONFIRMED e ativar plano de graca).
      // Configure ASAAS_WEBHOOK_TOKEN no Railway com o mesmo valor do painel Asaas.
      if (!segredo) {
        console.error("[webhook asaas] ASAAS_WEBHOOK_TOKEN nao configurado: rejeitando webhook por seguranca. Defina a variavel no Railway (mesmo valor do Asaas).");
        return json(res, 503, { erro: "webhook nao configurado" });
      }
      if (req.headers["asaas-access-token"] !== segredo) {
        return json(res, 401, { erro: "token invalido" });
      }
      const corpo = await lerCorpo(req);
      const evento = corpo.event;
      const pg = corpo.payment || {};
      try {
        if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
          let ref = pg.externalReference;
          if (!ref && pg.subscription) ref = await externalReferenceDaAssinatura(pg.subscription);
          const [tipo, token, id, ciclo] = String(ref || "").split(":");
          if (tipo === "sub" && token) {
            const nivel = PLANOS[id] ? id : "basico";
            // Anual estende 365 dias (a proxima cobranca do Asaas so vem em 1 ano).
            const anual = ciclo === "anual";
            await ativarPlano(token, nivel, anual ? 365 : 30, pg.billingType || null, anual ? "anual" : "mensal");
            // Conversion API GA4 (server-side): registra purchase pra remarketing
            // e medicao precisa de ROAS no Google Ads.
            try {
              const perfil = await perfilPorToken(token);
              if (perfil) {
                await enviarConversao(perfil, {
                  transactionId: pg.id || ref,
                  value: pg.value || precoNumero(PLANOS[nivel]?.preco || "0"),
                  planoId: nivel,
                  planoNome: PLANOS[nivel]?.nome || nivel,
                  formaPagamento: pg.billingType || null,
                });
              }
            } catch (e) { console.error("[ga4]", e.message); }
          } else if (tipo === "upgrade" && token) {
            // Upgrade pro-rata pago. Sobe nivel imediatamente e atualiza o valor
            // da assinatura recorrente no Asaas pras proximas cobrancas.
            const novoNivel = PLANOS[id] ? id : null;
            if (novoNivel) {
              await aplicarUpgrade(token, novoNivel);
              try {
                const perfilU = await perfilPorToken(token);
                // Inclui assentos extras pagos no novo valor recorrente, pra um
                // upgrade nao zerar a cobranca dos acessos adicionais.
                const novoValor = valorMensalRecorrente(perfilU);
                if (perfilU?.asaasSubscriptionId) {
                  await atualizarValorAssinatura(
                    perfilU.asaasSubscriptionId,
                    novoValor,
                    `ContrataX: Plano ${PLANOS[novoNivel].nome}`,
                    // Atualiza a referencia pro nivel novo, senao a renovacao
                    // reativaria o nivel antigo (bug latente do upgrade).
                    `sub:${token}:${novoNivel}`,
                  );
                }
                await enviarConversao(perfilU, {
                  transactionId: pg.id || ref,
                  value: pg.value || 0,
                  planoId: "upgrade-" + novoNivel,
                  planoNome: "Upgrade " + (PLANOS[novoNivel].nome || novoNivel),
                  formaPagamento: pg.billingType || null,
                });
              } catch (e) { console.error("[upgrade]", e.message); }
            }
          } else if (tipo === "avulso" && token) {
            const qtd = AVULSOS[id]?.analises || 0;
            if (qtd) await adicionarAvulsas(token, qtd);
            // Conversion para avulso tambem
            try {
              const perfil = await perfilPorToken(token);
              if (perfil) {
                await enviarConversao(perfil, {
                  transactionId: pg.id || ref,
                  value: pg.value || precoNumero(AVULSOS[id]?.preco || "0"),
                  planoId: "avulso-" + id,
                  planoNome: AVULSOS[id]?.nome || id,
                  formaPagamento: pg.billingType || null,
                });
              }
            } catch (e) { console.error("[ga4]", e.message); }
          } else if (tipo === "assentos" && token) {
            // Compra de acessos extras paga: libera os assentos na hora e sobe o
            // valor da assinatura recorrente (base do plano + assentos pagos).
            const n = Math.max(1, Math.min(50, Number(id) || 1));
            const perfilA = await aplicarAssentos(token, n);
            try {
              if (perfilA?.asaasSubscriptionId) {
                await atualizarValorAssinatura(
                  perfilA.asaasSubscriptionId,
                  valorMensalRecorrente(perfilA),
                  `ContrataX: Plano ${planoDe(perfilA).nome} + ${perfilA.assentosPagos} acesso(s) extra(s)`,
                );
              } else {
                console.warn(`[assentos] ${token}: sem asaasSubscriptionId; assentos liberados mas recorrencia nao atualizada.`);
              }
              await enviarConversao(perfilA, {
                transactionId: pg.id || ref,
                value: pg.value || 0,
                planoId: "assentos-" + n,
                planoNome: `${n} acesso(s) extra(s)`,
                formaPagamento: pg.billingType || null,
              });
            } catch (e) { console.error("[assentos]", e.message); }
          }
        } else if (evento === "PAYMENT_OVERDUE") {
          // Cobranca vencida: avisa o cliente com link pra atualizar o pagamento.
          // Acesso continua na carencia (LICITA_GRACA_DIAS) ate ser cortado.
          let ref = pg.externalReference;
          if (!ref && pg.subscription) ref = await externalReferenceDaAssinatura(pg.subscription);
          const [tipo, token] = String(ref || "").split(":");
          if (token) {
            try {
              const perfil = await perfilPorToken(token);
              const { temEmailKey, enviar } = await import("../src/email.mjs");
              if (perfil?.email && temEmailKey()) {
                const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
                const valor = (Number(pg.value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const linkPg = pg.invoiceUrl || `${BASE}/assinar?c=${perfil.token}`;
                await enviar({
                  para: perfil.email,
                  assunto: "Sua mensalidade do ContrataX ainda nao foi paga",
                  html: `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#fef3c7;padding:20px 26px;border-bottom:1px solid #fde68a">
<div style="font-size:13px;color:#92400e;font-weight:700;letter-spacing:.5px">PAGAMENTO PENDENTE</div>
<div style="font-size:18px;color:#78350f;font-weight:800;margin-top:4px">A renovacao do seu plano nao foi processada</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#0f172a;font-size:15px;line-height:1.6">
<p>Ola, ${perfil.nome || "cliente"}.</p>
<p>A cobranca de <b>${valor}</b> referente a sua mensalidade do ContrataX nao foi confirmada no vencimento. Pode ter sido cartao recusado, saldo insuficiente ou problema temporario.</p>
<p><b>O que acontece agora:</b> seu painel continua funcionando por mais alguns dias (carencia). Depois disso, o acesso e pausado ate o pagamento ser confirmado.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:20px 0"><tr><td align="center">
<a href="${linkPg}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:11px">Pagar agora</a>
</td></tr></table>
<p style="font-size:13.5px;color:#64748b">Se ja pagou nas ultimas horas, ignore este e-mail, a confirmacao pode levar alguns minutos.</p>
<p style="font-size:13.5px;color:#64748b">Duvidas? Responda este e-mail ou escreva para <a href="mailto:contato@contratax.com.br" style="color:#4338ca">contato@contratax.com.br</a>.</p>
</td></tr>
<tr><td style="background:#f8fafc;padding:16px 26px;text-align:center;border-top:1px solid #e2e8f0">
<div style="color:#64748b;font-size:12.5px">ContrataX, monitor de licitacoes publicas</div>
</td></tr></table></td></tr></table></body></html>`,
                });
              }
            } catch (e) { console.error("[email overdue]", e.message); }
          }
        } else if (evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_CHARGEBACK_REQUESTED") {
          // Estorno/chargeback: REVOGA o acesso automaticamente (antes so avisava
          // o Jacques, deixando o vetor de abuso: pagar -> ativar -> estornar ->
          // manter acesso). Se for chargeback contestado e vencido depois, o
          // Jacques reativa manual no admin.
          let ref = pg.externalReference;
          if (!ref && pg.subscription) ref = await externalReferenceDaAssinatura(pg.subscription);
          const [tipo, tokenR] = String(ref || "").split(":");
          if (tipo === "sub" && tokenR) {
            try {
              const { atualizarPerfil } = await import("../src/perfis.mjs");
              await atualizarPerfil(tokenR, (p) => {
                p.assinatura = { ...(p.assinatura || {}), status: "inativo", revogadoEm: new Date().toISOString(), revogadoMotivo: evento };
              });
            } catch (e) { console.error("[webhook revogar]", e.message); }
          }
          try {
            const { temEmailKey, enviar } = await import("../src/email.mjs");
            if (temEmailKey()) {
              await enviar({
                para: process.env.LICITA_CONTATO || "contato@contratax.com.br",
                assunto: `[ContrataX] ${evento} (acesso revogado): ${pg.id}`,
                html: `<p>Evento Asaas: <b>${evento}</b>. Acesso do cliente foi <b>revogado automaticamente</b>.</p><pre>${JSON.stringify(pg, null, 2).slice(0, 1500)}</pre>`,
              });
            }
          } catch {}
        }
      } catch (e) {
        console.error("[webhook asaas]", e.message);
      }
      return json(res, 200, { ok: true }); // sempre 200 para o Asaas nao re-tentar em loop
    }

    // Pre-visualizacao do upgrade: quanto custa hoje pra subir de plano.
    // GET /api/conta/upgrade-preview?c=token&novo=pro
    if (rota === "/api/conta/upgrade-preview" && req.method === "GET") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      const novoId = url.searchParams.get("novo");
      const novo = PLANOS[novoId];
      if (!novo) return json(res, 400, { erro: "Plano invalido" });
      const atualId = perfil.assinatura?.nivel || "starter";
      const atual = PLANOS[atualId] || PLANOS.starter;
      const calc = calcularProRata(perfil, atual, novo);
      return json(res, 200, {
        planoAtual: { id: atualId, nome: atual.nome, preco: atual.preco },
        planoNovo: { id: novoId, nome: novo.nome, preco: novo.preco },
        ...calc,
      });
    }

    // Upgrade self-service: cria cobranca avulsa com a diferenca pro-rata e
    // devolve o link de pagamento. Webhook PAYMENT_RECEIVED com externalReference
    // "upgrade:token:nivel" aplica a subida de nivel e atualiza o valor da
    // assinatura recorrente no Asaas.
    if (rota === "/api/conta/upgrade" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      if (!asaasConfigurado()) return json(res, 400, { erro: "Gateway nao configurado" });
      const novo = PLANOS[corpo.novo];
      if (!novo) return json(res, 400, { erro: "Plano invalido" });
      // Assinante ANUAL: o upgrade self-service (pro-rata mensal + atualizar valor
      // recorrente) assume ciclo mensal e cobraria errado numa assinatura YEARLY.
      // Ate ter pro-rata anual, encaminha pro suporte em vez de cobrar torto.
      if (perfil.assinatura?.plano === "anual") {
        return json(res, 400, { erro: `Você está no plano anual. Pra trocar de plano, fale com a gente em ${cobranca.contato} que ajustamos sem você pagar em dobro.`, anual: true });
      }
      const atualId = perfil.assinatura?.nivel || "starter";
      const atual = PLANOS[atualId] || PLANOS.starter;
      const calc = calcularProRata(perfil, atual, novo);
      if (!calc.permitido) return json(res, 400, { erro: "Upgrade nao aplicavel (downgrade ou mesmo plano)" });
      try {
        const clienteId = await clienteAsaasDoPerfil(perfil);
        const BASE_URL = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
        const successUrl = `${BASE_URL}/obrigado?c=${perfil.token}`;
        const r = await criarCobrancaAvulsa({
          clienteId,
          valor: calc.valor,
          descricao: `ContrataX: ${calc.descricao}`,
          externalReference: `upgrade:${perfil.token}:${corpo.novo}`,
          successUrl,
        });
        if (!r.invoiceUrl) return json(res, 502, { erro: "Gateway nao devolveu URL de pagamento" });
        return json(res, 200, { url: r.invoiceUrl, valor: calc.valor, diasRestantes: calc.diasRestantes });
      } catch (e) {
        return json(res, 502, { erro: mensagemPagamento(e) });
      }
    }

    // Downgrade self-service (usado na retencao no cancelamento): baixa pra um
    // plano mais barato da mesma familia. Sem cobranca (o cliente ja pagou o
    // ciclo); so ajusta o valor + referencia recorrente no Asaas pras proximas.
    if (rota === "/api/conta/downgrade" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      // Anual: mesmo problema do upgrade (pro-rata/ciclo). Encaminha pro suporte.
      if (perfil.assinatura?.plano === "anual") {
        return json(res, 400, { erro: `Você está no plano anual. Pra mudar de plano, fale com a gente em ${cobranca.contato}.` });
      }
      const novo = PLANOS[corpo.novo];
      if (!novo) return json(res, 400, { erro: "Plano invalido" });
      const atualId = perfil.assinatura?.nivel || "starter";
      const atual = PLANOS[atualId] || PLANOS.starter;
      // So permite descer dentro da MESMA familia (empresa ou assessoria) e pra
      // um preco MENOR (senao e upgrade, que tem rota propria com cobranca).
      if (Boolean(novo.assessoria) !== Boolean(atual.assessoria) || precoNumero(novo.preco) >= precoNumero(atual.preco)) {
        return json(res, 400, { erro: "Escolha um plano mais barato da mesma familia." });
      }
      try {
        const perfilD = await aplicarDowngrade(perfil.token, corpo.novo);
        // Proximas cobrancas no preco menor + referencia do nivel novo (senao a
        // renovacao reativaria o nivel antigo).
        if (perfilD.asaasSubscriptionId) {
          await atualizarValorAssinatura(
            perfilD.asaasSubscriptionId,
            valorMensalRecorrente(perfilD),
            `ContrataX: Plano ${novo.nome}`,
            `sub:${perfil.token}:${corpo.novo}`,
          );
        }
        return json(res, 200, { ok: true, nivel: corpo.novo, mensagem: `Pronto, você agora está no plano ${novo.nome} (R$ ${novo.preco}/mês). As próximas cobranças já vêm nesse valor. Seu acesso continua sem interrupção.` });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // Pre-visualizacao da compra de assentos extras (R$ por mes cada).
    // GET /api/equipe/assentos-preview?c=token&qtd=N
    if (rota === "/api/equipe/assentos-preview" && req.method === "GET") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      const qtd = Number(url.searchParams.get("qtd") || 1);
      const calc = calcularProRataAssentos(perfil, qtd);
      return json(res, 200, { ...calc, automatico: asaasConfigurado() });
    }

    // Compra self-service de assentos extras: cobra a diferenca pro-rata do ciclo
    // atual e devolve o link de pagamento. O webhook PAYMENT_RECEIVED com
    // externalReference "assentos:token:N" libera os acessos na hora e sobe o
    // valor da assinatura recorrente no Asaas pras proximas cobrancas.
    if (rota === "/api/equipe/comprar-assentos" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      // So o admin da conta pode comprar acessos.
      if (ehAssessoria(perfil)) return json(res, 400, { erro: "Planos Assessoria gerenciam empresas, nao assentos. Fale com o suporte." });
      if (!asaasConfigurado()) return json(res, 400, { erro: "Pagamento automatico indisponivel no momento. Fale com o suporte.", contato: cobranca.contato });
      const calc = calcularProRataAssentos(perfil, corpo.qtd);
      try {
        const clienteId = await clienteAsaasDoPerfil(perfil);
        const BASE_URL = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";
        const successUrl = `${BASE_URL}/obrigado?c=${perfil.token}`;
        const r = await criarCobrancaAvulsa({
          clienteId,
          valor: calc.valor,
          descricao: `ContrataX: ${calc.qtd} acesso(s) extra(s)`,
          externalReference: `assentos:${perfil.token}:${calc.qtd}`,
          successUrl,
        });
        if (!r.invoiceUrl) return json(res, 502, { erro: "Gateway nao devolveu URL de pagamento" });
        return json(res, 200, { url: r.invoiceUrl, valor: calc.valor, qtd: calc.qtd, mensalNovo: calc.mensalNovo });
      } catch (e) {
        return json(res, 502, { erro: mensagemPagamento(e) });
      }
    }

    // Batch: dado uma lista de IDs de editais (separados por virgula), devolve
    // quais ja tem analise completa no cache global. Permite a UI mostrar badge
    // "Ja analisado" em cada card e o cliente nao re-analisar (e nao gastar cota).
    if (rota === "/api/editais-analisados" && req.method === "GET") {
      const idsParam = url.searchParams.get("ids") || "";
      const ids = idsParam.split(",").filter(Boolean).slice(0, 200); // hard cap
      const analisados = [];
      for (const id of ids) {
        try {
          const c = await carregarAnalise(id);
          if (c) analisados.push(id);
        } catch {}
      }
      return json(res, 200, { analisados });
    }

    // LGPD art. 18: direito de portabilidade. Devolve TODOS os dados do
    // cliente em formato estruturado (JSON ou CSV) para download.
    if (rota === "/api/conta/meus-dados") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      const formato = (url.searchParams.get("formato") || "json").toLowerCase();
      // Monta o pacote sanitizado (sem senha hash, sem token secreto).
      const dados = {
        empresa: {
          nome: perfil.nome,
          razaoSocial: perfil.razaoSocial,
          cnpj: perfil.cnpj,
          email: perfil.email,
          endereco: perfil.endereco,
          representante: perfil.representante,
        },
        configuracao: {
          ramo: perfil.filtro?.termos || [],
          excluir: perfil.filtro?.termosExcluir || [],
          estados: perfil.ufs || [],
          modalidades: perfil.modalidades || [],
        },
        assinatura: {
          status: perfil.assinatura?.status,
          nivel: perfil.assinatura?.nivel,
          plano: perfil.assinatura?.plano,
          formaPagamento: perfil.assinatura?.formaPagamento,
          criadoEm: perfil.assinatura?.criadoEm,
          ativadoEm: perfil.assinatura?.ativadoEm,
          expiraEm: perfil.assinatura?.expiraEm,
          canceladoEm: perfil.assinatura?.canceladoEm,
        },
        consentimento: {
          termosVersao: perfil.aceiteTermos?.versao,
          aceiteEm: perfil.aceiteTermos?.em,
          ipAceite: perfil.aceiteTermos?.ip,
        },
        equipe: (perfil.usuarios || []).map((u) => ({
          nome: u.nome, email: u.email, papel: u.papel, criadoEm: u.criadoEm,
        })),
        uso: {
          analisesEsteMes: perfil.analises,
          extracoesPdf: perfil.extracoesPdf,
          avulsasCompradas: perfil._avulsasHist || [],
        },
        documentos: perfil.empresa?.certidoes || {},
        contratos: perfil.contratos || [],
        recebiveis: perfil.recebiveis || [],
      };
      if (formato === "csv") {
        // CSV flat das principais tabelas (empresa + configuracao + contratos)
        const linhas = [];
        linhas.push("# ContrataX - Meus Dados (export LGPD art. 18)");
        linhas.push(`# Gerado em: ${new Date().toISOString()}`);
        linhas.push("");
        linhas.push("Categoria,Campo,Valor");
        const flatten = (obj, prefixo = "") => {
          for (const [k, v] of Object.entries(obj || {})) {
            const chave = prefixo ? `${prefixo}.${k}` : k;
            if (v === null || v === undefined) continue;
            if (typeof v === "object" && !Array.isArray(v)) flatten(v, chave);
            else linhas.push(`"${chave.split(".")[0]}","${chave}","${String(Array.isArray(v) ? v.join("; ") : v).replace(/"/g, '""')}"`);
          }
        };
        flatten(dados);
        const csv = linhas.join("\n");
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="contratax-meus-dados-${perfil.cnpj || perfil.token}.csv"`,
        });
        return res.end(csv);
      }
      // Default JSON
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="contratax-meus-dados-${perfil.cnpj || perfil.token}.json"`,
      });
      return res.end(JSON.stringify(dados, null, 2));
    }

    // Cancelamento self-service: para a renovacao no Asaas e marca o perfil.
    // O acesso continua valido ate o fim do periodo ja pago.
    if (rota === "/api/conta/cancelar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const perfil = await perfilPorToken(corpo.c || url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      try {
        let asaasOk = true, asaasErro = null;
        if (perfil.asaasSubscriptionId) {
          const r = await cancelarAssinaturaAsaas(perfil.asaasSubscriptionId);
          asaasOk = r.ok; asaasErro = r.erro || null;
        }
        await cancelarPorToken(perfil.token, corpo.motivo || "");
        // Avisa o Jacques por email (opcional, se Resend configurado).
        try {
          const { temEmailKey, enviar } = await import("../src/email.mjs");
          if (temEmailKey()) {
            await enviar({
              para: process.env.LICITA_CONTATO || "contato@contratax.com.br",
              assunto: `[ContrataX] Cancelamento: ${perfil.nome || perfil.email}`,
              html: `<p>Cliente <b>${perfil.nome || perfil.email}</b> (CNPJ ${perfil.cnpj || "?"}, token ${perfil.token}) cancelou a assinatura.</p>
                     <p>Motivo informado: <i>${(corpo.motivo || "(nao informado)").slice(0, 240)}</i></p>
                     <p>Asaas: ${asaasOk ? "renovacao parada" : "falha ao cancelar (" + asaasErro + ")"}</p>`,
            });
          }
        } catch {}
        const venc = perfil.assinatura?.expiraEm || null;
        return json(res, 200, {
          ok: true,
          acessoAteFimDoCiclo: venc,
          renovacaoParada: asaasOk,
          mensagem: venc
            ? `Cancelamento registrado. Seu acesso continua ate ${new Date(venc).toLocaleDateString("pt-BR")}.`
            : "Cancelamento registrado.",
        });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // Equipe: lista os acessos da empresa (membros, assentos usados/total).
    if (rota === "/api/equipe" && req.method === "GET") {
      const dados = await listarMembros(url.searchParams.get("c") || "");
      if (!dados) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, dados);
    }
    // Equipe: convidar um novo acesso (respeita o limite de assentos do plano).
    if (rota === "/api/equipe/convidar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      try {
        const membro = await convidarMembro(url.searchParams.get("c") || "", corpo);
        return json(res, 200, { ok: true, membro });
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }
    // Equipe: remover um acesso (nao remove o admin).
    if (rota === "/api/equipe/remover" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      try {
        await removerMembro(url.searchParams.get("c") || "", corpo.id);
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }

    // Preview do e-mail diario de um cliente (pelo token).
    if (rota === "/digest") {
      const token = url.searchParams.get("c") || "";
      const perfil = await perfilPorToken(token);
      if (!perfil) { res.writeHead(404); return res.end("Perfil nao encontrado"); }
      const todos = await carregarResultados();
      const editais = [...(todos[perfil.id]?.editais ?? [])]
        .sort((a, b) => (a.encerramento || "").localeCompare(b.encerramento || ""))
        .slice(0, 6);
      const { html } = gerarDigest(perfil, editais);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }

    // Detalhe de um edital + analise/conferencia em cache (se houver).
    if (rota === "/api/edital") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      const token = url.searchParams.get("c") || "";
      const perfil = token ? await perfilPorToken(token) : null;
      const empresa = perfil ? empresaDoPerfil(perfil) : await empresaAtual();
      const temDocumentos = Boolean(perfil?.empresa && Object.keys(perfil.empresa.certidoes || {}).length);
      const analiseCache = await carregarAnalise(id);
      const confCache = await carregarConferencia(id, empresa.id);
      const impugCache = await carregarImpugnacao(id);
      const tldrCache = await carregarTldr(id);
      // Ranking de concorrentes localizado NO EDITAL aberto (cidade/UF do edital),
      // no ramo do cliente. Assim o ranking muda conforme a regiao da licitacao.
      // Usa a UF do edital (mais relevante) ou a primeira UF do perfil como fallback.
      const perfilUf = (perfil?.ufs ?? [])[0] ?? null;
      const preco = perfil
        ? precoVencedores({
            termos: perfil.filtro?.termos ?? [],
            uf: edital.uf ?? perfilUf,
            municipio: edital.municipio ?? null,
            orgao: edital.orgao ?? null,
            orgaoCnpj: edital.orgaoCnpj ?? null,
          })
        : null;
      const liberacao = token === ADMIN ? { ok: true } : (perfil ? checarAnalise(perfil) : { ok: false, motivo: "assinatura" });
      // Preco de referencia: faixa de valores de contratos similares (UF ou nacional).
      // Quando ha perfil, usa os termos do ramo (mais precisos).
      const referencia = precoReferencia(edital, { termosPerfil: perfil?.filtro?.termos ?? [] });
      const reputacao = await reputacaoDoOrgao({
        cnpj: edital.orgaoCnpj,
        nome: edital.orgao,
        uf: edital.uf,
        municipio: edital.municipio,
      });
      const nota = perfil ? await carregarNota(perfil.token, id) : null;
      return json(res, 200, {
        edital,
        nota: nota?.texto ?? "",
        analise: analiseCache?.analise ?? null,
        conferencia: confCache?.dados ?? null,
        impugnacao: impugCache?.dados ?? null,
        saude: saudeDocumental(empresa),
        temDocumentos,
        preco,
        referencia,
        reputacao,
        tldr: tldrCache?.tldr ?? null,
        uso: perfil ? usoDe(perfil) : null,
        ia: { liberada: liberacao.ok, motivo: liberacao.motivo ?? null }, // recurso do plano pago
        temChave: temChave(),
      });
    }

    // Lista os documentos de um edital (para o cliente escolher o que baixar).
    if (rota === "/api/edital-arquivos") {
      const edital = buscarPorId(url.searchParams.get("id"));
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      try {
        return json(res, 200, { documentos: await listarDocumentos(edital) });
      } catch (e) {
        return json(res, 200, { documentos: [], erro: e.message });
      }
    }

    // Itens da licitacao (o que esta sendo comprado). Lazy: so busca quando o
    // cliente clica "Ver itens" no drawer. Dado publico do PNCP, sem custo de IA.
    if (rota === "/api/edital-itens") {
      const edital = buscarPorId(url.searchParams.get("id"));
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      // Cabecalho do edital (pra pagina de itens montar o topo sem outra chamada).
      const cab = {
        id: edital.id, orgao: edital.orgao, municipio: edital.municipio, uf: edital.uf,
        objeto: edital.objeto, valorEstimado: edital.valorEstimado, modalidade: edital.modalidade,
        encerramento: edital.encerramento, link: edital.link,
      };
      try {
        return json(res, 200, { edital: cab, itens: await listarItens(edital) });
      } catch (e) {
        return json(res, 200, { edital: cab, itens: [], erro: e.message });
      }
    }

    // Planilha de proposta: os itens do edital em CSV pra empresa preencher o
    // preco e subir no portal. Dado publico do PNCP reformatado, sem custo de IA.
    if (rota === "/api/proposta-planilha") {
      const edital = buscarPorId(url.searchParams.get("id"));
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      try {
        const itens = await listarItens(edital);
        if (!itens.length) return json(res, 200, { erro: "Este edital nao trouxe itens estruturados no PNCP. Abra o edital pra ver a planilha original." });
        const csv = csvPropostaItens(
          { id: edital.id, orgao: edital.orgao, objeto: edital.objeto, encerramento: edital.encerramento },
          itens,
        );
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nomeArquivo("proposta")}"`,
          "Cache-Control": "no-store",
        });
        return res.end(csv);
      } catch (e) {
        return json(res, 200, { erro: e.message });
      }
    }

    // Carta de Proposta Comercial: documento (HTML pra PDF) com os dados da
    // empresa do cliente + o edital + a tabela de itens + as clausulas padrao.
    // Precisa de token pra personalizar com a empresa (razao/CNPJ).
    if (rota === "/api/proposta-carta") {
      const edital = buscarPorId(url.searchParams.get("id"));
      if (!edital) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Edital nao encontrado");
      const perfilP = await perfilPorToken(url.searchParams.get("c") || "");
      const empresa = perfilP ? {
        razao: perfilP.empresa?.razaoSocial || perfilP.razaoSocial || perfilP.nome,
        cnpj: perfilP.cnpj, email: perfilP.email, telefone: perfilP.telefone,
        cidade: perfilP.empresa?.cidade, uf: perfilP.empresa?.uf || (perfilP.ufs || [])[0],
      } : {};
      let itens = [];
      try { itens = await listarItens(edital); } catch { /* sem itens: a carta cita a planilha anexa */ }
      const html = cartaProposta({ empresa, edital, itens });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    // Kit de Habilitacao: todas as declaracoes + checklist de certidoes num PDF.
    // Precisa de token (usa os dados e as certidoes cadastradas da empresa).
    if (rota === "/api/kit-habilitacao") {
      const perfilK = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfilK) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Conta nao encontrada");
      const empresa = {
        ...empresaDoPerfil(perfilK),
        cnpj: perfilK.cnpj,
        razaoSocial: perfilK.empresa?.razaoSocial || perfilK.razaoSocial || perfilK.nome,
      };
      const html = kitHabilitacao(empresa);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    // Download de um documento do edital (pelo indice ?doc=).
    if (rota === "/api/edital-arquivo") {
      const edital = buscarPorId(url.searchParams.get("id"));
      if (!edital) { res.writeHead(404); return res.end("Edital nao encontrado"); }
      const indice = Number(url.searchParams.get("doc") || 0);
      try {
        const doc = await baixarArquivo(edital, indice);
        if (!doc) { res.writeHead(404); return res.end("Documento nao encontrado"); }
        const nome = (doc.nome || "documento").replace(/[^\w.\-]+/g, "_").slice(0, 90);
        const tipo = /\.pdf$/i.test(nome) ? "application/pdf" : "application/octet-stream";
        res.writeHead(200, { "Content-Type": tipo, "Content-Disposition": `attachment; filename="${nome}"` });
        return res.end(doc.buffer);
      } catch (e) {
        res.writeHead(502);
        return res.end("Falha ao baixar: " + e.message);
      }
    }

    // Baixar o EDITAL principal direto (1 clique, sem abrir o painel). Usa o
    // obterPdfs (acha o PDF do edital entre os arquivos do PNCP) e serve o maior.
    if (rota === "/api/baixar-edital") {
      const edital = buscarPorId(url.searchParams.get("id"));
      if (!edital) { res.writeHead(404); return res.end("Edital nao encontrado"); }
      try {
        const { obterPdfs } = await import("../src/documentos.mjs");
        const pdfs = await obterPdfs(edital);
        if (!pdfs.length) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("Este edital nao tem PDF disponivel no PNCP. Acesse pelo portal de origem.");
        }
        const nome = (pdfs[0].nome || "edital").replace(/[^\w.\-]+/g, "_").replace(/\.pdf$/i, "").slice(0, 80) + ".pdf";
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"` });
        return res.end(pdfs[0].buffer);
      } catch (e) {
        res.writeHead(502); return res.end("Falha ao baixar: " + e.message);
      }
    }

    // Calendario .ics: gera evento do encerramento do edital com lembretes
    // automaticos (3 dias e 1 hora antes). Aberto a qualquer um (sem token).
    if (rota === "/api/calendario") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      try {
        const ics = icsEdital(edital);
        res.writeHead(200, {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nomeIcs(edital)}"`,
          "Cache-Control": "no-store",
        });
        return res.end(ics);
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }

    // Chat assincrono na LP: pergunta livre, ContrataX.IA responde com base na
    // Central de Ajuda. Cacheada via prompt caching (Haiku 4.5). 15 perguntas/IP/24h.
    if (rota === "/api/chat-ajuda" && req.method === "POST") {
      const ip = ipDoRequest(req);
      const rl = tentarUsoVisitante(ip, "chat");
      if (!rl.ok) {
        return json(res, 200, {
          resposta: "Voce ja fez muitas perguntas hoje. Para continuar, escreva para contato@contratax.com.br ou abra /contato, respondemos em 1 dia util.",
          bloqueado: true,
        });
      }
      const body = await lerCorpo(req).catch(() => ({}));
      const pergunta = String(body.pergunta || "").trim().slice(0, 600);
      const historico = Array.isArray(body.historico) ? body.historico.slice(-6) : [];
      if (!pergunta) return json(res, 400, { erro: "Pergunta vazia" });
      try {
        const { responder } = await import("../src/chatAjuda.mjs");
        const r = await responder({ pergunta, historico });
        return json(res, 200, { resposta: r.resposta, restantes: rl.restantes });
      } catch (e) {
        console.error("[chat-ajuda] excecao", e?.message);
        return json(res, 200, {
          resposta: "Tive um problema agora. Manda sua duvida para contato@contratax.com.br que respondemos em 1 dia util.",
          erro: true,
        });
      }
    }

    // TL;DR do edital (resumo rapido): gera sob demanda se nao houver cache.
    // - Visitante anonimo: 3 grátis por IP/24h (gancho). Depois bloqueia com paywall.
    // - Cliente pagante: cada TL;DR novo (sem cache) consome 1 da cota.
    // - Cache global por edital protege custo medio.
    if (rota === "/api/tldr" && req.method === "POST") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      // Cache global: devolve direto sem custo (e sem consumir cota)
      const cache = await carregarTldr(id);
      if (cache) {
        // Mede ENGAJAMENTO: conta o resumo servido mesmo no cache hit (R$0),
        // senao o uso de IA do cliente fica invisivel no admin. Cache hit e o
        // caso mais comum (edital ja resumido por alguem). So registra se for
        // cliente logado (token != admin); escrita race-safe e barata.
        const ct = url.searchParams.get("c") || "";
        if (ct && ct !== ADMIN) await registrarResumo(ct);
        return json(res, 200, { tldr: cache.tldr, cache: true });
      }

      if (!temChave()) return json(res, 400, { erro: "Sem chave de leitura configurada" });

      const tokenT = url.searchParams.get("c") || "";
      const perfilT = await perfilPorToken(tokenT);
      // Caminho 1: cliente PAGANTE — TL;DR e gancho de ativacao, NAO consome
      // cota mensal (so a "Analisar este edital" completa, em /api/analisar,
      // consome). Cache global por edital protege a margem: segundo cliente do
      // mesmo edital nao gera nova chamada de IA. So edital INEDITO custa, e
      // custo de TL;DR (Haiku) e ~10x menor que analise completa (Sonnet).
      //
      // Trava anti-abuso: cap diario de TL;DRs com CACHE MISS por cliente.
      // Cache hit nao conta porque nao gera custo. Cap difere POR PLANO pra
      // garantir margem 60%+ pessimista em todos: Starter 8/dia, Basico 12,
      // Pro 18, Ass10 30, Ass25 50. Pode sobrescrever via env LICITA_TLDR_<PLANO>.
      if (perfilT && tokenT !== ADMIN) {
        if (!statusAtual(perfilT).temAcesso) {
          return json(res, 403, { erro: "Assinatura nao ativa", paywall: true });
        }
        const planoAtual = planoDe(perfilT);
        const TLDR_LIMITE_DIA = planoAtual.tldrLimiteDia || 30;
        // Contador diario de cache-miss por cliente
        const hoje = new Date().toISOString().slice(0, 10);
        const perfis = await lerPerfis();
        const p = perfis.find((x) => x.token === tokenT);
        if (!p._tldrUso || p._tldrUso.dia !== hoje) p._tldrUso = { dia: hoje, n: 0 };
        if (p._tldrUso.n >= TLDR_LIMITE_DIA) {
          return json(res, 429, {
            erro: "Limite diario de resumos rapidos atingido",
            mensagem: `Voce atingiu ${TLDR_LIMITE_DIA} resumos novos hoje (cota do plano ${planoAtual.nome}). O limite zera amanha. Editais ja lidos por voce ou outros clientes continuam aparecendo sem contar.`,
            paywall: false,
          });
        }
        try {
          const tldr = await gerarTldr(edital, { perfilToken: tokenT });
          await salvarTldr(id, tldr);
          p._tldrUso.n += 1;
          // Engajamento: conta o resumo novo no mesmo write do contador diario.
          if (!p._resumos) p._resumos = { n: 0, ultimo: null };
          p._resumos.n += 1;
          p._resumos.ultimo = new Date().toISOString();
          await salvarPerfis(perfis);
          return json(res, 200, { tldr, cache: false });
        } catch (e) {
          return json(res, 500, { erro: e.message });
        }
      }
      // Caminho 2: visitante ANONIMO — rate limit por IP (3/24h)
      const ip = ipDoRequest(req);
      const r = tentarUsoVisitante(ip, "tldr");
      if (!r.ok) {
        return json(res, 402, {
          erro: "Você usou seus testes grátis.",
          paywall: true,
          mensagem: `Visitantes têm direito a ${r.limite} análises rápidas grátis por dia. Cadastre-se grátis para ter mais.`,
        });
      }
      try {
        const tldr = await gerarTldr(edital);
        await salvarTldr(id, tldr);
        return json(res, 200, { tldr, cache: false, restantes: r.restantes });
      } catch (e) {
        return json(res, 500, { erro: e.message });
      }
    }

    // "Pergunte ao Edital": cliente pagante faz pergunta livre sobre o edital, a
    // IA responde com base no PDF. Fecha o gap competitivo (ConLicitacao/Licitei).
    // Cota: exige assinatura ativa + cap diario por plano (reusa tldrLimiteDia,
    // que ja garante margem). Cada pergunta envia o PDF (caro), entao o cap
    // protege custo; prompt caching barateia perguntas seguidas no mesmo edital.
    // Criar Radar com IA: texto livre -> filtros de busca estruturados.
    if (rota === "/api/radar-ia" && req.method === "POST") {
      if (!temChave()) return json(res, 400, { erro: "IA nao configurada" });
      const corpoR = await lerCorpo(req);
      const perfilR = await perfilPorToken(corpoR.c || "");
      if (!perfilR) return json(res, 403, { erro: "Faca login", paywall: true });
      try {
        const { radarIA } = await import("../src/radarIA.mjs");
        const filtros = await radarIA(corpoR.texto || "", { perfilToken: perfilR.token });
        return json(res, 200, { filtros });
      } catch (e) { return json(res, 500, { erro: e.message }); }
    }

    // ContrataX Juridico IA: chat de duvidas juridicas sobre licitacoes.
    if (rota === "/api/juridico" && req.method === "POST") {
      if (!temChave()) return json(res, 400, { erro: "IA juridica nao configurada" });
      const corpoJ = await lerCorpo(req);
      const perfilJ = await perfilPorToken(corpoJ.c || "");
      if (!perfilJ) return json(res, 403, { erro: "Faca login pra usar o Juridico IA", paywall: true });
      if (perfilJ.token !== ADMIN && !statusAtual(perfilJ).temAcesso) {
        return json(res, 403, { erro: "Assinatura nao ativa", paywall: true });
      }
      // Teto diario por cliente (controle de custo de IA).
      const CAP = Number(process.env.LICITA_JURIDICO_DIA || 25);
      const hoje = new Date().toISOString().slice(0, 10);
      let bloqueado = false;
      if (perfilJ.token !== ADMIN) {
        await atualizarPerfil(perfilJ.token, (p) => {
          if (!p._juridicoUso || p._juridicoUso.dia !== hoje) p._juridicoUso = { dia: hoje, n: 0 };
          if (p._juridicoUso.n >= CAP) { bloqueado = true; return; }
          p._juridicoUso.n += 1;
        });
      }
      if (bloqueado) return json(res, 429, { erro: `Você atingiu ${CAP} perguntas jurídicas hoje. O limite zera amanhã.` });
      try {
        const { juridicoIA } = await import("../src/juridicoIA.mjs");
        const r = await juridicoIA(corpoJ.historico || [], { perfilToken: perfilJ.token });
        return json(res, 200, r);
      } catch (e) { return json(res, 500, { erro: e.message }); }
    }

    if (rota === "/api/perguntar-edital" && req.method === "POST") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      if (!temChave()) return json(res, 400, { erro: "Leitura por IA nao configurada" });
      const corpoP = await lerCorpo(req);
      const pergunta = String(corpoP.pergunta || "").trim();
      if (pergunta.length < 3) return json(res, 400, { erro: "Escreva uma pergunta" });

      const tokenP = url.searchParams.get("c") || "";
      const perfilP = await perfilPorToken(tokenP);
      if (!perfilP) return json(res, 403, { erro: "Faca login para usar o Pergunte ao Edital", paywall: true });
      if (tokenP !== ADMIN) {
        if (!statusAtual(perfilP).temAcesso) {
          return json(res, 403, { erro: "O Pergunte ao Edital faz parte do plano. Assine para liberar.", paywall: true });
        }
        const planoP = planoDe(perfilP);
        const LIMITE = planoP.tldrLimiteDia || 30;
        const hojeP = new Date().toISOString().slice(0, 10);
        const perfisP = await lerPerfis();
        const pp = perfisP.find((x) => x.token === tokenP);
        if (!pp._perguntaUso || pp._perguntaUso.dia !== hojeP) pp._perguntaUso = { dia: hojeP, n: 0 };
        if (pp._perguntaUso.n >= LIMITE) {
          return json(res, 429, { erro: `Voce atingiu ${LIMITE} perguntas hoje (cota do plano ${planoP.nome}). O limite zera amanha.` });
        }
        try {
          const { perguntarEdital } = await import("../src/perguntarEdital.mjs");
          const { resposta } = await perguntarEdital(edital, pergunta, { perfilToken: tokenP });
          pp._perguntaUso.n += 1;
          await salvarPerfis(perfisP);
          return json(res, 200, { resposta });
        } catch (e) {
          return json(res, e.codigo === "sem_pdf" ? 200 : 502, { erro: e.message, codigo: e.codigo || null });
        }
      }
      // Admin: sem trava
      try {
        const { perguntarEdital } = await import("../src/perguntarEdital.mjs");
        const { resposta } = await perguntarEdital(edital, pergunta, { perfilToken: tokenP });
        return json(res, 200, { resposta });
      } catch (e) {
        return json(res, e.codigo === "sem_pdf" ? 200 : 502, { erro: e.message, codigo: e.codigo || null });
      }
    }

    // Dispara a analise de IA (Camadas 3 e 4) sob demanda.
    if (rota === "/api/analisar" && req.method === "POST") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      if (!temChave()) return json(res, 400, { erro: "Sem ANTHROPIC_API_KEY configurada" });
      const tokenA = url.searchParams.get("c") || "";
      const perfilA = await perfilPorToken(tokenA);
      const empresa = perfilA ? empresaDoPerfil(perfilA) : await empresaAtual();
      // A analise por IA e recurso do plano pago (custa $ do Claude). So roda para
      // assinatura ativa (ou degustacao do teste). Admin nao tem trava.
      if (perfilA) {
        const lib = checarAnalise(perfilA);
        if (!lib.ok) {
          const msg = lib.motivo === "assinatura"
            ? "A analise por IA faz parte do plano. Assine para liberar a leitura do edital e a conferencia dos seus documentos."
            : `Voce usou as ${lib.uso.limite} analises do seu plano neste mes. A cota volta no proximo mes.`;
          return json(res, 402, { erro: msg, motivo: lib.motivo, limiteAtingido: true, uso: lib.uso });
        }
      }
      try {
        const { aptidao, cache } = await conferir(edital, empresa, { perfilToken: tokenA });
        // So conta como analise nova quando houve chamada de IA (cache miss).
        let uso = perfilA ? usoDe(perfilA) : null;
        if (perfilA && cache === false) uso = await registrarAnalise(tokenA);
        const analiseCache = await carregarAnalise(id);
        return json(res, 200, { analise: analiseCache?.analise ?? null, conferencia: { aptidao }, uso });
      } catch (e) {
        return json(res, 502, { erro: e.message });
      }
    }

    // Dossie de impugnacao por IA (recurso do plano, igual a analise).
    if (rota === "/api/impugnacao" && req.method === "POST") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      if (!temChave()) return json(res, 400, { erro: "Sem chave de leitura configurada" });
      const tokenA = url.searchParams.get("c") || "";
      const perfilA = await perfilPorToken(tokenA);
      // Cliente pagante: consome cota
      if (perfilA && tokenA !== ADMIN) {
        const lib = checarAnalise(perfilA);
        if (!lib.ok) {
          const msg = lib.motivo === "assinatura"
            ? "O dossie de impugnacao faz parte do plano. Assine para liberar."
            : `Voce usou as ${lib.uso.limite} pesquisas do seu plano neste mes. A cota volta no proximo mes.`;
          return json(res, 402, { erro: msg, motivo: lib.motivo, limiteAtingido: true, paywall: true, uso: lib.uso });
        }
      } else if (!perfilA) {
        // Visitante anonimo: rate limit (1 impugnacao gratis por 24h por IP)
        const ip = ipDoRequest(req);
        const r = tentarUsoVisitante(ip, "impugnacao");
        if (!r.ok) {
          return json(res, 402, {
            erro: "Você usou sua impugnação grátis.",
            paywall: true,
            mensagem: `Visitantes têm direito a ${r.limite} dossiê grátis por dia. Cadastre-se grátis para ter mais.`,
          });
        }
      }
      try {
        const dossie = await gerarImpugnacao(edital, { perfilToken: tokenA });
        let uso = perfilA ? usoDe(perfilA) : null;
        if (perfilA && dossie.cache === false) uso = await registrarAnalise(tokenA);
        return json(res, 200, { impugnacao: dossie, uso });
      } catch (e) {
        return json(res, 502, { erro: e.message });
      }
    }

    // Healthcheck: Railway pode pingar /health pra confirmar que o processo
    // esta vivo. Resposta rapida (sem tocar banco/cache), so confirma loop event.
    if (rota === "/health" || rota === "/healthz" || rota === "/_health") {
      const m = process.memoryUsage();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({
        ok: true,
        uptime_s: Math.round(process.uptime()),
        memory_mb: { rss: Math.round(m.rss / 1024 / 1024), heap: Math.round(m.heapUsed / 1024 / 1024) },
        node: process.version,
        ts: new Date().toISOString(),
      }));
    }

    // Verificacao do Google Search Console.
    if (/^\/google[\w-]+\.html$/.test(rota)) {
      try {
        const buf = await readFile(resolve(AQUI, "public", rota.slice(1)));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(buf);
      } catch { /* nao existe: cai no 404 */ }
    }

    // llms.txt: padrao emergente pra orientar LLMs (ChatGPT, Claude, Gemini,
    // Perplexity) sobre como entender e citar o conteudo do site. Cresce em
    // relevancia a medida que LLM-based search se torna mainstream em 2026.
    if (rota === "/llms.txt" || rota === "/llms-full.txt") {
      try {
        const buf = await readFile(resolve(AQUI, "public", "llms.txt"), "utf8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
        return res.end(buf);
      } catch { /* nao existe */ }
    }

    // ai.txt (padrao alternativo): bloqueia ou permite uso por LLMs.
    if (rota === "/ai.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
      return res.end(`# ContrataX - Politica de uso por modelos de IA
# Permitido citar conteudo publico do blog e da landing page com referencia.
# Treinamento de modelos: nao consentido.
User-Agent: *
Allow: /blog/
Allow: /licitacoes/
Allow: /orgaos/
Allow: /cnae/
Disallow: /painel
Disallow: /admin
Disallow: /api/
Contact: contato@contratax.com.br
`);
    }

    // Verificacao do Bing Webmaster Tools (arquivo XML na raiz do dominio).
    if (rota === "/BingSiteAuth.xml") {
      try {
        const buf = await readFile(resolve(AQUI, "public", "BingSiteAuth.xml"));
        res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(buf);
      } catch { /* nao existe: cai no 404 */ }
    }

    // Assets estaticos da marca (svg/png/ico/webp) servidos da pasta public,
    // inclusive em subpastas (ex: /portais/pncp.png). Bloqueia path traversal
    // (".." na rota) por seguranca.
    // Cache de 30 dias - logo nao muda toda hora; quando trocar bumpa o arquivo.
    if (/^\/[\w./-]+\.(svg|png|ico|webp|jpg|jpeg|js)$/.test(rota) && !rota.includes("..")) {
      try {
        const buf = await readFile(resolve(AQUI, "public", rota.slice(1)));
        const tipo = rota.endsWith(".svg") ? "image/svg+xml"
                  : rota.endsWith(".png") ? "image/png"
                  : rota.endsWith(".webp") ? "image/webp"
                  : rota.endsWith(".jpg") || rota.endsWith(".jpeg") ? "image/jpeg"
                  : rota.endsWith(".js") ? "application/javascript; charset=utf-8"
                  : "image/x-icon";
        res.writeHead(200, {
          "Content-Type": tipo,
          // Service worker NAO deve ser cacheado pelo navegador (atualiza rapido)
          "Cache-Control": rota === "/sw.js" ? "no-cache" : "public, max-age=2592000, immutable",
        });
        return res.end(buf);
      } catch { /* nao existe: cai no 404 */ }
    }

    // Paginas estaticas de recuperacao de senha
    if (rota === "/esqueci-senha" || rota === "/esqueci-senha.html") {
      const html = await readFile(resolve(AQUI, "public", "esqueci-senha.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/redefinir-senha" || rota === "/redefinir-senha.html") {
      const html = await readFile(resolve(AQUI, "public", "redefinir-senha.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }

    // PWA manifest
    if (rota === "/manifest.json") {
      try {
        const buf = await readFile(resolve(AQUI, "public", "manifest.json"));
        res.writeHead(200, { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=86400" });
        return res.end(buf);
      } catch { /* fall through */ }
    }

    // Landing comparativa (sem nomear concorrentes — risco juridico)
    if (rota === "/lp/comparativo" || rota === "/comparativo") {
      const html = await readFile(resolve(AQUI, "public", "lp-comparativo.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }

    // ===== Paginas institucionais (Casos, Status, Seguranca) =====
    if (rota === "/casos" || rota === "/casos.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(paginaCasos()));
    }
    if (rota === "/status" || rota === "/status.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(paginaStatus()));
    }
    if (rota === "/seguranca" || rota === "/seguranca.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(paginaSeguranca()));
    }
    // Paginas legais (LGPD): Politica de Privacidade e Termos de Uso.
    if (rota === "/privacidade" || rota === "/privacidade.html") {
      const html = await readFile(resolve(AQUI, "public", "privacidade.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/termos" || rota === "/termos.html") {
      const html = await readFile(resolve(AQUI, "public", "termos.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(html));
    }

    // ===== Central de Ajuda e Contato =====
    if (rota === "/ajuda" || rota === "/ajuda.html") {
      const html = await renderizarAjuda(BASE_PUBLICA);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/contato" && req.method === "GET") {
      const tokenCt = url.searchParams.get("c") || "";
      const html = await renderizarContato(BASE_PUBLICA, { token: tokenCt });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/contato" && req.method === "POST") {
      // Aceita form-urlencoded (do <form> normal) ou JSON (do widget)
      let dados = {};
      const ct = req.headers["content-type"] || "";
      if (ct.includes("application/json")) {
        dados = await lerCorpo(req);
      } else {
        // form-urlencoded
        const corpo = await new Promise((resolve) => {
          let d = ""; req.on("data", (c) => d += c); req.on("end", () => resolve(d));
        });
        const params = new URLSearchParams(corpo);
        dados = Object.fromEntries(params.entries());
      }
      const r = await processarContato({
        email: dados.email,
        assunto: dados.assunto,
        mensagem: dados.mensagem,
        token: dados.token,
        meta: { userAgent: req.headers["user-agent"], url: dados.origem || null, painel: !!dados.token },
      });
      if (!r.ok) {
        if (ct.includes("application/json")) return json(res, 400, { erro: r.erro });
        const html = await renderizarContato(BASE_PUBLICA, { token: dados.token || "", erro: r.erro });
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(injetarAnalytics(html));
      }
      if (ct.includes("application/json")) return json(res, 200, { ok: true });
      const html = await renderizarContato(BASE_PUBLICA, { sucesso: true });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(html));
    }

    // ===== Blog SEO: artigos em /blog e /blog/<slug> =====
    if (rota === "/blog" || rota === "/blog/") {
      const html = await renderizarListagem(BASE_PUBLICA);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(html));
    }
    if (rota.startsWith("/blog/")) {
      const slug = rota.replace(/^\/blog\//, "").replace(/\/$/, "");
      const html = await renderizarArtigo(slug, BASE_PUBLICA);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(injetarAnalytics(html));
      }
      // slug invalido cai no 404
    }

    // ===== SEO programatico: paginas publicas de licitacoes por ramo/estado =====
    // Segmentos (ramos prontos) pra busca por clique no painel. Mostra APENAS
    // os nichos que o cliente cadastrou (filtro.termos), nao o catalogo inteiro:
    // o painel e dele, entao os atalhos sao do ramo dele. Sem token (ou sem
    // termos), cai no catalogo geral (ex: visitante).
    if (rota === "/api/segmentos") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      const termos = perfil?.filtro?.termos ?? [];
      if (termos.length) {
        const vistos = new Set();
        const segmentos = [];
        for (const t of termos) {
          const termo = String(t).trim();
          const chave = termo.toLowerCase();
          if (!termo || vistos.has(chave)) continue;
          vistos.add(chave);
          // Nome bonito: 1a letra de cada palavra em maiuscula (split por espaco
          // pra nao tropecar em acentos, que o \b do regex trata mal).
          const nome = termo.split(/\s+/).map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
          segmentos.push({ nome, termo });
        }
        return json(res, 200, { segmentos, doCliente: true });
      }
      return json(res, 200, { segmentos: CATEGORIAS.map((c) => ({ nome: c.nome, termo: c.termo })), doCliente: false });
    }
    if (rota === "/licitacoes" || rota === "/licitacoes/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(paginaHub()));
    }
    if (rota.startsWith("/licitacoes/")) {
      const partes = rota.split("/").filter(Boolean); // ["licitacoes", slug, uf?]
      const html = paginaCategoria(partes[1], partes[2] || null);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(injetarAnalytics(html));
      }
      // Recuperacao de URLs-lixo do Search Console: quando a CATEGORIA e valida
      // mas vem sujeira depois (ex: /licitacoes/veiculos/sai.io.org.br/... que o
      // PNCP guardava como "link" sem protocolo, ja corrigido na origem), faz
      // 301 pra pagina limpa da categoria (recupera o link, mata o 404). Se a
      // 2a parte for UF valida, leva pra categoria+UF; senao, categoria Brasil.
      const cat = categoriaPorSlug(partes[1]);
      if (cat) {
        const uf = ufPorSigla(partes[2] || "");
        const destino = `/licitacoes/${cat.slug}${uf ? "/" + uf.sigla.toLowerCase() : ""}`;
        if (destino !== rota) {
          res.writeHead(301, { Location: destino, "Cache-Control": "no-store" });
          return res.end();
        }
      }
      // slug invalido: cai no 404
    }

    // ===== SEO programatico: paginas por ORGAO publico =====
    if (rota === "/orgaos" || rota === "/orgaos/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(paginaHubOrgaos()));
    }
    if (rota.startsWith("/orgaos/")) {
      const slug = rota.split("/").filter(Boolean)[1];
      const html = await paginaOrgao(slug);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(injetarAnalytics(html));
      }
    }

    // ===== SEO programatico: paginas por CNAE =====
    if (rota === "/cnae" || rota === "/cnae/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(paginaHubCnae()));
    }
    if (rota.startsWith("/cnae/")) {
      const codigo = rota.split("/").filter(Boolean)[1];
      const html = paginaCnae(codigo);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(injetarAnalytics(html));
      }
    }

    // ===== SEO programatico: RANKINGS de compras por ramo (ativo linkavel) =====
    if (rota === "/ranking" || rota === "/ranking/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(paginaHubRanking()));
    }
    if (rota.startsWith("/ranking/")) {
      const slug = rota.split("/").filter(Boolean)[1];
      const html = paginaRanking(slug);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(injetarAnalytics(html));
      }
    }

    // Arquivos de SEO.
    if (rota === "/robots.txt") {
      const txt = await readFile(resolve(AQUI, "public", "robots.txt"), "utf8");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(txt);
    }
    // Sitemap DINAMICO: paginas-base + todas as paginas de SEO (ramo x estado).
    if (rota === "/sitemap.xml") {
      // Usa o dominio canonico (BASE_PUBLICA = com www) em tudo, alinhado com
      // os canonicals das paginas e com o redirect 301 do apex.
      const caminhos = ["/", "/cadastro", "/entrar", "/ajuda", "/contato", "/lp/comparativo", "/casos", "/status", "/seguranca", "/orgaos", "/cnae", "/ranking", "/privacidade", "/termos"];
      const base = caminhos.map((c) => BASE_PUBLICA + c);
      const blog = (await urlsBlog(BASE_PUBLICA)).map((b) => b.loc);
      const urls = [...base, ...blog, ...urlsSEO(), ...urlsOrgaos(), ...urlsCnae(), ...urlsRanking()];
      // lastmod = hoje: o acervo (licitacoes/orgaos/cnae) regenera diariamente do
      // PNCP, entao a data e legitima e ajuda o Google a priorizar o recrawl.
      const hoje = new Date().toISOString().slice(0, 10);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${hoje}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}\n</urlset>`;
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
      return res.end(xml);
    }

    // Landing page (porta de entrada) e o painel da aplicacao.
    if (rota === "/" || rota === "/lp.html") {
      const html = await readFile(LP, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/cadastro" || rota === "/cadastro.html") {
      const html = await readFile(CADASTRO, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/entrar" || rota === "/entrar.html") {
      const html = await readFile(ENTRAR, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/documentos" || rota === "/documentos.html") {
      const html = await readFile(DOCUMENTOS, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/equipe" || rota === "/equipe.html") {
      const html = await readFile(EQUIPE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/planejamento" || rota === "/planejamento.html") {
      const html = await readFile(PLANEJAMENTO, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/conta" || rota === "/conta.html") {
      const html = await readFile(CONTA, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/historico" || rota === "/historico.html") {
      const html = await readFile(HISTORICO, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/assinar" || rota === "/assinar.html") {
      const html = await readFile(ASSINAR, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/declaracoes" || rota === "/declaracoes.html") {
      const html = await readFile(DECLARACOES, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/obrigado" || rota === "/obrigado.html") {
      const html = await readFile(resolve(AQUI, "public", "obrigado.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/empresas" || rota === "/empresas.html") {
      const html = await readFile(EMPRESAS, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/admin" || rota === "/admin.html") {
      const html = await readFile(ADMIN_PAGE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/painel" || rota === "/index.html") {
      const html = await readFile(INDEX, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }

    // ===== Modulo Recebiveis (gestao de NFs emitidas pra orgaos publicos) =====

    // GET /api/recebiveis?c=token -> lista de notas + estatisticas
    if (rota === "/api/recebiveis" && req.method === "GET") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, {
        notas: listarNotas(tokenR),
        stats: estatisticasRecebiveis(tokenR),
      });
    }

    // POST /api/recebiveis?c=token { dataEmissao, valor, numero, orgaoNome, orgaoCnpj, descricao }
    if (rota === "/api/recebiveis" && req.method === "POST") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoR = await lerCorpo(req);
      if (!corpoR.dataEmissao || !corpoR.valor) {
        return json(res, 400, { erro: "Data de emissao e valor sao obrigatorios" });
      }
      const nota = cadastrarNota(tokenR, corpoR);
      return json(res, 200, { ok: true, nota });
    }

    // POST /api/recebiveis/xml?c=token { xml: "..." }
    if (rota === "/api/recebiveis/xml" && req.method === "POST") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoR = await lerCorpo(req);
      const dados = parsearNFe(corpoR.xml || "");
      if (!dados) return json(res, 400, { erro: "XML nao parece ser uma NFe valida" });
      const nota = cadastrarNota(tokenR, dados);
      return json(res, 200, { ok: true, nota, extraido: dados });
    }

    // POST /api/recebiveis/paga?c=token { id, dataPagamento }
    if (rota === "/api/recebiveis/paga" && req.method === "POST") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoR = await lerCorpo(req);
      const nota = marcarPaga(tokenR, Number(corpoR.id), corpoR.dataPagamento);
      if (!nota) return json(res, 404, { erro: "NF nao encontrada" });
      return json(res, 200, { ok: true, nota });
    }

    // POST /api/recebiveis/remover?c=token { id }
    if (rota === "/api/recebiveis/remover" && req.method === "POST") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoR = await lerCorpo(req);
      const ok = removerNota(tokenR, Number(corpoR.id));
      return json(res, 200, { ok });
    }

    // GET /recebiveis/oficio?c=token&id=... -> HTML do oficio (imprimivel como PDF)
    if (rota === "/recebiveis/oficio") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Conta nao encontrada");
      }
      const idR = Number(url.searchParams.get("id"));
      const nota = obterNota(tokenR, idR);
      if (!nota) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("NF nao encontrada");
      }
      const empresa = {
        razao: perfilR.empresa?.razaoSocial || perfilR.nome,
        cnpj: perfilR.cnpj,
        cidade: perfilR.empresa?.cidade,
        uf: perfilR.empresa?.uf || (perfilR.ufs || [])[0],
        email: perfilR.email,
      };
      const html = gerarOficioHtml({ nota, empresa, perfilToken: tokenR });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    // GET /recebiveis/peca?c=token&id=...&tipo=lai|tce|ouvidoria|oficio
    // Gera a peca de escalonamento escolhida (imprimivel como PDF).
    if (rota === "/recebiveis/peca") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Conta nao encontrada"); }
      const nota = obterNota(tokenR, Number(url.searchParams.get("id")));
      if (!nota) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("NF nao encontrada"); }
      const empresa = {
        razao: perfilR.empresa?.razaoSocial || perfilR.razaoSocial || perfilR.nome,
        nome: perfilR.nome,
        cnpj: perfilR.cnpj,
        cidade: perfilR.empresa?.cidade,
        uf: perfilR.empresa?.uf || (perfilR.ufs || [])[0],
        email: perfilR.email,
      };
      const tipo = url.searchParams.get("tipo") || "oficio";
      let html;
      if (tipo === "lai") html = gerarLaiHtml({ nota, empresa });
      else if (tipo === "tce") html = gerarTceHtml({ nota, empresa });
      else if (tipo === "ouvidoria") html = gerarOuvidoriaHtml({ nota, empresa });
      else html = gerarOficioHtml({ nota, empresa, perfilToken: tokenR });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    // POST /api/recebiveis/antecipar?c=token { id, observacoes }
    if (rota === "/api/recebiveis/antecipar" && req.method === "POST") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoR = await lerCorpo(req);
      const nota = obterNota(tokenR, Number(corpoR.id));
      if (!nota) return json(res, 404, { erro: "NF nao encontrada" });
      const empresa = {
        razao: perfilR.empresa?.razaoSocial || perfilR.razaoSocial || perfilR.nome,
        nome: perfilR.nome, cnpj: perfilR.cnpj, email: perfilR.email,
        telefone: perfilR.telefone, cidade: perfilR.empresa?.cidade,
        uf: perfilR.empresa?.uf || (perfilR.ufs || [])[0],
      };
      const r = await solicitarAntecipacao({ nota, empresa, perfilToken: tokenR, observacoes: corpoR.observacoes });
      return json(res, r.ok ? 200 : 500, r);
    }

    // GET /api/recebiveis/estimativa-antecipacao?c=token&id=... (faixa pra UI)
    if (rota === "/api/recebiveis/estimativa-antecipacao") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const nota = obterNota(tokenR, Number(url.searchParams.get("id")));
      if (!nota) return json(res, 404, { erro: "NF nao encontrada" });
      return json(res, 200, estimativaAntecipacao(nota.valor));
    }

    // POST /api/recebiveis/escalar?c=token { id, observacoes }
    if (rota === "/api/recebiveis/escalar" && req.method === "POST") {
      const tokenR = url.searchParams.get("c") || "";
      const perfilR = await perfilPorToken(tokenR);
      if (!perfilR) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoR = await lerCorpo(req);
      const nota = obterNota(tokenR, Number(corpoR.id));
      if (!nota) return json(res, 404, { erro: "NF nao encontrada" });
      const empresa = {
        razao: perfilR.empresa?.razaoSocial || perfilR.nome,
        nome: perfilR.nome,
        cnpj: perfilR.cnpj,
        email: perfilR.email,
        telefone: perfilR.telefone,
        cidade: perfilR.empresa?.cidade,
        uf: perfilR.empresa?.uf || (perfilR.ufs || [])[0],
      };
      const r = await escalarParaAdvogado({ nota, empresa, perfilToken: tokenR, observacoes: corpoR.observacoes });
      return json(res, r.ok ? 200 : 500, r);
    }

    // Pagina /recebiveis
    if (rota === "/recebiveis" || rota === "/recebiveis.html") {
      const html = await readFile(resolve(AQUI, "public", "recebiveis.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/concorrentes" || rota === "/concorrentes.html") {
      const html = await readFile(resolve(AQUI, "public", "concorrentes.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/precos" || rota === "/precos.html") {
      const html = await readFile(resolve(AQUI, "public", "precos.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/itens" || rota === "/itens.html") {
      const html = await readFile(resolve(AQUI, "public", "itens.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/pca" || rota === "/pca.html") {
      const html = await readFile(resolve(AQUI, "public", "pca.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }
    if (rota === "/juridico" || rota === "/juridico.html") {
      const html = await readFile(resolve(AQUI, "public", "juridico.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }

    // ===== Modulo Contratos Meus (gestao de vigencia + aditivos + reequilibrio) =====

    if (rota === "/api/contratos-meus" && req.method === "GET") {
      const tokenC = url.searchParams.get("c") || "";
      const perfilC = await perfilPorToken(tokenC);
      if (!perfilC) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, { contratos: listarContratos(tokenC), indices: indicesDisponiveis() });
    }

    if (rota === "/api/contratos-meus" && req.method === "POST") {
      const tokenC = url.searchParams.get("c") || "";
      const perfilC = await perfilPorToken(tokenC);
      if (!perfilC) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoC = await lerCorpo(req);
      if (!corpoC.dataFim) return json(res, 400, { erro: "Data fim e obrigatoria" });
      const c = cadastrarContrato(tokenC, corpoC);
      return json(res, 200, { ok: true, contrato: c });
    }

    // POST /api/contratos-meus/extrair { arquivo: base64, tipo: "pdf"|"xml" }
    // Le PDF ou XML e devolve os campos extraidos (sem salvar; o cliente revisa
    // e confirma antes de salvar via /api/contratos-meus).
    if (rota === "/api/contratos-meus/extrair" && req.method === "POST") {
      const tokenC = url.searchParams.get("c") || "";
      const perfilC = await perfilPorToken(tokenC);
      if (!perfilC) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoC = await lerCorpo(req);
      if (!corpoC.arquivo) return json(res, 400, { erro: "Arquivo nao enviado" });
      try {
        const buf = Buffer.from(corpoC.arquivo, "base64");
        const tipo = corpoC.tipo || detectarTipoArquivo(buf);
        if (tipo === "xml") {
          const dados = parsearXmlContrato(buf.toString("utf8"));
          if (!dados) return json(res, 400, { erro: "XML nao reconhecido como contrato" });
          return json(res, 200, { ok: true, dados, fonte: "xml" });
        }
        if (tipo === "pdf") {
          if (!temChave()) return json(res, 503, { erro: "Servico de extracao indisponivel no momento" });
          // Cota de extracao de PDF (separada da cota de analise de edital).
          // XML do PNCP nao consome essa cota porque o parsing eh local.
          if (!podeExtrairPdf(perfilC)) {
            return json(res, 402, {
              erro: "Voce atingiu o limite de extracoes de PDF do mes neste plano. Importe via XML do PNCP (sem limite) ou faca upgrade do plano.",
              uso: usoExtracoesDe(perfilC),
            });
          }
          const dados = await extrairContratoPdf(buf);
          await registrarExtracaoPdf(tokenC);
          return json(res, 200, { ok: true, dados, fonte: "pdf", uso: usoExtracoesDe(perfilC) });
        }
        return json(res, 400, { erro: "Tipo de arquivo nao suportado (use PDF ou XML)" });
      } catch (e) {
        return json(res, 500, { erro: "Falha ao extrair: " + e.message });
      }
    }

    if (rota === "/api/contratos-meus/remover" && req.method === "POST") {
      const tokenC = url.searchParams.get("c") || "";
      const perfilC = await perfilPorToken(tokenC);
      if (!perfilC) return json(res, 404, { erro: "Conta nao encontrada" });
      const corpoC = await lerCorpo(req);
      const ok = removerContrato(tokenC, Number(corpoC.id));
      return json(res, 200, { ok });
    }

    if (rota === "/api/contratos-meus/gatilho-reequilibrio" && req.method === "GET") {
      const indice = url.searchParams.get("indice");
      const dataBase = url.searchParams.get("dataBase");
      return json(res, 200, gatilhoReequilibrio({ indice, dataBase }) || { erro: "Parametros invalidos" });
    }

    // Minutas: /contratos-meus/minuta?c=token&id=...&tipo=prorrogacao|aditivo|reequilibrio
    if (rota === "/contratos-meus/minuta") {
      const tokenC = url.searchParams.get("c") || "";
      const perfilC = await perfilPorToken(tokenC);
      if (!perfilC) { res.writeHead(404).end("Conta nao encontrada"); return; }
      const id = Number(url.searchParams.get("id"));
      const c = obterContrato(tokenC, id);
      if (!c) { res.writeHead(404).end("Contrato nao encontrado"); return; }
      const empresa = {
        razao: perfilC.empresa?.razaoSocial || perfilC.nome,
        cnpj: perfilC.cnpj,
        cidade: perfilC.empresa?.cidade,
        uf: perfilC.empresa?.uf || (perfilC.ufs || [])[0],
      };
      const tipo = url.searchParams.get("tipo") || "prorrogacao";
      let html;
      if (tipo === "aditivo") {
        html = minutaAditivo({
          contrato: c,
          empresa,
          tipo: url.searchParams.get("natureza") || "quantitativo",
          justificativa: url.searchParams.get("justificativa") || "",
          percentualPretendido: Number(url.searchParams.get("percentual") || 25),
        });
      } else if (tipo === "reequilibrio") {
        html = minutaReequilibrio({
          contrato: c,
          empresa,
          indice: url.searchParams.get("indice") || c.indice_reajuste || "IPCA",
          dataBase: url.searchParams.get("dataBase") || c.data_inicio,
          justificativa: url.searchParams.get("justificativa") || "",
        });
      } else {
        html = minutaProrrogacao({
          contrato: c,
          empresa,
          mesesProrrogacao: Number(url.searchParams.get("meses") || 12),
        });
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    // Pagina /contratos
    if (rota === "/contratos" || rota === "/contratos.html") {
      const html = await readFile(resolve(AQUI, "public", "contratos.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(injetarAnalytics(html));
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nao encontrado");
  } catch (err) {
    // Gera ID curto para rastrear no log. Cliente ve o ID; o detalhe tecnico fica
    // so no servidor (nao vaza stack/mensagem ao usuario).
    const erroId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    console.error(`[500 ${erroId}] ${req.method} ${req.url}\n`, err);
    // Se a rota e JSON (API), devolve JSON; senao serve a pagina HTML amigavel.
    const rotaErr = req.url || "";
    const querJson = rotaErr.startsWith("/api/") || /application\/json/i.test(req.headers.accept || "");
    if (querJson) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ erro: "Erro interno do servidor", id: erroId }));
    }
    try {
      const html = await readFile(resolve(AQUI, "public", "erro-500.html"), "utf8");
      const comId = html.replace("ID: ...", "ID: " + erroId);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(injetarAnalytics(comId));
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Erro interno. ID: " + erroId);
    }
  }
});

servidor.listen(PORTA, () => {
  console.log(`Painel Licita rodando em http://localhost:${PORTA}`);
});

// ============================================================================
// PROTECOES CONTRA CRASH (Railway estava reiniciando o processo aleatoriamente)
// ============================================================================

// 1) Uncaught exceptions: LOGA e continua vivo. Antes derrubava o processo.
process.on("uncaughtException", (err, origin) => {
  console.error(`[CRASH PREVENIDO] uncaughtException em ${origin}:`, err);
  // Nao mata o processo. Loga, segue vida. So nao tenta operacao critica
  // se for erro de FS/SQLite (esses sao melhor reiniciar).
  if (/SQLITE|ENOSPC|EACCES|EBUSY/.test(err.message || "")) {
    console.error("[CRASH PREVENIDO] Erro critico de FS/DB - process.exit(1) pra Railway reiniciar limpo");
    process.exit(1);
  }
});

// 2) Unhandled promise rejections: idem.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRASH PREVENIDO] unhandledRejection:", reason);
});

// 3) Memory monitoring: a cada 5min, loga uso de memoria. Se passar de 80% do
// limite Railway (~410MB no hobby), aciona GC manual e checkpoint SQLite.
const MEM_LIMITE_MB = Number(process.env.LICITA_MEM_LIMITE_MB || 450);
setInterval(() => {
  const m = process.memoryUsage();
  const rssMb = Math.round(m.rss / 1024 / 1024);
  const heapMb = Math.round(m.heapUsed / 1024 / 1024);
  // ORDEM IMPORTA: o critico (95%) vem PRIMEIRO. Antes estava como else-if
  // depois do ramo de 80%, o que o tornava inalcancavel (acima de 95% tambem e
  // acima de 80% e caia sempre no primeiro ramo) - o restart protetivo nunca
  // disparava e o processo so fazia GC ate o Railway matar do jeito bruto.
  if (rssMb > MEM_LIMITE_MB * 0.95) {
    console.error(`[MEM] CRITICO: RSS=${rssMb}MB - reiniciando processo pra Railway.`);
    process.exit(1);
  } else if (rssMb > MEM_LIMITE_MB * 0.8) {
    console.warn(`[MEM] alerta: RSS=${rssMb}MB heap=${heapMb}MB (limite ${MEM_LIMITE_MB}MB). Forcando GC e checkpoint.`);
    try { if (global.gc) global.gc(); } catch {}
    // Checkpoint do WAL do SQLite: reduz tamanho do arquivo -wal acumulado.
    try {
      import("./../src/db.mjs").then(({ abrir }) => {
        try { abrir().exec("PRAGMA wal_checkpoint(TRUNCATE);"); } catch {}
      });
    } catch {}
  }
}, 5 * 60 * 1000);

// 4) SIGTERM (Railway envia ao reiniciar): grava log limpo.
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM recebido. Fechando graceful.");
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000); // timeout forcado
});

// 5) Healthcheck endpoint pro Railway saber que esta vivo
// (Railway pode pingar /health pra detectar travamento e reiniciar antes do timeout)
// Ja existe rota /api no codigo, vou expor /health no proximo deploy via novo handler.

// Opcional (Railway): roda o backfill continuo de contratos NO MESMO processo,
// para compartilhar o mesmo volume/banco do servidor (volumes nao sao compartilhados
// entre servicos no Railway). Ative com LICITA_BACKFILL=1.
//
// IMPORTANTE: backfill INICIA 60s APOS subida do servidor pra nao competir
// memoria com atualizador, digest e backup no startup (causa de OOM em Hobby).
if (process.env.LICITA_BACKFILL) {
  setTimeout(() => {
    import("../src/backfillContratos.mjs")
      .then(({ backfillLoop }) => {
        const meses = Number(process.env.LICITA_BACKFILL_MESES || 18);
        const horas = Number(process.env.LICITA_BACKFILL_HORAS || 6);
        console.log(`[backfill] ativado em background (${meses} meses, a cada ${horas}h)`);
        return backfillLoop({ meses, intervaloHoras: horas });
      })
      .catch((e) => console.error("[backfill] erro:", e.message));
  }, 60 * 1000);
}

// Opcional (Railway): atualiza os EDITAIS no mesmo processo. Carrega o acervo na
// subida e refaz a cada N horas. Ative com LICITA_ATUALIZAR=1.
// Tambem escalonado: inicia 30s apos subida.
if (process.env.LICITA_ATUALIZAR) {
  setTimeout(() => {
    import("../src/atualizador.mjs")
      .then(({ atualizarLoop }) => {
        const horas = Number(process.env.LICITA_ATUALIZAR_HORAS || 6);
        console.log(`[atualizar] ativado em background (a cada ${horas}h)`);
        return atualizarLoop({ intervaloHoras: horas });
      })
      .catch((e) => console.error("[atualizar] erro:", e.message));
  }, 30 * 1000);
}

// Opcional (Railway): digest diario por e-mail. Envia 1x ao dia para cada cliente
// ativo um resumo dos editais NOVOS do ramo dele. Ative com LICITA_DIGEST=1.
if (process.env.LICITA_DIGEST) {
  import("../src/digestDiario.mjs")
    .then(({ digestLoop }) => {
      const horaBR = Number(process.env.LICITA_DIGEST_HORA || 8);
      console.log(`[digest] ativado em background (alvo: ${horaBR}h Brasilia)`);
      return digestLoop({ horaBR });
    })
    .catch((e) => console.error("[digest] erro:", e.message));
}

// Opcional (Railway): backup off-site automatico. 1x ao dia, gera snapshot do
// banco, gzipa, salva em /data/backups e manda resumo por email com link de
// download (token admin). Ative com LICITA_BACKUP=1.
if (process.env.LICITA_BACKUP) {
  import("../src/backup.mjs")
    .then(({ backupLoop }) => {
      console.log(`[backup] ativado em background (clientes off-site por e-mail)`);
      return backupLoop();
    })
    .catch((e) => console.error("[backup] erro:", e.message));
}

// Indice de ITENS dos editais abertos (busca universal por produto). Loop
// dedicado, gated por LICITA_ITENS_INDEX=1, capado por disco (LICITA_ITENS_MAX).
// Inicia 90s apos subir (depois do backfill/atualizador) pra nao competir no boot.
if (process.env.LICITA_ITENS_INDEX) {
  setTimeout(() => {
    import("../src/colheitaItens.mjs")
      .then(({ colheitaItensLoop }) => colheitaItensLoop())
      .catch((e) => console.error("[itens] loop erro:", e.message));
  }, 90 * 1000);
}

// Limpeza de disco NO BOOT (self-healing): a cada deploy, esvazia a pasta de
// backups legada do volume (snapshots do banco inteiro que enchiam os 5GB) e
// faz checkpoint do WAL. Roda 15s apos subir pra nao competir no startup. Isso
// garante que, se o volume encheu, o proprio deploy ja libera o espaco —
// sem precisar acionar nada manualmente.
setTimeout(() => {
  import("../src/backup.mjs")
    .then(async ({ limparDisco, verificarDisco }) => {
      const r = await limparDisco({ vacuum: false });
      console.log(`[disco] limpeza no boot: liberado ${r.liberado} (${r.antes} -> ${r.depois})`);
      // Apos limpar, se o volume ainda estiver alto (>~80%), avisa o admin na hora.
      await verificarDisco();
    })
    .catch((e) => console.error("[disco] limpeza no boot falhou:", e.message));
}, 15 * 1000);
