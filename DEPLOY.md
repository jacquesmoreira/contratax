# Como colocar o Licita no ar

Guia de deploy num VPS Ubuntu. Você não precisa saber Linux: contrate o servidor,
me passe o acesso, e eu rodo tudo com você. Este documento é a referência do que
será feito.

## 1. Contratar o VPS

Qualquer um serve (o Licita é leve). Recomendados:

- **Hostinger VPS** (tem data center no Brasil, painel simples) — ~R$ 30/mês
- **DigitalOcean** ou **Hetzner** — ~US$ 5/mês

Escolha: **Ubuntu 24.04**, **1–2 GB de RAM**. Anote o **IP** e a **senha root** (ou
cadastre uma chave SSH).

## 2. Domínio

Registre um domínio (ex: no Registro.br, ~R$ 40/ano) e aponte um registro **A**
para o IP do VPS.

## 3. Subir o código

O projeto é portátil (zero dependências externas). Duas formas:

- **Cópia direta:** enviar a pasta `D:\Licita` para `/opt/licita` no servidor (scp/rsync).
- **Git:** subir para um repositório privado e `git clone` no servidor.

## 4. Provisionar (automático)

Com o código em `/opt/licita`:

```bash
bash deploy/setup.sh
```

Isso instala Node 24 + nginx, sobe o servidor como serviço (sempre ligado),
configura o cron (atualização diária + e-mail) e o proxy reverso.

## 5. Configurar o .env (no servidor)

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...                 # para enviar e-mail (apos verificar dominio)
LICITA_EMAIL_FROM=Licita <contato@seudominio.com.br>
LICITA_BASE_URL=https://seudominio.com.br
LICITA_PIX_CHAVE=sua-chave-pix
LICITA_CONTATO=seu-whatsapp-ou-email
LICITA_ADMIN_TOKEN=um-token-secreto-seu
```

## 6. Primeira carga de dados

```bash
node scripts/ingest.mjs    # acervo nacional (~30 min)
node scripts/buscar.mjs    # matching
```

## 7. HTTPS

```bash
sudo certbot --nginx -d seudominio.com.br
```

Pronto. O Licita fica no ar 24h, atualizando sozinho todo dia e enviando os e-mails.

## Arquitetura em produção

```
Internet → nginx (80/443, HTTPS) → Node (porta 3000, systemd, sempre ligado)
                                       ↑ lê o banco SQLite (data/licita.db)
cron 05:00 → atualizar.mjs (ingest + matching + limpeza)
cron 06:30 → digest.mjs (e-mail diário aos clientes ativos)
```
