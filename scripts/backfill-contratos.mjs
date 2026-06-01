// CLI do backfill continuo de contratos. Resumivel: pode parar (Ctrl-C) e retomar.
//
// Uso:
//   node scripts/backfill-contratos.mjs                  uma passada, 18 meses
//   node scripts/backfill-contratos.mjs --meses 36       uma passada, 36 meses
//   node scripts/backfill-contratos.mjs --loop           fica rodando (worker Railway)
//   node scripts/backfill-contratos.mjs --loop --horas 6 passada a cada 6h
//   node scripts/backfill-contratos.mjs --pausa 3000     3s entre paginas (mais gentil)

import { backfillContratos, backfillLoop } from "../src/backfillContratos.mjs";

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}
const tem = (nome) => process.argv.includes(nome);

const meses = Number(arg("--meses", 18));
const pausaPagina = Number(arg("--pausa", 2000));
const limitePaginasPorMes = Number(arg("--limite", Infinity));
const horas = Number(arg("--horas", 6));
const loop = tem("--loop");

// Encerramento elegante: Ctrl-C marca o sinal e o backfill para entre paginas,
// salvando o progresso antes de sair.
const sinal = { parar: false };
process.on("SIGINT", () => {
  if (sinal.parar) process.exit(1); // segundo Ctrl-C forca a saida
  console.log("\n[backfill] encerrando apos a pagina atual... (Ctrl-C de novo forca)");
  sinal.parar = true;
});

console.log(`Backfill de contratos | ${meses} meses | pausa ${pausaPagina}ms/pag | ${loop ? `loop a cada ${horas}h` : "uma passada"}`);
const inicio = Date.now();

if (loop) {
  await backfillLoop({ meses, pausaPagina, limitePaginasPorMes, intervaloHoras: horas, sinal });
} else {
  const { stats, progresso } = await backfillContratos({ meses, pausaPagina, limitePaginasPorMes, sinal });
  const seg = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n================ RESUMO ================`);
  console.log(`Acervo de contratos: ${stats.total.toLocaleString("pt-BR")} | vencendo em 6 meses: ${stats.vencendo6m.toLocaleString("pt-BR")}`);
  console.log(`Meses completos: ${progresso.mesesCompletos.length}/${meses} -> ${progresso.mesesCompletos.join(", ")}`);
  console.log(`Tempo desta passada: ${seg}s`);
}
