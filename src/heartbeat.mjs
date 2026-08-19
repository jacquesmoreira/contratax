// Heartbeat diario de saude do sistema: 1 e-mail por dia pro admin com os sinais
// vitais, MESMO quando esta tudo bem. Motivo (incidente de 20/07/2026): o sistema
// ja avisa quando algo QUEBRA (cota, disco, memoria, bounce, loop que caiu), mas o
// digest ficou dias mandando "0 e-mails" sem ninguem saber, porque "nao recebi
// alerta" tanto significa "tudo ok" quanto "o proprio monitoramento parou". O
// heartbeat resolve essa ambiguidade: silencio vira confirmacao explicita de "verde".
//
// Nao substitui os alertas de problema (esses continuam disparando na hora); e a
// camada de "prova de vida" diaria. So roda com LICITA_HEARTBEAT=1.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR } from "./caminhos.mjs";
import { lerPerfis } from "./perfis.mjs";
import { statusAtual } from "./assinatura.mjs";
import { usoDisco } from "./backup.mjs";
import { enviar, temEmailKey } from "./email.mjs";

const ADMIN_EMAIL = process.env.LICITA_BACKUP_EMAIL || "licitacontratax@gmail.com";
const TETO_DIARIO = Number(process.env.LICITA_TETO_EMAIL_DIA || 100);
const TETO_MENSAL = Number(process.env.LICITA_TETO_EMAIL_MES || 3000);
const MEM_LIMITE_MB = Number(process.env.LICITA_MEM_LIMITE_MB || 450);

const hojeISO = () => new Date().toISOString().slice(0, 10);

