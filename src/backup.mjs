// Backup off-site automatico do banco SQLite + perfis.json.
//
// O que faz: 1x por dia (LICITA_BACKUP=1) gera um snapshot consistente do
// banco (VACUUM INTO, sem travar leituras), gzipa, salva em DATA_DIR/backups/
// e envia um RESUMO por e-mail pro Jacques com link de download protegido por
// token de admin. Mantem so os ultimos N snapshots locais (default 7).
//
// Por que: o volume Railway pode falhar, ser perdido em uma migracao, ou ter
// corrupcao silenciosa. Backup off-site (e-mail) e a copia que sobrevive a
// qualquer problema da infra.
//
// Restauracao: baixa o .db.gz do e-mail, descompacta, sobe pro volume como
// licita.db. Pronto.

import { resolve } from "node:path";
import { mkdir, readFile, writeFile, readdir, unlink, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, PERFIS } from "./caminhos.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const BACKUP_DIR = resolve(DATA_DIR, "backups");
const MANTER = Number(process.env.LICITA_BACKUP_MANTER || 7);
const ADMIN_EMAIL = process.env.LICITA_CONTATO || "contato@contratax.com.br";
const BASE = process.env.LICITA_BASE_URL || "https://www.contratax.com.br";

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function brl(n) {
  return (Number(n) || 0).toLocaleString("pt-BR");
}
function tamanhoLegivel(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

async function sha256Arquivo(caminho) {
  const buf = await readFile(caminho);
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

// Cria snapshot do banco via VACUUM INTO (consistente, sem lock prolongado).
async function snapshotBanco(destino) {
  const dbOrigem = resolve(DATA_DIR, "licita.db");
  const db = new DatabaseSync(dbOrigem, { readOnly: true });
  try {
    // VACUUM INTO precisa de path absoluto e em formato POSIX no SQL.
    const safe = destino.replace(/\\/g, "/").replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safe}'`);
  } finally {
    db.close();
  }
}

// Gzipa um arquivo. Retorna caminho do gz.
async function gzip(origem) {
  const destino = origem + ".gz";
  await pipeline(createReadStream(origem), createGzip({ level: 9 }), createWriteStream(destino));
  return destino;
}

// Apaga snapshots antigos, mantendo os MANTER mais recentes. Tambem remove
// orfaos: snapshots .db soltos (sobra de gzip que falhou) que antes ficavam
// pra sempre no volume (45MB cada) e iam enchendo o disco.
async function limparAntigos() {
  try {
    const nomes = await readdir(BACKUP_DIR);

    // Remove .db soltos (sem o .gz correspondente) = orfaos de gzip incompleto
    const gzBases = new Set(nomes.filter((n) => n.endsWith(".db.gz")).map((n) => n.replace(/\.gz$/, "")));
    for (const n of nomes.filter((n) => n.endsWith(".db") && !gzBases.has(n))) {
      try { await unlink(resolve(BACKUP_DIR, n)); } catch {}
    }

    // Poda por tipo (.gz e perfis-*.json), mantendo os MANTER mais recentes
    for (const filtro of [(n) => n.endsWith(".gz"), (n) => /^perfis-.*\.json$/.test(n)]) {
      const arquivos = nomes.filter(filtro).map((n) => resolve(BACKUP_DIR, n));
      if (arquivos.length <= MANTER) continue;
      const ordenados = await Promise.all(
        arquivos.map(async (c) => ({ c, m: (await stat(c)).mtimeMs })),
      );
      ordenados.sort((a, b) => b.m - a.m);
      for (const x of ordenados.slice(MANTER)) {
        try { await unlink(x.c); } catch {}
      }
    }
  } catch {}
}

// Conta total de registros em algumas tabelas pro relatorio do e-mail.
function resumoBanco() {
  try {
    const db = new DatabaseSync(resolve(DATA_DIR, "licita.db"), { readOnly: true });
    try {
      const totais = {};
      for (const t of ["contratacoes", "contratos", "empresas"]) {
        try {
          const r = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
          totais[t] = r?.n || 0;
        } catch { totais[t] = null; }
      }
      return totais;
    } finally { db.close(); }
  } catch { return {}; }
}

// Executa o backup: snapshot + gzip + email com resumo. Retorna metadados.
export async function rodarBackup() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const data = ymd();
  const nomeBase = `contratax-${data}.db`;
  const snapPath = resolve(BACKUP_DIR, nomeBase);
  const perfisCopia = resolve(BACKUP_DIR, `perfis-${data}.json`);

  // 1) Snapshot do SQLite
  await snapshotBanco(snapPath);
  const gzPath = await gzip(snapPath);
  await unlink(snapPath).catch(() => {});

  // 2) Copia perfis.json
  try {
    const perfisRaw = await readFile(PERFIS, "utf8");
    await writeFile(perfisCopia, perfisRaw, "utf8");
  } catch {}

  // 3) Metadados
  const stGz = await stat(gzPath);
  const checksum = await sha256Arquivo(gzPath);
  const totais = resumoBanco();
  let totalPerfis = 0;
  try { totalPerfis = JSON.parse(await readFile(PERFIS, "utf8")).length || 0; } catch {}

  await limparAntigos();

  return {
    data,
    arquivo: gzPath,
    tamanho: stGz.size,
    checksum,
    totais,
    totalPerfis,
  };
}

