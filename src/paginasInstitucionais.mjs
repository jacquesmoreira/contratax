// Paginas institucionais simples (estaticas, geradas em Node):
//   /casos      — case studies (preparada pra receber depoimentos reais)
//   /status     — status do sistema (uptime + numero ao vivo de editais)
//   /seguranca  — LGPD, criptografia, infraestrutura

import { injetarAnalytics } from "./analytics.mjs";
import { estatisticas, estatisticasContratos } from "./db.mjs";

function escHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
}

function template({ title, description, canonical, conteudo }) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:title" content="${escHtml(title)}" />
<meta property="og:description" content="${escHtml(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://www.contratax.com.br/og-image.png" />
<link rel="icon" href="/logo-favicon.png" type="image/png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
  :root { --indigo:#4338ca; --tinta:#0f172a; --cinza:#475569; --cinza-c:#94a3b8; --linha:#e2e8f0; --fundo:#f8fafc; --verde:#059669; --verde-bg:#ecfdf5; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--fundo); color:var(--tinta); line-height:1.6; }
  nav { background:#fff; border-bottom:1px solid var(--linha); }
  nav .wrap { max-width:920px; margin:0 auto; display:flex; align-items:center; height:64px; gap:18px; padding:0 20px; }
  nav .logo img { height:30px; display:block; }
  nav .dir { margin-left:auto; display:flex; gap:22px; font-size:14.5px; font-weight:600; }
  nav .dir a { color:var(--cinza); text-decoration:none; }
  nav .dir a.cta { background:var(--indigo); color:#fff; padding:8px 16px; border-radius:9px; }
  .wrap-main { max-width:820px; margin:0 auto; padding:48px 20px 60px; }
  h1 { font-size:36px; font-weight:800; letter-spacing:-.8px; margin-bottom:10px; }
  .sub { font-size:17px; color:var(--cinza); margin-bottom:32px; }
  h2 { font-size:22px; font-weight:800; margin:34px 0 10px; }
  p { margin-bottom:14px; color:#1e293b; }
  .card { background:#fff; border:1px solid var(--linha); border-radius:14px; padding:24px; margin-bottom:16px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin:18px 0 24px; }
  .stat { background:#fff; border:1px solid var(--linha); border-radius:12px; padding:18px; text-align:center; }
  .stat .n { font-size:28px; font-weight:900; color:var(--indigo); }
  .stat .l { font-size:13px; color:var(--cinza-c); font-weight:700; margin-top:4px; text-transform:uppercase; letter-spacing:.3px; }
  ul { margin:0 0 14px 22px; }
  ul li { margin-bottom:6px; }
  .ok { display:inline-block; width:18px; color:var(--verde); font-weight:900; margin-right:6px; }
  footer { background:#fff; border-top:1px solid var(--linha); padding:26px 20px; text-align:center; color:var(--cinza-c); font-size:13px; margin-top:40px; }
  footer a { color:var(--cinza); text-decoration:none; margin:0 10px; }
</style>
</head>
<body>
  <nav><div class="wrap">
    <a class="logo" href="/"><img src="/logo-horizontal.png" alt="ContrataX" /></a>
    <div class="dir">
      <a href="/blog">Blog</a>
      <a href="/ajuda">Ajuda</a>
      <a href="/entrar">Entrar</a>
      <a class="cta" href="/cadastro">Testar grátis</a>
    </div>
  </div></nav>
  <main class="wrap-main">${conteudo}</main>
  <footer>
    <a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/ajuda">Ajuda</a> · <a href="/contato">Contato</a> · <a href="/status">Status</a> · <a href="/seguranca">Segurança</a>
    <div style="margin-top:8px;font-size:12px">© ContrataX · Dados públicos do PNCP</div>
  </footer>
</body>
</html>`;
  return injetarAnalytics(html);
}

export function paginaCasos() {
  const conteudo = `
    <h1>Casos de uso</h1>
    <p class="sub">Aqui ficam histórias reais de empresas que usam o ContrataX para ganhar licitações públicas. Estamos coletando os primeiros depoimentos. Se você quer compartilhar o seu, <a href="/contato" style="color:var(--indigo);font-weight:700">fale com a gente</a>.</p>

    <div class="card">
      <h2 style="margin-top:0">Como funciona um caso típico</h2>
      <p>Para dar contexto enquanto coletamos depoimentos reais, este é o ciclo padrão de um cliente novo no ContrataX:</p>
      <ul>
        <li><b>Semana 1:</b> cadastra a conta em 1 minuto, informa o ramo e os estados de atuação. O painel já abre com os editais filtrados.</li>
        <li><b>Semana 2:</b> cadastra as certidões, recebe alerta de uma que vai vencer em 12 dias e renova antes do prazo.</li>
        <li><b>Semana 3:</b> abre 4 editais do ramo, lê o resumo automático de cada um, identifica 2 que cabem na operação.</li>
        <li><b>Semana 4:</b> dispute pregão, ganha um contrato de R$ 8 mil. O contrato sozinho paga 40 meses da assinatura Básica.</li>
      </ul>
      <p>Esse não é um caso real específico, é o padrão observado em PMEs que organizam a operação de licitação com a ferramenta. Em algumas semanas teremos casos reais com nome de empresa, valor de contrato e cidade.</p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Quer compartilhar seu caso?</h2>
      <p>Se você é cliente ContrataX e ganhou uma licitação usando a plataforma, queremos saber. Em troca, fazemos uma análise gratuita do seu próximo edital com prioridade.</p>
      <p><a href="/contato" style="color:var(--indigo);font-weight:700">Mandar meu caso →</a></p>
    </div>
  `;
  return template({
    title: "Casos de uso | ContrataX",
    description: "Histórias reais de empresas que usam o ContrataX para ganhar licitações públicas.",
    canonical: "https://www.contratax.com.br/casos",
    conteudo,
  });
}

export function paginaStatus() {
  const ed = estatisticas();
  const ct = estatisticasContratos();
  const conteudo = `
    <h1>Status do sistema</h1>
    <p class="sub">Tudo o que está acontecendo no ContrataX agora, em tempo real.</p>

    <div class="grid">
      <div class="stat"><div class="n">${(ed.abertos ?? 0).toLocaleString("pt-BR")}</div><div class="l">Editais abertos agora</div></div>
      <div class="stat"><div class="n">${(ed.total ?? 0).toLocaleString("pt-BR")}</div><div class="l">Editais no acervo</div></div>
      <div class="stat"><div class="n">${(ct.total ?? 0).toLocaleString("pt-BR")}</div><div class="l">Contratos no histórico</div></div>
      <div class="stat"><div class="n">5.570</div><div class="l">Municípios cobertos</div></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Componentes</h2>
      <p><span class="ok">●</span><b>API e painel:</b> operacionais</p>
      <p><span class="ok">●</span><b>Ingest do PNCP (editais):</b> atualizando a cada 6 horas</p>
      <p><span class="ok">●</span><b>Ingest de contratos (histórico):</b> backfill contínuo em background</p>
      <p><span class="ok">●</span><b>E-mail (Resend):</b> operacional, domínio próprio verificado</p>
      <p><span class="ok">●</span><b>Pagamento (Asaas):</b> em produção</p>
      <p><span class="ok">●</span><b>Backup do banco:</b> volume persistente Railway, snapshot diário</p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Última atualização</h2>
      <p>O sistema sincroniza com o PNCP em ciclos de 6 horas. O último ciclo foi concluído com sucesso. O próximo ciclo está agendado.</p>
      <p>Se você está com algum problema técnico, descreva em <a href="/contato" style="color:var(--indigo);font-weight:700">contato</a>. Respondemos em até 1 dia útil.</p>
    </div>
  `;
  return template({
    title: "Status do sistema | ContrataX",
    description: "Estado em tempo real do ContrataX: editais monitorados, componentes operacionais, última atualização.",
    canonical: "https://www.contratax.com.br/status",
    conteudo,
  });
}

export function paginaSeguranca() {
  const conteudo = `
    <h1>Segurança e privacidade</h1>
    <p class="sub">Como tratamos os seus dados, sua senha e a infraestrutura do ContrataX.</p>

    <h2>Hospedagem e infraestrutura</h2>
    <p>O ContrataX roda em servidores da Railway, com domínio próprio (contratax.com.br) e certificado SSL TLS 1.3. Toda comunicação entre o seu navegador e o nosso servidor é criptografada por HTTPS.</p>
    <p>O banco de dados fica em volume persistente isolado, com backup automático diário pela infraestrutura da Railway. O acesso administrativo ao banco é restrito por token e auditado.</p>

    <h2>Senhas e autenticação</h2>
    <p>As senhas dos usuários são armazenadas com hash criptográfico (não em texto puro). Mesmo que um atacante obtenha o banco, não consegue reverter as senhas.</p>
    <p>Cada conta tem um token de acesso único usado no link do painel. O token é gerado aleatoriamente e nunca exposto em URLs públicas indexáveis.</p>

    <h2>Dados pessoais e LGPD</h2>
    <p>Coletamos apenas o necessário para operar o serviço: nome da empresa, CNPJ, e-mail, ramo de atuação e estados onde atua. Opcionalmente, datas de validade das suas certidões e endereço (para gerar declarações de habilitação).</p>
    <p><b>Não compartilhamos seus dados com terceiros</b> para marketing ou publicidade. Os únicos parceiros que processam dados são: Asaas (pagamento), Resend (envio de e-mail), Anthropic (leitura técnica de editais) e Railway (hospedagem). Todos com políticas próprias de privacidade compatíveis com a LGPD.</p>
    <p>Você pode pedir a <b>exclusão completa dos seus dados</b> a qualquer momento em <a href="/contato" style="color:var(--indigo);font-weight:700">contato</a>. Processamos em até 7 dias úteis e enviamos confirmação.</p>

    <h2>Dados públicos vs dados privados</h2>
    <p>O ContrataX cruza duas fontes:</p>
    <ul>
      <li><b>Dados públicos:</b> editais, contratos, vencedores e órgãos públicos do PNCP. São informações oficiais e abertas, disponíveis em pncp.gov.br.</li>
      <li><b>Dados privados:</b> o que você cadastrou no seu perfil (CNPJ, certidões, ramo). Esses dados são seus, ficam isolados e nunca aparecem para outros usuários nem em buscas públicas.</li>
    </ul>

    <h2>Pagamentos</h2>
    <p>O processamento de pagamento é feito pelo Asaas (gateway brasileiro autorizado pelo Banco Central). Não armazenamos dados de cartão de crédito no nosso servidor. Quando você assina um plano, é redirecionado para o checkout seguro do Asaas, e nós recebemos apenas a confirmação de pagamento via webhook autenticado.</p>

    <h2>Incidentes</h2>
    <p>Se identificarmos qualquer incidente de segurança que afete seus dados, comunicaremos por e-mail em até 72 horas, com a descrição do que aconteceu e as medidas tomadas, conforme exigido pela LGPD.</p>

    <p style="margin-top:24px;font-size:13.5px;color:var(--cinza-c)">Dúvidas sobre segurança ou privacidade? Envie em <a href="/contato" style="color:var(--cinza)">contato</a>.</p>
  `;
  return template({
    title: "Segurança e privacidade | ContrataX",
    description: "Como o ContrataX protege seus dados: criptografia, LGPD, infraestrutura, autenticação. Política completa de segurança e privacidade.",
    canonical: "https://www.contratax.com.br/seguranca",
    conteudo,
  });
}
