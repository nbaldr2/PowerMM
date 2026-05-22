#!/bin/bash

set -e

SERVER_IP="109.71.254.177"
SERVER_USER="root"
REMOTE_DIR="/var/www/powermm"

echo "=========================================="
echo "  PowerMM Deployment Script"
echo "=========================================="

if [ ! -f ~/.ssh/id_rsa ]; then
    echo "Error: SSH key not found at ~/.ssh/id_rsa"
    echo "Generate one with: ssh-keygen -t rsa -b 4096"
    echo "Then copy to server: ssh-copy-id root@${SERVER_IP}"
    exit 1
fi

echo "Checking SSH connection..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes ${SERVER_USER}@${SERVER_IP} "echo 'SSH OK'" 2>/dev/null; then
    echo "Error: SSH key authentication failed"
    echo "Run: ssh-copy-id ${SERVER_USER}@${SERVER_IP}"
    exit 1
fi

echo "Building frontend..."
npm run build

echo "Syncing files to server..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'PowerMTA5.zip' \
    --exclude 'PowerMTA5.0r8_ALMALINUX' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude '.dbg' \
    ./ ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/

echo "Installing dependencies on server..."
ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR}/server && npm install --production"

echo "Restarting services..."
ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
cd /var/www/powermm
pm2 stop powermm-server 2>/dev/null || true
pm2 start server/index.js --name powermm-server
pm2 save
ENDSSH

echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
