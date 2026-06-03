// Painel web do Licita. Servidor HTTP minimo, sem dependencias.
// Serve a pagina, a lista de editais e a analise de IA (Camadas 3 e 4) sob demanda.
//
// Uso: node web/server.mjs   (porta padrao 3000, ou variavel de ambiente PORT)

import "../src/env.mjs"; // carrega .env (chave da IA)
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarResultados, carregarAnalise, carregarConferencia, salvarLead, carregarImpugnacao, carregarLeads, carregarTldr, salvarTldr } from "../src/store.mjs";
import { gerarTldr } from "../src/tldr.mjs";
import { gerarImpugnacao } from "../src/impugnacao.mjs";
import { gerarDeclaracoes } from "../src/declaracoes.mjs";
import { paginaHub, paginaCategoria, urlsSEO } from "../src/seoPaginas.mjs";
import { buscarPorId, buscaPublica, buscarEditais, estatisticas, estatisticasContratos } from "../src/db.mjs";
import { conferir, saudeDocumental } from "../src/aptidao.mjs";
import { temChave } from "../src/ia.mjs";
import { criarPerfil } from "../src/cadastro.mjs";
import { gerarDigest, enviar, temEmailKey } from "../src/email.mjs";
import { statusAtual, cobranca } from "../src/assinatura.mjs";
import { precoVencedores } from "../src/preco.mjs";
import { precoReferencia } from "../src/precoReferencia.mjs";
import { csvEditais, csvHistorico, csvRadar, nomeArquivo } from "../src/exportar.mjs";
import { icsEdital, nomeIcs } from "../src/calendario.mjs";
import { ehAssessoria, limiteEmpresas, listarEmpresasGerenciadas, adicionarEmpresa, removerEmpresa } from "../src/assessoria.mjs";
import { checklist as onboardingChecklist } from "../src/onboarding.mjs";
import { radarRenovacao } from "../src/radar.mjs";
import { listarDocumentos, baixarArquivo } from "../src/documentos.mjs";
import { verificarSenha } from "../src/senha.mjs";
import { consultarCNPJ } from "../src/cnpj.mjs";
import { autenticarUsuario, convidarMembro, removerMembro, listarMembros, definirAssentos } from "../src/equipe.mjs";
import { lerPerfis, salvarPerfis, PERFIS, garantirUsuarios } from "../src/perfis.mjs";
import { monitorar } from "../src/monitor.mjs";
import { usoDe, registrarAnalise, checarAnalise, adicionarAvulsas } from "../src/uso.mjs";
import { resumoCustos } from "../src/custo.mjs";
import { PLANOS, AVULSOS, planoDe } from "../src/planos.mjs";
import { ativarPlano } from "../src/assinatura.mjs";
import { asaasConfigurado, precoNumero, obterOuCriarCliente, criarAssinatura, criarCobrancaAvulsa, externalReferenceDaAssinatura } from "../src/asaas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const INDEX = resolve(AQUI, "public", "index.html");
const LP = resolve(AQUI, "public", "lp.html");
const CADASTRO = resolve(AQUI, "public", "cadastro.html");
const ENTRAR = resolve(AQUI, "public", "entrar.html");
const DOCUMENTOS = resolve(AQUI, "public", "documentos.html");
const EQUIPE = resolve(AQUI, "public", "equipe.html");
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

const ADMIN = process.env.LICITA_ADMIN_TOKEN || "admin";

