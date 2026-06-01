# Licita

Plataforma de monitoramento de licitações públicas com leitura de editais e
conferência de aptidão. Dados oficiais do **PNCP** (Portal Nacional de Contratações
Públicas), gratuitos e obrigatórios por lei (14.133/2021).

Node puro + SQLite embutido. **Zero dependências externas** (nada de `npm install`).

## Como rodar na sua máquina

**Modo fácil:** clique duas vezes em `iniciar.cmd`. Abre o navegador em
http://localhost:3000 e mantém o servidor ligado.

**Pelo terminal:**
```
npm run web
```

Páginas:
- **http://localhost:3000** — landing page (busca grátis)
- **http://localhost:3000/cadastro** — criar painel de cliente
- **http://localhost:3000/painel?c=TOKEN** — painel privado de um cliente
- **http://localhost:3000/painel?c=admin** — painel com todos os clientes (você)

## Comandos

| Comando | O que faz |
|---|---|
| `npm run web` | Liga o site/painel |
| `npm run atualizar` | Ciclo completo: ingest nacional + matching + limpeza (já roda às 6h pelo Agendador) |
| `npm run ingest` | Só baixa o acervo nacional de editais (~30 min) |
| `npm run buscar` | Só recalcula os editais de cada cliente |
| `npm run digest` | Gera/envia o e-mail diário (preview se sem chave Resend) |
| `npm run clientes` | Lista todos os clientes e o status da assinatura |
| `npm run analisar <id>` | Leitura de um edital pela central de inteligência |
| `npm run conferir <id>` | Conferência de aptidão de um edital |
| `node scripts/ativar.mjs <token> [dias]` | Ativa um cliente após o Pix |
| `node scripts/remover.mjs <token>` | Remove um cliente (limpar teste ou cancelar) |

## Como funciona (arquitetura)

```
INGEST (noturno)        →  Banco SQLite  →  MATCHING (instantâneo)  →  PAINEL / E-MAIL
varre o PNCP nacional      data/licita.db    por perfil de cliente      o que o cliente vê
```

- O **ingest** roda devagar de madrugada (Agendador de Tarefas do Windows) e enche o banco.
- O **matching** lê do banco na hora (não chama a API), então o painel abre instantâneo.
- A **leitura do edital** e a **conferência de aptidão** rodam sob demanda quando o
  cliente abre um edital (usa a chave da central de inteligência no `.env`).

## Fluxo do cliente

```
Busca grátis (LP) → Cadastro (teste grátis 7 dias) → Painel privado + análise
→ E-mail diário → Teste vence → Muro de pagamento (Pix) → você ativa
```

## Configuração (.env)

```
ANTHROPIC_API_KEY=sk-ant-...          # leitura de editais e conferência
RESEND_API_KEY=re_...                 # envio de e-mail (opcional até ter domínio)
LICITA_BASE_URL=http://localhost:3000 # vira https://seudominio no deploy
LICITA_PIX_CHAVE=sua-chave-pix
LICITA_CONTATO=seu-whatsapp-ou-email
LICITA_ADMIN_TOKEN=um-token-secreto   # padrão "admin"
```

## Testar tudo

Veja o passo a passo em [`TESTE.md`](TESTE.md).

## Colocar no ar (produção)

Veja [`DEPLOY.md`](DEPLOY.md). O pacote de deploy está em `deploy/`.
