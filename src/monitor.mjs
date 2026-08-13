// Matching: para um perfil de cliente, consulta o acervo nacional no banco e
// devolve os editais que interessam. NAO chama a API (isso e papel do ingest);
// por isso e instantaneo e serve todos os clientes a partir de um unico acervo.

import { consultar, casarPerfil } from "./db.mjs";
import { expandirRamoCurado } from "./sinonimos.mjs";
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
  // termosIA = expansao do ramo pro feed: os termos que a IA gerou no cadastro
  // MAIS a expansao CURADA (frases do ramo entre aspas). Antes usava termosAmplos,
  // que derrubava a palavra generica e buscava a distintiva SOLTA ("material
  // hospitalar" -> "hospitalar"), trazendo servico/roupa/equipamento hospitalar.
  // A curada da recall do ramo (frases-irmas: "insumo hospitalar", "material de
  // enfermagem") SEM o lixo. A busca manual continua literal (sem essa expansao).
  const recorte = {
    modalidades: perfil.modalidades ?? [],
    valorMin: filtro.valorMin ?? null,
    valorMax: filtro.valorMax ?? null,
    apenasAbertos: true,
  };
  const termosBusca = {
    termos: filtro.termos ?? [],
    termosIA: [...(filtro.termosIA ?? []), ...expandirRamoCurado(filtro.termos ?? [])],
    termosExcluir: filtro.termosExcluir ?? [],
  };

  // SEM RAMO CADASTRADO = painel vazio + aviso, NUNCA o acervo inteiro.
  // Bug achado no pente fino de 13/08/2026: aplicarFiltro so filtra "if
  // (termos.length || termosIA.length)", entao quem nao tem ramo nenhum passava
  // por TODOS os editais. O cliente "Licita App", que entrou pelo Google (esse
  // caminho nao pede CNPJ nem ramo) e nunca completou o cadastro, estava vendo
  // 7.666 editais aleatorios: rastreamento veicular, hospedagem, caminhao. Isso
  // e pior que tela vazia, porque parece que o produto e burro em vez de
  // incompleto. Agora devolve vazio com semRamo=true e o painel explica o que
  // fazer. NAO mexi no aplicarFiltro generico de proposito: a busca publica da
  // landing usa "sem termo" legitimamente (contador nacional).
  const semRamo = !(termosBusca.termos.length || termosBusca.termosIA.length);
  if (semRamo) {
    return { total: 0, filtrados: [], novos: [], alargado: false, semRamo: true };
  }

  // casarPerfil casa no OBJETO (com a expansao de ramo) E nos ITENS do edital,
  // igual a busca livre. Sem os itens, ramo de produto especifico ("papel A4")
  // ficava raso no painel enquanto a busca achava dezenas (o produto mora nos itens).
  let candidatos = consultar({ ufs, ...recorte });
  let casaram = casarPerfil(candidatos, termosBusca);

  // PAINEL NUNCA VAZIO: estado do cliente trouxe poucos e ele tem UF setada ->
  // alarga pro Brasil todo. So vale se o nacional realmente tiver mais (senao e
  // nicho raro em todo lugar e nao adianta trocar). O front sinaliza o alargamento.
  let alargado = false;
  if (ufs.length && casaram.length < LIMIAR_ALARGAR) {
    const candNac = consultar({ ...recorte }); // sem ufs
    const casaramNac = casarPerfil(candNac, termosBusca);
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
