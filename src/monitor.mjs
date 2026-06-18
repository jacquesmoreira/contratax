// Matching: para um perfil de cliente, consulta o acervo nacional no banco e
// devolve os editais que interessam. NAO chama a API (isso e papel do ingest);
// por isso e instantaneo e serve todos os clientes a partir de um unico acervo.

import { consultar } from "./db.mjs";
import { aplicarFiltro, termosAmplos } from "./filtro.mjs";
import { carregarVistos, marcarVistos, salvarResultados } from "./store.mjs";

// perfil = {
//   id, nome, uf | ufs, modalidades,
//   filtro: { termos, termosExcluir, valorMin, valorMax }
// }
//
// Retorna: { total, filtrados: [...editais], novos: [...editais] }
//   total     = quantos editais passaram no recorte grosso (UF/modalidade/valor)
//   filtrados = os que tambem casaram com as palavras-chave (cada um com flag `novo`)
//   novos     = subconjunto ainda nao mostrado em rodadas anteriores
export async function monitorar(perfil, { marcar = true } = {}) {
  const ufs = perfil.ufs ?? (perfil.uf ? [perfil.uf] : []);
  const filtro = perfil.filtro ?? {};

  // Recorte grosso no SQL (UF, modalidade, faixa de valor, ainda aberto).
  const candidatos = consultar({
    ufs,
    modalidades: perfil.modalidades ?? [],
    valorMin: filtro.valorMin ?? null,
    valorMax: filtro.valorMax ?? null,
    apenasAbertos: true,
  });

  // Recorte fino por palavra-chave (valor ja foi tratado no SQL).
  // termosIA = expansao semantica (sinonimos do ramo) + palavras distintivas
  // derivadas dos termos crus. Isto amplia a ABERTURA do painel pro ramo
  // inteiro (ex: "material hospitalar" tambem traz "produtos hospitalares"),
  // que e o que o cliente quer ao logar. A busca manual continua literal.
  const termos = filtro.termos ?? [];
  const casaram = aplicarFiltro(candidatos, {
    termos,
    termosIA: [...(filtro.termosIA ?? []), ...termosAmplos(termos)],
    termosExcluir: filtro.termosExcluir ?? [],
  });

  const vistos = await carregarVistos(perfil.id);
  const filtrados = casaram.map((e) => ({ ...e, novo: !vistos.has(e.id) }));
  const novos = filtrados.filter((e) => e.novo);

  await salvarResultados(perfil, filtrados);
  if (marcar) {
    await marcarVistos(perfil.id, filtrados.map((e) => e.id));
  }

  return { total: candidatos.length, filtrados, novos };
}
