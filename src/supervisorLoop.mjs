// Supervisor generico para os loops de background do servidor (backfill,
// atualizador de editais, digest, backup, indice de itens).
//
// Cada um desses loops ja tem try/catch por ciclo internamente (um erro
// pontual nao mata o loop). O ponto cego e o que fica FORA desse try: se o
// import() do modulo falhar (bug introduzido num deploy, por exemplo) ou
// algo estourar antes do loop comecar, o loop morre pra sempre e em
// silencio ate o proximo deploy — o servidor continua de pe, o healthcheck
// continua verde, e aquele dado simplesmente para de atualizar sem
// ninguem perceber.
//
// supervisionar() reinicia automaticamente e avisa o admin por email na
// primeira falha e depois a cada 5 (pra nao virar spam se ficar num
// crash-loop).

import { enviar } from "./email.mjs";

const ADMIN_EMAIL = process.env.LICITA_BACKUP_EMAIL || "licitacontratax@gmail.com";

export function supervisionar(nome, iniciar, { esperaMs = 5 * 60 * 1000 } = {}) {
  let falhasSeguidas = 0;

  async function ciclo() {
    try {
      await iniciar();
      // Os loops de producao sao for(;;)/while(true) — so retornam aqui em
      // cenarios excepcionais (ex: sinal.parar, que nao e usado em producao
      // hoje). Nao reinicia sozinho pra nao mascarar um retorno intencional.
      console.log(`[supervisor:${nome}] loop encerrou normalmente (sem reiniciar).`);
    } catch (e) {
      falhasSeguidas++;
      console.error(`[supervisor:${nome}] caiu (tentativa ${falhasSeguidas}): ${e.message}`);
      if (falhasSeguidas === 1 || falhasSeguidas % 5 === 0) {
        avisarAdmin(nome, e, falhasSeguidas).catch(() => {});
      }
      setTimeout(ciclo, esperaMs);
    }
  }

  ciclo();
}

async function avisarAdmin(nome, erro, tentativa) {
  try {
    await enviar({
      para: ADMIN_EMAIL,
      assunto: `[ContrataX] Loop "${nome}" caiu (tentativa ${tentativa})`,
      html: `<p>O loop de background <b>${nome}</b> lançou um erro não tratado e foi reiniciado automaticamente.</p>
             <p><b>Erro:</b> ${String(erro?.message || erro).slice(0, 500)}</p>
             <p>O servidor continua no ar; só esse loop específico caiu. Se continuar caindo repetidamente, vale olhar os logs do Railway.</p>`,
    });
  } catch {}
}