// "ha quantos dias" em texto curto pra tabela do e-mail.
function diasDesdeTxt(iso) {
  if (!iso) return "nunca";
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (Number.isNaN(d)) return "-";
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d}d`;
}

// CUSTO DE IA DO DIA (13/08/2026). O Jacques teve prejuizo real: colocou US$10
// de credito e precisou de mais US$10 dois dias depois, com receita de R$208/mes.
// A causa era desperdicio nosso (78% dos resumos gerados nunca eram abertos),
// ja cortado -- mas ele so descobriu olhando o saldo na Anthropic. Agora o
// numero chega junto com o resto, todo dia, e vira ALERTA quando passa do teto.
// Le o mesmo jsonl que custo.mjs escreve; so leitura, nunca derruba o heartbeat.
const CUSTO_DIA_ALERTA = Number(process.env.LICITA_CUSTO_DIA_ALERTA_BRL || 12);

async function custoDeHoje() {
  try {
    const texto = await readFile(resolve(DATA_DIR, "custos-ia.jsonl"), "utf8");
    const hoje = hojeISO();
    const ontemISO = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    let brl = 0, chamadas = 0, ontem = 0;
    const porEtapa = {};
    for (const linha of texto.split("\n")) {
      if (!linha.trim()) continue;
      let l; try { l = JSON.parse(linha); } catch { continue; }
      const dia = String(l.ts || "").slice(0, 10);
      if (dia === ontemISO) { ontem += l.brl || 0; continue; }
      if (dia !== hoje) continue;
      brl += l.brl || 0;
      chamadas++;
      const e = l.etapa || "ia";
      porEtapa[e] = (porEtapa[e] || 0) + (l.brl || 0);
    }
    const maior = Object.entries(porEtapa).sort((a, b) => b[1] - a[1])[0] || null;
    // Variacao contra ONTEM: e o que responde "caiu?" direto no e-mail, sem
    // precisar abrir a Anthropic nem comparar de cabeca. So calcula quando
    // ontem teve movimento (senao a porcentagem nao significa nada).
    const variacao = ontem > 0 ? Math.round(((brl - ontem) / ontem) * 100) : null;
    return { brl, chamadas, maior, ontem, variacao };
  } catch { return { brl: 0, chamadas: 0, maior: null, ontem: 0, variacao: null }; }
}

// Le o contador global de envios (mesmo arquivo que email.mjs escreve). So leitura.
async function lerCotaEmail() {
  try {
    const c = JSON.parse(await readFile(resolve(DATA_DIR, "envios-contador.json"), "utf8"));
    const hoje = hojeISO();
    const mes = hoje.slice(0, 7);
    return {
      dia: c.dia === hoje ? (c.diaCount || 0) : 0,
      mes: c.mes === mes ? (c.mesCount || 0) : 0,
    };
  } catch { return { dia: 0, mes: 0 }; }
}

// Monta os dados + o HTML. Recebe os stats do PROCESSO (uptime/memoria) de quem
// chama, porque so o processo do servidor conhece esses numeros.
export async function montarHeartbeat({ uptimeS = 0, rssMb = 0, heapMb = 0 } = {}) {
  const alertas = []; // linhas de atencao (amarelas); vazio = tudo verde

  // Clientes por status + RAIO-X DOS TESTES (13/08/2026). O acompanhamento
  // diario dos trials nasceu como rotina externa na nuvem, mas o ambiente de la
  // BLOQUEIA a rede pro contratax.com.br (proxy 403), entao ela nunca conseguiu
  // nem consultar a API -- rodou ~20 vezes e falhou todas. Aqui funciona porque
  // roda DENTRO do proprio servidor, lendo o banco direto, e sai no e-mail que
  // o Jacques ja recebe. Meta dele: converter os testes em pagante, entao o
  // heartbeat passa a mostrar quem esta quente, quem esfriou e quem expira.
  let ativos = 0, teste = 0, expirados = 0, bouncesHoje = 0;
  let trials = [];
  // ULTIMO ACESSO REAL vem da tabela de sessoes (MAX(visto_em)), igual faz o
  // /api/admin/clientes. CORRECAO 19/08/2026: eu tinha usado um campo
  // `_ultimoAcessoEm` no perfil que NAO EXISTE em lugar nenhum do sistema,
  // entao a coluna de acesso do heartbeat vinha sempre vazia. Achado ao montar
  // o acompanhamento de quem voltou depois de receber e-mail.
  let acessoPorToken = {};
  try {
    const { abrir } = await import("./db.mjs");
    for (const r of abrir().prepare("SELECT token, MAX(visto_em) AS ultimo FROM sessoes GROUP BY token").all()) {
      acessoPorToken[r.token] = r.ultimo;
    }
  } catch { /* sem sessoes: a coluna mostra "-" e o resto do heartbeat segue */ }
  try {
    const perfis = await lerPerfis();
    const hoje = hojeISO();
    for (const p of perfis) {
      const st = statusAtual(p);
      if (st.status === "ativo" || st.status === "atrasado") ativos++;
      else if (st.status === "teste") {
        teste++;
        const ua = acessoPorToken[p.token] || null;
        const contato = p._contatoManualEm || null;
        // "Voltou depois do contato" = acessou DEPOIS do e-mail que mandamos.
        // E o sinal que responde se o contato funcionou.
        const voltouAposContato = Boolean(ua && contato && ua > contato);
        trials.push({
          nome: (p.razaoSocial || p.nome || "?").slice(0, 22),
          dias: st.diasRestantes,
          leituras: p._resumos?.n || 0,
          analises: p.analises?.usados || 0,
          semCnpj: !p.cnpj,
          ultimoAcesso: ua,
          contato,
          voltouAposContato,
        });
      }
      else if (["teste_expirado", "vencido", "inativo"].includes(st.status)) expirados++;
      if (p._emailBounce?.em && String(p._emailBounce.em).slice(0, 10) === hoje) bouncesHoje++;
    }
    // Mais quente primeiro: quem mais usou a IA. Empate pelo teste mais curto.
    trials.sort((a, b) => b.leituras - a.leituras || (a.dias ?? 99) - (b.dias ?? 99));
  } catch (e) { alertas.push(`Nao consegui ler os perfis: ${e.message}`); }

  // Alertas acionaveis sobre os testes (entram na lista amarela do e-mail).
  for (const t of trials) {
    if (t.dias != null && t.dias <= 3) alertas.push(`Teste de ${t.nome} termina em ${t.dias} dia(s), ${t.leituras} leitura(s) de IA.`);
    if (t.semCnpj) alertas.push(`${t.nome} nao informou CNPJ: o painel dele nao funciona.`);
  }
  // QUEM VOLTOU depois do contato: e o retorno do e-mail que o Jacques mandou.
  // Entra como alerta (nao como problema) porque muda o assunto e ele ve na
  // lista do Gmail que alguem reagiu, sem precisar abrir.
  const voltaram = trials.filter((t) => t.voltouAposContato);
  if (voltaram.length) {
    alertas.push(`✔ ${voltaram.map((t) => t.nome).join(", ")} ${voltaram.length === 1 ? "voltou" : "voltaram"} ao painel depois do seu contato.`);
  }

  // Cota de e-mail (Resend).
  const cota = await lerCotaEmail();

  // Custo de IA do dia + alerta se estourar o teto.
  const custo = await custoDeHoje();
  if (custo.brl >= CUSTO_DIA_ALERTA) {
    alertas.push(`IA custou R$ ${custo.brl.toFixed(2)} hoje (teto R$ ${CUSTO_DIA_ALERTA})${custo.maior ? `, maior parte em "${custo.maior[0]}"` : ""}.`);
  }
  if (cota.dia >= TETO_DIARIO * 0.9) alertas.push(`E-mail perto do teto diario: ${cota.dia}/${TETO_DIARIO}.`);
  if (cota.mes >= TETO_MENSAL * 0.9) alertas.push(`E-mail perto do teto mensal: ${cota.mes}/${TETO_MENSAL}.`);

  // Disco (volume Railway).
  let disco = null;
  try {
    disco = await usoDisco();
    if (disco.pct >= 0.8) alertas.push(`Volume em ${disco.pctTexto} (perto de encher).`);
  } catch (e) { alertas.push(`Nao consegui medir o disco: ${e.message}`); }

  // Memoria: so alerta se estiver alta de forma SUSTENTADA, nao num pico. O
  // backfill (varre milhoes de contratos) infla o RSS por alguns minutos e
  // depois libera; medir num instante unico caia bem no meio disso e gerava
  // alarme falso (visto ao vivo em 24/07: 598MB durante o backfill, 307MB
  // estavel segundos depois). Amostra 3x com intervalo e usa a MENOR: se ate a
  // menor estiver alta, ai sim e sustentado. rssMb (o valor recebido) entra
  // como uma das amostras; as outras 2 sao lidas aqui.
  const amostras = [rssMb];
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try { amostras.push(Math.round(process.memoryUsage().rss / 1024 / 1024)); } catch {}
  }
  const rssMin = Math.min(...amostras);
  if (rssMin >= MEM_LIMITE_MB * 0.8) {
    alertas.push(`Memoria alta sustentada: ${rssMin}MB (menor de 3 amostras) de ${MEM_LIMITE_MB}MB.`);
  }

  if (bouncesHoje > 0) alertas.push(`${bouncesHoje} e-mail(s) de cliente voltaram (bounce) hoje.`);

  const tudoVerde = alertas.length === 0;
  const upH = (uptimeS / 3600).toFixed(1);
  const linha = (rotulo, valor) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px">${rotulo}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:13px">${valor}</td></tr>`;

  const assunto = tudoVerde
    ? `[ContrataX] ✅ Tudo no ar, ${new Date().toLocaleDateString("pt-BR")}`
    : `[ContrataX] ⚠ ${alertas.length} ponto(s) de atencao, ${new Date().toLocaleDateString("pt-BR")}`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 20px;color:#0f172a">
    <div style="background:${tudoVerde ? "#059669" : "#b45309"};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;font-weight:800;letter-spacing:.5px">SAUDE DO SISTEMA, RESUMO DIARIO</div>
      <div style="font-size:20px;font-weight:800;margin-top:3px">${tudoVerde ? "Tudo funcionando" : alertas.length + " ponto(s) pra olhar"}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:6px 0 4px">
      <table style="width:100%;border-collapse:collapse">
        ${linha("No ar ha", `${upH} horas`)}
        ${linha("Memoria", `${rssMin} MB (estavel, limite ${MEM_LIMITE_MB})`)}
        ${disco ? linha("Volume", `${disco.usado} / ${disco.total} (${disco.pctTexto})`) : ""}
        ${linha("E-mails hoje", `${cota.dia} / ${TETO_DIARIO}`)}
        ${linha("E-mails no mes", `${cota.mes} / ${TETO_MENSAL}`)}
        ${linha("Custo de IA hoje", `R$ ${custo.brl.toFixed(2)} em ${custo.chamadas} chamada(s)${custo.maior ? ` · maior: ${custo.maior[0]}` : ""}`)}
        ${linha("Comparado a ontem", custo.ontem > 0
          ? `ontem R$ ${custo.ontem.toFixed(2)} · <span style="color:${custo.variacao <= 0 ? "#059669" : "#dc2626"};font-weight:800">${custo.variacao <= 0 ? "▼" : "▲"} ${Math.abs(custo.variacao)}%</span>`
          : "sem gasto ontem pra comparar")}
        ${linha("Clientes", `${ativos} pagantes, ${teste} em teste, ${expirados} expirados`)}
        ${linha("Bounces hoje", bouncesHoje === 0 ? "nenhum" : String(bouncesHoje))}
      </table>
    </div>
    ${trials.length ? `<div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:#eef2ff;padding:11px 14px;font-size:13px;font-weight:800;color:#3730a3">🎯 Testes em andamento (mais engajado primeiro)</div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f8fafc">
          <td style="padding:6px 12px;font-size:11px;color:#64748b;font-weight:700">EMPRESA</td>
          <td style="padding:6px 12px;font-size:11px;color:#64748b;font-weight:700">DIAS</td>
          <td style="padding:6px 12px;font-size:11px;color:#64748b;font-weight:700">LEITURAS IA</td>
          <td style="padding:6px 12px;font-size:11px;color:#64748b;font-weight:700">ACESSO</td>
        </tr>
        ${trials.map((t) => {
          const quente = t.leituras >= 10;
          const acabando = t.dias != null && t.dias <= 3;
          return `<tr>
            <td style="padding:7px 12px;border-top:1px solid #e2e8f0;font-size:13px;${quente ? "font-weight:800" : ""}">${quente ? "🔥 " : ""}${t.nome}${t.semCnpj ? ' <span style="color:#dc2626;font-size:11px">sem CNPJ</span>' : ""}</td>
            <td style="padding:7px 12px;border-top:1px solid #e2e8f0;font-size:13px;${acabando ? "color:#dc2626;font-weight:800" : ""}">${t.dias ?? "-"}</td>
            <td style="padding:7px 12px;border-top:1px solid #e2e8f0;font-size:13px;${quente ? "font-weight:800;color:#059669" : ""}">${t.leituras}</td>
            <td style="padding:7px 12px;border-top:1px solid #e2e8f0;font-size:13px">${diasDesdeTxt(t.ultimoAcesso)}${t.voltouAposContato ? ' <span style="color:#059669;font-weight:800">✔ voltou após o contato</span>' : (t.contato ? ' <span style="color:#b45309;font-size:11px">contatado, sem retorno</span>' : "")}</td>
          </tr>`;
        }).join("")}
      </table>
    </div>` : ""}
    ${tudoVerde
      ? `<p style="font-size:13px;color:#475569;margin:16px 4px 0">Nenhum ponto de atencao. Este e-mail chega todo dia so pra confirmar que o monitoramento esta vivo, se ele parar de chegar, e sinal de que algo travou.</p>`
      : `<div style="margin:14px 0 0"><div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:6px">Pontos de atencao:</div>
         <ul style="margin:0 0 0 18px;color:#92400e;font-size:13px;line-height:1.6">${alertas.map((a) => `<li>${a}</li>`).join("")}</ul></div>`}
    <p style="font-size:11px;color:#94a3b8;margin-top:22px">ContrataX, monitoramento interno. Os alertas de problema (cota, disco, memoria, bounce) continuam chegando na hora, independente deste resumo.</p>
  </div>`;

  return { assunto, html, tudoVerde, alertas, dados: { upH, rssMb, rssMin, disco, cota, ativos, teste, expirados, bouncesHoje } };
}

// Envia o heartbeat agora. Best-effort: nunca lanca (nao pode derrubar o loop).
export async function enviarHeartbeat({ uptimeS, rssMb, heapMb, log = console.log } = {}) {
  if (!temEmailKey()) { log("[heartbeat] RESEND_API_KEY ausente; pulando."); return { enviado: false }; }
  try {
    const { assunto, html, tudoVerde } = await montarHeartbeat({ uptimeS, rssMb, heapMb });
    await enviar({ para: ADMIN_EMAIL, assunto, html });
    log(`[heartbeat] enviado (${tudoVerde ? "tudo verde" : "com atencao"}).`);
    return { enviado: true, tudoVerde };
  } catch (e) {
    log(`[heartbeat] falha: ${e.message}`);
    return { enviado: false, erro: e.message };
  }
}

// Loop diario. getStats() devolve os numeros do processo (uptime/memoria), que
// so o servidor conhece. Alvo padrao 7h BR, antes do digest das 8h, pra o Jacques
// ver a saude antes dos envios do dia sairem.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function msAteHora(horaBR) {
  const horaUTC = (horaBR + 3) % 24; // Brasilia -> UTC
  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setUTCHours(horaUTC, 0, 0, 0);
  if (alvo <= agora) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo - agora;
}

export async function heartbeatLoop({ horaBR = 7, getStats = () => ({}), log = console.log } = {}) {
  log(`[heartbeat] loop ativado (alvo: ${horaBR}h Brasilia)`);
  for (;;) {
    await dormir(msAteHora(horaBR));
    const { uptimeS = 0, rssMb = 0, heapMb = 0 } = getStats() || {};
    await enviarHeartbeat({ uptimeS, rssMb, heapMb, log });
  }
}
