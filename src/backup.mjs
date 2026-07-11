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
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile, readdir, unlink, stat, statfs } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, PERFIS } from "./caminhos.mjs";
import { enviar, temEmailKey } from "./email.mjs";

// Pasta LEGADA de backups DENTRO do volume. Era aqui que o backup antigo
// guardava snapshots do banco INTEIRO (centenas de MB) — a causa do volume de
// 5GB encher. A politica nova NAO grava nada de backup no volume; esta pasta so
// existe pra ser ESVAZIADA (limpa o legado e libera disco).
const VOLUME_BACKUP_DIR = resolve(DATA_DIR, "backups");
// Onde o dump transitorio e gerado: disco EFEMERO do container (/tmp), NUNCA o
// volume persistente. Some no restart — e isso e proposital, o backup vai por
// e-mail (anexo) e nao precisa sobreviver no disco.
const TMP_DIR = resolve(tmpdir(), "contratax-backup");
// Destino do backup off-site (anexo no e-mail) e dos alertas de volume. Caixa
// dedicada pra backup; sobrescreva com LICITA_BACKUP_EMAIL se quiser.
const ADMIN_EMAIL = process.env.LICITA_BACKUP_EMAIL || "licitacontratax@gmail.com";
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

// ESVAZIA a pasta de backups do volume. A politica nova nao guarda backup no
// volume (vai por e-mail), entao qualquer arquivo aqui e legado e pode sair —
// e o que libera disco quando o volume enche. Devolve quantos bytes liberou.
async function limparAntigos() {
  let liberado = 0;
  try {
    const nomes = await readdir(VOLUME_BACKUP_DIR);
    for (const n of nomes) {
      const caminho = resolve(VOLUME_BACKUP_DIR, n);
      try {
        const st = await stat(caminho);
        if (st.isFile()) { await unlink(caminho); liberado += st.size; }
      } catch {}
    }
  } catch {}
  return liberado;
}

// Dump das tabelas INSUBSTITUIVEIS (dado de cliente). O acervo do PNCP (editais,
// contratos, pca, precos) NAO entra: e publico e re-coletavel a qualquer hora.
// Resultado: um JSON pequeno (KB a poucos MB) que cabe em anexo de e-mail.
function dumpClientes() {
  const db = new DatabaseSync(resolve(DATA_DIR, "licita.db"), { readOnly: true });
  const out = { geradoEm: new Date().toISOString(), tabelas: {} };
  try {
    for (const t of ["perfis", "notas_fiscais", "contratos_meus"]) {
      try { out.tabelas[t] = db.prepare(`SELECT * FROM ${t}`).all(); }
      catch { out.tabelas[t] = null; }
    }
  } finally { db.close(); }
  // perfis.json tambem (copia de seguranca redundante do arquivo).
  return out;
}

// Conta total de registros em algumas tabelas pro relatorio do e-mail.
function resumoBanco() {
  try {
    const db = new DatabaseSync(resolve(DATA_DIR, "licita.db"), { readOnly: true });
    try {
      const totais = {};
      for (const t of ["editais", "contratos", "perfis"]) {
        try {
          const r = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
          totais[t] = r?.n || 0;
        } catch { totais[t] = null; }
      }
      return totais;
    } finally { db.close(); }
  } catch { return {}; }
}

// Executa o backup: dump pequeno de CLIENTES (gerado em /tmp, fora do volume),
// gzipado e devolvido como buffer pra ir ANEXO no e-mail. Esvazia tambem a
// pasta de backups legada do volume. Retorna metadados + o buffer do anexo.
export async function rodarBackup() {
  await mkdir(TMP_DIR, { recursive: true });
  const data = ymd();

  // 1) Dump do dado de cliente (insubstituivel) + perfis.json redundante.
  const dump = dumpClientes();
  try { dump.perfisJson = JSON.parse(await readFile(PERFIS, "utf8")); } catch { dump.perfisJson = null; }
  const json = Buffer.from(JSON.stringify(dump), "utf8");
  const buffer = gzipSync(json, { level: 9 });

  // 2) Grava uma copia transitoria em /tmp (efemero) pro endpoint de download.
  const nomeArquivo = `contratax-clientes-${data}.json.gz`;
  const gzPath = resolve(TMP_DIR, nomeArquivo);
  try { await writeFile(gzPath, buffer); } catch {}

  // 3) Metadados + libera a pasta de backups legada do volume (o que enchia).
  const checksum = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const totais = resumoBanco();
  const totalPerfis = (dump.tabelas?.perfis?.length) || (Array.isArray(dump.perfisJson) ? dump.perfisJson.length : 0);
  const liberadoVolume = await limparAntigos();

  return {
    data,
    arquivo: gzPath,
    nomeArquivo,
    tamanho: buffer.length,
    buffer,
    checksum,
    totais,
    totalPerfis,
    liberadoVolume,
  };
}

