# Guia de Testes — Licita

Passo a passo para testar 100% das funcionalidades na sua máquina, antes de vender.
Marque cada item conforme for conferindo.

## Preparação

- [ ] **1. Ligar o servidor.** Clique duas vezes em `iniciar.cmd` (ou rode `npm run web`).
  O navegador abre em http://localhost:3000.
- [ ] **2. Conferir o acervo.** Rode `npm run clientes` num terminal — deve listar os
  clientes. Se quiser dados frescos, rode `npm run atualizar` (demora ~30 min).

## A. Landing page (aquisição)

- [ ] **3. Busca grátis.** Na página inicial, escolha um estado e digite um ramo
  (ex: `limpeza`). Clique **Ver agora**. Deve aparecer o número de licitações e
  alguns cards reais.
- [ ] **4. Captura de e-mail.** Abaixo dos resultados, digite um e-mail em
  "Quero receber" e envie. Confira depois em `data/leads.json`.

## B. Cadastro self-service (onboarding)

- [ ] **5. Criar painel.** Clique em **Criar meu painel** (ou vá em `/cadastro`).
  Preencha nome, e-mail, estado e ramo. Envie.
- [ ] **6. Resultado.** Deve aparecer "Painel criado!" com o número de editais e um
  **link de acesso**. Anote esse link (tem um token, ex: `/painel?c=abc123`).

## C. Painel do cliente (produto)

- [ ] **7. Abrir o painel.** Acesse o link do passo 6. Deve mostrar os editais do
  ramo, ordenados por prazo, com selo NOVO e um banner "Teste grátis: 7 dias".
- [ ] **8. Análise do edital.** Clique em qualquer edital. Abre o painel lateral com
  os dados. Clique em **Analisar este edital com IA**.
  - Deve aparecer: resumo, exigências de habilitação, alertas, e o **veredito
    apto / não apto** com item a item. (Leva até 1 min na 1ª vez; depois é instantâneo.)
  - *Obs: como a conta de IA é de tier inicial, analise um edital de cada vez para
    não bater no limite. Se der erro de limite, espere 1 min e tente de novo.*

## D. E-mail diário (retenção)

- [ ] **9. Preview do e-mail.** Rode `npm run digest -- --preview`. Ele salva os
  e-mails em `data/digest-*.html`. Abra um no navegador para ver o resumo diário.
  (Para enviar de verdade, precisa do Resend + domínio — isso é no deploy.)

## E. Cobrança (venda)

- [ ] **10. Vencer um cliente.** Pegue o token do cliente de teste e rode
  `node scripts/expirar.mjs <token>`.
- [ ] **11. Muro de pagamento.** Recarregue `/painel?c=<token>`. Em vez dos editais,
  deve aparecer **"Seu teste grátis terminou"** com a chave Pix e o contato.
- [ ] **12. Ativar.** Rode `node scripts/ativar.mjs <token>`. Recarregue o painel —
  os editais voltam (assinatura ativa por 30 dias).
- [ ] **13. Conferir status.** `npm run clientes` deve mostrar o cliente como ATIVO.

## F. Administração

- [ ] **14. Ver tudo.** Acesse `/painel?c=admin` — mostra os editais de todos os
  clientes juntos.
- [ ] **15. Limpar testes.** Remova os clientes de teste com
  `node scripts/remover.mjs <token>`.

## G. Atualização automática

- [ ] **16. Agendador.** Confira no Agendador de Tarefas do Windows a tarefa
  **"LicitaAtualizar"** (roda todo dia às 6h). Pode rodar manualmente com
  `npm run atualizar` para ver o ciclo completo.

---

## Checklist final antes de vender

- [ ] Troquei `LICITA_PIX_CHAVE` e `LICITA_CONTATO` no `.env` pelos meus dados reais.
- [ ] Testei o fluxo inteiro: busca → cadastro → painel → análise → cobrança.
- [ ] A análise de IA está funcionando (chave no `.env`).
- [ ] Decidi o nome/domínio do projeto.
- [ ] Quando aprovar tudo: contratar VPS e fazer o deploy (ver `DEPLOY.md`).
