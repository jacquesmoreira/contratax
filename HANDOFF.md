# ContrataX — Handoff de contexto

> **Para qualquer outra IA ou desenvolvedor que pegue este projeto:** este documento contém TUDO que precisa pra continuar de onde paramos. Leitura: ~10 minutos.

**Última atualização:** 2026-06-07 (sábado)
**Status:** Pronto pra venda. Primeiro pagamento real processado com sucesso (R$ 59 via Pix).

---

## 1. O negócio em uma frase

**ContrataX** é um SaaS B2B self-serve que monitora licitações públicas brasileiras (dados oficiais do PNCP), avisa o fornecedor quando aparece edital do ramo dele, lê o edital com IA (ContrataX.IA) e diz se ele está apto a participar.

- **Domínio**: `contratax.com.br` (com www)
- **Modelo**: assinatura mensal recorrente, sem fidelidade
- **Aquisição**: 100% orgânica + SEO programático (1.602 URLs no sitemap)
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
│   ├── winbackEmails.mjs     # reativação pós-cancelamento
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

**Marketing/Tracking (com fallback no código)**
- `LICITA_GA4_ID` — default `G-N79Q5SH624`
- `LICITA_GA4_API_SECRET` — Measurement Protocol secret (Conversion API)
- `LICITA_CLARITY_ID` — default `wrs09m31ps`
- `LICITA_GTM_ID`, `LICITA_META_PIXEL_ID` — opcionais

**Preços (overrides; default no planos.mjs)**
- `LICITA_PRECO_STARTER=59,00`
- `LICITA_PRECO_BASICO=197,00` (`LICITA_PRECO` legado também aceito)
- `LICITA_PRECO_PRO=297,00`
- `LICITA_PRECO_ASS10=497,00`, `LICITA_PRECO_ASS25=897,00`
- Avulsos: `LICITA_PRECO_AV50=130,00`, `LICITA_PRECO_AV150=330,00`
- Cotas: `LICITA_ANALISES_STARTER=3`, `LICITA_ANALISES_BASICO=50`, `LICITA_ANALISES_PRO=100`

---

## 6. Planos e modelo de cobrança

```
Starter  R$ 59,00/mês   3 análises completas, busca ilimitada (DEGUSTAÇÃO)
Básico   R$ 197,00/mês  50 análises completas, 5 extrações PDF
Pro      R$ 297,00/mês  100 análises completas, 20 extrações PDF

Assessoria 10  R$ 497,00/mês  10 CNPJs, 20 análises/CNPJ
Assessoria 25  R$ 897,00/mês  25 CNPJs, 20 análises/CNPJ

Pacote avulso 50    R$ 130,00 (sem recorrência, créditos não expiram)
Pacote avulso 150   R$ 330,00
```

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

### Marketing/SEO
- [x] Landing page (`lp.html`) + Comparativo (`lp-comparativo.html`)
- [x] SEO programático: 1.602 URLs no sitemap
- [x] `/licitacoes/<ramo>/<uf>` com Schema.org Event JSON-LD
- [x] `/orgaos/<slug>` (~520 órgãos com 5+ contratos)
- [x] `/cnae/<codigo>` (30 CNAEs estratégicos)
- [x] Schema.org GovernmentOrganization
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

### Legal/Conformidade
- [x] Política de Privacidade (`/privacidade`)
- [x] Termos de Uso (`/termos`) com CDC art. 49 (7 dias arrependimento)
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

---

## 13. Estado atual / Próximos passos

**07/06/2026 — sábado**
- ✅ Primeiro pagamento real processado automaticamente (R$ 59 Pix → ativação em ~3s)
- ✅ Webhook validado em produção
- ✅ Cancelamento self-service validado em produção
- ✅ Sistema 100% pronto pra venda

**Pendente para SEGUNDA-FEIRA (09/06/2026)**
- 📝 Redigir 1 post LinkedIn de lançamento (200 palavras)
- 📝 Mapear 10 nichos (CNAEs) de fornecedor com alta dor em editais
- 📝 (opcional) Redigir 3 mensagens pra empresas do network (não cold)

**Backlog (não urgente)**
- Botão "Reativar assinatura" pra reduzir churn por arrependimento
- Endereço comercial (quando migrar pra LTDA, ~30+ clientes)
- Email comercial `contato@contratax.com.br` via Cloudflare Email Routing (cliente vê email pro em vez de Gmail)
- Logos PNG dos portais em `/portais/` (Jacques vai mandar)
- Página de status pública (status.contratax.com.br)
- Upgrade no Asaas: marca site `https://www.contratax.com.br` (com www) ao invés de sem www
- Bing Webmaster Tools (5-8% do tráfego)

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

**Fim do handoff.** Boa sorte na próxima sessão.
