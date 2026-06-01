// CLI do e-mail diario. Para cada cliente, monta o resumo dos editais NOVOS e:
//   - se houver RESEND_API_KEY: envia para o e-mail do cliente.
//   - senao: salva um preview .html em data/ para conferir.
//
// Uso:
//   node scripts/digest.mjs            envia os novos (ou salva preview se sem chave)
//   node scripts/digest.mjs --preview  forca preview (mostra top 6 mesmo sem novos)

import "../src/env.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gerarDigest, enviar, temEmailKey } from "../src/email.mjs";
import { carregarResultados } from "../src/store.mjs";
import { statusAtual } from "../src/assinatura.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preview = process.argv.includes("--preview");

const perfis = JSON.parse(await readFile(resolve(RAIZ, "perfis.json"), "utf8"));
const resultados = await carregarResultados();
const ordenarPorPrazo = (arr) => [...arr].sort((a, b) => (a.encerramento || "").localeCompare(b.encerramento || ""));

console.log(`E-mail diario | ${perfis.length} cliente(s) | ${temEmailKey() ? "envio ATIVO (Resend)" : "modo preview (sem chave)"}\n`);

for (const perfil of perfis) {
  // Nao envia para quem esta sem acesso (teste expirado / assinatura vencida).
  if (!preview && !statusAtual(perfil).temAcesso) {
    console.log(`- ${perfil.nome}: sem assinatura ativa, pulando.`);
    continue;
  }
  const editais = resultados[perfil.id]?.editais ?? [];
  const novos = editais.filter((e) => e.novo);
  const lista = novos.length ? novos : preview ? ordenarPorPrazo(editais).slice(0, 6) : [];

  if (!lista.length) {
    console.log(`- ${perfil.nome}: sem editais novos, pulando.`);
    continue;
  }

  const { assunto, html } = gerarDigest(perfil, ordenarPorPrazo(lista).slice(0, 10));

  if (temEmailKey() && perfil.email && !preview) {
    try {
      await enviar({ para: perfil.email, assunto, html });
      console.log(`- ${perfil.nome}: enviado para ${perfil.email} (${lista.length} editais).`);
    } catch (e) {
      console.log(`- ${perfil.nome}: FALHA no envio: ${e.message}`);
    }
  } else {
    const arq = resolve(RAIZ, "data", `digest-${perfil.id}.html`);
    await mkdir(dirname(arq), { recursive: true });
    await writeFile(arq, html, "utf8");
    console.log(`- ${perfil.nome}: preview salvo em data/digest-${perfil.id}.html`);
    console.log(`    assunto: "${assunto}"`);
  }
}
