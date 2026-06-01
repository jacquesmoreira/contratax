#!/usr/bin/env bash
# Provisiona o Licita num VPS Ubuntu limpo. Rode como root, com o codigo ja em /opt/licita.
#   bash deploy/setup.sh
set -e

APP=/opt/licita
cd "$APP"

echo ">> Instalando Node 24 + nginx..."
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs nginx
node --version

echo ">> Preparando pastas..."
mkdir -p "$APP/data"

echo ">> Servico web (systemd)..."
cp deploy/licita-web.service /etc/systemd/system/licita-web.service
systemctl daemon-reload
systemctl enable --now licita-web

echo ">> Nginx..."
cp deploy/nginx-licita.conf /etc/nginx/sites-available/licita
ln -sf /etc/nginx/sites-available/licita /etc/nginx/sites-enabled/licita
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ">> Cron (atualizacao diaria + e-mail)..."
( crontab -l 2>/dev/null | grep -v 'licita'; cat deploy/licita-cron ) | crontab -

echo ""
echo "=================================================================="
echo "PROXIMOS PASSOS MANUAIS:"
echo "1. Crie o .env em $APP/.env (ANTHROPIC_API_KEY, RESEND_API_KEY,"
echo "   LICITA_PIX_CHAVE, LICITA_CONTATO, LICITA_BASE_URL=https://seudominio)"
echo "2. Rode o primeiro ingest (demora ~30min):  node scripts/ingest.mjs"
echo "3. Rode o matching:  node scripts/buscar.mjs"
echo "4. Aponte o dominio (A record) para o IP deste servidor"
echo "5. HTTPS:  sudo certbot --nginx -d seudominio.com.br"
echo "=================================================================="
