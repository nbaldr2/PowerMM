# PowerMM — MoonMailer Pro

PowerMM is a PowerMTA auto-installer and management panel. It installs, configures, and activates PowerMTA on remote VPS instances via SSH, then provides a web dashboard for SMTP sending, campaign management, and DNS record generation.

---

## Requirements

| Component | Minimum |
|-----------|---------|
| **Master Server** | Node.js 20+, PostgreSQL 14+, Redis 6+ |
| **Target VPS** | AlmaLinux / Rocky / RHEL 8+ |
| **Target VPS RAM** | 1 GB |
| **Target VPS Storage** | 5 GB free |

---

## Full Installation (Master Server — Fresh AlmaLinux/Rocky)

### 1. System dependencies

```bash
# Update system
dnf update -y

# Install Node.js 20+
dnf install -y nodejs npm

# Install PostgreSQL 14+
dnf install -y postgresql-server postgresql-contrib

# Install Redis 6+
dnf install -y redis

# Install other tools
dnf install -y git curl wget unzip openssl nginx

# Verify versions
node --version   # Should be v20+
npm --version    # Should be 10+
psql --version   # Should be 14+
redis-cli --version  # Should be 6+
```

### 2. Clone the repository

```bash
git clone https://github.com/nbaldr2/PowerMM.git /var/www/powermm
cd /var/www/powermm
```

### 3. Install project dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install && cd ..
```

### 4. Configure PostgreSQL

```bash
# Initialize database
postgresql-setup --initdb

# Start PostgreSQL
systemctl enable postgresql
systemctl start postgresql

# Create database and user
su - postgres -c "psql -c \"CREATE USER powermm WITH PASSWORD 'powermm_secret';\""
su - postgres -c "psql -c \"CREATE DATABASE powermm OWNER powermm;\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE powermm TO powermm;\""

# Configure PostgreSQL to accept password connections
sed -i 's/peer/md5/g' /var/lib/pgsql/data/pg_hba.conf
sed -i 's/ident/md5/g' /var/lib/pgsql/data/pg_hba.conf

# Restart to apply
systemctl restart postgresql
```

### 5. Configure Redis

```bash
systemctl enable redis
systemctl start redis

# Test connection
redis-cli ping
# Should return: PONG
```

### 6. Environment configuration

```bash
cp .env.example .env
```

Generate secure secrets:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Edit `.env` with your values:

```bash
nano .env
```

Required values in `.env`:

```
NODE_ENV=production
PORT=3001
APP_URL=http://your-server-ip
API_URL=http://your-server-ip:3001

DATABASE_URL=postgresql://powermm:powermm_secret@localhost:5432/powermm
DB_HOST=localhost
DB_PORT=5432
DB_NAME=powermm
DB_USER=powermm
DB_PASS=powermm_secret

REDIS_URL=redis://localhost:6379

JWT_SECRET=<paste generated hex>
JWT_REFRESH_SECRET=<paste generated hex>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

ENCRYPTION_KEY=<paste generated hex>

TRACKING_DOMAIN=http://your-domain.com
SMTP_FROM_DEFAULT=noreply@your-domain.com
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=52428800
```

### 7. Run database migrations

```bash
cd /var/www/powermm/server
npm run migrate
```

Expected output:

```
PostgreSQL connected: ...
Migration 001_init.sql already executed, skipping
Migration 002_add_pmta_license.sql already executed, skipping
Migration 003_fix_pmta_unique_constraint.sql already executed, skipping
Migration 004_add_ssh_credentials.sql already executed, skipping
All migrations complete
```

This creates all tables and seeds the default admin account:

| Field | Value |
|-------|-------|
| **Email** | `admin@moonmailer.pro` |
| **Password** | `admin123` |
| **Role** | `admin` |
| **Quota** | 1,000,000/day |

### 8. Prepare PowerMTA installation files

Place `PowerMTA5.zip` in the project root:

```bash
# Copy the zip to the project root
cp /path/to/PowerMTA5.zip /var/www/powermm/

