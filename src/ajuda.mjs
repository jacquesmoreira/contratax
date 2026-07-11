// Central de Ajuda (/ajuda) e pagina de Contato (/contato).
// /ajuda  renderiza o markdown em content/ajuda/central-de-ajuda.md
// /contato e formulario que envia mensagem por e-mail (via Resend) para o suporte.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mdParaHtml } from "./blog.mjs";
import { injetarAnalytics } from "./analytics.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO_AJUDA = resolve(AQUI, "..", "content", "ajuda", "central-de-ajuda.md");

function escHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
}

const SUPORTE = process.env.LICITA_SUPORTE_EMAIL || "suporte@contratax.com.br";

// E-mail de destino para mensagens de suporte do formulario /contato.
// Se nao tiver LICITA_SUPORTE_FORWARD, manda pro proprio suporte@.
const SUPORTE_FORWARD = process.env.LICITA_SUPORTE_FORWARD || SUPORTE;

function frontMatter(texto) {
  const m = texto.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { meta: {}, corpo: texto };
  const meta = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const mm = linha.match(/^(\w+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim();
  }
  return { meta, corpo: m[2] };
}

// Passo a passo visual do painel, com recriacoes fieis (mesmas cores e fontes
// do produto real) em vez de prints de tela: aqui nao ha como tirar screenshot
// de forma confiavel (a ferramenta de preview trava), e uma recriacao em HTML
// fica sempre em dia com o produto (nao envelhece como uma imagem estatica).
// Cada elemento importante tem uma tag numerada, explicada na legenda abaixo.
function passoAPassoHTML() {
  const secoes = [
    {
      id: "seu-painel",
      titulo: "1. Seu painel: os editais do seu ramo chegam sozinhos",
      desc: "Assim que você cadastra o que sua empresa vende, o painel já mostra os editais abertos que combinam. Sem precisar buscar nada.",
      shot: `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <span class="walk-tag">1</span><span style="font-weight:800;font-size:15px;color:#0B1E3A">Material hospitalar</span>
          <span style="background:#EEF0FF;color:#4338CA;font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px">23 editais</span>
          <span style="background:#dcfce7;color:#166534;font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px">🆕 3 novas hoje</span>
        </div>
        <div style="border:1px solid #E4E7F0;border-radius:12px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Florianópolis/SC · Prefeitura Municipal</span>
            <span><span class="walk-tag">2</span><span style="background:#fef3c7;color:#b45309;font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px">NOVO</span></span>
          </div>
          <div style="font-size:13.5px;color:#0B1E3A;line-height:1.4;margin-bottom:10px">Aquisição de material hospitalar e insumos para atendimento na rede municipal de saúde...</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:12px;font-weight:700;color:#475569">Pregão eletrônico</span>
            <span style="font-size:13px;font-weight:800;color:#0B1E3A">R$ 340.000</span>
            <span class="walk-tag">3</span><span style="font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;padding:2px 8px;border-radius:99px">🟢 Oportunidade forte</span>
            <span style="margin-left:auto;display:flex;align-items:center"><span class="walk-tag">4</span><button style="background:none;border:1px solid #E4E7F0;color:#4338CA;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;font-family:inherit">+ Planejamento</button></span>
          </div>
        </div>`,
      legenda: [
        "O ramo que você cadastrou e quantos editais bateram com ele agora, incluindo os que apareceram desde sua última visita.",
        "Selo <b>NOVO</b>, edital que ainda não estava aqui na sua última visita.",
        "Selo de <b>Oportunidade</b> (Forte, Regular ou Avaliar), calculado a partir de sinais reais como reputação de pagamento do órgão. Passe o mouse em cima pra ver o motivo.",
        "Adiciona esse edital ao quadro de <b>Planejamento</b> (item 5 abaixo) pra acompanhar o andamento.",
      ],
    },
    {
      id: "analise-ia",
      titulo: "2. A leitura do edital pela IA",
      desc: "Clique em qualquer edital e a ContrataX.IA lê o documento oficial e te diz, em segundos, se vale a pena.",
      shot: `
        <div style="background:linear-gradient(135deg,#4338ca,#6d28d9);color:#fff;border-radius:12px;padding:16px 18px;margin-bottom:12px">
          <div><span class="walk-tag" style="background:#fff;color:#4338CA">1</span><span style="font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;opacity:.85">Resumo da IA</span></div>
          <div style="font-size:13.5px;margin-top:8px;opacity:.95;line-height:1.5">Objeto: aquisição de seringas e luvas para 12 postos de saúde. Prazo final em 6 dias. Exige atestado de capacidade técnica e não permite ME/EPP em cota exclusiva.</div>
        </div>
        <div style="border:1px solid #E4E7F0;border-radius:12px;padding:14px;margin-bottom:10px">
          <span class="walk-tag">2</span><span style="font-size:13px;font-weight:800;color:#065f46;background:#d1fae5;padding:3px 10px;border-radius:99px">✓ Apto com pendências</span>
          <div style="font-size:12.5px;color:#475569;margin-top:8px">Cruzado com os documentos que você cadastrou (item 4 abaixo). Falta 1 certidão.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="walk-tag">3</span><span style="font-size:12.5px;font-weight:700;color:#475569">6 exigências de habilitação, item a item</span>
          <span style="margin-left:auto"><span class="walk-tag">4</span><span style="font-size:12px;font-weight:700;color:#4338CA">⬇ Baixar edital (PDF oficial do PNCP)</span></span>
        </div>`,
      legenda: [
        "TL;DR do edital: objeto, prazo e pontos de atenção, sem precisar ler o PDF inteiro.",
        "Veredito de aptidão. Diferente de um checklist genérico, aqui a IA cruza o edital com OS SEUS documentos cadastrados e diz se a sua empresa especificamente está apta.",
        "Lista das exigências de habilitação, uma por uma, com o que já está ok e o que falta.",
        "Baixa o PDF oficial direto do PNCP, pra você conferir a fonte original quando quiser.",
      ],
    },
    {
      id: "busca-avulsa",
      titulo: "3. Busca avulsa (fora do seu ramo cadastrado)",
      desc: "Quer investigar algo pontual, fora do que você já monitora sempre? Use a busca livre.",
      shot: `
        <div style="border:1px solid #E4E7F0;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
          <span class="walk-tag">1</span><span style="font-size:13px;color:#94a3b8">papel A4 · Rio Grande do Sul · até R$ 50 mil</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="walk-tag">2</span><span style="font-weight:800;font-size:14px;color:#0B1E3A">7 resultados</span> <span style="color:#64748b;font-size:13px">para "papel A4"</span>
          <span style="margin-left:auto"><span class="walk-tag">3</span><span style="font-size:12.5px;font-weight:700;color:#4338CA">🔔 Monitorar "papel A4"</span></span>
        </div>`,
      legenda: [
        "Busca livre por palavra, cidade, UF, valor, prazo, sem alterar o seu ramo cadastrado.",
        "Quantos editais bateram nesse recorte específico.",
        `<b>Monitorar</b>: se essa busca avulsa valeu a pena, um clique adiciona o termo ao seu ramo (item 6 abaixo), pra passar a receber isso automaticamente por e-mail, sem precisar lembrar de buscar de novo.`,
      ],
    },
    {
      id: "documentos",
      titulo: "4. Documentos e certidões da sua empresa",
      desc: "Cadastre uma vez o que a sua empresa tem, a IA usa isso pra cruzar contra cada edital automaticamente.",
      shot: `
        <div style="border:1px solid #E4E7F0;border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <span><span class="walk-tag">1</span><span style="font-size:13.5px;font-weight:700;color:#0B1E3A">Certidão Negativa Federal</span></span>
          <span style="font-size:11.5px;font-weight:700;color:#166534;background:#dcfce7;padding:3px 9px;border-radius:99px">válida até 12/2026</span>
        </div>
        <div style="border:1px solid #E4E7F0;border-radius:10px;padding:12px 14px">
          <span class="walk-tag">2</span><span style="font-size:13.5px;font-weight:700;color:#0B1E3A">Atestado de capacidade técnica</span>
          <div style="font-size:12.5px;color:#475569;margin-top:4px">Objeto: fornecimento de material hospitalar · Quantidade: 500un · <span class="walk-tag">3</span>Faturamento anual: R$ 1,2mi</div>
        </div>`,
      legenda: [
        "Certidões com data de validade, a ContrataX avisa por e-mail quando alguma estiver perto de vencer.",
        "Atestados de capacidade técnica: objeto e quantidade de cada um, usados pra confirmar se a exigência do edital é atendida de verdade (não é só ter atestado, é ter o atestado certo, na quantidade certa).",
        "Faturamento anual e responsável técnico, usados quando o edital exige qualificação econômico-financeira ou técnica.",
      ],
    },
    {
      id: "planejamento",
      titulo: "5. Planejamento: o funil das licitações que você decidiu perseguir",
      desc: "Um quadro pra acompanhar cada licitação da identificação até o resultado, em vez de ficar só na cabeça ou numa planilha solta.",
      shot: `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="border:1px solid #E4E7F0;border-radius:10px;padding:10px;background:#FAF9F5">
            <div style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:8px"><span class="walk-tag">1</span>Identificada</div>
            <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:8px;font-size:11px;color:#0B1E3A">Prefeitura de Itajaí, material hospitalar</div>
          </div>
          <div style="border:1px solid #E4E7F0;border-radius:10px;padding:10px;background:#FAF9F5">
            <div style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:8px">Elaborando proposta</div>
          </div>
          <div style="border:1px solid #E4E7F0;border-radius:10px;padding:10px;background:#FAF9F5">
            <div style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:8px">Enviada</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:12.5px;color:#475569"><span class="walk-tag">2</span>Arraste o card pra próxima coluna conforme avança &nbsp;·&nbsp; <span class="walk-tag">3</span>Chega aqui pelo botão "+ Planejamento" (item 4 da seção 1)</div>`,
      legenda: [
        "Cada coluna é uma etapa: Identificada → Em análise → Elaborando proposta → Enviada → Aguardando resultado → Encerrada.",
        "Arraste e solte o card pra mover de etapa, sem formulário, sem clique extra.",
        "É o mesmo botão <b>+ Planejamento</b> que aparece em cada edital do seu painel (seção 1) que traz o card pra cá.",
      ],
    },
    {
      id: "ajustar-ramo",
      titulo: "6. Ajustando o que você recebe",
      desc: "Na página Conta, você ajusta a qualquer momento o que define os editais que chegam até você.",
      shot: `
        <div style="margin-bottom:12px">
          <span class="walk-tag">1</span><span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px">O que a sua empresa vende</span>
          <div style="border:1px solid #E4E7F0;border-radius:9px;padding:10px 12px;font-size:13px;color:#0B1E3A;margin-top:4px">material hospitalar, seringa, luva</div>
        </div>
        <div style="margin-bottom:12px">
          <span class="walk-tag">2</span><span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px">Termos sugeridos pela IA</span>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            <span style="background:#fff;border:1px solid #ddd6fe;color:#4338CA;font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:99px">insumo hospitalar</span>
            <span style="background:#fff;border:1px solid #ddd6fe;color:#4338CA;font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:99px">equipamento médico</span>
          </div>
        </div>
        <span class="walk-tag">3</span><span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px">Estados monitorados</span>
        <div style="margin-top:6px;display:flex;gap:6px">
          <span style="background:#4338CA;color:#fff;font-size:12px;font-weight:700;padding:5px 11px;border-radius:99px">SC</span>
          <span style="background:#FAF9F5;border:1.5px solid #E4E7F0;color:#0B1E3A;font-size:12px;font-weight:700;padding:5px 11px;border-radius:99px">PR</span>
        </div>`,
      legenda: [
        "As palavras que definem o que você vende. São elas que trazem os editais certos pro seu painel (seção 1).",
        "Termos relacionados que a ContrataX.IA sugere sozinha, pra ampliar sem fugir do seu ramo. Transparente: você vê exatamente por que recebe cada edital, e pode remover o que não fizer sentido.",
        "Os estados que você acompanha. Se o seu estado tiver poucos editais do seu ramo, o painel amplia pro Brasil todo sozinho, e avisa quando isso acontece.",
      ],
    },
  ];

  const nav = `<div class="walk-nav">${secoes.map((s) => `<a href="#${s.id}">${escHtml(s.titulo.replace(/^\d+\.\s*/, ""))}</a>`).join("")}</div>`;

  const corpo = secoes.map((s) => `
    <div class="walk-secao" id="${s.id}">
      <h2>${escHtml(s.titulo)}</h2>
      <p class="walk-desc">${s.desc}</p>
      <div class="walk-shot">${s.shot}</div>
      <ol class="walk-legenda">${s.legenda.map((l, i) => `<li><span class="walk-num">${i + 1}</span><span>${l}</span></li>`).join("")}</ol>
    </div>`).join("");

  return `<section style="margin-bottom:12px">
    <h2 style="font-family:'Manrope',sans-serif;font-size:24px;font-weight:800;margin-bottom:6px;color:#0B1E3A">Como funciona o painel, passo a passo</h2>
    <p style="font-size:14.5px;color:#475569;margin-bottom:18px">As telas abaixo mostram o produto de verdade, com cada botão numerado e explicado. Se preferir texto corrido, as perguntas frequentes continuam logo abaixo.</p>
    ${nav}
    ${corpo}
  </section>`;
}

export async function renderizarAjuda(baseUrl) {
  const texto = await readFile(ARQUIVO_AJUDA, "utf8");
  const { meta, corpo } = frontMatter(texto);
  const html = mdParaHtml(corpo);
  return template({
    title: (meta.title || "Central de Ajuda") + " | ContrataX",
    description: meta.description || "Tudo o que você precisa saber para usar o ContrataX.",
    canonical: `${baseUrl}/ajuda`,
    conteudo: `
      <header style="margin-bottom:32px">
        <h1 style="font-size:36px;letter-spacing:-.8px;margin-bottom:8px">${escHtml(meta.title || "Central de Ajuda")}</h1>
        <p style="font-size:16px;color:#475569">${escHtml(meta.description || "")}</p>
      </header>
      ${passoAPassoHTML()}
      <article class="post"><div class="conteudo-post">${html}</div></article>
      <div style="background:linear-gradient(135deg,#4338ca,#2563eb);color:#fff;border-radius:16px;padding:24px;margin-top:36px;text-align:center">
        <div style="font-size:18px;font-weight:800;margin-bottom:6px">Não achou a resposta?</div>
        <p style="color:#c7d2fe;font-size:14.5px;margin-bottom:14px">Fale com a gente, respondemos em até 1 dia útil.</p>
        <a href="/contato" style="display:inline-block;background:#fff;color:#4338ca;font-weight:800;padding:11px 22px;border-radius:11px;text-decoration:none">Abrir contato →</a>
      </div>`,
  });
}

export async function renderizarContato(baseUrl, { token = "", erro = "", sucesso = false } = {}) {
  return template({
    title: "Fale com a gente | ContrataX",
    description: "Envie sua mensagem para o suporte do ContrataX. Respondemos em até 1 dia útil.",
    canonical: `${baseUrl}/contato`,
    conteudo: sucesso ? `
      <div style="background:#DCFCE7;border:1px solid #a7f3d0;border-radius:14px;padding:30px;text-align:center;max-width:540px;margin:0 auto">
        <div style="font-size:48px;margin-bottom:10px">✓</div>
        <h1 style="font-size:24px;font-weight:800;color:#047857;margin-bottom:8px">Mensagem enviada!</h1>
        <p style="color:#475569;font-size:15px;margin-bottom:18px">Recebemos sua mensagem e vamos responder em até 1 dia útil no e-mail que você informou.</p>
        <a href="/" style="display:inline-block;background:#4338ca;color:#fff;font-weight:700;padding:11px 22px;border-radius:11px;text-decoration:none">Voltar para o início</a>
      </div>
    ` : `
      <header style="margin-bottom:24px;text-align:center">
        <h1 style="font-size:34px;letter-spacing:-.8px;margin-bottom:8px">Fale com a gente</h1>
        <p style="font-size:16px;color:#475569;max-width:560px;margin:0 auto">Respondemos em até <b>1 dia útil</b> no e-mail que você informar. Pra dúvidas comuns, dá uma olhada antes na <a href="/ajuda" style="color:#4338ca;font-weight:700">Central de Ajuda</a>.</p>
      </header>
      ${erro ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:12px 16px;border-radius:10px;margin:0 auto 18px;max-width:560px;font-size:14px;font-weight:600">${escHtml(erro)}</div>` : ""}
      <form method="POST" action="/contato" style="background:#fff;border:1px solid #E4E7F0;border-radius:16px;padding:28px;max-width:560px;margin:0 auto;box-shadow:0 12px 36px rgba(15,23,42,.06)">
        <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Seu e-mail</label>
        <input name="email" type="email" required placeholder="voce@empresa.com.br" style="width:100%;padding:13px 14px;border:1.5px solid #E4E7F0;border-radius:10px;font-size:15px;font-family:inherit;outline:none;margin-bottom:18px" />

        <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Assunto</label>
        <select name="assunto" required style="width:100%;padding:13px 14px;border:1.5px solid #E4E7F0;border-radius:10px;font-size:15px;font-family:inherit;outline:none;margin-bottom:18px;background:#fff">
          <option value="">Selecione...</option>
          <option value="Dúvida sobre plano ou pagamento">Dúvida sobre plano ou pagamento</option>
          <option value="Problema técnico">Problema técnico</option>
          <option value="Dúvida sobre um edital">Dúvida sobre um edital</option>
          <option value="Sugestão de melhoria">Sugestão de melhoria</option>
          <option value="Quero falar com vocês">Quero falar com vocês</option>
        </select>

        <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Mensagem</label>
        <textarea name="mensagem" required rows="6" placeholder="Conte o que está acontecendo..." style="width:100%;padding:13px 14px;border:1.5px solid #E4E7F0;border-radius:10px;font-size:15px;font-family:inherit;outline:none;resize:vertical;margin-bottom:18px"></textarea>

        ${token ? `<input type="hidden" name="token" value="${escHtml(token)}" />` : ""}
        <button type="submit" style="width:100%;background:#4338ca;color:#fff;border:none;padding:14px;border-radius:11px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">Enviar mensagem</button>
        <div style="font-size:12px;color:#94a3b8;margin-top:12px;text-align:center">Ao enviar, você concorda em receber nossa resposta no e-mail informado.</div>
      </form>
    `,
  });
}

// Recebe o POST /contato e dispara o e-mail pro suporte
export async function processarContato({ email, assunto, mensagem, token, meta = {} }) {
  if (!email || !/.+@.+\..+/.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!assunto?.trim()) return { ok: false, erro: "Selecione um assunto." };
  if (!mensagem?.trim() || mensagem.trim().length < 10) return { ok: false, erro: "Escreva uma mensagem com pelo menos 10 caracteres." };

  if (!temEmailKey()) {
    // Sem RESEND configurado: nao da pra enviar; reporta sucesso mas loga (modo dev/preview)
    console.log("[contato] (sem RESEND_API_KEY) De:", email, "| Assunto:", assunto);
    console.log("[contato] Mensagem:", mensagem);
    return { ok: true, modo: "preview" };
  }

  const linhasMeta = [];
  if (token) linhasMeta.push(`Token do cliente: ${token}`);
  if (meta.painel) linhasMeta.push(`Origem: painel`);
  if (meta.userAgent) linhasMeta.push(`Navegador: ${meta.userAgent}`);
  if (meta.url) linhasMeta.push(`URL: ${meta.url}`);

  const html = `
    <div style="font-family:'Public Sans',sans-serif;max-width:560px;margin:0 auto;padding:20px">
      <h2 style="font-size:18px;font-weight:800;color:#0B1E3A;margin-bottom:12px">Novo contato, ContrataX</h2>
      <p style="font-size:14px;color:#475569;margin-bottom:8px"><b>De:</b> ${escHtml(email)}</p>
      <p style="font-size:14px;color:#475569;margin-bottom:14px"><b>Assunto:</b> ${escHtml(assunto)}</p>
      <div style="background:#FAF9F5;border-left:4px solid #4338ca;padding:14px 18px;border-radius:0 8px 8px 0;white-space:pre-wrap;font-size:14.5px;color:#1e293b;line-height:1.55">${escHtml(mensagem)}</div>
      ${linhasMeta.length ? `<div style="font-size:12px;color:#94a3b8;margin-top:16px">${linhasMeta.map(l => escHtml(l)).join("<br>")}</div>` : ""}
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">Para responder, basta clicar em Responder no seu e-mail, o endereço de retorno é do cliente.</p>
    </div>`;

  try {
    await enviar({
      para: SUPORTE_FORWARD,
      assunto: `[ContrataX] ${assunto}, ${email}`,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[contato] erro ao enviar:", e.message);
    return { ok: false, erro: "Não conseguimos enviar agora. Tente novamente em alguns minutos." };
  }
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
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Public+Sans:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { --indigo:#4338ca; --tinta:#0B1E3A; --cinza:#475569; --cinza-c:#94a3b8; --linha:#E4E7F0; --fundo:#FAF9F5; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Public Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--fundo); color:var(--tinta); }
  h1,h2,h3 { font-family:'Manrope','Public Sans',sans-serif; }
  nav { background:rgba(250,249,245,.85); backdrop-filter:blur(10px); border-bottom:1px solid var(--linha); }
  nav .wrap { max-width:920px; margin:0 auto; display:flex; align-items:center; height:64px; gap:18px; padding:0 20px; }
  nav .logo img { height:30px; display:block; }
  nav .dir { margin-left:auto; display:flex; gap:22px; font-size:14.5px; font-weight:600; }
  nav .dir a { color:var(--cinza); text-decoration:none; }
  nav .dir a.cta { background:var(--indigo); color:#fff; padding:8px 16px; border-radius:9px; }
  .wrap-main { max-width:760px; margin:0 auto; padding:42px 20px 60px; }
  .post .conteudo-post { font-family:"Lora", Georgia, serif; font-size:16.5px; line-height:1.7; color:#1e293b; }
  .conteudo-post h2 { font-family:'Manrope',sans-serif; font-size:22px; font-weight:800; margin:34px 0 10px; letter-spacing:-.2px; color:#0B1E3A; padding-bottom:8px; border-bottom:2px solid #EEF0FF; }
  .conteudo-post h3 { font-family:'Manrope',sans-serif; font-size:17px; font-weight:800; margin:22px 0 6px; color:#0B1E3A; }
  .conteudo-post p { margin-bottom:14px; }
  .conteudo-post ul, .conteudo-post ol { margin:0 0 14px 22px; }
  .conteudo-post li { margin-bottom:5px; }
  .conteudo-post a { color:var(--indigo); font-weight:600; }
  .conteudo-post strong { color:#0B1E3A; font-weight:700; }
  footer { background:#fff; border-top:1px solid var(--linha); padding:24px 20px; text-align:center; color:var(--cinza-c); font-size:13px; }
  footer a { color:var(--cinza); text-decoration:none; margin:0 10px; }
  .walk-nav { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:36px; }
  .walk-nav a { font-size:13px; font-weight:700; color:var(--indigo); text-decoration:none; background:#EEF0FF; padding:7px 13px; border-radius:99px; }
  .walk-secao { margin-bottom:40px; scroll-margin-top:20px; }
  .walk-secao h2 { font-family:'Manrope',sans-serif; font-size:19px; font-weight:800; margin-bottom:5px; color:#0B1E3A; letter-spacing:-.2px; }
  .walk-secao .walk-desc { font-size:14px; color:#475569; margin-bottom:16px; }
  .walk-shot { position:relative; background:#fff; border:1px solid var(--linha); border-radius:14px; padding:18px 20px; box-shadow:0 8px 24px rgba(15,23,42,.06); }
  .walk-tag { display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px; border-radius:50%; background:var(--indigo); color:#fff; font-size:10px; font-weight:800; margin-right:5px; vertical-align:middle; flex-shrink:0; font-family:'Public Sans',sans-serif; }
  .walk-legenda { list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:9px; }
  .walk-legenda li { display:flex; gap:10px; align-items:flex-start; font-size:14px; color:#1e293b; line-height:1.5; }
  .walk-legenda .walk-num { flex-shrink:0; margin-top:1px; width:20px; height:20px; border-radius:50%; background:#EEF0FF; color:var(--indigo); font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; }
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
    <a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/ajuda">Ajuda</a> · <a href="/contato">Contato</a> · <a href="/cadastro">Cadastro</a>
    <div style="margin-top:8px;font-size:12px">© ContrataX · Dados públicos do PNCP</div>
  </footer>
</body>
</html>`;
  return injetarAnalytics(html);
}
