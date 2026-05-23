# PowerMM — Deploy on a New Master VPS
# Fresh installation guide from a clean AlmaLinux/Rocky/Ubuntu server

set -e  # exit on error

# ============================================================
# 1. SYSTEM DEPENDENCIES
# ============================================================

# Update system
apt-get update -qq && apt-get upgrade -y
# OR for AlmaLinux/RHEL:
# dnf update -y

# Install core tools
apt-get install -y git curl wget unzip openssl nginx
# AlmaLinux: dnf install -y git curl wget unzip openssl nginx

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version   # must be v20+

# Install PostgreSQL 14+
apt-get install -y postgresql postgresql-contrib
# AlmaLinux: dnf install -y postgresql-server postgresql-contrib

# Install Redis 6+
apt-get install -y redis-server
# AlmaLinux: dnf install -y redis

# Init PostgreSQL (AlmaLinux only)
# postgresql-setup --initdb

# Start services
systemctl enable postgresql redis-server
systemctl start postgresql redis-server

# ============================================================
# 2. DATABASE SETUP
# ============================================================

su - postgres -c "psql -c \"CREATE USER powermm WITH PASSWORD 'powermm_secret';\""
su - postgres -c "psql -c \"CREATE DATABASE powermm OWNER powermm;\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE powermm TO powermm;\""

# Allow password auth (AlmaLinux)
# sed -i 's/peer/md5/g' /var/lib/pgsql/data/pg_hba.conf
# sed -i 's/ident/md5/g' /var/lib/pgsql/data/pg_hba.conf
# systemctl restart postgresql

# ============================================================
# 3. CLONE THE REPOSITORY
# ============================================================

cd /var/www
git clone https://github.com/nbaldr2/PowerMM.git powermm
cd powermm

# ============================================================
# 4. INSTALL DEPENDENCIES
# ============================================================

# Frontend
npm install

# Backend
cd server && npm install && cd ..

# ============================================================
# 5. ENVIRONMENT CONFIGURATION
# ============================================================

cp .env.example .env

# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Edit .env with your values
cat > .env << EOF
NODE_ENV=production
PORT=3001
APP_URL=http://YOUR_SERVER_IP
API_URL=http://YOUR_SERVER_IP:3001

DATABASE_URL=postgresql://powermm:powermm_secret@localhost:5432/powermm
DB_HOST=localhost
DB_PORT=5432
DB_NAME=powermm
DB_USER=powermm
DB_PASS=powermm_secret

REDIS_URL=redis://localhost:6379

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

ENCRYPTION_KEY=${ENCRYPTION_KEY}

TRACKING_DOMAIN=http://YOUR_SERVER_IP
SMTP_FROM_DEFAULT=noreply@your-domain.com
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=52428800
EOF

# ============================================================
# 6. DATABASE MIGRATIONS
# ============================================================

cd server
npm run migrate
cd ..

# ============================================================
# 7. POWERMTA INSTALLATION FILES
# ============================================================

# Copy PowerMTA files from local machine to master VPS:
#   scp PowerMTA5.zip root@YOUR_SERVER_IP:/var/www/powermm/
#   scp -r PowerMTA5.0r8_ALMALINUX root@YOUR_SERVER_IP:/var/www/powermm/

# Also copy to /root/pmta_files/ for installer to use:
# From local machine:
#   scp PowerMTA5.zip root@YOUR_SERVER_IP:/root/
#   ssh root@YOUR_SERVER_IP "mkdir -p /root/pmta_files && cd /root/pmta_files && unzip -o /root/PowerMTA5.zip"

# OR directly from another VPS:
#   ssh root@OLD_MASTER "cat /root/pmta_files/pmtad" | ssh root@NEW_MASTER "cat > /root/pmta_files/pmtad"
#   ... etc for each file

# ============================================================
# 8. BUILD FRONTEND
# ============================================================

npm run build

# ============================================================
# 9. START THE APPLICATION (PM2)
# ============================================================

npm install -g pm2
pm2 start server/index.js --name powermm
pm2 save
pm2 startup
# → Run the displayed command (usually: systemctl enable pm2-root)

# Verify
curl -s http://127.0.0.1:3001/health
# Expected: {"status":"healthy","services":{"database":"up","redis":"up"}}

# ============================================================
# 10. CONFIGURE NGINX (optional but recommended)
# ============================================================

cat > /etc/nginx/conf.d/powermm.conf << 'NGINX'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }
}
NGINX

systemctl enable nginx
systemctl start nginx

# Optional: HTTPS with Let's Encrypt
# apt-get install -y certbot python3-certbot-nginx
# certbot --nginx -d YOUR_DOMAIN

# ============================================================
# 11. FIREWALL (master server)
# ============================================================

ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3001/tcp
ufw reload

# OR iptables:
# iptables -A INPUT -p tcp --dport 80 -j ACCEPT
# iptables -A INPUT -p tcp --dport 443 -j ACCEPT
# iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# ============================================================
# 12. VERIFY FULL STACK
# ============================================================

curl -s http://127.0.0.1:3001/health
curl -s http://YOUR_SERVER_IP/health

# Open http://YOUR_SERVER_IP in browser
# Default login: admin@moonmailer.pro / admin123

# ============================================================
# 13. QUICK UPDATE (existing installation)
# ============================================================

cd /var/www/powermm
git pull
npm install
cd server && npm install && npm run migrate && cd ..
npm run build
pm2 restart powermm

# ============================================================
# 14. TRANSFER FROM OLD MASTER TO NEW MASTER
# ============================================================

# If migrating from an old master VPS:

# 1. Transfer PowerMTA files
rsync -avz root@OLD_MASTER_IP:/var/www/powermm/PowerMTA5.zip /var/www/powermm/
rsync -avz root@OLD_MASTER_IP:/var/www/powermm/PowerMTA5.0r8_ALMALINUX/ /var/www/powermm/PowerMTA5.0r8_ALMALINUX/
rsync -avz root@OLD_MASTER_IP:/root/pmta_files/ /root/pmta_files/

# 2. Transfer database (if keeping data)
# pg_dump -U powermm -h OLD_MASTER_IP powermm > db_dump.sql
# psql -U powermm -h localhost powermm < db_dump.sql

# 3. Transfer .env securely
# scp root@OLD_MASTER_IP:/var/www/powermm/.env /var/www/powermm/.env

# ============================================================
# 15. POST-INSTALL CHECKLIST
# ============================================================

echo "=========================================="
echo "  Post-install checklist:"
echo "=========================================="
echo "1. Verify health endpoint: curl http://127.0.0.1:3001/health"
echo "2. Open http://YOUR_SERVER_IP in browser"
echo "3. Log in with admin@moonmailer.pro / admin123"
echo "4. Verify PMTA installer works (SSH test → config → install)"
echo "5. Make sure /root/pmta_files/ has all PMTA files"
echo "6. Set up DNS records for sending domains"
echo "=========================================="