# Verify
ls -la /var/www/powermm/PowerMTA5.zip
```

If the zip isn't available, the extracted directory can be used instead:

```bash
cp -r /path/to/PowerMTA5.0r8_ALMALINUX /var/www/powermm/
```

Alternatively, set `PMTA_ZIP_URL` in `.env` to a download URL — the server will cache it automatically on first install.

### 9. Build the frontend

```bash
cd /var/www/powermm
npm run build
```

Expected output:

```
vite v5.x.x building client environment for production...
transforming...✓ XXXX modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.89 kB │ gzip:   0.50 kB
dist/assets/index-xxx.css        40.86 kB │ gzip:   7.04 kB
dist/assets/index-xxx.js        372.02 kB │ gzip: 101.16 kB
✓ built in XXXms
```

### 10. Configure firewall

```bash
# Allow web traffic
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --permanent --add-port=3001/tcp

# Reload
firewall-cmd --reload

# Verify
firewall-cmd --list-ports
```

### 11. Start the application (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start backend
cd /var/www/powermm
pm2 start server/index.js --name powermm
pm2 save

# Enable PM2 startup on boot
pm2 startup
# → Run the displayed command (usually: systemctl enable pm2-root)
```

Verify it's running:

```bash
pm2 list
curl -s http://127.0.0.1:3001/health
# Response: {"status":"healthy","timestamp":"...","uptime":...,"db":"connected","redis":"connected"}
```

### 12. Configure nginx reverse proxy (recommended)

```bash
# Remove default nginx config
rm -f /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/sites-enabled/default

# Create PowerMM config
cat > /etc/nginx/conf.d/powermm.conf << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

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

        # Timeouts
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    # Increase body size for file uploads
    location /uploads {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        client_max_body_size 100M;
    }
}
EOF

# Start nginx
systemctl enable nginx
systemctl start nginx
```

### 13. HTTPS with Let's Encrypt (recommended)

```bash
# Install Certbot
dnf install -y certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d your-domain.com

# Verify auto-renewal
certbot renew --dry-run
```

### 14. Complete setup verification

```bash
# Check all services
systemctl status postgresql --no-pager
systemctl status redis --no-pager
systemctl status nginx --no-pager
pm2 status

# Test full stack
curl -s http://127.0.0.1:3001/health
curl -s http://your-domain.com/health

# Test login
curl -s -X POST http://your-domain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@moonmailer.pro","password":"admin123"}'
# Response should include: {"user":{...},"accessToken":"..."}
```

### 15. Upload PowerMTA5.zip to server

The `PowerMTA5.zip` file is **not in Git** (`.gitignore`). Copy it from your local machine to the VPS:

```bash
# From your LOCAL machine (not the VPS)
scp /path/to/local/PowerMTA5.zip root@your-server-ip:/var/www/powermm/

# Verify on the VPS
ssh root@your-server-ip "ls -la /var/www/powermm/PowerMTA5.zip"
```

Also upload the extracted directory (fallback):

```bash
# From your LOCAL machine
scp -r /path/to/local/PowerMTA5.0r8_ALMALINUX root@your-server-ip:/var/www/powermm/
```

### 16. API authentication (required before PMTA operations)

The PMTA installer requires a valid JWT token. If you get **"Authentication required"** when testing SSH, you need to log in first:

```bash
# Log in and get a token
curl -s -X POST http://your-domain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@moonmailer.pro","password":"admin123"}'
```

Save the token from the response (`accessToken`) and use it for subsequent API calls:

```bash
# Store token
TOKEN="<paste-access-token-here>"

# Test SSH connection to a target VPS via API
curl -s -X POST http://your-domain.com/pmta/test-ssh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "host": "target-vps-ip",
    "port": 22,
    "username": "root",
    "password": "target-vps-root-password"
  }'

# Expected success response:
# {"success":true,"message":"Connected as root to target-vps-ip:22","details":"hostname\nkernel-version"}
```

If testing via the web UI, simply log in at `http://your-domain.com` first — the browser stores the token automatically.

### 17. Access the dashboard

Open `http://your-domain.com` in your browser and log in with:
- **Email:** `admin@moonmailer.pro`
- **Password:** `admin123`