// Perfil completo pelo token, lido de perfis.json.
async function perfilPorToken(token) {
  const perfis = await lerPerfis();
  return perfis.find((p) => p.token === token) ?? null;
}

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const rota = url.pathname;

    // Busca publica da landing page (por UF e termo, sem login).
    if (rota === "/api/busca-publica") {
      const uf = url.searchParams.get("uf") || null;
      const termo = url.searchParams.get("termo") || "";
      return json(res, 200, buscaPublica({ uf, termo, limite: 6 }));
    }

    // Login por e-mail e senha.
    if (rota === "/api/entrar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const email = (corpo.email || corpo.cnpj || "").trim();
      const senha = corpo.senha || "";
      if (!email) return json(res, 400, { erro: "Informe o seu e-mail ou CNPJ" });
      // Procura por e-mail ou CNPJ em todas as contas (admin ou membro de equipe).
      const r = await autenticarUsuario(email, senha);
      if (!r.ok) {
        const codigo = /incorret/i.test(r.motivo) ? 401 : 404;
        return json(res, codigo, { erro: r.motivo });
      }
      // Assessoria: direto pra /empresas (gestao multi-CNPJ)
      const destino = ehAssessoria(r.perfil) ? `/empresas?c=${r.perfil.token}` : `/painel?c=${r.perfil.token}`;
      return json(res, 200, { link: destino });
    }

    // Plano Assessoria: lista as empresas gerenciadas pelo assessor logado.
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
      }
      return json(res, 200, r);
    }

    // Cadastro self-service: cria o perfil e devolve o link do painel.
    if (rota === "/api/cadastrar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      try {
        const r = await criarPerfil(corpo);
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
        const r = buscarEditais({
          uf, ufs,
          termos,
          termo: termoQuery,
          cidade: url.searchParams.get("cidade") || "",
          prazoDias: url.searchParams.get("prazo") || null,
          dataDe: url.searchParams.get("dataDe") || null,
          dataAte: url.searchParams.get("dataAte") || null,
          modalidades: modParam ? [Number(modParam)] : (usarPerfil ? (perfilEx.modalidades || []) : []),
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
        if (!termos.length) return json(res, 400, { erro: "Informe um termo para exportar" });
        const candidatos = (await import("../src/db.mjs")).consultarContratos({ uf, mesesAtras: meses });
        const { aplicarFiltro, normalizar } = await import("../src/filtro.mjs");
        let todos = aplicarFiltro(candidatos, { termos }).filter(c => c.valor > 0);
        if (cidade.trim()) {
          const cn = normalizar(cidade.trim());
          todos = todos.filter(c => normalizar(c.municipio || "").includes(cn));
        }
        // Agrupa por objeto aproximado (mesma logica do /api/historico)
        const grupos = new Map();
        for (const c of todos) {
          const ch = `${c.orgao || ""}|${normalizar(c.objeto || "").slice(0, 50)}`;
          const g = grupos.get(ch) || { orgao: c.orgao, municipio: c.municipio, uf: c.uf, objeto: c.objeto, data: c.vigenciaInicio, fornecedores: new Map(), valorTotal: 0, qtdContratos: 0 };
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
      const modParam = url.searchParams.get("modalidade") || "";
      const modalidades = modParam ? [Number(modParam)] : [];
      return json(res, 200, buscarEditais({ uf, ufs, termo, modalidades, cidade, prazoDias, dataDe, dataAte, limite: 60 }));
    }

    // Lista de editais do cliente (filtrada pelo token ?c=). Token admin ve tudo.
    if (rota === "/api/editais") {
      const token = url.searchParams.get("c") || "";
      const todos = await carregarResultados();
      if (token === ADMIN) return json(res, 200, todos);
      const perfil = await perfilPorToken(token);
      if (!perfil || !todos[perfil.id]) return json(res, 200, {}); // token invalido = nada
      return json(res, 200, { [perfil.id]: todos[perfil.id] });
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
        cobranca: { preco: cobranca.preco, pix: cobranca.pix, contato: cobranca.contato },
      });
    }

    // Perfil do cliente: ler dados editaveis (para a pagina Minha conta).
    if (rota === "/api/perfil" && req.method === "GET") {
      const perfil = await perfilPorToken(url.searchParams.get("c") || "");
      if (!perfil) return json(res, 404, { erro: "Conta nao encontrada" });
      return json(res, 200, {
        nome: perfil.nome,
        razaoSocial: perfil.razaoSocial ?? null,
        cnpj: perfil.cnpj ?? null,
        email: perfil.email ?? null,
        ramo: (perfil.filtro?.termos ?? []).join(", "),
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
      const termos = (corpo.ramo || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (!termos.length) return json(res, 400, { erro: "Informe ao menos uma palavra do seu ramo" });
      if (corpo.nome && corpo.nome.trim()) p.nome = corpo.nome.trim();
      p.filtro = {
        ...(p.filtro || {}),
        termos,
        termosExcluir: (corpo.excluir || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean),
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
      const { aplicarFiltro, normalizar } = await import("../src/filtro.mjs");
      const candidatos = consultarContratos({ uf, mesesAtras: meses });
      // Usa o termo digitado ou os termos do perfil (se logado).
      const customTermo = url.searchParams.get("termo");
      const termos = customTermo
        ? customTermo.split(",").map(t => t.trim()).filter(Boolean)
        : (perfil?.filtro?.termos ?? []);
      // Sem termo e sem perfil: pede que o usuario busque algo
      if (!termos.length) {
        return json(res, 200, { total: 0, paginas: 0, pagina: 1, termos: [], licitacoes: [], aviso: "Digite um produto ou serviço para ver o histórico." });
      }
      let todos = aplicarFiltro(candidatos, { termos }).filter(c => c.valor > 0);
      // Filtro por cidade
      if (cidade.trim()) {
        const cn = normalizar(cidade.trim());
        todos = todos.filter(c => normalizar(c.municipio || "").includes(cn));
      }
      // Agrupa por licitacao (mesmo objeto aproximado): colapsa contratos do mesmo
      // Registro de Precos comprado por varias prefeituras. Mostra top 3 vencedores.
      const grupos = new Map();
      for (const c of todos) {
        const chave = normalizar(c.objeto || "").replace(/\s+/g, " ").trim().slice(0, 60);
        const g = grupos.get(chave) || {
          objeto: c.objeto, orgao: c.orgao, municipio: c.municipio, uf: c.uf,
          data: c.vigenciaInicio, vigenciaFim: c.vigenciaFim,
          valorTotal: 0, qtdContratos: 0, fornecedores: new Map(),
        };
        if ((c.objeto || "").length > (g.objeto || "").length) g.objeto = c.objeto;
        if ((c.vigenciaInicio || "") > (g.data || "")) g.data = c.vigenciaInicio;
        g.valorTotal += c.valor || 0;
        g.qtdContratos++;
        g.fornecedores.set(c.fornecedor || "Não informado",
          (g.fornecedores.get(c.fornecedor || "Não informado") || 0) + (c.valor || 0));
        grupos.set(chave, g);
      }
      // Ordena do mais recente ao mais antigo
      const lista = [...grupos.values()].sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(g => ({
        objeto: g.objeto, orgao: g.orgao, municipio: g.municipio, uf: g.uf,
        data: g.data, vigenciaFim: g.vigenciaFim,
        valorTotal: g.valorTotal, qtdContratos: g.qtdContratos,
        vencedores: [...g.fornecedores.entries()]
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([fornecedor, valor]) => ({ fornecedor, valor })),
      }));
      const total = lista.length;
      const paginas = Math.ceil(total / porPag);
      const licitacoes = lista.slice((pag - 1) * porPag, pag * porPag);
      return json(res, 200, { total, paginas, pagina: pag, termos, licitacoes });
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

    // ===== Painel admin (tudo gated por LICITA_ADMIN_TOKEN) =====
    if (rota === "/api/admin/clientes") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      const perfis = await lerPerfis();
      const clientes = perfis.map((p) => {
        garantirUsuarios(p); // so em memoria, para contar a equipe
        const st = statusAtual(p);
        return {
          token: p.token, nome: p.nome, razaoSocial: p.razaoSocial ?? null, email: p.email ?? null,
          cnpj: p.cnpj ?? null, criadoEm: p.assinatura?.criadoEm ?? null,
          ramo: (p.filtro?.termos ?? []).join(", "), uf: (p.ufs ?? [])[0] ?? null,
          status: st.status, diasRestantes: st.diasRestantes, formaPagamento: st.formaPagamento ?? null,
          nivel: p.assinatura?.nivel ?? null, planoNome: planoDe(p).nome,
          uso: usoDe(p), equipe: { usados: p.usuarios.length, assentos: p.assentos || 1 },
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
      return json(res, 200, { editais: estatisticas(), contratos: estatisticasContratos(), leads });
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

    // Catalogo de planos e pacotes avulsos (para a pagina de assinar).
    if (rota === "/api/planos") {
      return json(res, 200, {
        planos: Object.values(PLANOS),
        avulsos: Object.values(AVULSOS),
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
          r = await criarCobrancaAvulsa({ clienteId, valor: precoNumero(a.preco), descricao: `ContrataX — ${a.nome}`, externalReference: `avulso:${perfil.token}:${a.id}`, successUrl });
        } else {
          const pl = PLANOS[corpo.id];
          if (!pl) return json(res, 400, { erro: "Plano invalido" });
          r = await criarAssinatura({ clienteId, valor: precoNumero(pl.preco), descricao: `ContrataX — Plano ${pl.nome}`, externalReference: `sub:${perfil.token}:${pl.id}`, successUrl });
        }
        if (!r.invoiceUrl) return json(res, 502, { erro: "Gateway nao devolveu a URL de pagamento" });
        return json(res, 200, { automatico: true, url: r.invoiceUrl });
      } catch (e) {
        return json(res, 502, { erro: e.message });
      }
    }

    // Webhook do Asaas: ativa a conta automaticamente quando o pagamento confirma.
    if (rota === "/api/webhook/asaas" && req.method === "POST") {
      const segredo = process.env.ASAAS_WEBHOOK_TOKEN;
      if (segredo && req.headers["asaas-access-token"] !== segredo) {
        return json(res, 401, { erro: "token invalido" });
      }
      const corpo = await lerCorpo(req);
      const evento = corpo.event;
      const pg = corpo.payment || {};
      try {
        if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
          let ref = pg.externalReference;
          if (!ref && pg.subscription) ref = await externalReferenceDaAssinatura(pg.subscription);
          const [tipo, token, id] = String(ref || "").split(":");
          if (tipo === "sub" && token) {
            await ativarPlano(token, PLANOS[id] ? id : "basico", 30, pg.billingType || null);
          } else if (tipo === "avulso" && token) {
            const qtd = AVULSOS[id]?.analises || 0;
            if (qtd) await adicionarAvulsas(token, qtd);
          }
        }
      } catch (e) {
        console.error("[webhook asaas]", e.message);
      }
      return json(res, 200, { ok: true }); // sempre 200 para o Asaas nao re-tentar em loop
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
      return res.end(html);
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
      return json(res, 200, {
        edital,
        analise: analiseCache?.analise ?? null,
        conferencia: confCache?.dados ?? null,
        impugnacao: impugCache?.dados ?? null,
        saude: saudeDocumental(empresa),
        temDocumentos,
        preco,
        referencia,
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

    // TL;DR do edital (5 linhas): gera sob demanda se nao houver cache.
    // Recurso GRATUITO (cache global por edital) — abre pra qualquer visitante
    // (gancho de aquisicao). O cache protege contra custo: mesmo edital aberto
    // 1000 vezes = 1 chamada de IA. Circuit breaker simples por hora.
    if (rota === "/api/tldr" && req.method === "POST") {
      const id = url.searchParams.get("id");
      const edital = buscarPorId(id);
      if (!edital) return json(res, 404, { erro: "Edital nao encontrado" });
      // Cache global: se ja existe, devolve direto (sem custo de IA)
      const cache = await carregarTldr(id);
      if (cache) return json(res, 200, { tldr: cache.tldr, cache: true });
      if (!temChave()) return json(res, 400, { erro: "Sem ANTHROPIC_API_KEY configurada" });
      // Circuit breaker: limita geracoes novas por hora pra proteger orcamento
      if (!global.__tldrCounter) global.__tldrCounter = { hora: 0, count: 0 };
      const horaAtual = Math.floor(Date.now() / 3600000);
      if (global.__tldrCounter.hora !== horaAtual) global.__tldrCounter = { hora: horaAtual, count: 0 };
      const LIMITE = Number(process.env.LICITA_TLDR_LIMITE_HORA || 60);
      if (global.__tldrCounter.count >= LIMITE) {
        return json(res, 429, { erro: "Limite temporario atingido. Tente daqui a alguns minutos." });
      }
      global.__tldrCounter.count++;
      try {
        const tldr = await gerarTldr(edital);
        await salvarTldr(id, tldr);
        return json(res, 200, { tldr, cache: false });
      } catch (e) {
        global.__tldrCounter.count--; // nao consome cota se falhou
        return json(res, 500, { erro: e.message });
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
        const { aptidao, cache } = await conferir(edital, empresa);
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
      if (!temChave()) return json(res, 400, { erro: "Sem ANTHROPIC_API_KEY configurada" });
      const tokenA = url.searchParams.get("c") || "";
      const perfilA = await perfilPorToken(tokenA);
      if (perfilA) {
        const lib = checarAnalise(perfilA);
        if (!lib.ok) {
          const msg = lib.motivo === "assinatura"
            ? "O dossie de impugnacao faz parte do plano. Assine para liberar."
            : `Voce usou as ${lib.uso.limite} analises do seu plano neste mes. A cota volta no proximo mes.`;
          return json(res, 402, { erro: msg, motivo: lib.motivo, limiteAtingido: true, uso: lib.uso });
        }
      }
      try {
        const dossie = await gerarImpugnacao(edital);
        let uso = perfilA ? usoDe(perfilA) : null;
        if (perfilA && dossie.cache === false) uso = await registrarAnalise(tokenA);
        return json(res, 200, { impugnacao: dossie, uso });
      } catch (e) {
        return json(res, 502, { erro: e.message });
      }
    }

    // Verificacao do Google Search Console.
    if (/^\/google[\w-]+\.html$/.test(rota)) {
      try {
        const buf = await readFile(resolve(AQUI, "public", rota.slice(1)));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(buf);
      } catch { /* nao existe: cai no 404 */ }
    }

    // Assets estaticos da marca (svg/png/ico) servidos da pasta public.
    if (/^\/[\w.-]+\.(svg|png|ico)$/.test(rota)) {
      try {
        const buf = await readFile(resolve(AQUI, "public", rota.slice(1)));
        const tipo = rota.endsWith(".svg") ? "image/svg+xml" : rota.endsWith(".png") ? "image/png" : "image/x-icon";
        res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "public, max-age=86400" });
        return res.end(buf);
      } catch { /* nao existe: cai no 404 */ }
    }

    // ===== SEO programatico: paginas publicas de licitacoes por ramo/estado =====
    if (rota === "/licitacoes" || rota === "/licitacoes/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(paginaHub());
    }
    if (rota.startsWith("/licitacoes/")) {
      const partes = rota.split("/").filter(Boolean); // ["licitacoes", slug, uf?]
      const html = paginaCategoria(partes[1], partes[2] || null);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(html);
      }
      // slug/uf invalido: cai no 404
    }

    // Arquivos de SEO.
    if (rota === "/robots.txt") {
      const txt = await readFile(resolve(AQUI, "public", "robots.txt"), "utf8");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(txt);
    }
    // Sitemap DINAMICO: paginas-base + todas as paginas de SEO (ramo x estado).
    if (rota === "/sitemap.xml") {
      const base = ["https://contratax.com.br/", "https://contratax.com.br/cadastro", "https://contratax.com.br/entrar"];
      const urls = [...base, ...urlsSEO()];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><changefreq>daily</changefreq></url>`).join("\n")}\n</urlset>`;
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
      return res.end(xml);
    }

    // Landing page (porta de entrada) e o painel da aplicacao.
    if (rota === "/" || rota === "/lp.html") {
      const html = await readFile(LP, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/cadastro" || rota === "/cadastro.html") {
      const html = await readFile(CADASTRO, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/entrar" || rota === "/entrar.html") {
      const html = await readFile(ENTRAR, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/documentos" || rota === "/documentos.html") {
      const html = await readFile(DOCUMENTOS, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/equipe" || rota === "/equipe.html") {
      const html = await readFile(EQUIPE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/conta" || rota === "/conta.html") {
      const html = await readFile(CONTA, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/historico" || rota === "/historico.html") {
      const html = await readFile(HISTORICO, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/assinar" || rota === "/assinar.html") {
      const html = await readFile(ASSINAR, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/declaracoes" || rota === "/declaracoes.html") {
      const html = await readFile(DECLARACOES, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/obrigado" || rota === "/obrigado.html") {
      const html = await readFile(resolve(AQUI, "public", "obrigado.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/empresas" || rota === "/empresas.html") {
      const html = await readFile(EMPRESAS, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/admin" || rota === "/admin.html") {
      const html = await readFile(ADMIN_PAGE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (rota === "/painel" || rota === "/index.html") {
      const html = await readFile(INDEX, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nao encontrado");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro interno: " + err.message);
  }
});

servidor.listen(PORTA, () => {
  console.log(`Painel Licita rodando em http://localhost:${PORTA}`);
});

// Opcional (Railway): roda o backfill continuo de contratos NO MESMO processo,
// para compartilhar o mesmo volume/banco do servidor (volumes nao sao compartilhados
// entre servicos no Railway). Ative com LICITA_BACKFILL=1.
if (process.env.LICITA_BACKFILL) {
  import("../src/backfillContratos.mjs")
    .then(({ backfillLoop }) => {
      const meses = Number(process.env.LICITA_BACKFILL_MESES || 18);
      const horas = Number(process.env.LICITA_BACKFILL_HORAS || 6);
      console.log(`[backfill] ativado em background (${meses} meses, a cada ${horas}h)`);
      return backfillLoop({ meses, intervaloHoras: horas });
    })
    .catch((e) => console.error("[backfill] erro:", e.message));
}

// Opcional (Railway): atualiza os EDITAIS no mesmo processo. Carrega o acervo na
// subida e refaz a cada N horas. Ative com LICITA_ATUALIZAR=1.
if (process.env.LICITA_ATUALIZAR) {
  import("../src/atualizador.mjs")
    .then(({ atualizarLoop }) => {
      const horas = Number(process.env.LICITA_ATUALIZAR_HORAS || 6);
      console.log(`[atualizar] ativado em background (a cada ${horas}h)`);
      return atualizarLoop({ intervaloHoras: horas });
    })
    .catch((e) => console.error("[atualizar] erro:", e.message));
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
