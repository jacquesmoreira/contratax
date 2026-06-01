# Deploy no Railway

Guia para subir o Licita num host sempre-ligado (Railway). O app é Node puro
(sem dependências), então o deploy é simples. O ponto crítico é o **volume
persistente** — sem ele, os dados somem a cada deploy.

## 1. Criar o projeto
1. Suba o repositório para o GitHub (privado).
2. Em railway.app: **New Project → Deploy from GitHub repo** e escolha o repo.
3. O Railway detecta o Node pelo `package.json` e roda `npm start`
   (= `node web/server.mjs`). Node 22.5+ é garantido pelo campo `engines`.

## 2. Volume persistente (OBRIGATÓRIO)
O disco do Railway zera a cada deploy. Tudo que é gravável precisa ficar num volume.
1. No serviço, **Settings → Volumes → Add Volume**.
2. Mount path: **`/data`**.
3. Nas variáveis (passo 3), aponte os dados para esse volume:
   - `LICITA_DATA_DIR=/data` (banco `licita.db`, caches, progresso, custos)
   - `LICITA_PERFIS=/data/perfis.json` (contas dos clientes)

> Localmente nada muda: sem essas variáveis, os dados ficam em `data/` e
> `perfis.json` na raiz, como hoje.

## 3. Variáveis de ambiente (Settings → Variables)
Essenciais:
- `ANTHROPIC_API_KEY` — chave da IA (análise dos editais).
- `LICITA_DATA_DIR=/data` e `LICITA_PERFIS=/data/perfis.json` (volume, passo 2).
- `LICITA_ADMIN_TOKEN` — um token secreto seu (acesso admin via `?c=...`).
- `LICITA_BASE_URL` — a URL pública do Railway (ou seu domínio).

Cobrança (página de assinar) e e-mail:
- `LICITA_PRECO` (ex: `197,00`), `LICITA_PIX_CHAVE`, `LICITA_CONTATO`.
- `RESEND_API_KEY` — se for enviar os e-mails (digest).

Ajustes opcionais (têm padrão):
- `LICITA_ANALISES_PLANO=100` (análises/mês do plano), `LICITA_ANALISES_TESTE=0`.
- `LICITA_MODELO_LEITURA=claude-haiku-4-5-20251001` (leitura barata).
- `LICITA_TRIAL_DIAS=7`.

## 4. Backfill de contratos (o crawl pesado)
São milhões de contratos (~163 mil/mês). Como **volumes não são compartilhados
entre serviços** no Railway, o backfill roda **no mesmo processo do servidor**:
- Adicione a variável **`LICITA_BACKFILL=1`**.
- O servidor sobe e, em background, vai preenchendo o acervo mês a mês, com pausa
  gentil (não toma bloqueio do PNCP) e progresso salvo no volume (retoma sozinho).
- Opcionais: `LICITA_BACKFILL_MESES=18`, `LICITA_BACKFILL_HORAS=6`.

Enquanto enche, o painel já funciona (mostra o que já entrou). O ranking por
órgão/cidade e o radar ficam mais ricos conforme o acervo cresce.

## 5. Primeira carga de editais
Os **editais abertos** (não os contratos) podem ser carregados uma vez:
- Pelo cron do Railway (Settings → Cron) rodando `npm run atualizar`
  periodicamente (ex: a cada 6h), que busca novos editais e atualiza o painel.

## 6. Conferir
- Acesse a URL pública: a landing e o `/cadastro` devem abrir.
- Crie uma conta de teste e confirme que o painel enche.
- `?c=SEU_LICITA_ADMIN_TOKEN` dá a visão admin (e libera a análise para testar).
- Ative um cliente após o Pix: `npm run ativar` (ou o script `ativar.mjs`).

## Resumo do que NÃO versionar (já no .gitignore)
`.env`, `perfis.json`, `leads.json`, `data/` — dados sensíveis e mutáveis.
No Railway eles vivem no volume e nas variáveis, não no repositório.
