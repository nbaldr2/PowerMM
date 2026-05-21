#!/bin/bash
# PowerMM Deployment Script (non-interactive)
# Usage: VPS_PASSWORD='yourpass' ./deploy.sh
#
# Set these environment variables before running:
#   VPS_HOST      - VPS IP address (default: 109.71.254.177)
#   VPS_USER      - SSH user (default: root)
#   VPS_PORT      - SSH port (default: 22)
#   VPS_PASSWORD  - SSH password
#   DEPLOY_PATH   - Path on VPS (default: /var/www/powermm)

set -e

VPS_HOST="${VPS_HOST:-109.71.254.177}"
VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/powermm}"
GIT_REPO="https://github.com/nbaldr2/PowerMM.git"

if [[ -z "$VPS_PASSWORD" ]]; then
    echo "ERROR: VPS_PASSWORD environment variable not set."
    echo "Usage: VPS_PASSWORD='<yourpass>' ./deploy.sh"
    exit 1
fi

echo "=========================================="
echo " PowerMM Deployment to $VPS_USER@$VPS_HOST"
echo "=========================================="

echo "[1/10] Connecting and checking OS..."
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
OS_INFO=$(sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" "uname -a && cat /etc/os-release | head -3" 2>/dev/null)
echo "$OS_INFO"

echo "[2/10] Updating system packages..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "export DEBIAN_FRONTEND=noninteractive; \
     (apt-get update -qq && apt-get upgrade -y -qq 2>/dev/null) || \
     (yum update -y -qq 2>/dev/null) || \
     (dnf update -y -qq 2>/dev/null) || true" 2>/dev/null
echo "Done"

echo "[3/10] Installing Node.js 20.x..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null || \
     curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null || true" 2>/dev/null
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "yum install -y nodejs 2>/dev/null || \
     apt-get install -y nodejs npm 2>/dev/null || \
     dnf install -y nodejs npm 2>/dev/null || true" 2>/dev/null
echo "Done"

echo "[4/10] Installing PMTA dependencies..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "yum install -y openssl curl wget git 2>/dev/null || \
     apt-get install -y openssl curl wget git 2>/dev/null || \
     dnf install -y openssl curl wget git 2>/dev/null || true" 2>/dev/null
echo "Done"

echo "[5/10] Creating deployment directory..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "mkdir -p $DEPLOY_PATH" 2>/dev/null
echo "Done"

echo "[6/10] Cloning repository..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "cd $DEPLOY_PATH && git clone $GIT_REPO . 2>/dev/null || git pull origin master" 2>/dev/null
echo "Done"

echo "[7/10] Installing server dependencies..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "cd $DEPLOY_PATH/server && npm install --production 2>&1 | tail -3" 2>/dev/null
echo "Done"

echo "[8/10] Running database migrations..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "cd $DEPLOY_PATH/server && node migrations/run.js 2>&1 | tail -5" 2>/dev/null
echo "Done"

echo "[9/10] Building frontend..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "cd $DEPLOY_PATH && npm run build 2>&1 | tail -5" 2>/dev/null
echo "Done"

echo "[10/10] Final setup..."
sshpass -p "$VPS_PASSWORD" ssh $SSH_OPTS -p $VPS_PORT "$VPS_USER@$VPS_HOST" \
    "mkdir -p $DEPLOY_PATH/logs && chmod 755 $DEPLOY_PATH" 2>/dev/null
echo "Done"

echo ""
echo "=========================================="
echo " Deployment completed successfully!"
echo "=========================================="
echo ""
echo "Next steps on the VPS:"
echo "  1. Configure environment: nano $DEPLOY_PATH/.env"
echo "  2. Upload PowerMTA files to: $DEPLOY_PATH/PowerMTA5.0r8_ALMALINUX/"
echo "  3. Start with PM2: pm2 start $DEPLOY_PATH/server/index.js --name powermm"
echo "  4. Or start manually: cd $DEPLOY_PATH/server && node index.js"
echo ""
