# Deploy no Railway

O Licita já está quase pronto para o Railway. Pontos para quando formos subir:

## O que o Railway faz sozinho
- Detecta o Node pelo `package.json` e roda `npm start` (= `node web/server.mjs`).
- Dá uma URL pública e HTTPS automático.
- Permite agendar tarefas (cron) para o `atualizar` e o `digest`.

## O que precisa de atenção (eu cuido)
1. **Volume persistente.** O Railway zera o disco a cada deploy. Os dados graváveis
   (`perfis.json`, `data/licita.db`, `data/*.json`) precisam ficar num **Volume**
   montado, senão clientes e acervo somem a cada atualização. Vou tornar o caminho
   dos dados configurável (`LICITA_DATA_DIR`) e apontar para o volume.
2. **Variáveis de ambiente** (em Settings → Variables): `ANTHROPIC_API_KEY`,
   `RESEND_API_KEY`, `LICITA_BASE_URL` (a URL do Railway/domínio), `LICITA_PIX_CHAVE`,
   `LICITA_CONTATO`, `LICITA_ADMIN_TOKEN`.
3. **Primeira carga de dados.** Rodar `npm run ingest` (editais) e o
   `ingest-contratos` no servidor uma vez; depois o cron mantém atualizado.
4. **Crawl de contratos** é o trabalho pesado (milhões de registros) — roda no
   Railway por ser sempre-ligado, em background.

## Passos no dia do deploy
1. Criar conta em railway.app e um novo projeto (deploy do repositório).
2. Adicionar um Volume apontando para a pasta de dados.
3. Preencher as variáveis de ambiente.
4. Rodar a primeira carga e apontar o domínio.
