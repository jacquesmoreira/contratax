// Painel web do Licita. Servidor HTTP minimo, sem dependencias.
// Serve a pagina, a lista de editais e a analise de IA (Camadas 3 e 4) sob demanda.
//
// Uso: node web/server.mjs   (porta padrao 3000, ou variavel de ambiente PORT)

import "../src/env.mjs"; // carrega .env (chave da IA)
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarResultados, carregarAnalise, carregarConferencia, salvarLead } from "../src/store.mjs";
import { buscarPorId, buscaPublica, buscarEditais } from "../src/db.mjs";
import { conferir, saudeDocumental } from "../src/aptidao.mjs";
import { temChave } from "../src/ia.mjs";
import { criarPerfil } from "../src/cadastro.mjs";
import { gerarDigest, enviar, temEmailKey } from "../src/email.mjs";
import { statusAtual, cobranca } from "../src/assinatura.mjs";
import { precoVencedores } from "../src/preco.mjs";
import { radarRenovacao } from "../src/radar.mjs";
import { listarDocumentos, baixarArquivo } from "../src/documentos.mjs";
import { verificarSenha } from "../src/senha.mjs";
import { consultarCNPJ } from "../src/cnpj.mjs";
import { autenticarUsuario, convidarMembro, removerMembro, listarMembros } from "../src/equipe.mjs";
import { lerPerfis, salvarPerfis } from "../src/perfis.mjs";
import { monitorar } from "../src/monitor.mjs";
import { usoDe, registrarAnalise, checarAnalise } from "../src/uso.mjs";
import { resumoCustos } from "../src/custo.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const INDEX = resolve(AQUI, "public", "index.html");
const LP = resolve(AQUI, "public", "lp.html");
const CADASTRO = resolve(AQUI, "public", "cadastro.html");
const ENTRAR = resolve(AQUI, "public", "entrar.html");
const DOCUMENTOS = resolve(AQUI, "public", "documentos.html");
const EQUIPE = resolve(AQUI, "public", "equipe.html");
const CONTA = resolve(AQUI, "public", "conta.html");
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
  const caminho = resolve(RAIZ, "perfis.json");
  const perfis = JSON.parse(await readFile(caminho, "utf8"));
  const p = perfis.find((x) => x.token === token);
  if (!p) return false;
  p.empresa = empresa;
  await writeFile(caminho, JSON.stringify(perfis, null, 2), "utf8");
  return true;
}

const ADMIN = process.env.LICITA_ADMIN_TOKEN || "admin";

// Perfil completo pelo token, lido de perfis.json.
async function perfilPorToken(token) {
  const perfis = JSON.parse(await readFile(resolve(RAIZ, "perfis.json"), "utf8"));
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
      const email = (corpo.email || "").trim().toLowerCase();
      const senha = corpo.senha || "";
      if (!email) return json(res, 400, { erro: "Informe o seu e-mail" });
      // Procura o usuario em todas as contas (admin ou membro de equipe).
      const r = await autenticarUsuario(email, senha);
      if (!r.ok) {
        const codigo = /incorret/i.test(r.motivo) ? 401 : 404;
        return json(res, codigo, { erro: r.motivo });
      }
      return json(res, 200, { link: `/painel?c=${r.perfil.token}` });
    }

    // Consulta CNPJ (valida na Receita e devolve a razao social) + checa duplicidade.
    if (rota === "/api/cnpj") {
      const r = await consultarCNPJ(url.searchParams.get("cnpj") || "");
      if (r.valido) {
        const limpo = (url.searchParams.get("cnpj") || "").replace(/\D/g, "");
        const perfis = JSON.parse(await readFile(resolve(RAIZ, "perfis.json"), "utf8"));
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
    if (rota === "/api/buscar") {
      const uf = url.searchParams.get("uf") || null;
      const termo = url.searchParams.get("termo") || "";
      const cidade = url.searchParams.get("cidade") || "";
      const prazoDias = url.searchParams.get("prazo") || null;
      const dataDe = url.searchParams.get("dataDe") || null;
      const dataAte = url.searchParams.get("dataAte") || null;
      const modParam = url.searchParams.get("modalidade") || "";
      const modalidades = modParam ? [Number(modParam)] : [];
      return json(res, 200, buscarEditais({ uf, termo, modalidades, cidade, prazoDias, dataDe, dataAte, limite: 60 }));
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
    if (rota === "/api/acesso") {
      const token = url.searchParams.get("c") || "";
      if (token === ADMIN) return json(res, 200, { encontrado: true, nome: "Administrador", status: "admin", temAcesso: true });
      const perfil = await perfilPorToken(token);
      if (!perfil) return json(res, 200, { encontrado: false });
      return json(res, 200, {
        encontrado: true,
        nome: perfil.nome,
        ...statusAtual(perfil),
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
        modalidades: perfil.modalidades ?? [],
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
      p.ufs = corpo.uf ? [corpo.uf] : [];
      if (Array.isArray(corpo.modalidades) && corpo.modalidades.length) p.modalidades = corpo.modalidades.map(Number);
      await salvarPerfis(perfis);
      // Re-roda o matching para o painel ja refletir o novo ramo.
      let total = 0;
      try { const { filtrados } = await monitorar(p); total = filtrados.length; } catch {}
      return json(res, 200, { ok: true, total });
    }

    // Custo de IA (so admin): resumo de tokens/R$ por analise.
    if (rota === "/api/custos") {
      if ((url.searchParams.get("c") || "") !== ADMIN) return json(res, 403, { erro: "Apenas admin" });
      return json(res, 200, (await resumoCustos()) || { chamadas: 0 });
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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
      // Ranking de concorrentes localizado NO EDITAL aberto (cidade/UF do edital),
      // no ramo do cliente. Assim o ranking muda conforme a regiao da licitacao.
      const preco = perfil
        ? precoVencedores({
            termos: perfil.filtro?.termos ?? [],
            uf: edital.uf ?? (perfil.ufs ?? [])[0] ?? null,
            municipio: edital.municipio ?? null,
            orgao: edital.orgao ?? null,
            orgaoCnpj: edital.orgaoCnpj ?? null,
          })
        : null;
      const liberacao = token === ADMIN ? { ok: true } : (perfil ? checarAnalise(perfil) : { ok: false, motivo: "assinatura" });
      return json(res, 200, {
        edital,
        analise: analiseCache?.analise ?? null,
        conferencia: confCache?.dados ?? null,
        saude: saudeDocumental(empresa),
        temDocumentos,
        preco,
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

    // Arquivos de SEO.
    if (rota === "/robots.txt") {
      const txt = await readFile(resolve(AQUI, "public", "robots.txt"), "utf8");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(txt);
    }
    if (rota === "/sitemap.xml") {
      const xml = await readFile(resolve(AQUI, "public", "sitemap.xml"), "utf8");
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
      return res.end(xml);
    }

    // Landing page (porta de entrada) e o painel da aplicacao.
    if (rota === "/" || rota === "/lp.html") {
      const html = await readFile(LP, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (rota === "/cadastro" || rota === "/cadastro.html") {
      const html = await readFile(CADASTRO, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (rota === "/entrar" || rota === "/entrar.html") {
      const html = await readFile(ENTRAR, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (rota === "/documentos" || rota === "/documentos.html") {
      const html = await readFile(DOCUMENTOS, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (rota === "/equipe" || rota === "/equipe.html") {
      const html = await readFile(EQUIPE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (rota === "/conta" || rota === "/conta.html") {
      const html = await readFile(CONTA, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (rota === "/painel" || rota === "/index.html") {
      const html = await readFile(INDEX, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
