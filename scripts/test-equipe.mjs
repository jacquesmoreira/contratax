// Teste de integracao: equipe (multiusuario/assentos) + limite de analises.
// Roda contra o servidor local (porta 3000) e limpa os dados de teste no fim.

import { lerPerfis, salvarPerfis } from "../src/perfis.mjs";
import { definirAssentos } from "../src/equipe.mjs";
import { usoDe, limiteDe, podeAnalisar, registrarAnalise } from "../src/uso.mjs";

const BASE = "http://localhost:3000";
const ok = (c, m) => console.log(`${c ? "PASS" : "FALHA"} - ${m}`);

// Gera um CNPJ valido (digitos verificadores corretos) a partir de uma base.
function digito(base) {
  const pesos = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let s = 0; for (let i=0;i<base.length;i++) s += Number(base[i])*pesos[i];
  const r = s%11; return r<2?0:11-r;
}
function cnpjValido() {
  const base = "11444777000"; const seq = base + Math.floor(Math.random()*9 + 1);
  const d1 = digito(seq); const d2 = digito(seq + d1);
  return seq + "" + d1 + d2;
}

const email = `teste_equipe_${Date.now()}@exemplo.com`;
const membroEmail = `membro_${Date.now()}@exemplo.com`;
const cnpj = cnpjValido();
let token = null;

try {
  // 1) Cadastro cria a empresa com o criador como admin.
  let r = await fetch(`${BASE}/api/cadastrar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, razaoSocial: "Empresa Teste LTDA", nome: "Empresa Teste LTDA", email, senha: "senha123", uf: "SC", ramo: "computador, informatica" }),
  });
  let d = await r.json();
  ok(r.ok && d.link, `cadastro cria conta (link: ${d.link})`);
  token = d.link?.split("c=")[1];

  // 2) Equipe nasce com 1 admin e 1 assento.
  r = await fetch(`${BASE}/api/equipe?c=${token}`);
  d = await r.json();
  ok(d.usados === 1 && d.assentos === 1 && d.membros[0].papel === "admin", `equipe inicial: 1 admin, 1 assento (usados=${d.usados}, assentos=${d.assentos})`);

  // 3) Convidar com assentos esgotados deve FALHAR com mensagem de preco.
  r = await fetch(`${BASE}/api/equipe/convidar?c=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: "Membro Um", email: membroEmail, senha: "senha123" }),
  });
  d = await r.json();
  ok(r.status === 400 && /assento/i.test(d.erro), `convite bloqueia sem assento livre ("${d.erro?.slice(0,60)}...")`);

  // 4) Admin libera 2 assentos (concierge) e o convite passa.
  await definirAssentos(token, 2);
  r = await fetch(`${BASE}/api/equipe/convidar?c=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: "Membro Um", email: membroEmail, senha: "senha123" }),
  });
  d = await r.json();
  ok(r.ok && d.membro?.papel === "membro", `convite passa com assento livre (membro: ${d.membro?.email})`);

  // 5) Login do MEMBRO cai no mesmo painel (mesmo token da empresa).
  r = await fetch(`${BASE}/api/entrar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: membroEmail, senha: "senha123" }),
  });
  d = await r.json();
  ok(r.ok && d.link?.includes(token), `membro faz login e entra no painel da empresa`);

  // 6) Login do membro com senha errada falha.
  r = await fetch(`${BASE}/api/entrar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: membroEmail, senha: "errada" }),
  });
  ok(r.status === 401, `senha errada do membro e rejeitada (status ${r.status})`);

  // 7) Limite de analises: trial = 5.
  let perfis = await lerPerfis();
  let p = perfis.find((x) => x.token === token);
  ok(limiteDe(p) === 5, `limite de analises no teste = 5 (${limiteDe(p)})`);

  // 8) registrarAnalise incrementa a cota.
  await registrarAnalise(token);
  perfis = await lerPerfis(); p = perfis.find((x) => x.token === token);
  ok(usoDe(p).usados === 1 && usoDe(p).restantes === 4, `apos 1 analise: usados=1 restantes=4`);

  // 9) Estourar a cota bloqueia.
  for (let i = 0; i < 4; i++) await registrarAnalise(token);
  perfis = await lerPerfis(); p = perfis.find((x) => x.token === token);
  ok(!podeAnalisar(p) && usoDe(p).restantes === 0, `cota cheia bloqueia novas analises (restantes=${usoDe(p).restantes})`);

} catch (e) {
  console.error("ERRO NO TESTE:", e.message);
} finally {
  // Limpeza: remove o perfil de teste.
  if (token) {
    const perfis = await lerPerfis();
    await salvarPerfis(perfis.filter((x) => x.token !== token));
    console.log("\nLimpeza: perfil de teste removido.");
  }
}