// E-mail diario com resumo + link de download. O link exige token admin.
async function enviarResumo(meta, adminToken) {
  if (!temEmailKey()) return;
  const link = `${BASE}/admin/backup/${meta.data}?t=${encodeURIComponent(adminToken)}`;
  const tot = meta.totais || {};
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f172a;color:#fff;padding:20px 26px">
<div style="font-size:13px;color:#a5b4fc;font-weight:700;letter-spacing:.5px">BACKUP DIARIO</div>
<div style="font-size:20px;font-weight:800;margin-top:4px">ContrataX, ${meta.data}</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#0f172a;font-size:14.5px;line-height:1.6">
<p>Snapshot do banco gerado com sucesso.</p>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px;margin:14px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
<tr><td style="padding:10px 14px;background:#f8fafc;width:50%;color:#64748b">Tamanho do arquivo</td><td style="padding:10px 14px;font-weight:700">${tamanhoLegivel(meta.tamanho)}</td></tr>
<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">SHA-256 (16 chars)</td><td style="padding:10px 14px;font-family:monospace;font-size:12.5px">${meta.checksum}</td></tr>
<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Perfis (clientes)</td><td style="padding:10px 14px;font-weight:700">${brl(meta.totalPerfis)}</td></tr>
${tot.contratacoes != null ? `<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Contratacoes</td><td style="padding:10px 14px;font-weight:700">${brl(tot.contratacoes)}</td></tr>` : ""}
${tot.contratos != null ? `<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Contratos</td><td style="padding:10px 14px;font-weight:700">${brl(tot.contratos)}</td></tr>` : ""}
${tot.empresas != null ? `<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Empresas</td><td style="padding:10px 14px;font-weight:700">${brl(tot.empresas)}</td></tr>` : ""}
</table>
<table cellpadding="0" cellspacing="0" border="0" style="margin:18px 0"><tr><td align="center">
<a href="${link}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:11px">Baixar backup</a>
</td></tr></table>
<p style="font-size:12.5px;color:#64748b">Guarde este e-mail. Em caso de problema com o volume Railway, baixe daqui e restaure no novo servidor.</p>
<p style="font-size:12.5px;color:#64748b">Restauracao: <code>gunzip contratax-${meta.data}.db.gz</code> e suba o .db para o volume como <code>licita.db</code>.</p>
</td></tr></table></td></tr></table></body></html>`;
  await enviar({ para: ADMIN_EMAIL, assunto: `[ContrataX] Backup ${meta.data} (${tamanhoLegivel(meta.tamanho)})`, html });
}

// Loop in-process: dispara 1x por dia no horario alvo (default 03:00 BR).
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function msAteProximoHorario(horaBR = 3) {
  const horaUTC = (horaBR + 3) % 24;
  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setUTCHours(horaUTC, 0, 0, 0);
  if (alvo <= agora) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo - agora;
}

export async function backupLoop({ adminToken } = {}) {
  const horaBR = Number(process.env.LICITA_BACKUP_HORA || 3);
  console.log(`[backup] loop ativado (hora alvo BR=${horaBR}, manter=${MANTER})`);
  while (true) {
    const ms = msAteProximoHorario(horaBR);
    await dormir(ms);
    try {
      const meta = await rodarBackup();
      console.log(`[backup] ok ${meta.data} ${tamanhoLegivel(meta.tamanho)} sha=${meta.checksum}`);
      await enviarResumo(meta, adminToken).catch((e) => console.error("[backup email]", e.message));
    } catch (e) {
      console.error("[backup]", e.message);
    }
  }
}

// Para servir o download: localiza o arquivo .db.gz por data.
export function caminhoBackup(data) {
  return resolve(BACKUP_DIR, `contratax-${data}.db.gz`);
}

// ===== Diagnostico e limpeza de disco (pra investigar volume cheio) =====

// Lista todos os arquivos do volume de dados (1 nivel + subpasta backups),
// com tamanho, ordenado do maior pro menor. Inclui o WAL/SHM do SQLite, que
// e o suspeito numero 1 de inchar quando o processo morre sem checkpoint.
export async function diagnosticoDisco() {
  const itens = [];
  async function varrer(dir, prefixo) {
    let nomes = [];
    try { nomes = await readdir(dir); } catch { return; }
    for (const n of nomes) {
      const caminho = resolve(dir, n);
      try {
        const st = await stat(caminho);
        if (st.isDirectory()) {
          await varrer(caminho, prefixo + n + "/");
        } else {
          itens.push({ arquivo: prefixo + n, bytes: st.size });
        }
      } catch {}
    }
  }
  await varrer(DATA_DIR, "");
  itens.sort((a, b) => b.bytes - a.bytes);
  const total = itens.reduce((s, x) => s + x.bytes, 0);
  return {
    total,
    totalLegivel: tamanhoLegivel(total),
    arquivos: itens.map((x) => ({ ...x, legivel: tamanhoLegivel(x.bytes) })),
  };
}

// Limpeza de emergencia do volume. Faz, em ordem:
// 1) WAL checkpoint TRUNCATE: zera o arquivo licita.db-wal (principal causa de
//    inchaco quando o processo cai sem checkpoint limpo).
// 2) Remove snapshots de backup ORFAOS (contratax-*.db sem .gz, sobra de um
//    gzip que falhou) e copias de perfis antigas (perfis-*.json) alem do MANTER.
// 3) VACUUM no banco pra recuperar paginas livres (opcional, mais lento).
// Retorna antes/depois pra mostrar quanto liberou.
export async function limparDisco({ vacuum = false } = {}) {
  const antes = await diagnosticoDisco();
  const acoes = [];

  // 1) PRIMEIRO remove orfaos (deletes puros, liberam espaco na hora). Num
  // volume 100% cheio, isso da o respiro necessario pro checkpoint do passo 2.
  try {
    const nomes = await readdir(BACKUP_DIR).catch(() => []);
    const gzBases = new Set(nomes.filter((n) => n.endsWith(".db.gz")).map((n) => n.replace(/\.gz$/, "")));
    let removidos = 0, bytesLiberados = 0;
    for (const n of nomes) {
      // .db solto (sem o .gz correspondente) = orfao de gzip que falhou
      if (n.endsWith(".db") && !gzBases.has(n)) {
        const c = resolve(BACKUP_DIR, n);
        try { bytesLiberados += (await stat(c)).size; await unlink(c); removidos++; } catch {}
      }
    }
    // perfis-*.json: mantem so os MANTER mais recentes
    const perfisJson = nomes.filter((n) => /^perfis-.*\.json$/.test(n)).map((n) => resolve(BACKUP_DIR, n));
    if (perfisJson.length > MANTER) {
      const ord = await Promise.all(perfisJson.map(async (c) => ({ c, m: (await stat(c)).mtimeMs })));
      ord.sort((a, b) => b.m - a.m);
      for (const x of ord.slice(MANTER)) {
        try { bytesLiberados += (await stat(x.c)).size; await unlink(x.c); removidos++; } catch {}
      }
    }
    acoes.push(`orfaos removidos: ${removidos} (${tamanhoLegivel(bytesLiberados)})`);
  } catch (e) { acoes.push(`limpeza de orfaos falhou: ${e.message}`); }

  // 2) Checkpoint do WAL (TRUNCATE zera o licita.db-wal apos aplicar). Roda
  // depois dos orfaos pra ter espaco. VACUUM so se pedido (precisa de espaco).
  try {
    const db = new DatabaseSync(resolve(DATA_DIR, "licita.db"));
    try {
      db.exec("PRAGMA journal_mode = WAL;");
      const r = db.prepare("PRAGMA wal_checkpoint(TRUNCATE);").get();
      acoes.push(`wal_checkpoint(TRUNCATE): ${JSON.stringify(r)}`);
      if (vacuum) { db.exec("VACUUM;"); acoes.push("VACUUM concluido"); }
    } finally { db.close(); }
  } catch (e) { acoes.push(`checkpoint/vacuum falhou: ${e.message}`); }

  const depois = await diagnosticoDisco();
  return {
    acoes,
    antes: antes.totalLegivel,
    depois: depois.totalLegivel,
    liberado: tamanhoLegivel(Math.max(0, antes.total - depois.total)),
    arquivos: depois.arquivos.slice(0, 15),
  };
}
