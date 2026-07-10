# ContrataX — Handoff de contexto

> **Para qualquer outra IA ou desenvolvedor que pegue este projeto:** este documento contém TUDO que precisa pra continuar de onde paramos. Leitura: ~10 minutos.

**Última atualização:** 2026-07-08 (quarta-feira, fechamento da noite)
**Status:** Em operação, infra 100% saudável. Domínio raiz resolvido e confirmado (Railway, certificado válido). 513 páginas indexadas, revalidação dos 307 erros 5xx disparada no Search Console (causa raiz confirmada e corrigida). Primeiros cliques orgânicos reais aparecendo, inclusive capturando busca por concorrente. Google Ads religado com a conversão `purchase` finalmente configurada certo (achado que estava quebrada desde o início) — rodando 14 dias de aprendizado sem mexer. 3 backlinks confirmados (B2B Stack, Product Hunt, G2). Fase atual: deixar rodar e observar — próximos trials (funil corrigido), validação do Search Console, e resultado do teste pago.

---

## 1. O negócio em uma frase

**ContrataX** é um SaaS B2B self-serve que monitora licitações públicas brasileiras (dados oficiais do PNCP), avisa o fornecedor quando aparece edital do ramo dele, lê o edital com IA (ContrataX.IA) e diz se ele está apto a participar.

- **Domínio**: `contratax.com.br` (com www)
- **Modelo**: assinatura mensal recorrente, sem fidelidade
- **Aquisição**: 100% orgânica + SEO programático (1.609 URLs no sitemap)
- **Suporte**: zero outbound, zero vendas ativas, zero ligações, zero demos
- **CNPJ operador**: 61.740.453/0001-49 (Jacques Brião Moreira, MEI)

---

## 2. Quem é o fundador

**Jacques Brião Moreira**
- Email: jacques.moreira@gmail.com
- Cidade: Balneário Camboriú/SC
- Regime: MEI (Micro Empreendedor Individual)
- Empresa-mãe: NegouPlano (negouplano.com.br) — SaaS de reversão de negativas de plano de saúde
- Estilo: bootstrap, B2C/B2B self-serve com IA 24/7, sem networking, sem outbound

**Restrições não-negociáveis:**
- Sem outbound prospecting
- Sem ligações/demos/networking
- Sem depoimentos fabricados (ilegal — CDC + CONAR)
- Sem Google Ads vertical saúde (bloqueado pelo Google)
- Sem programa de indicação até ter 30+ clientes ativos

---

## 3. Stack técnica