---

## Quick Deploy (Update an existing installation)

```bash
# Pull latest code
cd /var/www/powermm
git pull origin master

# Install any new dependencies
npm install
cd server && npm install && cd ..

# Run new migrations (if any)
cd server && npm run migrate && cd ..

# Rebuild frontend
npm run build

# Restart server
pm2 restart powermm

# Verify
curl -s http://127.0.0.1:3001/health
```

---

## One-liner full update

```bash
ssh root@your-server "cd /var/www/powermm && git pull && npm install && cd server && npm install && npm run migrate && cd .. && npm run build && pm2 restart powermm"
```

---

## PowerMTA Auto-Installer (Target VPS)

The PMTA Installer wizard automates PowerMTA setup on remote VPS instances.

### Prerequisites (Target VPS)

- AlmaLinux / Rocky / RHEL 8+
- Root SSH access (password or key-based)
- Port 22 open for SSH
- No existing PowerMTA installation

### Installation Flow

1. **Step 1 — SSH Connection**
   - Enter target VPS IP, SSH port, username, and password/private key
   - Test the SSH connection

2. **Step 2 — Domain Configuration**
   - Sending domain
   - Hostname
   - Primary IP (the target VPS IP)
   - DKIM selector (default: `default`)
   - SMTP credentials (username, password, port)
   - Monitor port (default: `1983`)

3. **Step 3 — Config Template**
   - Pre-filled PMTA configuration template
   - Customizable with placeholder variables
   - ISP rate limit rules manager

4. **Step 4 — Install**
   - The master server connects to the target VPS via SSH
   - Uploads `PowerMTA5.zip` via SFTP
   - Extracts and installs RPM packages
   - Patches binaries
   - Installs license
   - Generates DKIM keys
   - Writes PMTA configuration
   - Starts services (`pmtad`, `pmtahttpd`)
   - Configures firewall
   - Updates database with status

### Post-Installation

After successful installation, the wizard shows:

- **SMTP Host:** `{target-vps-ip}`
- **SMTP Port:** `2525`
- **SMTP Username / Password:** As configured
- **Monitor URL:** `http://{target-vps-ip}:8080/`
- **DKIM Public Key:** Auto-fetched from the VPS

Required DNS records to publish:

| Type | Host | Value |
|------|------|-------|
| A | `mail.{domain}` | `{target-vps-ip}` |
| MX | `@` | `10 mail.{domain}` |
| TXT | `@` | `v=spf1 ip4:{target-vps-ip} -all` |
| TXT | `default._domainkey` | `v=DKIM1; k=rsa; p={public-key}` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine` |

---

## SSH Session Management

The server manages SSH connections to target VPS instances:

- **Timeout:** 30 minutes of inactivity
- **Rate limit:** 10 connection attempts per minute per user
- **Credentials:** Stored encrypted in the database
- **Cleanup:** Automatic on timeout, disconnect, or error

---

## Deployment

### Secure deployment script

```bash
./deploy-secure.sh
```

Requires SSH key authentication to the master server. Set up with:

```bash
ssh-keygen -t rsa -b 4096
ssh-copy-id root@your-master-server
```

### Transfer PowerMTA files to fresh VPS

```bash
# From LOCAL machine (first deploy)
scp /path/to/PowerMTA5.zip root@your-server:/var/www/powermm/
scp -r /path/to/PowerMTA5.0r8_ALMALINUX root@your-server:/var/www/powermm/

# Then deploy normally
ssh root@your-server "cd /var/www/powermm && git pull && npm run build && pm2 restart powermm"
```

### Manual deploy

```bash
ssh root@your-master-server "cd /var/www/powermm && git pull && npm run build && pm2 restart powermm"
```

---

## Troubleshooting

### Server won't start

```bash
# Check PM2 logs
pm2 logs powermm --lines 50

# Check error log directly
tail -100 /root/.pm2/logs/powermm-error.log
tail -100 /root/.pm2/logs/powermm-out.log

