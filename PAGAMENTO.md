# Pagamento automático (Asaas)

O Licita cobra de forma automática pelo Asaas: o cliente clica em assinar, paga
(Pix, cartão ou boleto) e a conta é **liberada na hora** pelo webhook — sem
comprovante manual. Pacotes avulsos somam créditos de análise do mesmo jeito.

## Como funciona
```
Cliente clica "Assinar Pro" → /api/checkout cria a cobrança no Asaas
→ redireciona para a página de pagamento do Asaas → cliente paga
→ Asaas chama /api/webhook/asaas → o sistema ativa o plano (ou soma os avulsos)
```

## Setup (uma vez)
1. Crie conta no Asaas (comece pelo **Sandbox** para testar): asaas.com.
2. Pegue a **API Key** em Configurações → Integrações → API.
3. No host (Railway → Variables), configure:
   - `ASAAS_API_KEY` = a chave da conta
   - `ASAAS_BASE_URL` = `https://sandbox.asaas.com/api/v3` (teste) ou
     `https://api.asaas.com/v3` (produção)
   - `ASAAS_WEBHOOK_TOKEN` = um segredo qualquer que você inventa (ex: uma senha longa)
4. No Asaas, em **Configurações → Webhooks**, adicione:
   - URL: `https://SEU-DOMINIO/api/webhook/asaas`
   - Token de autenticação: o **mesmo** valor de `ASAAS_WEBHOOK_TOKEN`
   - Eventos: marque **PAYMENT_RECEIVED** e **PAYMENT_CONFIRMED**

Sem `ASAAS_API_KEY`, a página de assinar cai no modo "Pix manual" (concierge):
mostra a chave Pix e o contato para enviar o comprovante.

## Planos (configuráveis por env)
- `LICITA_PRECO_BASICO` (default `197,00`) / `LICITA_ANALISES_BASICO` (default `100`)
- `LICITA_PRECO_PRO` (default `297,00`) / `LICITA_ANALISES_PRO` (default `250`)
- Avulsos: `LICITA_PRECO_AV50` (default `97,00`, +50) / `LICITA_PRECO_AV150` (default `247,00`, +150)

## Testar no Sandbox
1. Configure as variáveis com a chave de sandbox e reinicie.
2. Na página `/assinar`, clique em Assinar — deve abrir a página de pagamento do Asaas.
3. No sandbox, pague a cobrança (o Asaas tem botões de simular pagamento).
4. Confirme que a conta virou "ativo" e a cota subiu (no painel, badge de análises).

## Como o sistema sabe quem pagar liberar
A cobrança leva uma `externalReference`:
- `sub:<token-da-conta>:<nivel>` para assinatura (nivel = basico/pro)
- `avulso:<token-da-conta>:<pacote>` para pacote avulso (p50/p150)
O webhook lê isso e ativa a conta certa. A renovação mensal reativa sozinha a cada
pagamento confirmado.
