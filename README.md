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

## Installation (Master Server)

### 1. Clone the repository

```bash
git clone https://github.com/nbaldr2/PowerMM.git /var/www/powermm
cd /var/www/powermm
```

### 2. Install dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install && cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `PORT` | Backend port (default `3001`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Generate with `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 key, 64 hex chars (`openssl rand -hex 32`) |

### 4. Database setup

```bash
cd server
npm run migrate
```

This creates all required tables and seeds the default admin account:
- **Email:** `admin@moonmailer.pro`
- **Password:** `admin123`

### 5. Prepare PowerMTA installation files

Place `PowerMTA5.zip` in the project root:

```bash
# Copy the zip to the project root
cp /path/to/PowerMTA5.zip /var/www/powermm/
```

Alternatively, set `PMTA_ZIP_URL` in `.env` to a download URL and the server will cache it automatically.

The extracted directory `PowerMTA5.0r8_ALMALINUX/` is also used as a fallback.

### 6. Start the server

```bash
# Using PM2 (recommended)
pm2 start server/index.js --name powermm
pm2 save

# Or directly
node server/index.js
```

### 7. Build and serve the frontend

```bash
npm run build
```

The built frontend is automatically served by the Express backend from the `dist/` directory. Access it at `http://your-server-ip:3001`.

### 8. Configure nginx (optional but recommended)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
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

### Manual deploy

```bash
ssh root@your-master-server "cd /var/www/powermm && git pull && npm run build && pm2 restart powermm"
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `502 Bad Gateway` | Node server not running | `pm2 restart powermm` |
| `Cannot GET /` | Frontend not built | `npm run build` |
| SSH connection timeout | Wrong IP/port or firewall | Verify target VPS SSH access |
| PMTA install hangs | Large file upload | Wait up to 3 minutes for zip upload |
| `pmtahttpd` fails | Missing `log-file` in config | Rerun installer with updated template |
| Monitor shows "Access denied" | HTTP monitor needs `http-access` directive | Config template includes it by default |

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