// E-mail diario com resumo + link de download. O link exige token admin.
async function enviarResumo(meta) {
  if (!temEmailKey()) return;
  const tot = meta.totais || {};
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f172a;color:#fff;padding:20px 26px">
<div style="font-size:13px;color:#a5b4fc;font-weight:700;letter-spacing:.5px">BACKUP DIARIO (CLIENTES)</div>
<div style="font-size:20px;font-weight:800;margin-top:4px">ContrataX, ${meta.data}</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#0f172a;font-size:14.5px;line-height:1.6">
<p><b>O backup do dado de cliente está anexado neste e-mail</b> (${meta.nomeArquivo}). Guarde o e-mail, é a sua cópia off-site, sobrevive a qualquer problema do volume.</p>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px;margin:14px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
<tr><td style="padding:10px 14px;background:#f8fafc;width:50%;color:#64748b">Anexo</td><td style="padding:10px 14px;font-weight:700">${tamanhoLegivel(meta.tamanho)}</td></tr>
<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">SHA-256 (16 chars)</td><td style="padding:10px 14px;font-family:monospace;font-size:12.5px">${meta.checksum}</td></tr>
<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Perfis (clientes)</td><td style="padding:10px 14px;font-weight:700">${brl(meta.totalPerfis)}</td></tr>
${tot.editais != null ? `<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Editais (acervo PNCP)</td><td style="padding:10px 14px;font-weight:700">${brl(tot.editais)}</td></tr>` : ""}
${tot.contratos != null ? `<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Contratos (acervo PNCP)</td><td style="padding:10px 14px;font-weight:700">${brl(tot.contratos)}</td></tr>` : ""}
${meta.liberadoVolume ? `<tr><td style="padding:10px 14px;background:#f8fafc;color:#64748b">Liberado do volume</td><td style="padding:10px 14px;font-weight:700">${tamanhoLegivel(meta.liberadoVolume)}</td></tr>` : ""}
</table>
<p style="font-size:12.5px;color:#64748b">O acervo público do PNCP (editais/contratos) NÃO entra no backup de propósito: é re-coletável a qualquer momento. O que importa (contas, recebíveis e contratos dos clientes) está no anexo.</p>
<p style="font-size:12.5px;color:#64748b">Restauração: descompacte o .gz e reimporte o JSON (tabelas perfis/notas_fiscais/contratos_meus + perfisJson).</p>
</td></tr></table></td></tr></table></body></html>`;
  await enviar({
    para: ADMIN_EMAIL,
    assunto: `[ContrataX] Backup ${meta.data} (${tamanhoLegivel(meta.tamanho)})`,
    html,
    anexos: [{ filename: meta.nomeArquivo, content: meta.buffer }],
  });
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

export async function backupLoop() {
  const horaBR = Number(process.env.LICITA_BACKUP_HORA || 3);
  console.log(`[backup] loop ativado (hora alvo BR=${horaBR}; backup de clientes off-site por e-mail, nada no volume)`);
  while (true) {
    const ms = msAteProximoHorario(horaBR);
    await dormir(ms);
    try {
      const meta = await rodarBackup();
      console.log(`[backup] ok ${meta.data} ${tamanhoLegivel(meta.tamanho)} sha=${meta.checksum} (liberou ${tamanhoLegivel(meta.liberadoVolume)} do volume)`);
      await enviarResumo(meta).catch((e) => console.error("[backup email]", e.message));
      // Checagem diaria do volume: alerta o admin se passar do limiar (~80%).
      await verificarDisco().catch((e) => console.error("[disco]", e.message));
    } catch (e) {
      console.error("[backup]", e.message);
    }
  }
}

// Para servir o download (copia transitoria em /tmp; o backup real vai por e-mail).
export function caminhoBackup(data) {
  return resolve(TMP_DIR, `contratax-clientes-${data}.json.gz`);
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

  // 1) PRIMEIRO esvazia a pasta de backups legada do volume (deletes puros,
  // liberam espaco na hora). Num volume 100% cheio, isso da o respiro necessario
  // pro checkpoint do passo 2. A politica nova nao guarda backup no volume.
  try {
    const liberado = await limparAntigos();
    acoes.push(`backups legados do volume removidos (${tamanhoLegivel(liberado)})`);
  } catch (e) { acoes.push(`poda falhou: ${e.message}`); }

  // 1b) Poda contratos antigos (fora da janela do historico). So MARCA paginas
  // como livres; o espaco so volta pro disco com o VACUUM (passo 3, vacuum:true).
  try {
    const { podarContratosAntigos } = await import("./db.mjs");
    const podados = podarContratosAntigos();
    acoes.push(`contratos antigos podados: ${podados}`);
  } catch (e) { acoes.push(`poda contratos falhou: ${e.message}`); }

  // 2) Checkpoint do WAL (TRUNCATE zera o licita.db-wal apos aplicar). Roda
  // depois da poda pra ter espaco. VACUUM so se pedido (precisa de espaco).
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

// ===== Alerta de volume cheio =====

// Uso REAL do volume (capacidade total/livre via statfs, nao so a soma dos
// nossos arquivos). Em producao DATA_DIR e o ponto de montagem do volume Railway.
export async function usoDisco() {
  const s = await statfs(DATA_DIR);
  const total = s.blocks * s.bsize;
  const livre = s.bavail * s.bsize; // disponivel pra processo nao-root
  const usado = total - livre;
  const pct = total > 0 ? usado / total : 0;
  return {
    totalBytes: total, usadoBytes: usado, livreBytes: livre, pct,
    total: tamanhoLegivel(total), usado: tamanhoLegivel(usado), livre: tamanhoLegivel(livre),
    pctTexto: (pct * 100).toFixed(1) + "%",
  };
}

// Throttle do alerta: no maximo 1 a cada ~20h (evita spam em restart/loop).
let _ultimoAlertaMs = 0;
const ALERTA_LIMIAR = Number(process.env.LICITA_DISCO_ALERTA_PCT || 80) / 100;

// Checa o volume e, se passar do limiar, manda e-mail pro admin com instrucao
// de limpeza. Best-effort: se statfs/email falhar, loga e segue.
export async function verificarDisco({ log = console.log, forcar = false } = {}) {
  let uso;
  try { uso = await usoDisco(); }
  catch (e) { log(`[disco] statfs indisponivel: ${e.message}`); return null; }

  log(`[disco] volume em ${uso.pctTexto} (${uso.usado}/${uso.total}).`);
  if (uso.pct < ALERTA_LIMIAR && !forcar) return uso;
  if (!temEmailKey()) return uso;

  const agora = Date.now();
  if (!forcar && agora - _ultimoAlertaMs < 20 * 3600 * 1000) return uso; // ja avisou hoje
  _ultimoAlertaMs = agora;

  const limiarTxt = (ALERTA_LIMIAR * 100).toFixed(0) + "%";
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#b91c1c;color:#fff;padding:20px 26px">
<div style="font-size:13px;color:#fecaca;font-weight:700;letter-spacing:.5px">ATENCAO: VOLUME</div>
<div style="font-size:20px;font-weight:800;margin-top:4px">Disco em ${uso.pctTexto}</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#0f172a;font-size:14.5px;line-height:1.6">
<p>O volume do ContrataX passou de <b>${limiarTxt}</b>. Use <b>${uso.usado}</b> de <b>${uso.total}</b> (livre: ${uso.livre}).</p>
<p>Se chegar a 100%, o login e as escritas param. A limpeza automatica roda no boot e no backup diario, mas se quiser liberar agora, rode no console do navegador (logado como admin):</p>
<pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:10px;font-size:12px;overflow:auto">fetch('/api/admin/disco/limpar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({c:'SEU_ADMIN_TOKEN',vacuum:true})}).then(r=>r.json()).then(console.log)</pre>
<p style="font-size:12.5px;color:#64748b">Isso esvazia backups legados, poda contratos antigos, faz checkpoint do WAL e compacta o banco (VACUUM).</p>
</td></tr></table></td></tr></table></body></html>`;
  try {
    await enviar({ para: ADMIN_EMAIL, assunto: `[ContrataX] ⚠ Volume em ${uso.pctTexto}`, html });
    log(`[disco] alerta enviado pro admin (volume ${uso.pctTexto}).`);
  } catch (e) { log(`[disco] falha ao enviar alerta: ${e.message}`); }
  return uso;
}
