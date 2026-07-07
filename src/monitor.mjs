// Matching: para um perfil de cliente, consulta o acervo nacional no banco e
// devolve os editais que interessam. NAO chama a API (isso e papel do ingest);
// por isso e instantaneo e serve todos os clientes a partir de um unico acervo.

import { consultar } from "./db.mjs";
import { aplicarFiltro, termosAmplos } from "./filtro.mjs";
import { carregarVistos, marcarVistos, salvarResultados } from "./store.mjs";

// Abaixo deste numero de editais no estado do cliente, o painel ALARGA pro Brasil
// todo. Estado pequeno + ramo de nicho nao pode virar tela vazia no primeiro
// login: painel vazio mata a ativacao, principal causa de churn medida no teste
// (ex.: material didatico/RN = 0 no estado, 31 no Brasil).
const LIMIAR_ALARGAR = 8;

// perfil = {
//   id, nome, uf | ufs, modalidades,
//   filtro: { termos, termosExcluir, valorMin, valorMax }
// }
//
// Retorna: { total, filtrados: [...editais], novos: [...editais], alargado }
//   total     = quantos editais passaram no recorte grosso (UF/modalidade/valor)
//   filtrados = os que tambem casaram com as palavras-chave (cada um com flag `novo`)
//   novos     = subconjunto ainda nao mostrado em rodadas anteriores
//   alargado  = true se caiu no fallback nacional (estado do cliente tinha poucos)
export async function monitorar(perfil, { marcar = true, salvar = true } = {}) {
  const ufs = perfil.ufs ?? (perfil.uf ? [perfil.uf] : []);
  const filtro = perfil.filtro ?? {};

  // Recorte grosso (UF/modalidade/valor) e recorte fino por palavra-chave.
  // termosIA = expansao semantica (sinonimos do ramo) + palavras distintivas
  // derivadas dos termos crus. Isto amplia a ABERTURA do painel pro ramo inteiro
  // (ex: "material hospitalar" tambem traz "hospitalar"), que e o que o cliente
  // quer ao logar. A busca manual continua literal.
  const recorte = {
    modalidades: perfil.modalidades ?? [],
    valorMin: filtro.valorMin ?? null,
    valorMax: filtro.valorMax ?? null,
    apenasAbertos: true,
  };
  const termosBusca = {
    termos: filtro.termos ?? [],
    termosIA: [...(filtro.termosIA ?? []), ...termosAmplos(filtro.termos ?? [])],
    termosExcluir: filtro.termosExcluir ?? [],
  };

  let candidatos = consultar({ ufs, ...recorte });
  let casaram = aplicarFiltro(candidatos, termosBusca);

  // PAINEL NUNCA VAZIO: estado do cliente trouxe poucos e ele tem UF setada ->
  // alarga pro Brasil todo. So vale se o nacional realmente tiver mais (senao e
  // nicho raro em todo lugar e nao adianta trocar). O front sinaliza o alargamento.
  let alargado = false;
  if (ufs.length && casaram.length < LIMIAR_ALARGAR) {
    const candNac = consultar({ ...recorte }); // sem ufs
    const casaramNac = aplicarFiltro(candNac, termosBusca);
    if (casaramNac.length > casaram.length) {
      candidatos = candNac;
      casaram = casaramNac;
      alargado = true;
    }
  }

  const vistos = await carregarVistos(perfil.id);
  const filtrados = casaram.map((e) => ({ ...e, novo: !vistos.has(e.id) }));
  const novos = filtrados.filter((e) => e.novo);

  // salvar:false quando e leitura ao vivo do painel (evita escrita por abertura).
  if (salvar) await salvarResultados(perfil, filtrados);
  if (marcar) {
    await marcarVistos(perfil.id, filtrados.map((e) => e.id));
  }

  return { total: candidatos.length, filtrados, novos, alargado };
}
