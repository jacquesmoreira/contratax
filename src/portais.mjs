// Identificacao do PORTAL de origem de cada edital a partir do linkSistemaOrigem
// (campo `link` do edital, que o PNCP ja entrega). Serve pro filtro "Portal" da
// busca: o cliente escolhe em qual plataforma quer ver as licitacoes.
//
// DECISAO DE PRODUTO: NAO classificamos portal como "gratis" ou "pago". Politica
// de cobranca e fato de terceiro que muda (alguns cobram so do vencedor, outros
// isentam ME/EPP) e nao e nosso papel afirmar isso. Mostramos QUAL e o portal; o
// cliente confere as regras de cada um por conta.
//
// Casamento por FRAGMENTO de dominio (substring do hostname). Ordem importa pouco
// porque os fragmentos sao especificos, mas o primeiro que casar vence. Editais
// sem link viram "sem"; dominio conhecido -> sua chave; resto -> "outros".
//
// ATENCAO: a lista de chaves aqui precisa bater com a PORTAIS_P do frontend
// (web/public/index.html). Se adicionar/remover portal, atualize os dois.

const PORTAIS = [
  { chave: "comprasgov", nome: "Compras.gov.br (Comprasnet)", frags: ["cnetmobile", "comprasnet", "comprasgovernamentais.gov.br", "compras.gov.br", "gov.br/compras"] },
  { chave: "pcp", nome: "Portal de Compras Públicas", frags: ["portaldecompraspublicas.com.br"] },
  { chave: "bll", nome: "BLL Compras", frags: ["bllcompras.com", "bll.org.br"] },
  { chave: "licitanet", nome: "Licitanet", frags: ["licitanet.com.br"] },
  { chave: "bnc", nome: "BNC (Bolsa Nacional de Compras)", frags: ["bnccompras.com", "bnc.org.br"] },
  { chave: "licitardigital", nome: "Licitar Digital", frags: ["licitardigital.com.br"] },
  { chave: "licitacoese", nome: "Licitações-e (Banco do Brasil)", frags: ["licitacoes-e", "bb.com.br"] },
  { chave: "amm", nome: "AMM Licita", frags: ["ammlicita.org.br"] },
  { chave: "comprasbr", nome: "ComprasBR", frags: ["comprasbr.com.br"] },
  { chave: "licitamais", nome: "Licita Mais Brasil", frags: ["licitamaisbrasil.com.br"] },
  { chave: "mg", nome: "Portal de Compras MG", frags: ["compras.mg.gov.br"] },
  { chave: "rs", nome: "Compras RS / Banrisul", frags: ["compras.rs.gov.br", "pregaobanrisul.com.br"] },
  { chave: "rj", nome: "Compras RJ", frags: ["compras.rj.gov.br"] },
];

// Buckets sinteticos (sempre existem, nao entram na lista de dominios acima).
const SEM = { chave: "sem", nome: "Portal não informado" };
const OUTROS = { chave: "outros", nome: "Outro portal" };

// Devolve SEMPRE um objeto {chave, nome}. Nunca null, pra simplificar quem usa.
export function portalDeLink(link) {
  if (!link || typeof link !== "string" || !link.trim()) return SEM;
  let host;
  try {
    host = new URL(link.trim()).hostname.toLowerCase();
  } catch {
    // Algumas origens gravam texto que nao e URL valida (ex: so o nome do sistema).
    host = link.toLowerCase();
  }
  for (const p of PORTAIS) {
    if (p.frags.some((f) => host.includes(f))) return { chave: p.chave, nome: p.nome };
  }
  return OUTROS;
}

// Lista pro dropdown do frontend / possivel /api. Inclui os buckets sinteticos
// no fim, porque o cliente pode querer ver "Outros" ou "Sem portal informado".
export function listaPortais() {
  return [...PORTAIS.map((p) => ({ chave: p.chave, nome: p.nome })), OUTROS, SEM];
}
