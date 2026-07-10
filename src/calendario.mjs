// Geracao de arquivo .ics (iCalendar RFC 5545) para um edital.
// Cria um evento com a data de encerramento + lembretes (3 dias e 1 hora antes).
// Compativel com Google Calendar, Outlook, Apple Calendar e Office 365.

// Formata Date para o formato UTC do iCalendar: YYYYMMDDTHHMMSSZ
function fmt(d) {
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// Escapa caracteres especiais do iCalendar (RFC 5545): \, ;, ,, novas linhas.
function esc(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Dobra linhas longas (>75 octets) com continuacao por espaco — exigencia RFC.
function dobrar(linha) {
  if (linha.length <= 75) return linha;
  const partes = [];
  let resto = linha;
  partes.push(resto.slice(0, 75));
  resto = resto.slice(75);
  while (resto.length > 0) {
    partes.push(" " + resto.slice(0, 74));
    resto = resto.slice(74);
  }
  return partes.join("\r\n");
}

const BASE = process.env.LICITA_BASE_URL || "https://contratax.com.br";

// Monta o .ics para um edital.
//   edital: { id, objeto, encerramento (ISO), orgao, municipio, uf, valorEstimado, link }
// Retorna a string completa pronta pra download.
export function icsEdital(edital) {
  if (!edital?.encerramento) throw new Error("Edital sem data de encerramento");

  const inicio = new Date(edital.encerramento);
  if (isNaN(inicio)) throw new Error("Data de encerramento invalida");
  // Duracao nominal de 1h (so pra reservar tempo no calendario)
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
  const agora = new Date();

  // UID estavel: mesmo edital, mesmo UID — atualizacao no calendario do cliente
  const uid = `${edital.id}@contratax.com.br`;
  const titulo = `[Licitação] ${(edital.objeto || "").slice(0, 80)}`;
  const local = [edital.orgao, edital.municipio, edital.uf].filter(Boolean).join(" - ");

  const valor = edital.valorEstimado
    ? `Valor estimado: R$ ${Number(edital.valorEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`
    : "";
  const link = edital.link ? `Portal: ${edital.link}\n` : "";
  const descricao =
    `${edital.objeto || ""}\n\n` +
    `Órgão: ${edital.orgao || "?"}\n` +
    `Local: ${edital.municipio || "?"}/${edital.uf || "?"}\n` +
    valor +
    link +
    `\nVer detalhes no ContrataX: ${BASE}/painel?id=${edital.id}`;

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ContrataX//Agenda de Licitacoes//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(agora)}`,
    `DTSTART:${fmt(inicio)}`,
    `DTEND:${fmt(fim)}`,
    `SUMMARY:${esc(titulo)}`,
    `LOCATION:${esc(local)}`,
    `DESCRIPTION:${esc(descricao)}`,
    edital.link ? `URL:${edital.link}` : null,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    // Lembrete 1: 3 dias antes
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Licitação encerra em 3 dias, prepare a proposta",
    "TRIGGER:-P3D",
    "END:VALARM",
    // Lembrete 2: 1 hora antes
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Licitação encerra em 1 hora",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

export function nomeIcs(edital) {
  const limpa = (s) => String(s ?? "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const safe = limpa(edital.objeto || "edital").toLowerCase().slice(0, 40);
  const idSafe = limpa(edital.id).slice(0, 20);
  return `contratax-${safe || "edital"}-${idSafe}.ics`;
}