# Common fixes
cd /var/www/powermm/server && npm install && npm run migrate && cd .. && npm run build && pm2 restart powermm
```

### 502 Bad Gateway (nginx)

```bash
# PM2 crashed — restart it
pm2 restart powermm

# nginx misconfigured — check config
nginx -t
systemctl restart nginx

# Backend not listening — check port
curl -s http://127.0.0.1:3001/health
ss -tlnp | grep 3001
```

### Database connection failures

```bash
# Check PostgreSQL is running
systemctl status postgresql

# Test connection
psql -U powermm -d powermm -h localhost -c "SELECT 1"

# Reset password if needed
su - postgres -c "psql -c \"ALTER USER powermm WITH PASSWORD 'new_password';\""
```

### Redis connection failures

```bash
systemctl status redis
redis-cli ping  # Should return PONG
```

### PMTA installation fails on target VPS

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| SSH timeout | Wrong IP/port or firewall | Verify `ssh root@target-ip` works manually |
| Authentication required | No valid JWT token | Log in via UI first, or get token: `curl -s -X POST .../auth/login -d '{"email":"admin@moonmailer.pro","password":"admin123"}'` |
| Zip upload hangs | PowerMTA5.zip missing on master | Upload it: `scp PowerMTA5.zip root@server:/var/www/powermm/` |
| Zip upload hangs | Slow connection / large file | Wait up to 3 minutes; cancel and retry |
| `pmtad` fails to start | Missing `log-file` in config | Rerun installer — template now includes it |
| `pmtahttpd` fails to start | Missing `log-file` or bad directive | Check `/etc/pmta/config` on target VPS |
| Monitor shows "Access denied" | No `http-access` directive | Config template has `http-access 0.0.0.0/0 monitor` |
| `unknown directive` errors | Config uses wrong PMTA version syntax | Template is now PMTA 5.0r8 compatible |
| `{{ SECONDARY_VMTA_... }}` left in config | No secondary IPs entered in wizard | Backend now strips placeholders when no secondaries |

### Manual fix on target VPS

If the target VPS config is broken, SSH in and fix it:

```bash
ssh root@target-vps

# Check current config
cat /etc/pmta/config

# Fix common issues
sed -i '/http-listener-port/d' /etc/pmta/config
sed -i '/{{ SECONDARY/d' /etc/pmta/config

# Restart services
pkill -f pmtad 2>/dev/null
pkill -f pmtahttpd 2>/dev/null
sleep 1
/usr/sbin/pmtad &
/usr/sbin/pmtahttpd &
sleep 2
ss -tlnp | grep -E ':(25|2525|8080)'
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Authenticate |
| POST | `/auth/register` | Register user |
| GET | `/auth/me` | Get current user |
| POST | `/pmta/test-ssh` | Test SSH connection |
| POST | `/pmta/config` | Save PMTA configuration |
| GET | `/pmta/config` | Get saved configuration |
| POST | `/pmta/install` | Start PowerMTA installation |
| POST | `/pmta/service/:action` | Control PMTA service (status/start/stop/restart) |
| POST | `/pmta/uninstall` | Uninstall PowerMTA |
| POST | `/pmta/dns-records` | Generate DNS records |
| GET | `/health` | Health check |
| POST | `/campaigns` | Create campaign |
| POST | `/campaigns/:id/send` | Start sending |

---

## Project Structure

```
PowerMM/
├── server/              # Express backend
│   ├── index.js         # Entry point
│   ├── config/          # Database, env configuration
│   ├── routes/          # API routes (auth, pmta, smtp, campaigns, etc.)
│   ├── middleware/       # Auth, validation middleware
│   ├── socket/          # Socket.io event handlers
│   ├── utils/           # Encryption, logging utilities
│   └── migrations/      # SQL migration files
├── src/                 # React frontend
│   ├── App.jsx          # Main application component
│   ├── api.js           # API client
│   └── socket.js        # Socket.io client
├── dist/                # Built frontend (auto-generated)
├── Command.txt          # Installation commands reference
└── PowerMTA5.zip        # PowerMTA installation archive
```

---

## License

MoonMailer Pro — PowerMM Platform