- **Runtime**: Node.js v24 (`D:/node.js/node.exe` no Windows local)
- **Filosofia**: zero dependências externas (só built-ins do Node)
- **Banco**: SQLite via `node:sqlite` (built-in, experimental)
- **HTTP**: `node:http` puro, sem framework
- **Auth**: token por perfil em URL `?c=<token>` + cookie HttpOnly
- **Crypto**: `node:crypto` para senhas (PBKDF2) e tokens
- **Deploy**: Railway (https://railway.app)
- **Repositório**: github.com/jacquesmoreira/contratax
- **Branch principal**: `main`

---

## 4. Estrutura do projeto

```
D:/Licita/
├── web/
│   ├── server.mjs            # HTTP server (todas as rotas)
│   └── public/               # HTML estáticos servidos
│       ├── index.html        # Painel do cliente (SPA)
│       ├── lp.html           # Landing page
│       ├── lp-comparativo.html
│       ├── cadastro.html, entrar.html, conta.html
│       ├── assinar.html, obrigado.html
│       ├── equipe.html, documentos.html, recebiveis.html, contratos.html
│       ├── itens.html        # Viewer de itens de um edital (abre em nova aba do painel)
│       ├── admin.html        # Painel admin (gated por LICITA_ADMIN_TOKEN)
│       ├── erro-500.html, privacidade.html, termos.html
│       ├── sw.js             # Service Worker (v2)
│       ├── manifest.json     # PWA
│       └── portais/          # logos dos portais de origem
├── src/
│   ├── db.mjs                # SQLite (consultas: contratacoes, contratos, empresas)
│   ├── perfis.mjs            # JSON-based store de clientes
│   ├── caminhos.mjs          # paths (LICITA_DATA_DIR + LICITA_PERFIS)
│   ├── env.mjs
│   ├── pncp.mjs              # ingest do PNCP
│   ├── ingest.mjs, ingestContratos.mjs, backfillContratos.mjs
│   ├── monitor.mjs           # cruza filtro do cliente com editais novos
│   ├── filtro.mjs            # palavras-chave + UF + modalidade
│   ├── analise.mjs, ia.mjs   # Claude API (Anthropic SDK)
│   ├── tldr.mjs              # resumo rápido Haiku (cache global)
│   ├── impugnacao.mjs        # dossiê de impugnação por IA
│   ├── declaracoes.mjs       # geração de declarações de habilitação
│   ├── minutasContrato.mjs   # prorrogação, aditivo, reequilíbrio
│   ├── extratorContrato.mjs, parserNFe.mjs
│   ├── recebiveis.mjs, contratosMeus.mjs
│   ├── correcaoMonetaria.mjs, indicesEconomicos.mjs
│   ├── alertasContratos.mjs, alertasCertidoes.mjs, alertasRecebiveis.mjs
│   ├── escalonamentoCobranca.mjs, escalonamentoJuridico.mjs
│   ├── oficioCobranca.mjs, antecipacaoRecebivel.mjs
│   ├── radar.mjs, calendario.mjs
│   ├── aptidao.mjs, documentos.mjs
│   ├── preco.mjs             # contratos do fornecedor + agruparContratos
│   ├── precoReferencia.mjs
│   ├── capag.mjs             # reputação CAPAG do Tesouro
│   ├── reputacaoOrgaos.mjs
│   ├── categorias.mjs, cnpj.mjs
│   ├── planos.mjs            # PLANOS + AVULSOS + planoDe()
│   ├── assinatura.mjs        # statusAtual, ativarPlano, cancelarPorToken,
│   │                         # calcularProRata, aplicarUpgrade
│   ├── asaas.mjs             # gateway de pagamento (criar/cancelar/upgrade)
│   ├── uso.mjs               # cota de análises mensal
│   ├── custo.mjs             # tracking de custo de IA por chamada
│   ├── email.mjs             # envio via Resend
│   ├── onboarding.mjs        # checklist self-service
│   ├── onboardingEmails.mjs  # 3 emails na 1ª semana
│   ├── digestDiario.mjs      # email diário com editais novos do ramo
│   ├── avisoRenovacao.mjs    # email 7d e 1d antes de renovar
│   ├── winbackEmails.mjs     # reengajamento DIARIO dos nao-convertidos (afunila: diario->semanal->mensal), formato Boletim
│   ├── recuperarSenha.mjs, senha.mjs
│   ├── equipe.mjs            # multiusuário (assentos por plano)
│   ├── googleOAuth.mjs       # login com Google
│   ├── cadastro.mjs
│   ├── backup.mjs            # backup off-site diário
│   ├── analytics.mjs         # GA4 + GTM + Clarity + Meta Pixel + PWA
│   ├── rateLimitAuth.mjs, rateLimitVisitante.mjs
│   ├── store.mjs, atualizador.mjs, monitor.mjs
│   ├── seoPaginas.mjs        # /licitacoes/<ramo>/<uf>
│   ├── seoOrgaos.mjs         # /orgaos/<slug>
│   ├── seoCnae.mjs           # /cnae/<codigo>
│   ├── paginasInstitucionais.mjs
│   ├── ajuda.mjs, blog.mjs, exportar.mjs, zip.mjs
│   ├── assessoria.mjs        # planos Assessoria 10/25 (consultores)
│   └── dados/                # CAPAG, índices econômicos, etc.
├── data/                     # banco SQLite + caches + backups (volume Railway)
├── perfis.json               # contas dos clientes (volume Railway)
├── HANDOFF.md                # ESTE arquivo
└── package.json              # type:module
```

---

## 5. Variáveis de ambiente (Railway)

**Pagamento e webhook**
- `ASAAS_API_KEY` — chave de produção da conta Asaas
- `ASAAS_BASE_URL` — `https://api.asaas.com/v3`
- `ASAAS_WEBHOOK_TOKEN` — segredo do webhook (precisa ser idêntico ao que está no painel do Asaas)

**E-mail e IA**
- `RESEND_API_KEY` — Resend (domínio contratax.com.br verificado)
- `LICITA_EMAIL_FROM` — `ContrataX <noreply@contratax.com.br>` ou similar
- `ANTHROPIC_API_KEY` — chave Claude API (usada por tldr.mjs + analise.mjs + impugnacao.mjs)

**Auth/Admin**
- `LICITA_ADMIN_TOKEN` — token do painel admin (`/admin?c=...`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — login Google

**Contato e dados**
- `LICITA_CONTATO` — `jacques.moreira@gmail.com` (cancelamentos, estornos, backup)
- `LICITA_DATA_DIR` — `/data` (volume persistente Railway)
- `LICITA_PERFIS` — `/data/perfis.json`
- `LICITA_BASE_URL` — `https://www.contratax.com.br`

**Loops background (ativam funcionalidades)**
- `LICITA_BACKFILL=1` — ingest contínuo de contratos PNCP
- `LICITA_BACKFILL_MESES=18`, `LICITA_BACKFILL_HORAS=6`
- `LICITA_ATUALIZAR=1` — atualizador de editais
- `LICITA_DIGEST=1` — email diário + avisos de renovação
- `LICITA_DIGEST_HORA=8` — horário Brasília
- `LICITA_BACKUP=1` — backup diário off-site (manda email com link)
- `LICITA_BACKUP_HORA=3`, `LICITA_BACKUP_MANTER=7`

**Trava de custo**
- `LICITA_TLDR_LIMITE_DIA=30` — máximo de TL;DRs novos por cliente/dia
- `LICITA_TRIAL_DIAS=7`
- `LICITA_GRACA_DIAS=3` — carência após vencimento antes de bloquear

**LGPD**
- `LICITA_IP_RETENCAO_DIAS=30` — após esse prazo, IP em perfil é anonimizado (default 30)

**Marketing/Tracking (com fallback no código)**
- `LICITA_GA4_ID` — default `G-N79Q5SH624`
- `LICITA_GA4_API_SECRET` — Measurement Protocol secret (Conversion API)
- `LICITA_CLARITY_ID` — default `wrs09m31ps`
- `LICITA_GTM_ID`, `LICITA_META_PIXEL_ID` — opcionais

**Preços (overrides; default no planos.mjs)**
- `LICITA_PRECO_STARTER=59,00`
- `LICITA_PRECO_BASICO=247,00` (`LICITA_PRECO` legado também aceito)
- `LICITA_PRECO_PRO=397,00`
- `LICITA_PRECO_ASS10=697,00`, `LICITA_PRECO_ASS25=1297,00`
- Avulsos: `LICITA_PRECO_AV10=79,00`, `LICITA_PRECO_AV25=189,00`, `LICITA_PRECO_AV50=369,00`
- Cotas: `LICITA_ANALISES_STARTER=3`, `LICITA_ANALISES_BASICO=30`, `LICITA_ANALISES_PRO=50`, `LICITA_ANALISES_ASS10=8`, `LICITA_ANALISES_ASS25=6`

---

## 6-A. Análise de margem (2026-06-07)

Custos REAIS medidos no `data/custos-ia.jsonl`:
- Leitura de edital nova (Sonnet 4.6, com cache write): R$ 1,42 - R$ 2,89
- Conferência (cache read): R$ 0,17
- Impugnação: R$ 0,35
- TL;DR (Haiku 4.5, cache miss): ~R$ 0,05

**Fórmula pessimista** (cliente usa 100% da cota):
```
custo = (cota × R$ 2,50) + R$ 2,25 TL;DR pico + 4% Asaas + R$ 1 infra
margem 60% exige: receita >= (2,5 × cota + 3,25) / 0,36
```

**Diagnóstico dos planos atuais (PESSIMISTA, cliente usa 100%):**

| Plano | Receita | Custo | Margem | Status |
|---|---|---|---|---|
| Starter (3) | R$ 59 | R$ 13 | 78% | OK |
| Básico (50) | R$ 197 | R$ 141 | 28% | Crítico |
| Pro (100) | R$ 297 | R$ 273 | 8% | Quase prejuízo |
| Assessoria 10 (200) | R$ 497 | R$ 525 | -6% | Prejuízo |
| Assessoria 25 (500) | R$ 897 | R$ 1.298 | -45% | Prejuízo grande |

**Decisão pendente (Jacques precisa escolher):** Cenário A, B ou C para garantir margem mínima de 60% pessimista. Ver discussão completa no chat de 2026-06-07.

---

## 6. Planos e modelo de cobrança (Cenário A — 2026-06-07)

```
Starter  R$ 59,00/mês     3 análises completas, busca ilimitada (DEGUSTAÇÃO)
Básico   R$ 247,00/mês    30 análises completas, 5 extrações PDF
Pro      R$ 397,00/mês    50 análises completas, 20 extrações PDF

Assessoria 10  R$ 697,00/mês   10 CNPJs, 8 análises/CNPJ (80 total)
Assessoria 25  R$ 1.297,00/mês 25 CNPJs, 6 análises/CNPJ (150 total)

Pacote avulso 10    R$ 79,00  (R$ 7,90/análise)
Pacote avulso 25    R$ 189,00 (R$ 7,56/análise)
Pacote avulso 50    R$ 369,00 (R$ 7,38/análise)
```

**Garantia de margem:** todos os planos têm **mínimo 60% de lucro** mesmo se o
cliente usar 100% da cota mensal. Margens reais com uso médio (60% da cota):

| Plano | Receita | Custo realista | Margem |
|---|---|---|---|
| Starter | R$ 59 | ~R$ 9 | 84% |
| Básico | R$ 247 | ~R$ 50 | 80% |
| Pro | R$ 397 | ~R$ 80 | 80% |
| Assessoria 10 | R$ 697 | ~R$ 145 | 79% |
| Assessoria 25 | R$ 1.297 | ~R$ 280 | 78% |

**O que conta como "análise":**
- ✅ Click em "🔍 Analisar este edital" → IA lê o PDF, dá veredicto, lista o que falta, gera dossiê
- ❌ Busca, alertas, radar, TL;DR (resumo rápido), conferência de documentos avulsa

**TL;DR (resumo rápido):**
- **Ilimitado** pra assinante ativo (gancho de ativação)
- Cache global por edital: segundo cliente do mesmo edital → custo R$ 0
- Trava anti-abuso: 30 cache-misses por cliente/dia (configurável)
- Custo aproximado: R$ 0,30 por edital novo (Haiku 3.5)
- Análise completa custa ~R$ 2-3 (Sonnet)

**Upgrade pro-rata** (`src/assinatura.mjs::calcularProRata`):
```
diferença = (preço_novo - preço_atual) × dias_restantes / 30
piso: R$ 5,00 (evita cobrança irrisória)
teto: 30 dias
```

Cliente paga a diferença via cobrança avulsa Asaas → webhook reconhece `upgrade:TOKEN:NIVEL` → eleva nível imediato + `PUT /subscriptions/{id}` atualiza valor recorrente.

**Downgrade:** manual via email (`contato@contratax.com.br`). Evita arbitragem (cliente sobe pra Pro, lê 100, desce no fim do mês).

**Cancelamento:** self-service em `/conta`. Chama `DELETE /subscriptions/{id}` no Asaas + marca `canceladoEm` no perfil. Acesso mantido até `expiraEm`.

---

## 7. Fluxo de pagamento (validado em produção 2026-06-07)

```
1. Cliente em /assinar?c=TOKEN clica em "Assinar [Plano]"
2. POST /api/checkout cria customer no Asaas + cria subscription
   - externalReference: "sub:TOKEN:NIVEL"
   - successUrl: /obrigado?c=TOKEN
3. Cliente paga (Pix/cartão/boleto) na URL Asaas
4. Asaas envia POST /api/webhook/asaas com header asaas-access-token
5. Servidor valida token contra ASAAS_WEBHOOK_TOKEN
6. Eventos tratados:
   - PAYMENT_RECEIVED/PAYMENT_CONFIRMED → ativarPlano(token, nivel, 30, billingType)
   - PAYMENT_OVERDUE → email amarelo para cliente
   - PAYMENT_REFUNDED/PAYMENT_CHARGEBACK_REQUESTED → email vermelho para Jacques
7. Conversion API GA4 dispara evento "purchase" server-side (sobrevive se cliente fechar navegador)
8. /obrigado mostra "Pagamento confirmado" e libera link pro painel
```

**Webhook de Asaas** (config necessária no painel Asaas):
- URL: `https://www.contratax.com.br/api/webhook/asaas`
- Token: precisa bater com `ASAAS_WEBHOOK_TOKEN` no Railway
- Eventos: PAYMENT_CREATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED
- "Fila de sincronização": ativada (retry automático)

---

## 8. Funcionalidades implementadas

### Captura e ingest
- [x] Ingest contínuo PNCP (loop background)
- [x] Backfill de contratos 18 meses
- [x] Cache de TL;DR global por edital
- [x] Filtro por palavras-chave + UF + modalidade

### Painel do cliente
- [x] Login senha + Google OAuth
- [x] Recuperar senha
- [x] Painel SPA (index.html) com busca, alertas, radar
- [x] Resumo rápido (TL;DR) ilimitado, com cache
- [x] Análise completa por edital (cota mensal)
- [x] Dossiê de impugnação por IA
- [x] Conferência de documentos contra edital
- [x] Geração de declarações de habilitação
- [x] Radar de renovação (contratos que vencem)
- [x] Calendário de prazos
- [x] Recebíveis (pagamentos pendentes do governo)
- [x] Minutas (prorrogação, aditivo, reequilíbrio)
- [x] Multiusuário (equipe + assentos por plano)
- [x] Reputação CAPAG do Tesouro Nacional
- [x] Onboarding interativo (checklist)
- [x] Toggle "Mostrar senha" em todos os inputs password

### Assinatura
- [x] Trial 7 dias
- [x] Checkout Asaas (Pix/cartão/boleto)
- [x] Webhook → ativação automática
- [x] Conversion API GA4 server-side
- [x] Upgrade pro-rata self-service
- [x] Cancelamento self-service
- [x] Chip de status no nav com data de renovação (amarelo ≤7d, laranja ≤2d)
- [x] Email 7 dias antes da renovação
- [x] Email 1 dia antes da renovação
- [x] Email cobrança vencida (PAYMENT_OVERDUE)
- [x] Email estorno/chargeback para o Jacques

### Painel — funcionalidades recentes
- [x] **Viewer de itens** (`itens.html`) — página standalone que abre em nova aba do painel com todos os itens de um edital (quantidade, unidade, valor unitário, valor total). Filtro em tempo real por descrição. Útil pra editais de ata de registro de preços com 80-200+ itens. Abertura via botão "📦 Ver o que está sendo comprado →" no painel.

### Régua de e-mail (ativação + reengajamento + Boletim)
- [x] **Onboarding** (`src/onboardingEmails.mjs`) — 5 toques no teste: boas-vindas (dia 0), ATIVAÇÃO (dia 2, mostra os editais reais do ramo), veredito (dia 4), planos (dia 6), últimas horas (dia 7). Ataca a baixa ativação (quase ninguém rodava a 1ª análise no teste).
- [x] **Reengajamento diário** (`src/winbackEmails.mjs`, `disparosReengajamento`) — para quem testou e não assinou: DIÁRIO até 14 dias após expirar, SEMANAL até 60, MENSAL depois (pra sempre). Cada e-mail lidera com os editais do dia do ramo + muro "reative pra ver o veredito". Roda 1x/dia no `digestLoop`. Respeita `_jaFoiPago`, `_descadastrado`, 1/dia (`_ultimoReengajamento`).
- [x] **Formato Boletim** (`boletimLayout` em `src/email.mjs`) — digest e reengajamento saem com nº de edição, data de processamento, bloco de identificação do cliente (código, empresa+CNPJ, filtro, vigência da assinatura), saudação formal e política de uso. Cara de empresa estabelecida (inspirado no boletim da ConLicitação).
- [x] **Descadastro de 1 clique** — rota `/descadastrar` (GET + one-click POST RFC 8058) + header `List-Unsubscribe`. Honrado em digest, onboarding e reengajamento. Flag `_descadastrado` no perfil. Pré-requisito pra envio diário não virar spam.

### Marketing/SEO
- [x] Landing page (`lp.html`) + Comparativo (`lp-comparativo.html`)
- [x] SEO programático: 1.609 URLs no sitemap (13 base + 36 blog + 1.009 seoPaginas + 521 órgãos + 30 CNAE)
- [x] `<lastmod>` com data de hoje em todas as URLs do sitemap (acervo regenera diariamente do PNCP — legítimo)
- [x] `/licitacoes/<ramo>/<uf>` com Schema.org Event JSON-LD
- [x] `/orgaos/<slug>` (~521 órgãos com 5+ contratos)
- [x] `/cnae/<codigo>` (30 CNAEs estratégicos)
- [x] Schema.org GovernmentOrganization
- [x] 6 landing pages comparativas vs concorrentes (`/blog/contratax-vs-*`)
- [x] 35+ artigos pilar no blog (Lei 14.133, MEI em licitação, PNCP, impugnação, etc.)
- [x] GA4 (G-N79Q5SH624) + Microsoft Clarity (wrs09m31ps)
- [x] PWA (manifest, service worker, "Adicionar à tela inicial")
- [x] Cookie banner LGPD

### Operação
- [x] Painel admin (gated por LICITA_ADMIN_TOKEN)
- [x] Medidor de custo de IA por cliente
- [x] Backup off-site diário (email com link de download)
- [x] Rate limit em auth/cadastro/visitante
- [x] Página 500 amigável (com ID rastreável)
- [x] CSP configurada (libera Clarity, GA, Google Fonts, GTM)
- [x] HTTPS via Railway

### Seguranca e LGPD reforcadas
- [x] Headers HTTP de seguranca: X-Content-Type-Options, X-Frame-Options SAMEORIGIN, Referrer-Policy, HSTS 2 anos+preload, Permissions-Policy (geolocation/microphone/camera/payment/usb/accelerometer/etc), Cross-Origin-Resource-Policy same-origin, X-DNS-Prefetch-Control off, X-XSS-Protection
- [x] **Disclaimer permanente** em toda analise IA (texto amarelo no topo) + botao verde "Ver edital oficial no PNCP" destacado em cada analise
- [x] **Anonimizacao automatica** de IP em perfis com > 30 dias (LICITA_IP_RETENCAO_DIAS configuravel). Mascara 189.45.67.123 -> 189.45.x.x. Roda 1x/dia no loop do digest.
- [x] **Painel "Meus Dados" (LGPD art. 18)** em /conta: cliente baixa todos seus dados em JSON ou CSV (portabilidade)
- [x] **Email automatico pos-login**: notifica cliente a cada login bem-sucedido com data, regiao do IP (mascarado), dispositivo. CTA "Trocar minha senha" se nao foi ele.
- [ ] 2FA TOTP opcional (pendente — auth atual e token-based em URL, refator necessario)

### Legal/Conformidade
- [x] Política de Privacidade (`/privacidade`)
- [x] **Termos de Uso 2.0** (`/termos`) com:
  - CDC art. 49 (7 dias arrependimento + reembolso integral)
  - Cláusula 6.1 — fonte secundária de dados (PNCP prevalece)
  - Cláusula 6.2 — disclaimer reforçado de IA (Anthropic Claude)
  - Cláusula 6.5 — **limitação de responsabilidade: teto de 12 meses pagos**
  - Cláusula 6.6 — "como está", janelas de manutenção
  - Cláusula 9 — alterações com **30 dias de antecedência**
  - Cláusula 9-A — registro do aceite (IP/timestamp/versão)
- [x] **Clickwrap explícito no cadastro**: checkbox obrigatório + log de IP (server-side), timestamp e versão dos termos salvos no perfil (`perfil.aceiteTermos`)
- [x] LGPD (Lei 13.709/2018) cumprida no cookie banner
- [x] DPO declarado (Jacques)

---

## 9. Comandos úteis

**Rodar local:**
```bash
cd D:/Licita
# Token admin de produção (NÃO commitar)
LICITA_ADMIN_TOKEN=qualquer D:/node.js/node.exe web/server.mjs
```

**Boot syntactico (testar imports sem subir HTTP):**
```bash
D:/node.js/node.exe -e "
require('node:http').createServer = () => ({ listen: () => console.log('BOOT OK'), on: () => {} });
import('./web/server.mjs').then(() => setTimeout(() => process.exit(0), 500));
"
```

**Testar função específica:**
```bash
D:/node.js/node.exe -e "
import('./src/assinatura.mjs').then(({ calcularProRata }) => {
  // ...
});
"
```

**Deploy:**
```bash
git add -A && git commit -m "..." && git push origin main
# Railway auto-deploya em 1-2 min
```

---

## 10. Padrões de código e estilo

**Comentários:**
- Em PORTUGUÊS (do Brasil), sem acento (evita problemas de encoding)
- Explicar o **porquê**, não o **o quê**
- Comentar regras de negócio sutis, não código óbvio

**Copy/UX:**
- **Sem exclamação** em copy comercial (Jacques odeia "Compre agora!")
- **Sem em-dash** (—) — usar vírgula ou ponto
- Tom seco, profissional, B2B
- Sem emoji em copy (só em UI quando necessário pra sinalizar — ex: 🔍 🔒)

**Commits:**
- Mensagem em português, descreve "o quê" + "porquê"
- Sem "BREAKING:", sem "feat:", sem "fix:" prefix
- Sem coautor Claude (foi pedido — não adicionar `Co-Authored-By` em ContrataX)

**Segurança:**
- NUNCA commitar valor de token/secret no chat
- NUNCA logar token completo (truncar)
- ASAAS_WEBHOOK_TOKEN: validar com `req.headers["asaas-access-token"]`
- Admin token sem fallback inseguro em produção (warn se não definido)

---

## 11. Decisões de produto importantes

| Decisão | Por quê |
|---|---|
| TL;DR fora da cota | Cliente Starter (3/mês) esgotava em 3 resumos sem chegar na análise completa que vende o upgrade |
| Cota só na análise COMPLETA | É ela que justifica plano superior (Pro com 100/mês) |
| Cache global do TL;DR | Custo de API marginal — segundo cliente do mesmo edital paga R$ 0 |
| Upgrade pro-rata | Justo, padrão de mercado SaaS B2B |
| Downgrade manual via email | Evita arbitragem (subir, consumir, descer) |
| Chip mostra DATA exata, não countdown | Mais profissional, menos ansioso |
| Backup envia EMAIL com link de download | Resiliência off-site sem depender de S3/GCS |
| Webhook 200 sempre, mesmo em erro interno | Evita Asaas re-tentar em loop (penalização) |
| Sem reembolso proporcional | Termos avisam; só CDC 7d obriga |
| Service Worker NÃO intercepta cross-origin | CSP bloqueia se SW faz fetch de outro domínio (corrigido v2) |

---

## 12. Decisões REJEITADAS conscientemente

| Sugestão | Por que não |
|---|---|
| Programa de indicação | Sem base de clientes ainda (revisitar com 30+ ativos) |
| Outbound / parcerias contadores | Contraria regra do Jacques (zero outbound) |
| 20 artigos/semana de blog | Impossível pra MEI solo. SEO programático com 1.602 URLs faz o mesmo trabalho |
| Headline "Transforme seu CNPJ em..." | Genérica de infoprodutor. Atual é mais direta |
| Analisador de edital grátis ilimitado | Você pagaria a API de quem nunca converte |
| Widgets/embed pra prefeituras | Prefeitura não é ICP (ICP = fornecedor) |
| Depoimentos fabricados | ILEGAL (CDC + CONAR) — nunca |
| Self-service downgrade | Arbitragem (subir, consumir, descer) |
| Google Ads vertical saúde | Bloqueado pelo Google pra essa vertical |
| **Lances pela plataforma** | **Risco existencial** sem ser leiloeiro oficial (Dec 21.981/1932). CDC art. 51 anula cláusulas que eximem responsabilidade em B2C. Cliente perdeu lance de R$ 1M? Patrimônio pessoal do MEI responde. Manter modelo "Bloomberg + corretora" (camada de inteligência, execução no portal oficial). Só revisar com LTDA + seguro E&O + advogado digital + infra multi-AZ. |

---

## 13. Estado atual / Próximos passos

**06/07/2026 — domingo (estado atual)**
- ✅ Sistema em produção, estável
- ✅ SEO técnico completo: 1.609 páginas, schema, sitemap com lastmod, 35+ artigos pilar, 6 páginas vs concorrentes
- ✅ Sequência win-back implementada (3 e-mails automáticos pós-expiração)
- ✅ Viewer de itens de edital (itens.html)
- ⚠️ Tráfego orgânico ainda baixo — esperado para domínio de ~1 mês; domínio precisa de backlinks para ganhar autoridade
- ⚠️ Google Ads: sequência crítica de junho (#55) ainda pendente de execução (Jacques)

**Alavancas de curto prazo (Jacques — manual)**
- 🔑 Google Business Profile (#57) — base de tudo, ainda não feito
- 🔑 Backlinks BR (#56): GetApp Brasil, Capterra Brasil, AppMasters, Guia Mais/Apontador, diretórios de empresa BR, post LinkedIn pessoal, guest post em blog de despachante/contador/consultor de licitação, imprensa regional (Balneário Camboriú/SC)
- 🔑 Google Ads: importar conversão `purchase` + trocar para "Maximizar conversões" + religar em R$ 30/dia (#55)
- Search Console: revalidar erros após indexação completa (#49)
- Bing Webmaster Tools verificação (#47)

**Backlog técnico (não urgente)**
- 2FA TOTP opcional (#35 — auth atual é token-based em URL, refator necessário primeiro)
- Botão "Reativar assinatura" pra reduzir churn por arrependimento
- Endereço comercial (quando migrar pra LTDA, ~30+ clientes)
- Email comercial `contato@contratax.com.br` via Cloudflare Email Routing
- Logos PNG dos portais em `/portais/` (Jacques vai mandar)
- Página de status pública (status.contratax.com.br)
- Aceite explícito no fluxo Google OAuth (`/conta?completar=1`)
- Contratar 1h com advogado de direito digital (R$ 500-800) para revisar termos 2.0 e privacidade
- Migrar pra LTDA quando passar de R$ 50k MRR (proteção patrimonial)
- OG image dinâmica + imagens convertidas para WebP (#60)
- Healthcheck Railway: `HEALTHCHECK_PATH=/health` (#61)
- Breadcrumbs schema em todas as páginas SEO (#58)

---

## 14. Cliente único atual (07/06/2026)

```
Empresa: 61.740.453 JACQUES BRIAO MOREIRA (próprio Jacques)
CNPJ: 61.740.453/0001-49
Email: jacques.moreira@gmail.com
Plano: STARTER ATIVO
Pagamento: PIX
Renovação: 07/07/2026
Análises usadas: 0/3
Equipe: 1/1
Token: e29744cdbda68bdd9877426d57d5a007 (NUNCA commitar)
```

---

## 15. Como debugar problemas comuns

### "Pagamento não ativa a conta"
1. Asaas → Integrações → **Logs de Webhooks** → ver status HTTP
2. Se **401** → token diferente entre Asaas e Railway (`ASAAS_WEBHOOK_TOKEN`)
3. Se **404** → URL errada (deve ser `/api/webhook/asaas` no final)
4. Se **500** → bug no nosso código, ver Railway → Logs
5. Se **não tem log** → webhook desativado ou eventos não marcados
6. **Plano B**: ativar manualmente pelo admin (`/admin?c=ADMIN_TOKEN`)

### "Webhook está penalizado"
- Acontece após 15 falhas seguidas. Asaas pausa a fila.
- Fix: corrige a causa (token, URL) → deleta o webhook → recria

### "Console com erros de CSP / Service Worker"
- Provavelmente cache antigo do `sw.js v1`. Solução:
  - DevTools → Application → Service Workers → Unregister + Clear Storage
  - OU aba anônima (Ctrl+Shift+N)

### "Cliente diz que cota acabou rápido"
- TL;DR está fora da cota desde 07/06. Se cliente reclama, é porque ele clicou na ANÁLISE COMPLETA. Limite mensal é correto.

### "Cliente quer cancelar mas não acha o botão"
- `/conta` → rola até o final → card vermelho "Cancelar assinatura"

### "Backup não está chegando no email"
- Verifica env `LICITA_BACKUP=1` no Railway
- Verifica `RESEND_API_KEY` configurada
- Verifica `LICITA_CONTATO` aponta pra email válido

---

## 16. Métricas chave a acompanhar

**Custo Anthropic API**
- Painel admin mostra `R$ X custo total` por cliente
- Anthropic Console: `console.anthropic.com` → Usage
- Alvo: TL;DR < R$ 1/dia por cliente médio; análise completa < R$ 3/uso

**GA4 (Tempo Real)**
- `analytics.google.com` → ContrataX → Tempo real
- Eventos críticos: `purchase` (server-side via Conversion API)

**Microsoft Clarity**
- `clarity.microsoft.com` → ContrataX (project `wrs09m31ps`)
- Heatmap + session recordings (a partir de 2-3h após visita)

**Search Console**
- `search.google.com/search-console` → contratax.com.br
- Indexação: 253 URLs em `site:` em 5 dias (normal)

**Asaas**
- `app.asaas.com` → Cobranças → ver MRR
- Saldo disponível pra saque

---

## 17. URLs públicas importantes

- **Site**: https://www.contratax.com.br
- **Cadastro**: https://www.contratax.com.br/cadastro
- **Login**: https://www.contratax.com.br/entrar
- **Planos**: https://www.contratax.com.br/assinar?c=TOKEN
- **Admin**: https://www.contratax.com.br/admin?c=LICITA_ADMIN_TOKEN
- **Webhook**: https://www.contratax.com.br/api/webhook/asaas
- **Sitemap**: https://www.contratax.com.br/sitemap.xml
- **Termos**: https://www.contratax.com.br/termos
- **Privacidade**: https://www.contratax.com.br/privacidade

---

## 18. Para a próxima IA que pegar esse contexto

1. **Não invente features.** Pergunta antes de codar algo grande.
2. **Não cole valores de token/secret no chat.**
3. **Não use exclamações em copy.** Não use em-dash. Não invente depoimentos.
4. **Sempre testar local** (boot syntactico) antes de commitar.
5. **Sempre fazer commit em português** com explicação do porquê.
6. **Não sugerir outbound/cold call/networking** — contraria regra do fundador.
7. **A próxima alavanca não é mais código.** É marketing orgânico, content, SEO. Se ele te pedir mais feature, pergunte se não é hora de divulgar.
8. **MEI tem teto R$ 81k/ano.** Quando chegar perto, planejar migração pra LTDA com novo endereço comercial.

---

---

## 19. Diário de bordo (cronológico)

### 2026-06-07 (sábado)

**Manhã/tarde** — Maratona de produção:
- Configuração Asaas (chave de produção, domínio cadastrado)
- Webhook configurado e validado em produção
- Primeiro pagamento real recebido (R$ 59 Pix, processado em ~3 segundos automaticamente)
- Cancelamento self-service validado em produção
- Upgrade pro-rata implementado (calcularProRata + rota /api/conta/upgrade + UI em /conta)
- E-mails de aviso de renovação (7d antes e 1d antes) implementados em src/avisoRenovacao.mjs
- Chip do plano no nav agora mostra data exata de renovação (dd/mm/aaaa)
- Trava anti-abuso TL;DR (30 cache-misses/dia/cliente, configurável)
- TL;DR fora da cota mensal (vira gancho de ativação ilimitado)
- Bug do TL;DR sumindo na tela corrigido
- Service Worker v2: bypass de cross-origin (era a causa dos erros CSP em GA/Clarity/Fonts)
- CSP liberou Clarity (script-src + connect-src) e Google Fonts (connect-src)
- Toggle "mostrar/ocultar senha" em cadastro, entrar e redefinir-senha
- Agrupamento de contratos corrigido (normalização YYYY-MM-DD na chave)
- Página de erro 500 amigável (com ID rastreável)
- Backup off-site automático diário (snapshot SQLite + gzip + email com link)
- HANDOFF.md criado (este documento)

**Final de tarde** — Reforço jurídico:
- Discussão sobre contrato de adesão e proteção legal
- Conclusão: NÃO implementar lances pela plataforma (risco existencial para MEI)
- Termos de Uso 2.0 reescritos com:
  - Cláusula 6 expandida (fonte secundária, IA, sem garantia, indisponibilidade de terceiros, limitação contratual de responsabilidade com teto de 12 meses, janelas de manutenção)
  - Cláusula 9 reforçada (alterações com 30 dias de antecedência)
  - Nova cláusula 9-A (registro do aceite com IP/timestamp/versão como prova jurídica)
- Clickwrap explícito implementado no cadastro:
  - Checkbox obrigatório (`#aceite-termos required`)
  - Front envia `aceiteTermos: { em, versao, userAgent }`
  - Backend valida + completa com `ip` capturado server-side
  - `perfil.aceiteTermos` persistido no perfis.json (prova de consentimento)

**Estado final:**
- 27 tarefas concluídas em 1 dia
- 14 commits no main
- 1 cliente real ativo (Jacques)
- Sistema 100% pronto pra vender + protegido juridicamente em nível "padrão SaaS bootstrap" (suficiente até 30-50 clientes ou contratação de advogado)

## 🔴 PENDÊNCIA CRÍTICA — SEGUNDA 15/06/2026

**Jacques precisa fazer no Google Ads (após 24h do vínculo GA4 feito em 13/06):**

1. **Importar conversão purchase**
   - Google Ads → Ferramentas → Conversões → +Nova ação de conversão
   - "Importar" → "Google Analytics 4 propriedades"
   - Marcar evento `purchase`
   - Categoria: Compra | Valor: Usar valor das transações | Janela: 30 dias
   - Incluir em "Conversões": SIM
   - Salvar

2. **Trocar estratégia de lance**
   - Campanhas → Campaign #1 → Configurações → Lances
   - "Alterar estratégia de lances"
   - Escolher "Conversões" → "Maximizar conversões"
   - CPA desejado: deixar em BRANCO (Google precisa aprender por 14 dias)
   - Salvar

3. **Religar campanha**
   - Orçamento: R$ 30/dia
   - Status: Ativada

⚠️ **CRÍTICO**: depois de religar, NÃO mexer por 14 dias em:
- Palavras-chave
- Orçamento (drasticamente)
- Anúncios
- Público-alvo
Senão reseta a fase de aprendizado do algoritmo.

Resultado esperado em 14 dias: CPA estabilizado entre R$ 100-300. Se for até R$ 300, manter. Se passar, reavaliar palavras-chave.

---

**Pendente para segunda-feira (09/06):**
- ✅ Post LinkedIn de lançamento (3 versões prontas - escolher A, B ou C)
- ✅ 10 CNAEs mapeados com alta dor
- ✅ 3 mensagens pra rede sem cold call prontas
- Tudo registrado no chat de 2026-06-07. Jacques posta quando bem entender.

---

## 20. Materiais de marketing (gerados em 07/06 noite)

### Post LinkedIn (vencedor recomendado: variação B)

> 27 mil licitações estão abertas no Brasil agora. 1,2 milhão de contratos foram fechados nos últimos 18 meses. Quase nenhuma pequena empresa sabe quais valem pra ela.
>
> Construí o ContrataX pra resolver 3 problemas que travam pequena empresa de vender pro governo:
>
> 1. Editais aparecem em centenas de portais por dia. Quem garimpa PNCP na mão perde tempo demais.
> 2. Cada edital tem dezenas de exigências. Saber se sua empresa está apta dá trabalho.
> 3. Quando descobre o edital, já é tarde pra impugnar irregularidade ou cotar preço.
>
> Como funciona: cadastra CNPJ, ramo e estados. O sistema monitora todos os editais do Brasil. A ContrataX.IA lê o PDF de cada edital e cruza com seus documentos. Em segundos diz: apto, apto com pendências, ou não apto.
>
> Sem fidelidade. R$ 59 pra começar. 7 dias grátis sem cartão.
>
> Bootstrap, MEI, solo. Sem investidor, sem time comercial.
>
> Se você vende ou quer vender pro governo, dá uma olhada. Vou agradecer feedback sincero.
>
> www.contratax.com.br

**Hashtags:** `#licitações #saas #pncp` (max 3, sem spam)

### 10 CNAEs com alta dor (priorizar comunicação)

1. **8121-4-00** Limpeza e conservação predial
2. **5620-1-01** Alimentação escolar (merenda)
3. **8011-1-01** Vigilância patrimonial
4. **4774-1-00** Material médico-hospitalar
5. **1412-6-01** Vestuário/uniforme
6. **7711-0-00** Locação de veículos sem motorista
7. **7112-0-00** Engenharia consultiva
8. **4313-4-00** Manutenção predial / obras menores
9. **6201-5-01** Desenvolvimento de software
10. **4647-8-01** Material de escritório/papelaria

Plano: 1 post por semana focado em UM desses CNAEs, com link interno pro `/cnae/<codigo>` correspondente do SEO programático.

### 3 mensagens prontas pra rede (texto completo no chat de 07/06 noite)

- **Msg 1**: Pra alguém que VOCÊ CONHECE e vende pro governo. Tom: "preciso da sua opinião antes de divulgar".
- **Msg 2**: Pra contador/consultor multiplicador. Tom: "plano Assessoria foi pensado pra você ofertar como serviço agregado".
- **Msg 3**: Pra amigo geral. Tom: "favor rápido, só passar o link pra quem se encaixar".

Todas sem cold call, sem venda dura, sem pressão. Pedem ação mínima (opinião, indicação, ou só compartilhamento).

---

---

### 2026-06-08 a 2026-06-21 (múltiplas sessões)

**Reforços de segurança e LGPD:**
- Headers HTTP completos (HSTS 2 anos+preload, X-Frame-Options, Referrer-Policy, Permissions-Policy, CORP, DNS-Prefetch-Control, X-XSS-Protection)
- Disclaimer permanente amarelo em toda análise IA + botão verde "Ver edital oficial no PNCP"
- Anonimização automática de IP após 30 dias (mascara `189.45.67.x`) — roda 1x/dia no loop do digest
- Painel "Meus Dados" em `/conta` (portabilidade LGPD art. 18): download JSON + CSV de todos os dados do cliente
- Email automático pós-login com data, região de IP mascarado, dispositivo e CTA "Trocar minha senha"

**LCP e performance (#42 — concluído):**
- Investigação completa do LCP de 6,8s na lp.html
- Fix: preload do logo, inline CSS crítico, lazy-load de fontes, remoção de render-blocking
- LCP medido pós-fix: dentro do aceitável

**Otimizações UX e conversão (#45):**
- TBT reduzido (script deferral)
- Prova social adicionada na LP
- Fricção de cadastro Google reduzida
- Demo grátis ("ver a IA antes de cadastrar") implementado

**SEO — pilares e landings (#50-54, #63-65):**
- 5 artigos pilar publicados: o-que-e-pncp, lei-14133-atualizada-2026, como-mei-participar-licitacao, documentos-habilitacao-licitacao, como-impugnar-edital-restritivo
- 30+ artigos de cauda longa adicionados ao blog
- 6 landing pages comparativas vs concorrentes: ConLicitação, Effecti, Licitei, PainelGov, QLicitações, Licitação Nacional
- sinonimos.mjs: expansão produto→ramo na busca (corrige zero-results quando usuário busca produto específico como "papel A4")

**Asaas e planos:**
- Alerta no admin quando cliente passa 80% da cota
- Cenário A de preços aplicado: Starter R$59, Básico R$247, Pro R$397, Assessoria 10 R$697, Assessoria 25 R$1.297

**Search Console (#48):**
- Investigados 8 URLs 404 + 25 redirecionamentos
- Corrigidos os canonicals e redirecionamentos relevantes

---

### 2026-06-22 a 2026-07-05 (múltiplas sessões)

**Win-back implementado (`src/winbackEmails.mjs`):**
- Sequência de 3 e-mails automáticos para leads que testaram e não converteram
- E-mail 1 (2d): FOMO com dado real do ramo (licitações abertas + valor total)
- E-mail 2 (9d): custo de NÃO monitorar (1 contrato perdido > 1 ano de assinatura)
- E-mail 3 (21d): última chamada, sem pressão, conta preservada
- Nunca envia pra ex-pagantes (`_jaFoiPago`); cada e-mail enviado uma única vez por perfil

**Viewer de itens de edital (`web/public/itens.html`):**
- Página standalone que abre em nova aba via "📦 Ver o que está sendo comprado →" no painel
- Lista todos os itens do edital: nº, descrição, quantidade, unidade, valor unitário, valor total
- Filtro em tempo real por palavras (destaca match com `<mark>`)
- Tag ME/EPP quando `beneficioMeEpp` indica exclusividade
- Criada pra substituir drawer que não escalava para editais de ata com 80-200+ itens
- Bug pós-criação (Chrome): `position:sticky` no `thead` conflitava com `border-collapse:collapse` — cabeçalho "boiava" sobre as linhas. Fix: removido o sticky, substituído por `border-bottom: 1px solid var(--linha)`.

**Sitemap com `<lastmod>` (`web/server.mjs`):**
- Todas as 1.609 URLs do sitemap agora incluem `<lastmod>` com a data atual (YYYY-MM-DD)
- Justificativa: acervo de licitações/órgãos/CNAE regenera diariamente do PNCP → data legítima, ajuda Google a priorizar recrawl
- Validado: `curl /sitemap.xml` retorna `<lastmod>2026-07-06</lastmod>` em todas as URLs

**Diagnóstico SEO (07/06 a 07/07 — ~1 mês de domínio):**
- Técnica: OK. 1.609 páginas indexáveis, schema/JSON-LD, robots.txt, sitemap completo.
- Gap real: **backlinks/autoridade** — domínio novo sem links apontando para ele é invisível ao Google independente da qualidade técnica.
- Organic sandbox do Google: 3-6 meses para domínio novo começar a rankear mesmo com tudo certo.
- Conclusão: não mais código de SEO. Prioridade = backlinks (Jacques) + tempo.
- Checklist de backlinks BR gerado: GetApp/Capterra Brasil, AppMasters, diretórios BR, LinkedIn pessoal, guest post, imprensa regional.

---

### 2026-07-06 (domingo — sessão atual)

- Sticky header bug em itens.html diagnosticado e corrigido (commit+push)
- Sitemap ganhou `<lastmod>` (commit+push)
- Auditoria SEO completa: fundação técnica sólida, gap = backlinks
- **Régua de e-mail reformada** (deploy): onboarding com ativação (dia 2) + últimas horas (dia 7); win-back virou reengajamento DIÁRIO que afunila (diário→semanal→mensal); digest e reengajamento no formato Boletim; descadastro de 1 clique (`/descadastrar` + `List-Unsubscribe`). Decisões do Jacques: "diário quente → afunila" (protege o domínio), WhatsApp fica pra depois, sem e-mail de consultora humana.
- **Marca só ContrataX** nas superfícies públicas: termos, privacidade e llms.txt passam a usar "ContrataX" + CNPJ, sem o nome pessoal do fundador. Ver memória `contratax-marca-empresa-nao-pessoa`.
- HANDOFF.md atualizado (este documento)

### 2026-07-07 (continuação)

- **Diagnóstico de churn do teste (dados reais):** rodei o acervo contra o ramo×UF dos 10 leads. Só **2 de 7** (nicho + estado pequeno: material didático/RN=0, energia solar/AC=0) viram painel vazio. A **maioria tinha 20-87 editais** e mesmo assim não rodou análise → causa principal = **ATIVAÇÃO**, não painel vazio. (Correção honesta: 1º diagnóstico com termo cru subestimou; o painel real usa termos+termosAmplos+termosIA.)
- **Painel nunca vazio** (deploy): `monitor.mjs` alarga pro Brasil quando o estado do cliente tem < 8 editais do ramo (flag `alargado`); `/api/editais` expõe o flag; painel mostra banner "ampliamos para o Brasil todo". Ateliê/RN: 0 → 31. Beneficia painel + digest + reengajamento.
- **LP: números corrigidos** — "27 mil licitações / 1,2 milhão contratos" (furados) → "20 mil / 3,1 milhões" (reais).

**FUNIL DE ATIVAÇÃO no painel — 3 passos (SHIPPED 07/07):** `perfilHTML` (index.html) mostra UM card por estado (mutuamente exclusivos); `/api/editais` expõe `analisou` + `temCertidao`:
1. `!analisou` → card "✨ Comece por aqui" (leva ao resumo da IA do edital mais urgente, reusa `abrirDrawer`).
2. `analisou && !temCertidao` → card "🔓 Destrave o veredito" com 5 datas de certidão INLINE; salva via `/api/certidoes` (MERGE, não apaga o resto da empresa) e recarrega.
3. `analisou && temCertidao` → card "🎯 Sua melhor oportunidade" (melhor edital por `oportunidade.nivel`+valor+prazo — SEM custo de IA). `onboarding.mjs` também reordenado (análise+veredito no topo).
**NÃO testado ao vivo por mim** (perfis.json local vazio, sem sessão, IA precisa da chave) — só `--check` + parse do JS. **VERIFICAR criando conta de teste nova** e andando o funil inteiro.

**Outras entregas 07/07:** LP passou a exaltar qualidades (tirou "não temos robô de lance") + números reais (3,1M contratos); rodapé sem link "Status"; "Anthropic"→"provedor de IA" e "Railway"→"provedor de nuvem" em /status, /seguranca, /privacidade, llms.txt (regra da marca `contratax-marca-empresa-nao-pessoa`); rota admin `/api/admin/testar-emails?c=&para=&ramo=&uf=` + botão no /admin pra receber os 7 e-mails da régua (produção é personalizada por cliente; a amostra do teste é configurável por ramo/uf).

**Pendente (precisa do Jacques):** (1) VALIDAR o funil de ativação numa conta de teste; (2) trazer prints do Clarity dos leads que não fecharam (não há MCP de Clarity — confirmado no registro; a API do Clarity só dá agregado raso). **Pendente (código/decisão):** "você está APTO" de verdade custaria IA por edital (decidir se vale); revisão visual das subpáginas; funil não cobre multi-CNPJ (assessoria); decisão de PREÇO (abismo Starter R$59 → Básico R$247, onde mora a mágica do veredito).

---

### 2026-07-07 (noite) a 2026-07-08 — VALIDAÇÃO AO VIVO: achadas e corrigidas as travas reais de conversão

Jacques cadastrou uma conta de teste nova e andou o funil inteiro, print a print. Isso revelou dois bugs graves que explicavam sozinhos boa parte do "0 de 10 trials converteram", mais uma leva de refinos de honestidade/clareza na tela.

**BUG GRAVE #1 — cota do teste travava o diferencial.** `src/uso.mjs`: `ANALISES_TESTE` tinha default **0** (só funcionava se `LICITA_ANALISES_TESTE` estivesse setada no Railway, e não estava). Resultado: todo cliente em teste clicava em "Analisar" e batia num paywall — nunca via o veredito, que é o produto de verdade. Fix: default 0→3 (commit `7aca4da`). Jacques confirmou a variável criada no Railway. **Validado em produção**: conta de teste nova mostrou 2/3 análises consumidas no painel admin.

**BUG GRAVE #2 — painel via muito menos editais que a busca.** O painel (`monitor.mjs`) só casava palavra-chave no CAMPO OBJETO do edital; a busca livre também varria os ITENS (onde mora o produto específico, ex. "papel A4"). Cliente buscava "papel A4" e achava 72 resultados na busca, mas o painel automático só trazia 1. Fix: nova `casarPerfil()` em `src/db.mjs` que faz objeto + itens igual à busca; `monitor.mjs` passou a usá-la (commit `245af37`). **Validado em produção**: painel RS foi de 11 → 137 editais, todos no estado certo, com badge "Achado nos itens".

**Refinos de honestidade na tela (todos commitados e no ar):**
- Cards de ativação (aha-card, certidão, melhor oportunidade) agora preferem editais do(s) estado(s) do próprio cliente antes de cair no nacional (`fa759f3`) — corrige caso real de painel SC/RN/PR mostrando destaque de Alagoas.
- Banner do teste tinha número furado ("100 leituras/mês"); virou texto honesto sem contagem inventada (`acc451b`).
- Veredito de aptidão: empresa sem NENHUM documento cadastrado não recebe mais "NÃO APTO" (desanima no 1º uso) — vira "AGUARDANDO SEUS DOCUMENTOS", neutro e acionável (`0b25b21`, `src/aptidao.mjs`).
- Badge do TL;DR (Resumo Rápido) usava a MESMA linguagem do veredito pessoal ("APTO COM PENDÊNCIAS"), confundindo cliente sem documentos cadastrados — ele achava que era sobre ELE, mas o TL;DR é uma leitura GLOBAL da barreira do EDITAL (cache compartilhado, não vê documentos de ninguém). Relabeled: "EXIGÊNCIAS PADRÃO" / "EXIGE REQUISITOS ESPECÍFICOS" / "ACESSO RESTRITO" / "A CONFERIR", e "Veredito:" → "Leitura do edital:" (`b920b12`).
- Botão de acesso à disputa: (a) rótulo do fallback deixou claro que o PNCP é a PORTA de entrada pro sistema de origem, não o lugar da disputa em si (`48e4489`); (b) só chama de "disputa por lances" quando a modalidade é Pregão — Dispensa/Inexigibilidade/Concurso não têm fase de lances competitivos, então o texto vira neutro "acompanhar esta contratação" (`fc38ded`).

**Investigado e ESCLARECIDO (sem código):** pré-aquecimento automático de TL;DR (`preaquecerTldrs` em `web/server.mjs`, gera até 8 resumos em segundo plano por carregamento de painel, sem clique) é intencional — imita concorrente que pré-gera tudo. Custo real medido no admin: **R$48,80 TOTAL desde sempre** em toda a operação (todas as etapas de IA somadas). Negligível — 1 cliente pagante já cobre. Mantido como está.

**Estado do negócio (admin, 08/07):** 12 clientes cadastrados, 1 ativo pagante (o próprio Jacques), 1 em teste (a conta de validação, 2/3 análises), **10 com teste expirado sem converter**. Confirma que o problema é real e os fixes acima atacam a causa raiz (ativação quebrada) — efeito só será visível nos PRÓXIMOS trials, não nos 10 já perdidos.

**Verificação final desta leva:** `node --check` limpo em todos os `.mjs` tocados (`uso.mjs`, `db.mjs`, `monitor.mjs`, `aptidao.mjs`, `planos.mjs`, `tldr.mjs`, `pncp.mjs`, `server.mjs`, `chatAjuda.mjs`) + parse-check dos blocos `<script>` executáveis em `index.html`, `lp.html`, `lp-comparativo.html`, `assinar.html` — todos OK. Todos os commits já com push pro `main` (Railway auto-deploya).

**Pendente:** observar as PRÓXIMAS contas de teste (não as 10 já expiradas) pra confirmar que o funil de ativação converte melhor agora. Decisão em aberto sobre a página comparativa nomeada vs concorrentes (Jacques ainda não decidiu manter ou substituir por "ContrataX vs o jeito antigo").

---

### 2026-07-08 (continuação) — infra crítica destravada + primeiro ativo de backlinks + SEO/IA

Sessão longa focada em três frentes: auditoria de SEO/descoberta por IA, infraestrutura Railway/DNS (achou e corrigiu problemas sérios que ninguém sabia que existiam), e início da campanha de backlinks.

**Refinos de produto (commits menores, todos no ar):**
- Calculadora da LP mudou de framing: "tempo/dinheiro economizado" → "quantas oportunidades ficam sem revisão" (`0fa0e90`). Baseado em convergência de análise com o ChatGPT (Jacques roda os dois em paralelo pra segunda opinião): aversão à perda converte mais que economia. Números só derivados do que o próprio visitante informa, sem estatística de mercado inventada — testado ao vivo no preview (desktop + mobile).
- Painel admin ganhou filtro **Ativos / Em teste / Expirados / Todos** na tabela de clientes (`3442256`, `d8e9c9f`) — Ativos (pagante+atrasado) é o padrão, sem apagar nada (a régua de reengajamento continua rodando nos expirados por trás).
- Fix de overflow horizontal no painel mobile: drawer off-canvas (fora da tela via `transform`) estourava a largura da viewport (`13813c9`).
- `llms.txt` e o FAQ do `/lp/comparativo` tinham os MESMOS números furados que já haviam sido corrigidos na LP ("27 mil/1,2 milhão" → "20 mil/3,1 milhões"); tirado rótulo "MEI" do llms.txt (`798f9c5`). Importante porque é o arquivo que IAs (ChatGPT, Claude, Perplexity) leem pra descrever o produto.

**Auditoria de SEO — correção de rota própria:** Checagem inicial via busca externa deu `site:contratax.com.br` = zero, sugerindo domínio invisível. **Estava errado** — o Search Console (fonte da verdade, print do Jacques) mostrou **513 páginas já indexadas** e 1.205 descobertas na fila. A ferramenta de busca usada só reflete índice dos EUA. Lição: sempre confiar no Search Console do próprio domínio, não em buscas externas de terceiros.

**Achado #1 — 307 páginas com "Erro no servidor (5xx)" no Search Console, causa raiz dupla:**

1. **Domínio raiz preso num Netlify esquecido.** `contratax.com.br` (sem www) era servido pelo **Netlify** (`Server: Netlify`, projeto "remarkable-torrone-a66bd0" com esse domínio como **Primary domain** + Netlify DNS ativo), não pelo Railway — só o `www` apontava certo. Provável resquício de protótipo antes da migração pro Railway, nunca desligado. Isso explicava o aviso "Waiting for DNS update" no Railway e é a explicação mais provável pros erros de redirecionamento/5xx no Search Console (dois servidores concorrentes pro mesmo domínio).
   - **Fix** (passo a passo interativo com prints, print a print): removido `contratax.com.br` do projeto Netlify (Site settings → Domain management → Options → Remove domain) — isso liberou o registro proprietário `NETLIFY` que travava edição direta no DNS. Depois, na zona de DNS (Netlify DNS continua sendo o **host** do DNS, só não hospeda mais o site): adicionado `CNAME @ → t9ryqg4i.up.railway.app` + `TXT _railway-verify → <valor do Railway>`, copiados exatamente da tela "Show DNS records" do Railway.
   - Depois de mais de 1h ainda preso em "Waiting for DNS update" (DNS real já confirmado propagado via `nslookup` contra 8.8.8.8 — não era propagação, era o processo de verificação do Railway travado). **Fix final:** removido o domínio do Railway (lixeira) e re-adicionado (+ Custom Domain) — reiniciou a verificação do zero e resolveu em minutos. Railway gerou um alvo CNAME novo (`0isb9xom.up.railway.app`) mas aceitou manter o CNAME antigo no DNS (`t9ryqg4i...`) porque os dois apontam pro mesmo serviço por trás — não precisou trocar nada no Netlify de novo. **Confirmado 100% funcionando**: `curl -I https://contratax.com.br/` retorna `Server: railway-hikari`, 301 pra `https://www.contratax.com.br/`, certificado válido.
   - Nota lateral: o painel "Production domains" do projeto Netlify voltou a mostrar `contratax.com.br` como "★ Primary domain" com "Netlify DNS propagating..." depois da remoção — é só a UI do Netlify desatualizada/com cache, sem efeito real (confirmado via DNS direto que nada regrediu). Pode ignorar esse painel específico daqui pra frente.
   - Nota técnica capturada: cada domínio anexado no Railway ganha um alvo `*.up.railway.app` **único** (não é erro ter `www`→`w5xa6fnv...` e raiz→`t9ryqg4i...` diferentes — ambos roteiam pro mesmo serviço, é assim que o Railway identifica de qual domínio veio a requisição).

2. **Bug real de código quebrando TODA página `/orgaos/<slug>`.** Achado testando um cross-link genuíno (nunca clicado antes) da nova página de ranking pra uma página de órgão. `orgaoPorCnpj()` em `src/db.mjs` retornava dois campos diferentes com o MESMO nome `contratos` — uma contagem numérica (`COUNT(*)`) e um array dos 20 contratos mais recentes — e o spread `{ ...linha, contratos }` fazia o array sobrescrever o número. Resultado: `detalhe.contratos.toLocaleString()` (esperando número) quebrava com `TypeError: undefined is not a function` sempre que chamado num objeto puro sem esse método → erro 500 em **até 1.000 páginas indexáveis no sitemap**, provável causa real (não suposição — comprovada com stack trace) dos 5xx do Search Console.
   - **Fix** (commit `36ae159`): renomeado o campo numérico pra `totalContratos` (distinto do array `contratos`); `seoOrgaos.mjs` atualizado nos 2 lugares que exibiam esse número. Bônus: a métrica também estava **subestimada antes** do bug virar crash visível (limitada a 20 mesmo quando o órgão tinha centenas — confirmado 460 num caso real).
   - Testado em lote: 12 páginas de órgão diferentes, todas 200 OK depois do fix.

**Achado #2 — `/health` já existia no código mas o Railway não sabia disso.** `web/server.mjs` já tinha uma rota `/health` bem-feita (resposta rápida, sem tocar banco), mas o Railway não estava configurado pra usá-la como healthcheck — sem isso, ele não detecta travamento e não reinicia limpo (comentário no próprio código: "Railway estava reiniciando o processo aleatoriamente"). **Fix:** Jacques configurou Settings → Deploy → Healthcheck Path = `/health`, Timeout = 30s (task #61 concluída). Revisão do resto do Settings do Railway: Serverless desligado (bom, descarta risco de cold-start), região US West Califórnia (só 4 regiões existem no Railway, sem América do Sul — US East teria latência menor pro Brasil, troca opcional sem downtime, baixa prioridade), resto default e sem problema.

**Achado #3 — `contato@contratax.com.br` nunca existiu de verdade.** Investigando pra que servia o e-mail de verificação do G2 (backlink), descoberto que o domínio **não tinha nenhum registro MX no ápice** — só um MX no subdomínio `send.` (infra do Amazon SES, só serve pra ENVIO via Resend). Ou seja, todo texto do site (chat de ajuda, rodapé de e-mails, termos de uso) que manda cliente escrever pra `contato@contratax.com.br` caía no vazio há meses. **Fix:** conta grátis no [ImprovMX](https://improvmx.com), domínio adicionado com alias curinga (`*` → `licitacontratax@gmail.com`, já cobre `contato@` automaticamente), 3 registros DNS adicionados na mesma zona Netlify (`MX @ 10 mx1.improvmx.com`, `MX @ 20 mx2.improvmx.com`, `TXT @ v=spf1 include:spf.improvmx.com ~all`). **Validado ponta a ponta**: status "Active" no ImprovMX + Jacques mandou e-mail de teste e confirmou que chegou no Gmail.

**Novo: ativo de dados linkável — `/ranking/<ramo>` (Nível 3 da estratégia de backlinks, commit `36ae159`):**
- 36 páginas novas (uma por categoria já existente em `categorias.mjs`), ex. `/ranking/material-hospitalar`, respondendo "quem mais comprou X no Brasil" — valor total + nº de contratos por órgão comprador, agregado do acervo (`SUM(valor)` agrupado por `orgao_cnpj`, filtrado por `objeto_norm LIKE`). Nova query `rankingPorTermo()` em `src/db.mjs`. Novo módulo `src/rankingCompras.mjs` (layout próprio reaproveitando o padrão de `seoCnae.mjs`), hub em `/ranking`, incluído no sitemap.
- Racional: diferente de `/licitacoes`/`/cnae` (editais abertos, úteis pro fornecedor comprar), ranking é o tipo de dado que jornalista/consultor/blog de contador **cita e linka sem a gente pedir** — único jeito de ganhar autoridade de domínio sem outbound (regra do fundador). Ideia veio de convergência entre a auditoria própria e a do ChatGPT.
- Testado ao vivo no preview: mobile (tabela com `overflow-x:auto` próprio, não vaza a página — achado e corrigido um bug de responsividade nessa mesma leva de testes) e desktop (tabela cabe sem scroll). JSON-LD (ItemList/CollectionPage/BreadcrumbList) validado.

**Estratégia de backlinks (Nível 1-4, definida em conversa, sem outbound):**
- Nível 1 (autosserviço, backlink garantido): B2B Stack, Capterra/GetApp/Software Advice, G2, Product Hunt, Crunchbase, StartupBase. **B2B Stack e Product Hunt já cadastrados.** G2 em andamento (estava travado esperando e-mail de verificação — destravado agora que `contato@` funciona).
- Nível 2 (propriedades próprias): LinkedIn empresa + pessoal, GitHub, Reclame Aqui.
- Nível 3 (o de maior alavanca): ativos de dados linkáveis — **`/ranking/<ramo>` é o primeiro, já no ar.**
- Nível 4 (opcional, só se topar contato leve): guest post em blog de contador/consultor — pode pular sem prejuízo, Níveis 1-3 já sustentam a estratégia.
- Decidido explicitamente: localização (Balneário Camboriú) NÃO é critério de segmentação de backlink — negócio atende Brasil todo, feedback do Jacques.

**Verificação desta leva:** todos os módulos novos/tocados passaram por `node --check` + parse-check de JSON-LD + teste real no preview (mobile e desktop) antes do commit. Bug do `/orgaos` confirmado corrigido testando 12 páginas em lote (todas 200). DNS confirmado propagado via `nslookup` contra 8.8.8.8 (não só cache local). Todos os commits com push pro `main`.

**Pendente:**
- Retomar cadastro do G2 agora que o e-mail de verificação vai chegar.
- Seguir Nível 1 dos backlinks: Capterra/GetApp, Crunchbase, StartupBase, LinkedIn.
- Pedir indexação manual das 6 URLs prioritárias no Search Console (home + 5 pilares) — passo a passo já dado, não confirmado se Jacques executou.
- Considerar reframear os títulos de `/orgaos/<slug>` e `/cnae/<codigo>` em formato mais "ranking" pra reforçar o efeito Nível 3 (sugestão do ChatGPT, não implementada ainda).

---

### 2026-07-08 (fechamento da noite) — domínio raiz resolvido, Search Console confirmando o fix, Google Ads religado com conversão corrigida

**Domínio raiz: resolvido de vez.** O aviso "Waiting for DNS update" ficou preso por mais de 1h mesmo com DNS já propagado (confirmado via `nslookup` contra 8.8.8.8 múltiplas vezes) — não era propagação, era o processo de verificação do Railway travado. Fix: removido o domínio do Railway (lixeira) e re-adicionado (+ Custom Domain), o que reiniciou a verificação do zero e resolveu em minutos. Railway gerou um alvo CNAME novo (`0isb9xom.up.railway.app`) mas aceitou manter o antigo (`t9ryqg4i...`) no DNS, sem precisar trocar nada no Netlify de novo. **Confirmado 100%**: `curl -I https://contratax.com.br/` → `Server: railway-hikari`, 301 pra `https://www.contratax.com.br/`, certificado válido. O painel "Production domains" do Netlify continuou (e provavelmente vai continuar) mostrando "propagating..." pros dois domínios — é só a UI do Netlify remoendo um estado que não existe mais (ele hospeda a zona de DNS mas não o site), sem efeito real. Ignorar esse painel específico daqui pra frente.

**Search Console: bug do `/orgaos` confirmado como causa raiz, revalidação disparada.** No relatório "Erro no servidor (5xx)" (307 páginas), os exemplos de URL eram TODOS `/orgaos/<slug>` — bate exatamente com o bug corrigido mais cedo hoje. Testadas 13 dessas URLs específicas + 3 URLs "sujas" de `/licitacoes/<categoria>/<link-externo-colado>` (mecanismo de recuperação via 301 que já existia no código, comentário em `server.mjs`) — **todas 200 ou 301 corretos agora**. Jacques clicou em "Validar correção"; status mudou pra "Validação iniciado, Início: 08/07/2026". Expectativa: página indexadas deve subir de 513 pra bem mais nos próximos dias, já que a maioria dos 307 eram páginas boas travadas por bug, não conteúdo ruim.

**Search Console: primeiros sinais reais de tráfego orgânico.** 65 cliques / 2,6 mil impressões em 28 dias (site tem ~1 mês). Destaques: busca por "contratax" (13 cliques, branded/reconhecimento), busca por **"licitei"** (1 clique — alguém procurando o concorrente e clicando no ContrataX, prova que `/lp/comparativo` está funcionando como planejado), página `/licitacoes/ar-condicionado/mg` com 4 cliques (+300%, primeira página de SEO programático rankeando de verdade). 99%+ do tráfego é Brasil. Core Web Vitals sem dado ainda (normal, precisa de mais volume).

**Google Ads: religado, mas com bug de configuração de meses achado e corrigido no processo.** Jacques reativou a campanha (R$25/dia). Ao configurar a estratégia de lance, achamos que a ação de conversão "Compra" já existente estava **quebrada desde sempre**: configurada como tag direta no site (Google tag/gtag.js), status "Inativo", nunca recebeu dado — porque o checkout do ContrataX não passa por uma página de confirmação com JS (pagamento acontece no Asaas, fora do domínio, confirmação via webhook servidor-a-servidor). O assistente de "corrigir com fluxo guiado" do Google Ads pedia instalar tag via GTM, o que não bate com essa arquitetura — **não seguido**.
- **Fix correto:** criada nova ação de conversão via **Importar → Google Analytics 4 (propriedade "ContrataX", 540488652) → evento `purchase`** — esse é o caminho que já estava documentado desde o início (era o task #39/#55), mas nunca tinha sido finalizado direito (a ação antiga, quebrada, mascarava o problema).
- **Confirmado no código (não por suposição)** que o evento `purchase` só dispara dentro do handler do webhook do Asaas (`web/server.mjs`, dentro de `if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED")`, chamando `enviarConversao`) — nunca no cadastro/início do trial. Métrica limpa: só conta pagamento de verdade.
- A ação antiga (quebrada) foi desativada ("Incluir em Conversões: Não") pra não brigar com a nova — status da meta "Compra" voltou pra "✓ Ativa".
- Estratégia de lance: **Maximizar conversões, sem teto de CPA** (Jacques inicialmente configurou um teto de R$5/conversão, que teria sufocado a campanha — plano mais barato é R$59/mês e o algoritmo não tinha nenhum histórico ainda; removido a pedido, deixado aprender livre).
- Tasks #40 e #55 marcadas concluídas.
- **Pendente:** observar depois dos 14 dias de aprendizado se o CPA estabiliza numa faixa saudável (referência antiga do HANDOFF: R$100-300). Não mexer em nada da campanha até lá.

**Backlinks confirmados nesta sessão:** B2B Stack, Product Hunt, G2 (3 cadastrados). Faltam Capterra/GetApp, Crunchbase, StartupBase, LinkedIn pra fechar o Nível 1.

**Preferência registrada do Jacques:** sempre registrar no HANDOFF tudo que for concluído numa sessão, não só quando perguntado — vale manter esse hábito daqui pra frente.

### 2026-07-10 — LP reescrita ponto a ponto seguindo o mock exato do Jacques (Claude Design)

**Contexto:** Jacques comparou visualmente o ContrataX com o concorrente QLicitações e achou o deles muito mais atraente. Ele mesmo desenhou uma nova LP usando a ferramenta "Claude Design" e pediu replicação **exata** ("eu quero IGUAL ao html que te mandei"), não uma reestilização inspirada. Ele mandou dois exports: um bundle React compilado (inútil pra nós — client-render puro, quebraria as 513 páginas indexadas que dependem de HTML servido pronto) e depois o `.dc.html` com o código-fonte legível completo (14 seções, cores exatas, cópia exata, lógica de tabs/FAQ/count-up).

**Feito:** `web/public/lp.html` reescrito quase inteiro (585 inserções / 815 remoções) seguindo a estrutura exata do mock: header sticky, hero em duas colunas (pitch + card navy), faixa de portais, 6 cards de diferenciais, 4 cards de dor (fundo escuro), seção "Produto" com 4 abas (fundo navy, telas reais do painel), faixa de segmentos, 4 passos "como funciona", tabela comparativa (fundo escuro), preços (3 planos empresa + 2 assessoria), FAQ em accordion nativo `<details>`, CTA final em gradiente indigo→navy, rodapé escuro de 3 colunas. Fontes trocadas pra Manrope (títulos) + Public Sans (corpo), paleta 100% a do mock (`#0B1E3A` navy, `#4338CA` indigo etc).

**Decisões de reconciliação (não estavam no mock, foram mantidas por serem features reais de conversão):**
- O card navy do hero no mock era um mockup estático ilustrativo. Mantivemos a moldura visual exata (navy, barra de "browser" com bolinhas coloridas) mas colocamos a **busca pública interativa de verdade** dentro dele (a mesma que já existia, ligada a `/api/busca-publica` e ao TL;DR pago via `/api/tldr`).
- O widget de chat ContrataX.IA (fab + painel) foi preservado 100% intacto, sem tocar.
- A calculadora de "oportunidades perdidas" (seção ROI, `id="roi"`) que tinha sido construída numa sessão anterior **foi removida** — não existia no mock e o pedido era fidelidade exata. Vale avaliar com o Jacques se ela deve voltar em outro lugar da página (não confirmado com ele ainda).
- O fundo de partículas conectadas em canvas que o mock tinha (`startHero()`) **foi deixado de fora de propósito** — é exatamente o tipo de clichê visual "feito por IA" que o próprio Jacques pediu pra evitar numa instrução anterior da mesma sessão.

**Validado:** parse-check de todos os blocos `<script>` (sintaxe ok), preview local rodando com dados reais da API (17.529 licitações), hero em 2 colunas confirmado em desktop (1440px), abas do "Produto" trocando de conteúdo corretamente, accordion do FAQ funcionando (é `<details>` nativo), comparativo e preços renderizando fiéis ao mock, zero erros no console. Commitado (`e79db42`) e **já em produção** (push feito, Railway auto-deploy).

**Pendente:** Jacques também pediu pra aplicar o mesmo tratamento visual nas subpáginas ("Tem que tratar também as subpaginas") — não há mock exato pra elas, então vai exigir extrapolar a linguagem visual já estabelecida (paleta, fontes, cards, sombras navy) pras páginas internas (cadastro, entrar, assinar, comparativo, painel). Ainda não iniciado.

---

**Fim do handoff.** Boa sorte na próxima sessão.
